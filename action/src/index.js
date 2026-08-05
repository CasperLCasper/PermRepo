const core = require('@actions/core');
const github = require('@actions/github');
const { ethers } = require('ethers');

async function run() {
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    const issueBody = process.env.ISSUE_BODY;
    const issueNumber = parseInt(process.env.ISSUE_NUMBER);
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
        
        // 4. Check on-chain permissions
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        
        const subscriptionABI = ['function isSubscribed(address) view returns (bool)'];
        const subscriptionContract = new ethers.Contract(process.env.SUBSCRIPTION_ADDRESS, subscriptionABI, provider);
        const isSubscribed = await subscriptionContract.isSubscribed(address);
        
        if (!isSubscribed) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Lietotājam nav aktīva abonementa.');
            return;
        }
        
        // 5. Extract repo name from message
        const repoMatch = message.match(/Repository: (.+)/);
        const repoName = repoMatch ? repoMatch[1] : `${owner}/${repo}`;
        const repoHash = ethers.id(repoName);
        
        const nftABI = ['function repositoryTokens(bytes32) view returns (uint256)'];
        const nftContract = new ethers.Contract(process.env.NFT_ADDRESS, nftABI, provider);
        const tokenId = await nftContract.repositoryTokens(repoHash);
        
        if (tokenId === 0n) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Šim repozitorijam nav izveidots NFT.');
            return;
        }
        
        // 6. Execute backup
        const { execSync } = require('node:child_process');
        const cmd = [
            'npx perm-repo backup',
            `--wallet ${address}`,
            `--subscription ${process.env.SUBSCRIPTION_ADDRESS}`,
            `--nft ${process.env.NFT_ADDRESS}`,
            `--registry ${process.env.REGISTRY_ADDRESS}`,
            `--rpc ${process.env.RPC_URL}`,
            `--turbo-upload ${process.env.TURBO_UPLOAD_URL}`,
            `--turbo-payment ${process.env.TURBO_PAYMENT_URL}`,
            '--repo .'
        ].join(' ');
        
        const output = execSync(cmd, { encoding: 'utf-8' });
        const result = JSON.parse(output.trim().split('\n').pop());
        
        if (result.status === 'success') {
            await closeIssue(octokit, owner, repo, issueNumber, `✅ Backups veiksmīgs!\n\nManifests: \`${result.manifestTxId}\`\nFaili: ${result.filesChanged}`);
        } else {
            await closeIssue(octokit, owner, repo, issueNumber, `⚠️ Backups pabeigts ar statusu: ${result.status}`);
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
