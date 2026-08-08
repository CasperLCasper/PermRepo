const core = require('@actions/core');
const github = require('@actions/github');
const { ethers } = require('ethers');
const CONFIG = require('../../shared/config');

// ============================================
// PERMAREPO GITHUB ACTION — GALVENĀ LOĢIKA
// ============================================

async function run() {
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    const issueBody = process.env.ISSUE_BODY;
    const issueNumber = Number.parseInt(process.env.ISSUE_NUMBER, 10);
    const { owner, repo } = github.context.repo;
    
    try {
        // 1. Parsēt JSON no Issue body
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            await closeIssue(octokit, owner, repo, issueNumber, 
                '❌ Neizdevās atrast JSON datus Issue aprakstā.\n\n' +
                'Pārliecinies, ka JSON ir ievietots starp ```json ... ``` atzīmēm.'
            );
            return;
        }
        
        const payload = JSON.parse(jsonMatch[1]);
        const { address, signature, message, timestamp } = payload;
        
        // 2. Timestamp pārbaude
        const now = Math.floor(Date.now() / 1000);
        if (now - timestamp > CONFIG.SIGNATURE_TIMEOUT_SECONDS) {
            const signUrl = `${CONFIG.WEB_URL}${CONFIG.SIGN_PAGE}?repo=${encodeURIComponent(`${owner}/${repo}`)}`;
            await closeIssue(octokit, owner, repo, issueNumber, 
                '❌ Paraksts ir novecojis (>10 min). Lūdzu, mēģiniet vēlreiz.\n\n' +
                `🔗 Parakstīt no jauna: ${signUrl}`
            );
            return;
        }
        
        // 3. Verificēt parakstu
        let recoveredAddress;
        try {
            recoveredAddress = ethers.verifyMessage(message, signature);
        } catch (error) {
            await closeIssue(octokit, owner, repo, issueNumber, 
                '❌ Neizdevās verificēt parakstu. Iespējams, bojāts paraksts.'
            );
            return;
        }
        
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            await closeIssue(octokit, owner, repo, issueNumber, 
                '❌ Paraksta verifikācija neizdevās. Adrese nesakrīt.'
            );
            return;
        }
        
        // 4. Izvilkt repo nosaukumu no ziņojuma
        const repoMatch = message.match(/Repository: (.+)/);
        const repoName = repoMatch ? repoMatch[1] : `${owner}/${repo}`;
        const repoHash = ethers.id(repoName);
        
        // 5. Pārbaudīt NFT eksistenci
        const rpcUrl = core.getInput('rpc_url') || CONFIG.RPC_URL;
        const nftAddress = core.getInput('nft_address') || CONFIG.NFT_ADDRESS;
        const subscriptionAddress = core.getInput('subscription_address') || CONFIG.SUBSCRIPTION_ADDRESS;
        
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        
        const nftABI = [
            'function repositoryTokens(bytes32) view returns (uint256)',
            'function ownerOf(uint256) view returns (address)'
        ];
        const nftContract = new ethers.Contract(nftAddress, nftABI, provider);
        const tokenId = await nftContract.repositoryTokens(repoHash);
        
        if (tokenId === 0n) {
            const payUrl = `${CONFIG.WEB_URL}${CONFIG.PAY_PAGE}?repo=${encodeURIComponent(repoName)}`;
            await closeIssue(octokit, owner, repo, issueNumber, 
                '❌ Šim repozitorijam nav izveidots NFT.\n\n' +
                `🔗 Izveidot NFT: ${payUrl}\n\n` +
                '⚠️ Pēc NFT izveides, izveido jaunu Issue, lai palaistu backup.'
            );
            return;
        }
        
        // 6. Pārbaudīt NFT īpašnieku
        const nftOwner = await nftContract.ownerOf(tokenId);
        if (nftOwner.toLowerCase() !== address.toLowerCase()) {
            await closeIssue(octokit, owner, repo, issueNumber, 
                '❌ NFT nepieder norādītajai adresei.\n\n' +
                `NFT īpašnieks: \`${nftOwner}\`\n` +
                `Norādītā adrese: \`${address}\``
            );
            return;
        }
        
        // 7. Pārbaudīt abonementu
        const subscriptionABI = ['function isSubscribed(uint256) view returns (bool)'];
        const subscriptionContract = new ethers.Contract(subscriptionAddress, subscriptionABI, provider);
        const isSubscribed = await subscriptionContract.isSubscribed(tokenId);
        
        if (!isSubscribed) {
            const subscribeUrl = `${CONFIG.WEB_URL}${CONFIG.SUBSCRIBE_PAGE}`;
            await closeIssue(octokit, owner, repo, issueNumber,
                '❌ Šim NFT nav aktīva abonementa.\n\n' +
                `NFT Token ID: \`${tokenId}\`\n\n` +
                `🔗 Aktivizēt abonementu: ${subscribeUrl}\n\n` +
                '⚠️ Pēc abonementa iegādes, izveido jaunu Issue, lai palaistu backup.'
            );
            return;
        }
        
        // 8. Izpildīt backup
        const { execSync } = require('node:child_process');
        
        const cmd = [
            'npx perm-repo backup',
            `--wallet ${address}`,
            `--rpc ${rpcUrl}`,
            `--subscription ${subscriptionAddress}`,
            `--nft ${nftAddress}`,
            `--registry ${core.getInput('registry_address') || CONFIG.REGISTRY_ADDRESS}`,
            `--turbo-upload ${core.getInput('turbo_upload_url') || CONFIG.TURBO_UPLOAD_URL}`,
            `--turbo-payment ${core.getInput('turbo_payment_url') || CONFIG.TURBO_PAYMENT_URL}`,
            '--repo .'
        ].join(' ');
        
        console.log('🔧 Izpilda:', cmd);
        
        let output;
        try {
            output = execSync(cmd, { 
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
        } catch (execError) {
            await closeIssue(octokit, owner, repo, issueNumber,
                '❌ Backupa izpilde neizdevās.\n\n' +
                '```\n' + (execError.stderr || execError.message) + '\n```'
            );
            return;
        }
        
        console.log('Backup izvade:', output);
        
        // 9. Parsēt rezultātu
        const lines = output.trim().split('\n');
        const jsonLine = lines.find(l => l.startsWith('{'));
        let result;
        
        if (jsonLine) {
            try {
                result = JSON.parse(jsonLine);
            } catch {
                result = { status: 'unknown' };
            }
        } else {
            result = { status: 'success' };
        }
        
        // 10. Aizvērt Issue ar rezultātu
        if (result.status === 'success') {
            await closeIssue(octokit, owner, repo, issueNumber,
                '✅ **Backups veiksmīgs!**\n\n' +
                `🔗 Manifests: \`${result.manifestTxId || 'N/A'}\`\n` +
                `📊 Faili: ${result.filesChanged || '?'}\n` +
                `📦 Izmērs: ${result.totalSize ? (result.totalSize / 1024).toFixed(1) + ' KB' : 'N/A'}\n` +
                `🌳 Merkle root: \`${result.merkleRoot || 'N/A'}\`\n` +
                `🎫 Token ID: \`${result.tokenId || tokenId}\``
            );
        } else {
            await closeIssue(octokit, owner, repo, issueNumber,
                `⚠️ Backups pabeigts ar statusu: ${result.status}`
            );
        }
        
    } catch (error) {
        console.error('Kļūda:', error);
        await closeIssue(octokit, owner, repo, issueNumber, 
            '❌ **Negaidīta kļūda**\n\n' +
            '```\n' + error.message + '\n```\n\n' +
            'Lūdzu, sazinies ar atbalsta komandu.'
        );
    }
}

/**
 * Aizver Issue ar komentāru
 */
async function closeIssue(octokit, owner, repo, issueNumber, message) {
    try {
        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: message
        });
        
        await octokit.rest.issues.update({
            owner,
            repo,
            issue_number: issueNumber,
            state: 'closed'
        });
    } catch (error) {
        console.error('Neizdevās aizvērt Issue:', error.message);
    }
}

run();
