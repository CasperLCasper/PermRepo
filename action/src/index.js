const core = require('@actions/core');
const github = require('@actions/github');
const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RENDER_URL = process.env.RENDER_URL || core.getInput('render_url');
const RENDER_API_KEY = process.env.RENDER_API_KEY || core.getInput('render_api_key') || '';
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || core.getInput('wallet_address');

const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const NFT_ADDRESS = process.env.NFT_ADDRESS || '0xeD3eB455cAeb057a034d7bE2368cdCEA37Faa1d4';
const SUBSCRIPTION_ADDRESS = process.env.SUBSCRIPTION_ADDRESS || '0x29f1ed42C6C2E157B7571f9585a9C9Dd6fBcda51';

const IGNORE_PATTERNS = '.git,node_modules,.next,dist,build,.cache,coverage,.env,.env.local,permarepo.lock.json,.permrepo'.split(',');
const MAX_FILE_SIZE_BYTES = 104857600;
const LOCK_FILE_NAME = 'permarepo.lock.json';

const NFT_ABI = [
    "function repositoryTokens(bytes32 repoHash) external view returns (uint256)",
    "function ownerOf(uint256 tokenId) external view returns (address)"
];

const SUBSCRIPTION_ABI = [
    "function isSubscribed(uint256 tokenId) external view returns (bool)"
];

function scanFiles(rootPath) {
    const files = {};
    const ignore = IGNORE_PATTERNS;

    const shouldIgnore = (relativePath) => {
        return ignore.some(pattern => {
            if (relativePath === pattern) return true;
            if (relativePath.startsWith(pattern + path.sep)) return true;
            return false;
        });
    };

    const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(rootPath, fullPath);
            if (shouldIgnore(relativePath)) continue;
            if (entry.isDirectory()) { walk(fullPath); }
            else if (entry.isFile()) {
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.size > MAX_FILE_SIZE_BYTES) continue;
                    const content = fs.readFileSync(fullPath);
                    files[relativePath] = {
                        hash: crypto.createHash('sha256').update(content).digest('hex'),
                        size: content.length,
                        content: content.toString('base64')
                    };
                } catch {}
            }
        }
    };

    walk(rootPath);
    return files;
}

function loadLockFile(repoPath) {
    const lockPath = path.join(repoPath, LOCK_FILE_NAME);
    if (!fs.existsSync(lockPath)) return { files: {} };
    try {
        const data = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        return { files: data.files || {} };
    } catch {
        return { files: {} };
    }
}

function compareWithLock(currentFiles, lockData) {
    const lockFiles = lockData.files || {};
    const changed = [];
    const unchanged = {};
    
    for (const [filePath, info] of Object.entries(currentFiles)) {
        if (lockFiles[filePath] && lockFiles[filePath].hash === info.hash) {
            unchanged[filePath] = {
                hash: info.hash,
                size: info.size,
                txId: lockFiles[filePath].txId
            };
        } else {
            changed.push({
                path: filePath,
                size: info.size,
                content: info.content,
                hash: info.hash
            });
        }
    }
    
    const deleted = Object.keys(lockFiles).filter(fp => !currentFiles[fp]);
    
    return { changed, unchanged, deleted };
}

function getRepoName() {
    if (process.env.GITHUB_REPOSITORY) {
        return process.env.GITHUB_REPOSITORY.trim();
    }
    return 'unknown-repo';
}

function getRepoHash(repoName) {
    return ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['string'], [repoName])
    );
}

