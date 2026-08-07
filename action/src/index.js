const core = require('@actions/core');
const github = require('@actions/github');
const { ethers } = require('ethers');

// ============================================
// PERMAREPO KONFIGURĀCIJA (iekodēta)
// ============================================
const CONFIG = {
    RPC_URL: 'https://sepolia.base.org',
    SUBSCRIPTION_ADDRESS: '0x29f1ed42C6C2E157B7571f9585a9C9Dd6fBcda51',
    NFT_ADDRESS: '0xeD3eB455cAeb057a034d7bE2368cdCEA37Faa1d4',
    REGISTRY_ADDRESS: '0x2a5a7F926046BB1A011D9082aB70BF38bfcb9dc9',
    TURBO_UPLOAD_URL: 'https://upload.services.ar-io.dev',
    TURBO_PAYMENT_URL: 'https://payment.services.ar-io.dev',
    WEB_URL: 'https://perma-repo.pages.dev'
};

async function run() {
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    const issueBody = process.env.ISSUE_BODY;
    const issueNumber = Number.parseInt(process.env.ISSUE_NUMBER, 10);
    const { owner, repo } = github.context.repo;
    
    try {
        // 1. Parse JSON from issue body
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Neizdevās atrast JSON datus Issue aprakstā.');
            return;
        }
        
        const payload = JSON.parse(jsonMatch[1]);
        const { address, signature, message, timestamp } = payload;
        
        // 2. Timestamp check (10 minutes)
        const now = Math.floor(Date.now() / 1000);
        if (now - timestamp > 600) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Paraksts ir novecojis (>10 min). Lūdzu, mēģiniet vēlreiz.');
            return;
        }
        
        // 3. Verify signature
        const recoveredAddress = ethers.verifyMessage(message, signature);
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Paraksta verifikācija neizdevās. Adrese nesakrīt.');
            return;
        }
        
        // 4. Extract repo name
        const repoMatch = message.match(/Repository: (.+)/);
        const repoName = repoMatch ? repoMatch[1] : `${owner}/${repo}`;
        const repoHash = ethers.id(repoName);
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const nftABI = ['function repositoryTokens(bytes32) view returns (uint256)'];
        const nftContract = new ethers.Contract(CONFIG.NFT_ADDRESS, nftABI, provider);
        const tokenId = await nftContract.repositoryTokens(repoHash);
        
        // 5. Pārbauda, vai ir NFT
        if (tokenId === 0n) {
            const nftUrl = `${CONFIG.WEB_URL}/pay.html?repo=${encodeURIComponent(repoName)}`;
            await closeIssue(octokit, owner, repo, issueNumber, 
                `❌ Šim repozitorijam nav izveidots NFT.\n\n` +
                `🔗 Izveidot NFT: ${nftUrl}\n\n` +
                `⚠️ Pēc NFT izveides, palaid Action vēlreiz.`
            );
            return;
        }
        
        // 6. Pārbauda, vai ir abonements
        const subscriptionABI = ['function isSubscribed(uint256) view returns (bool)'];
        const subscriptionContract = new ethers.Contract(CONFIG.SUBSCRIPTION_ADDRESS, subscriptionABI, provider);
        const isSubscribed = await subscriptionContract.isSubscribed(tokenId);
        
        if (!isSubscribed) {
            const subscribeUrl = `${CONFIG.WEB_URL}/subscribe.html`;
            await closeIssue(octokit, owner, repo, issueNumber,
                `❌ Šim NFT (tokenId: ${tokenId}) nav aktīva abonementa.\n\n` +
                `🔗 Aktivizēt abonementu: ${subscribeUrl}\n\n` +
                `⚠️ Pēc abonementa iegādes, palaid Action vēlreiz.`
            );
            return;
        }
        
        // 7. Execute backup
        const { execSync } = require('node:child_process');
        const cmd = [
            'npx perm-repo backup',
            `--wallet ${address}`,
            `--subscription ${CONFIG.SUBSCRIPTION_ADDRESS}`,
            `--nft ${CONFIG.NFT_ADDRESS}`,
            `--registry ${CONFIG.REGISTRY_ADDRESS}`,
            `--rpc ${CONFIG.RPC_URL}`,
            `--turbo-upload ${CONFIG.TURBO_UPLOAD_URL}`,
            `--turbo-payment ${CONFIG.TURBO_PAYMENT_URL}`,
            '--repo .'
        ].join(' ');
        
        const output = execSync(cmd, { encoding: 'utf-8' });
        const result = JSON.parse(output.trim().split('\n').pop());
        
        if (result.status === 'success') {
            await closeIssue(octokit, owner, repo, issueNumber,
                `✅ Backups veiksmīgs!\n\n` +
                `Manifests: \`${result.manifestTxId}\`\n` +
                `Faili: ${result.filesChanged}\n` +
                `Izmērs: ${result.totalSize} baiti`
            );
        } else {
            await closeIssue(octokit, owner, repo, issueNumber,
                `⚠️ Backups pabeigts ar statusu: ${result.status}`
            );
        }
        
    } catch (error) {
        await closeIssue(octokit, owner, repo, issueNumber, `❌ Kļūda: ${error.message}`);
    }
}

async function closeIssue(octokit, owner, repo, issueNumber, message) {
    await octokit.rest.issues.createComment({
        owner, repo, issue_number: issueNumber, body: message
    });
    await octokit.rest.issues.update({
        owner, repo, issue_number: issueNumber, state: 'closed'
    });
}

run();
