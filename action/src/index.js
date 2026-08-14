const core = require('@actions/core');
const github = require('@actions/github');
const { ethers } = require('ethers');

async function run() {
    const githubToken = core.getInput('github_token');
    const octokit = github.getOctokit(githubToken);
    const issueBody = process.env.ISSUE_BODY;
    const issueNumber = Number.parseInt(process.env.ISSUE_NUMBER, 10);
    const { owner, repo } = github.context.repo;
    
    const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
    const NFT_ADDRESS = process.env.NFT_ADDRESS || '0xeD3eB455cAeb057a034d7bE2368cdCEA37Faa1d4';
    const SUBSCRIPTION_ADDRESS = process.env.SUBSCRIPTION_ADDRESS || '0x29f1ed42C6C2E157B7571f9585a9C9Dd6fBcda51';
    const SIGNATURE_TIMEOUT_SECONDS = 600;
    
    try {
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Neizdevās atrast JSON datus.');
            return;
        }
        
        const payload = JSON.parse(jsonMatch[1]);
        const { address, signature, message, timestamp } = payload;
        
        const now = Math.floor(Date.now() / 1000);
        if (now - timestamp > SIGNATURE_TIMEOUT_SECONDS) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Paraksts ir novecojis (>10 min).');
            return;
        }
        
        let recoveredAddress;
        try {
            recoveredAddress = ethers.verifyMessage(message, signature);
        } catch {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Neizdevās verificēt parakstu.');
            return;
        }
        
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Paraksts neatbilst adresei.');
            return;
        }
        
        const repoMatch = message.match(/Repository: (.+)/);
        const repoName = repoMatch ? repoMatch[1] : `${owner}/${repo}`;
        const repoHash = ethers.id(repoName);
        
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        
        const nftABI = [
            'function repositoryTokens(bytes32) view returns (uint256)',
            'function ownerOf(uint256) view returns (address)'
        ];
        const nftContract = new ethers.Contract(NFT_ADDRESS, nftABI, provider);
        const tokenId = await nftContract.repositoryTokens(repoHash);
        
        if (tokenId === 0n) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Nav NFT šim repozitorijam.');
            return;
        }
        
        const nftOwner = await nftContract.ownerOf(tokenId);
        if (nftOwner.toLowerCase() !== address.toLowerCase()) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ NFT nepieder šai adresei.');
            return;
        }
        
        const subscriptionABI = ['function isSubscribed(uint256) view returns (bool)'];
        const subscriptionContract = new ethers.Contract(SUBSCRIPTION_ADDRESS, subscriptionABI, provider);
        const isSubscribed = await subscriptionContract.isSubscribed(tokenId);
        
        if (!isSubscribed) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Nav aktīva abonementa.');
            return;
        }
        
        const { execSync } = require('node:child_process');
        const cmd = `npx perm-repo backup --wallet ${address} --repo .`;
        
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
        } catch (execError) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Backups neizdevās.');
            return;
        }
        
        const lines = output.trim().split('\n');
        const jsonLine = lines.find(l => l.startsWith('{'));
        let result = { status: 'success' };
        if (jsonLine) {
            try { result = JSON.parse(jsonLine); } catch {}
        }
        
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
        await closeIssue(octokit, owner, repo, issueNumber, '❌ Kļūda: ' + error.message);
    }
}

async function closeIssue(octokit, owner, repo, issueNumber, message) {
    try {
        await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body: message });
        await octokit.rest.issues.update({ owner, repo, issue_number: issueNumber, state: 'closed' });
    } catch (error) {
        console.error('Neizdevās aizvērt Issue:', error.message);
    }
}

run();
