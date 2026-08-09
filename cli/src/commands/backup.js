const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('../config');
const { scanFiles, compareWithLock, saveLock, getRepoName } = require('../git/scanner');
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

    // Ipasnieka parbaude
    const nftContract = new ethers.Contract(CONFIG.NFT_ADDRESS, ['function ownerOf(uint256) view returns (address)'], provider);
    const nftOwner = await nftContract.ownerOf(tokenId);
    if (nftOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        console.log('NFT nepieder sim makam.');
        return;
    }
    console.log('NFT ipasumtiesibas apstiprinatas');

    // Abonementa parbaude
    const subscribed = await checkSubscription(provider, CONFIG.SUBSCRIPTION_ADDRESS, tokenId);
    if (!subscribed) {
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
        console.log('Nav izmainu kops pedeja backupa.');
        return;
    }

    const totalChangedSize = Object.values(changed).reduce((s, f) => s + f.size, 0);
    console.log(`Mainiti: ${Object.keys(changed).length} faili, ${(totalChangedSize / 1024).toFixed(1)} KB`);

    // Glabasanas apmaksas verifikacija
    const issueBody = process.env.ISSUE_BODY;
    
    if (!issueBody) {
        const filesList = Object.entries(changed).map(([filePath, info]) => ({
            path: filePath,
            size: info.size
        }));
        const filesParam = encodeURIComponent(JSON.stringify(filesList));
        
        console.log('Nepieciesams augsupieladet failus.');
        console.log(`Failu skaits: ${filesList.length}`);
        console.log(`Kopejais izmers: ${(totalChangedSize / 1024).toFixed(1)} KB`);
        console.log(`Augsupieladet: ${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?repo=${encodeURIComponent(repoName)}&files=${filesParam}`);
        console.log('Pirms tam parliecinies, ka esi iegadajies Turbo kreditus: https://console.ar.io/topup');
        return;
    }

    let uploadedFiles = [];
    let manifestTxId = null;
    
    try {
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            console.log('Neizdevas atrast JSON datus.');
            return;
        }
        
        const payload = JSON.parse(jsonMatch[1]);
        const { signature, message, timestamp, uploadedFiles: files, manifestTxId: issueManifestTxId } = payload;
        
        if (Math.floor(Date.now() / 1000) - timestamp > CONFIG.SIGNATURE_TIMEOUT_SECONDS) {
            console.log('Paraksts ir novecojis (>10 min).');
            return;
        }
        
        const recovered = ethers.verifyMessage(message, signature);
        if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
            console.log('Paraksts neatbilst maka adresei.');
            return;
        }
        
        uploadedFiles = files || [];
        manifestTxId = issueManifestTxId || null;
        
        console.log('Glabasanas apmaksa verificeta');
        if (uploadedFiles.length > 0) console.log(`Augsupieladeti ${uploadedFiles.length} faili`);
        if (manifestTxId) console.log(`Manifests: ar://${manifestTxId}`);
        
    } catch (e) {
        console.log('Kluda verificejot parakstu:', e.message);
        return;
    }

    // Apvienot failus no parluka un lokalas skenesanas
    const allUploaded = {};
    for (const f of uploadedFiles) {
        allUploaded[f.path] = { hash: '', txId: f.txId, size: f.size };
    }
    for (const [fp, info] of Object.entries(changed)) {
        if (!allUploaded[fp]) allUploaded[fp] = info;
    }

    // Merkle root
    const allFiles = { ...unchanged, ...allUploaded };
    const { root: merkleRoot } = createMerkleTree(allFiles);
    console.log(`Merkle root: ${merkleRoot}`);

    // Lokala manifesta kopija
    if (manifestTxId) {
        const manifest = {
            manifest: 'arweave/paths',
            version: '0.2.0',
            index: { path: 'README.md' },
            paths: {},
            metadata: {
                repo: repoName,
                timestamp: new Date().toISOString(),
                generatedBy: 'PermRepo v1.0.0'
            }
        };
        for (const [fp, info] of Object.entries(allUploaded)) {
            manifest.paths[fp] = { id: info.txId };
        }
        
        const backupDir = path.join(repoPath, CONFIG.PERMAREPO_DIR, CONFIG.BACKUPS_DIR);
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(path.join(backupDir, `manifest-${ts}.json`), JSON.stringify(manifest, null, 2));
    }

    // Lock fails
    saveLock(repoPath, unchanged, allUploaded);
    if (deleted.length > 0) console.log(`Dzestie faili: ${deleted.join(', ')}`);

    const totalSize = Object.values(allUploaded).reduce((s, f) => s + f.size, 0);
    
    console.log('=======================================================');
    console.log('BACKUPS VEIKSMIGS!');
    console.log(`Faili:     ${Object.keys(allUploaded).length}`);
    console.log(`Izmers:    ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`Merkle:    ${merkleRoot}`);
    if (manifestTxId) console.log(`Manifests: ar://${manifestTxId}`);
    console.log('=======================================================');

    return {
        status: 'success',
        manifestTxId,
        merkleRoot,
        filesChanged: Object.keys(allUploaded).length,
        totalSize,
        tokenId: tokenId.toString()
    };
}

function loadLock(repoPath) {
    const lockPath = path.join(repoPath, CONFIG.LOCK_FILE_NAME);
    if (!fs.existsSync(lockPath)) return { files: {} };
    try { return { files: JSON.parse(fs.readFileSync(lockPath, 'utf-8')).files || {} }; } catch { return { files: {} }; }
}

module.exports = { backup };