async function run() {
    console.log('=== PERMAREPO ACTION SĀKAS ===');
    
    const githubToken = core.getInput('github_token') || process.env.GITHUB_TOKEN;
    const octokit = github.getOctokit(githubToken);
    const issueNumber = Number.parseInt(core.getInput('issue_number') || github.context.issue.number || '0');
    const { owner, repo } = github.context.repo;
    
    console.log('DEBUG INFO:');
    console.log('  owner:', owner);
    console.log('  repo:', repo);
    console.log('  issueNumber:', issueNumber);
    console.log('  WALLET_ADDRESS:', WALLET_ADDRESS || 'NAV');
    console.log('  RENDER_URL:', RENDER_URL || 'NAV');
    
    if (!WALLET_ADDRESS) {
        console.error('❌ WALLET_ADDRESS nav konfigurēts');
        await closeIssue(octokit, owner, repo, issueNumber, '❌ WALLET_ADDRESS nav iestatīts GitHub Secrets.');
        return;
    }
    
    if (!RENDER_URL) {
        console.error('❌ RENDER_URL nav konfigurēts');
        await closeIssue(octokit, owner, repo, issueNumber, '❌ RENDER_URL nav iestatīts GitHub Secrets.');
        return;
    }
    
    try {
        const repoName = getRepoName();
        const repoHash = getRepoHash(repoName);
        console.log('  repoName:', repoName);
        console.log('  repoHash:', repoHash);
        
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        
        // ==========================================
        // 1. PĀRBAUDĪT NFT
        // ==========================================
        console.log('\n1. Pārbaudam NFT...');
        const nftContract = new ethers.Contract(NFT_ADDRESS, NFT_ABI, provider);
        const tokenId = await nftContract.repositoryTokens(repoHash);
        
        let hasNFT = false;
        let hasSubscription = false;
        
        if (tokenId === 0n || tokenId === 0) {
            console.log('❌ Nav NFT');
        } else {
            const nftOwner = await nftContract.ownerOf(tokenId);
            if (nftOwner.toLowerCase() === WALLET_ADDRESS.toLowerCase()) {
                hasNFT = true;
                console.log('✅ NFT atrasts, tokenId:', tokenId.toString());
            } else {
                console.log('❌ NFT nepieder šai adresei');
                await closeIssue(octokit, owner, repo, issueNumber,
                    '❌ NFT nepieder šai adresei\n\n' +
                    `NFT īpašnieks: ${nftOwner}\n` +
                    `Tava adrese: ${WALLET_ADDRESS}`
                );
                return;
            }
        }
        
        // ==========================================
        // 2. PĀRBAUDĪT ABONEMENTU
        // ==========================================
        console.log('\n2. Pārbaudam abonementu...');
        
        if (hasNFT) {
            const subscriptionContract = new ethers.Contract(SUBSCRIPTION_ADDRESS, SUBSCRIPTION_ABI, provider);
            hasSubscription = await subscriptionContract.isSubscribed(tokenId);
            
            if (hasSubscription) {
                console.log('✅ Abonements aktīvs');
            } else {
                console.log('❌ Nav abonementa');
            }
        }
        
        // ==========================================
        // 3. JA KAUT KAS TRŪKST — INFORMĒT LIETOTĀJU
        // ==========================================
        if (!hasNFT || !hasSubscription) {
            let msg = '';
            
            if (!hasNFT) msg += '❌ Nav atrasts NFT\n';
            if (!hasSubscription) msg += '❌ Nav atrasts abonements\n';
            
            msg += '\n📋 Lai turpinātu:\n\n';
            
            let step = 1;
            
            if (!hasNFT) {
                msg += `${step}. Izveido NFT:\n`;
                msg += `   https://virsburts-permrepo-server.onrender.com/nft.html?repo=${encodeURIComponent(repoName)}\n\n`;
                step++;
            }
            
            if (!hasSubscription) {
                msg += `${step}. Iegādājies abonementu:\n`;
                msg += `   https://virsburts-permrepo-server.onrender.com/subscribe.html?repo=${encodeURIComponent(repoName)}\n\n`;
            }
            
            msg += 'Kad viss izdarīts, izveido jaunu Issue ar nosaukumu [PermRepo Backup]';
            
            await closeIssue(octokit, owner, repo, issueNumber, msg);
            return;
        }
        
        console.log('✅ NFT un abonements OK');
        
        // ==========================================
        // 4. SKENĒT FAILUS (INKREMENTĀLI)
        // ==========================================
        console.log('\n4. Skenējam failus...');
        const currentFiles = scanFiles(process.cwd());
        const lockData = loadLockFile(process.cwd());
        const { changed, unchanged, deleted } = compareWithLock(currentFiles, lockData);
        
        console.log(`  Izmainīti: ${changed.length} faili`);
        console.log(`  Nemainīti: ${Object.keys(unchanged).length} faili`);
        console.log(`  Dzēsti: ${deleted.length} faili`);
        
        if (changed.length === 0 && deleted.length === 0) {
            await closeIssue(octokit, owner, repo, issueNumber, '✅ Nav izmaiņu kopš pēdējā backupa.');
            return;
        }
        
        // ==========================================
        // 5. SŪTĪT UZ RENDER
        // ==========================================
        console.log('\n5. Sūtam uz Render...');
        
        const requestBody = {
            repoName,
            files: changed,
            unchangedFiles: unchanged,
            deletedFiles: deleted,
            walletAddress: WALLET_ADDRESS
        };
        
        const headers = {
            'Content-Type': 'application/json',
            ...(RENDER_API_KEY ? { 'X-API-Key': RENDER_API_KEY } : {})
        };
        
        const response = await fetch(`${RENDER_URL}/api/prepare-backup`, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(300000)
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Kļūda: ' + (result.error || 'Nezināma kļūda'));
            return;
        }
        
        console.log('✅ Render sagatavoja backupu');
        console.log('  Backup ID:', result.backupId);
        console.log('  Izmaksas:', result.costEth, 'ETH');
        
        // ==========================================
        // 6. DOD APMAKSAS LINKU
        // ==========================================
        const payUrl = `https://virsburts-permrepo-server.onrender.com/storage-pay.html?backupId=${result.backupId}&repo=${encodeURIComponent(repoName)}&amount=${result.costEth}`;
        
        console.log('\n6. Dodam apmaksas linku...');
        
        await closeIssue(octokit, owner, repo, issueNumber,
            '✅ NFT atrasts\n' +
            '✅ Abonements aktīvs\n\n' +
            '📦 Backups sagatavots!\n\n' +
            `💰 Apmaksas summa: ${result.costEth} ETH\n\n` +
            'Lai pabeigtu backupu, atver apmaksas lapu:\n\n' +
            `${payUrl}\n\n` +
            'Pēc apmaksas backups tiks automātiski pabeigts.'
        );
        
    } catch (error) {
        console.error('💥 KĻŪDA:', error.message);
        console.error(error);
        await closeIssue(octokit, owner, repo, issueNumber, '❌ Kļūda: ' + error.message);
    }
    
    console.log('\n=== ACTION BEIDZAS ===');
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
