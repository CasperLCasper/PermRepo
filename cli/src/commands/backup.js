const { ethers } = require('ethers');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('../config');
const { scanFiles, compareWithLock, saveLock, getRepoName } = require('../git/scanner');
const { createManifest } = require('../manifest/create');
const { createMerkleTree } = require('../merkle/tree');
const { getExistingNFT } = require('../blockchain/nft');
const { checkSubscription } = require('../blockchain/subscription');

function getRepoHash(repoName) {
    return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], [repoName]));
}

async function backup(opts) {
    const walletAddress = opts.wallet || CONFIG.WALLET_ADDRESS;
    if (!walletAddress) { console.log('Nav iestatits WALLET_ADDRESS.'); return; }

    const repoPath = path.resolve(opts.repo || '.');
    const repoName = getRepoName(repoPath).trim();
    const repoHash = getRepoHash(repoName);
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    console.log('PermRepo — Inkrementals backups');
    console.log('=======================================================');
    console.log(`Repozitorijs: ${repoName}`);
    console.log(`Maks: ${walletAddress}`);

    // NFT parbaude
    const tokenId = await getExistingNFT(provider, CONFIG.NFT_ADDRESS, repoHash);
    if (tokenId === 0n || tokenId === 0) {
        console.log('Nav izveidots NFT sim repozitorijam.');
        console.log(`Izveidot NFT: ${CONFIG.WEB_URL}${CONFIG.NFT_PAGE}?repo=${encodeURIComponent(repoName)}`);
        return;
    }
    const nftContract = new ethers.Contract(CONFIG.NFT_ADDRESS, ['function ownerOf(uint256) view returns (address)'], provider);
    if ((await nftContract.ownerOf(tokenId)).toLowerCase() !== walletAddress.toLowerCase()) {
        console.log('NFT nepieder sim makam.'); return;
    }
    console.log('NFT ipasumtiesibas apstiprinatas');

    // Abonementa parbaude
    if (!(await checkSubscription(provider, CONFIG.SUBSCRIPTION_ADDRESS, tokenId))) {
        console.log('Nav aktiva abonementa.');
        console.log(`Aktivizet abonementu: ${CONFIG.WEB_URL}${CONFIG.SUBSCRIBE_PAGE}`);
        return;
    }
    console.log('Abonements aktivs');

    // Failu skenesana
    const currentFiles = scanFiles(repoPath);
    const lockData = loadLock(repoPath);
    const { unchanged, changed, deleted } = compareWithLock(currentFiles, lockData);
    
    if (Object.keys(changed).length === 0 && deleted.length === 0) {
        console.log('Nav izmainu kops pedeja backupa.'); return;
    }

    const totalChangedSize = Object.values(changed).reduce((s, f) => s + f.size, 0);
    console.log(`Mainiti: ${Object.keys(changed).length} faili, ${(totalChangedSize / 1024).toFixed(1)} KB`);

    // Izveidot lokalo serveri
    const PORT = 3000;
    const filesList = Object.entries(changed).map(([fp, info]) => ({
        path: fp, size: info.size, content: fs.readFileSync(path.join(repoPath, fp), 'utf-8')
    }));

    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        if (req.url === '/get-files') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ repoName, files: filesList }));
        } else if (req.url === '/complete' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const result = JSON.parse(body);
                    const { uploadedFiles, manifestTxId } = result;
                    
                    const allUploaded = {};
                    for (const f of uploadedFiles) allUploaded[f.path] = { hash: '', txId: f.txId, size: f.size };
                    for (const [fp, info] of Object.entries(unchanged)) allUploaded[fp] = info;
                    
                    const allFiles = { ...unchanged, ...allUploaded };
                    const { root: merkleRoot } = createMerkleTree(allFiles);
                    
                    const manifest = createManifest(unchanged, allUploaded, repoName);
                    const backupDir = path.join(repoPath, CONFIG.PERMAREPO_DIR, CONFIG.BACKUPS_DIR);
                    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
                    const ts = new Date().toISOString().replace(/[:.]/g, '-');
                    fs.writeFileSync(path.join(backupDir, `manifest-${ts}.json`), JSON.stringify(manifest, null, 2));
                    
                    saveLock(repoPath, unchanged, allUploaded);
                    
                    const totalSize = Object.values(allUploaded).reduce((s, f) => s + f.size, 0);
                    
                    console.log('=======================================================');
                    console.log('BACKUPS VEIKSMIGS!');
                    console.log(`Faili: ${Object.keys(allUploaded).length}`);
                    console.log(`Izmers: ${(totalSize / 1024).toFixed(1)} KB`);
                    console.log(`Merkle: ${merkleRoot}`);
                    console.log(`Manifests: ar://${manifestTxId}`);
                    console.log('=======================================================');
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, merkleRoot, manifestTxId }));
                    
                    server.close();
                    process.exit(0);
                    
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        } else {
            // Serve statisko lapu
            const htmlPath = path.join(__dirname, '..', '..', '..', 'web', 'localhost-upload.html');
            if (fs.existsSync(htmlPath)) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(fs.readFileSync(htmlPath, 'utf-8'));
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<html><body><h1>PermRepo Localhost Bridge</h1><p>Atver ${CONFIG.WEB_URL}/localhost-upload.html</p></body></html>`);
            }
        }
    });

    server.listen(PORT, () => {
        console.log(`Lokalais serveris: http://localhost:${PORT}`);
        console.log('Atver parlukprogrammu...');
        const { exec } = require('node:child_process');
        exec(`xdg-open http://localhost:${PORT}`).unref();
    });
}

function loadLock(repoPath) {
    const lockPath = path.join(repoPath, CONFIG.LOCK_FILE_NAME);
    if (!fs.existsSync(lockPath)) return { files: {} };
    try { return { files: JSON.parse(fs.readFileSync(lockPath, 'utf-8')).files || {} }; } catch { return { files: {} }; }
}

module.exports = { backup };
