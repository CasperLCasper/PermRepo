const core = require('@actions/core');
const github = require('@actions/github');
const { ethers } = require('ethers');

async function run() {
    console.log('=== ACTION SĀKAS ===');
    
    const githubToken = core.getInput('github_token');
    const octokit = github.getOctokit(githubToken);
    const issueBody = core.getInput('issue_body') || process.env.ISSUE_BODY || '';
    const issueNumber = Number.parseInt(core.getInput('issue_number') || github.context.issue.number || '0');
    const { owner, repo } = github.context.repo;
    
    console.log('DEBUG INFO:');
    console.log('  owner:', owner);
    console.log('  repo:', repo);
    console.log('  issueNumber:', issueNumber);
    console.log('  issueBody garums:', issueBody.length);
    
    const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
    const NFT_ADDRESS = process.env.NFT_ADDRESS || '0xeD3eB455cAeb057a034d7bE2368cdCEA37Faa1d4';
    const SUBSCRIPTION_ADDRESS = process.env.SUBSCRIPTION_ADDRESS || '0x29f1ed42C6C2E157B7571f9585a9C9Dd6fBcda51';
    const SIGNATURE_TIMEOUT_SECONDS = 600;
    
    try {
        // 1. PARSE JSON
        console.log('1. Parsejam JSON no Issue...');
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            console.log('❌ Nav JSON');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Neizdevās atrast JSON datus.');
            return;
        }
        console.log('✅ JSON atrasts');
        
        const payload = JSON.parse(jsonMatch[1]);
        const { address, signature, message, timestamp } = payload;
        console.log('✅ JSON parse veiksmīgs');
        
        // 2. TIMESTAMP PĀRBAUDE
        console.log('2. Pārbaudam timestamp...');
        const now = Math.floor(Date.now() / 1000);
        if (now - timestamp > SIGNATURE_TIMEOUT_SECONDS) {
            console.log('❌ Paraksts novecojis');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Paraksts ir novecojis (>10 min).');
            return;
        }
        console.log('✅ Timestamp OK');
        
        // 3. PARAKSTA VERIFIKĀCIJA
        console.log('3. Verificējam parakstu...');
        let recoveredAddress;
        try {
            recoveredAddress = ethers.verifyMessage(message, signature);
            console.log('✅ Paraksts verificēts, adrese:', recoveredAddress);
        } catch (verifyError) {
            console.error('❌ Paraksta verifikācijas kļūda:', verifyError.message);
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Neizdevās verificēt parakstu.');
            return;
        }
        
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            console.log('❌ Adreses nesakrīt');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Paraksts neatbilst adresei.');
            return;
        }
        
        // 4. REPO NOSAUKUMS UN HASH
        console.log('4. Iegūstam repo nosaukumu...');
        const repoMatch = message.match(/Repository: (.+)/);
        const repoName = repoMatch ? repoMatch[1] : `${owner}/${repo}`;
        
        // PAREIZAIS HASH APRĒĶINS
        const repoHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(['string'], [repoName])
        );
        
        console.log('  repoName:', repoName);
        console.log('  repoHash:', repoHash);
        
        // 5. NFT PĀRBAUDE
        console.log('5. Pārbaudam NFT...');
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        console.log('  Provider izveidots');
        
        const nftABI = [
            'function repositoryTokens(bytes32) view returns (uint256)',
            'function ownerOf(uint256) view returns (address)'
        ];
        const nftContract = new ethers.Contract(NFT_ADDRESS, nftABI, provider);
        console.log('  NFT Contract izveidots');
        
        const tokenId = await nftContract.repositoryTokens(repoHash);
        console.log('  tokenId:', tokenId.toString());
        
        if (tokenId === 0n) {
            console.log('❌ Nav NFT');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Nav NFT šim repozitorijam.');
            return;
        }
        console.log('✅ NFT atrasts');
        
        // 6. ĪPAŠNIEKA PĀRBAUDE
        console.log('6. Pārbaudam īpašnieku...');
        const nftOwner = await nftContract.ownerOf(tokenId);
        console.log('  nftOwner:', nftOwner);
        
        if (nftOwner.toLowerCase() !== address.toLowerCase()) {
            console.log('❌ Nav īpašnieks');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ NFT nepieder šai adresei.');
            return;
        }
        console.log('✅ Īpašnieks apstiprināts');
        
        // 7. ABONEMENTA PĀRBAUDE
        console.log('7. Pārbaudam abonementu...');
        const subscriptionABI = ['function isSubscribed(uint256) view returns (bool)'];
        const subscriptionContract = new ethers.Contract(SUBSCRIPTION_ADDRESS, subscriptionABI, provider);
        const isSubscribed = await subscriptionContract.isSubscribed(tokenId);
        console.log('  isSubscribed:', isSubscribed);
        
        if (!isSubscribed) {
            console.log('❌ Nav abonementa');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Nav aktīva abonementa.');
            return;
        }
        console.log('✅ Abonements aktīvs');
        
        // 8. BACKUP IZPILDE
        console.log('8. Izpildam backup...');
        const { execSync } = require('node:child_process');
        const cmd = `npx perm-repo backup --wallet ${address} --repo .`;
        console.log('  Komanda:', cmd);
        
        let output;
        try {
            output = execSync(cmd, {
                encoding: 'utf-8',
                stdio: 'pipe',
                env: {
                    ...process.env,
                    OPERATOR_PRIVATE_KEY: process.env.OPERATOR_PRIVATE_KEY,
                    TREASURY_ADDRESS: process.env.TREASURY_ADDRESS || '0x349c78525Dbb6aCfE60c96546174dC1627028b62'
                }
            });
            console.log('✅ Backup izpildīts');
            console.log('  Izvade:', output);
        } catch (execError) {
            console.error('❌ Backup kļūda:', execError.message);
            console.error('  stderr:', execError.stderr ? execError.stderr.toString() : 'nav');
            console.error('  stdout:', execError.stdout ? execError.stdout.toString() : 'nav');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Backups neizdevās.');
            return;
        }
        
        // 9. REZULTĀTA PARSĒŠANA
        console.log('9. Parsējam rezultātu...');
        const lines = output.trim().split('\n');
        const jsonLine = lines.find(l => l.startsWith('{'));
        let result = { status: 'success' };
        if (jsonLine) {
            try { result = JSON.parse(jsonLine); } catch (parseError) {
                console.warn('Neizdevās noparsēt JSON rezultātu');
            }
        }
        console.log('  result:', result);
        
        if (result.status === 'success') {
            await closeIssue(octokit, owner, repo, issueNumber,
                '✅ Backups veiksmīgs!\n\n' +
                `🔗 Manifests: \`${result.manifestTxId || 'N/A'}\`\n` +
                `📊 Faili: ${result.filesChanged || '?'}\n` +
                `📦 Izmērs: ${result.totalSize ? (result.totalSize / 1024).toFixed(1) + ' KB' : 'N/A'}\n` +
                `🌳 Merkle: \`${result.merkleRoot || 'N/A'}\`\n` +
                `🎫 Token ID: \`${result.tokenId || tokenId}\``
            );
        }
        
    } catch (error) {
        console.error('💥 VISPĀRĒJA KĻŪDA:', error.message);
        console.error('Pilna kļūda:', error);
        await closeIssue(octokit, owner, repo, issueNumber, '❌ Kļūda: ' + error.message);
    }
    
    console.log('=== ACTION BEIDZAS ===');
}

async function closeIssue(octokit, owner, repo, issueNumber, message) {
    console.log(`Mēģinām aizvērt: ${owner}/${repo} issue #${issueNumber}`);
    if (!issueNumber || issueNumber === 0) {
        console.warn('Nav issueNumber');
        return;
    }
    try {
        await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body: message });
        console.log('✅ Komentārs pievienots');
        await octokit.rest.issues.update({ owner, repo, issue_number: issueNumber, state: 'closed' });
        console.log('✅ Issue aizvērts');
    } catch (error) {
        console.error('❌ Kļūda aizverot Issue:', error.message);
    }
}

run();
