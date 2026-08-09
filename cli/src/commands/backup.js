const { ethers } = require('ethers');
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
    if (!walletAddress) { console.log('❌ Nav iestatīts WALLET_ADDRESS.'); return; }

    const repoPath = path.resolve(opts.repo || '.');
    const repoName = getRepoName(repoPath).trim();
    const repoHash = getRepoHash(repoName);
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    console.log('🚀 PermRepo — Inkrementāls backups');
    console.log('=======================================================');
    console.log(`📦 Repozitorijs: ${repoName}`);
    console.log(`👛 Maks: ${walletAddress}`);

    // NFT pārbaude
    const tokenId = await getExistingNFT(provider, CONFIG.NFT_ADDRESS, repoHash);
    if (tokenId === 0n || tokenId === 0) {
        console.log('❌ Nav izveidots NFT šim repozitorijam.');
        console.log(`🔗 Izveidot NFT: ${CONFIG.WEB_URL}${CONFIG.NFT_PAGE}?repo=${encodeURIComponent(repoName)}`);
        return;
    }

    // Īpašnieka pārbaude
    const nftContract = new ethers.Contract(CONFIG.NFT_ADDRESS, ['function ownerOf(uint256) view returns (address)'], provider);
    const nftOwner = await nftContract.ownerOf(tokenId);
    if (nftOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        console.log('❌ NFT nepieder šim makam.');
        return;
    }
    console.log('✅ NFT īpašumtiesības apstiprinātas');

    // Abonementa pārbaude
    const subscribed = await checkSubscription(provider, CONFIG.SUBSCRIPTION_ADDRESS, tokenId);
    if (!subscribed) {
        console.log('❌ Nav aktīva abonementa.');
        console.log(`🔗 Aktivizēt abonementu: ${CONFIG.WEB_URL}${CONFIG.SUBSCRIBE_PAGE}`);
        return;
    }
    console.log('✅ Abonements aktīvs');

    // Failu skenēšana pirms apmaksas
    const currentFiles = scanFiles(repoPath);
    const lockData = loadLock(repoPath);
    const { unchanged, changed, deleted } = compareWithLock(currentFiles, lockData);
    
    if (Object.keys(changed).length === 0 && deleted.length === 0) {
        console.log('✅ Nav izmaiņu kopš pēdējā backupa.');
        return;
    }

    // Aprēķināt kopējo izmēru
    const totalChangedSize = Object.values(changed).reduce((s, f) => s + f.size, 0);
    console.log(`📊 Mainīti: ${Object.keys(changed).length} faili, ${(totalChangedSize / 1024).toFixed(1)} KB`);

    // Glabāšanas apmaksas verifikācija
    const issueBody = process.env.ISSUE_BODY;
    
    if (!issueBody) {
        // Izveidot failu sarakstu priekš storage-pay.html
        const filesList = Object.entries(changed).map(([filePath, info]) => ({
            path: filePath,
            size: info.size
        }));
        
        const filesParam = encodeURIComponent(JSON.stringify(filesList));
        const estimatedCost = Math.max(0.001, totalChangedSize / 1000000 * 0.001).toFixed(4);
        
        console.log('💳 Nepieciešams apmaksāt glabāšanu.');
        console.log(`📊 Failu skaits: ${filesList.length}`);
        console.log(`📦 Kopējais izmērs: ${(totalChangedSize / 1024).toFixed(1)} KB`);
        console.log(`💰 Aptuvenās izmaksas: ~${estimatedCost} ETH`);
        console.log(`🔗 Apmaksāt glabāšanu: ${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?repo=${encodeURIComponent(repoName)}&files=${filesParam}`);
        return;
    }

    let uploadedFiles = [];
    
    try {
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            console.log('❌ Neizdevās atrast JSON datus.');
            const filesList = Object.entries(changed).map(([fp, info]) => ({ path: fp, size: info.size }));
            const filesParam = encodeURIComponent(JSON.stringify(filesList));
            console.log(`💳 Apmaksāt glabāšanu: ${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?repo=${encodeURIComponent(repoName)}&files=${filesParam}`);
            return;
        }
        
        const payload = JSON.parse(jsonMatch[1]);
        const { signature, message, timestamp, txHash, uploadedFiles: files } = payload;
        
        if (Math.floor(Date.now() / 1000) - timestamp > CONFIG.SIGNATURE_TIMEOUT_SECONDS) {
            console.log('❌ Paraksts ir novecojis (>10 min).');
            return;
        }
        
        const recovered = ethers.verifyMessage(message, signature);
        if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
            console.log('❌ Paraksts neatbilst maka adresei.');
            return;
        }
        
        uploadedFiles = files || [];
        console.log('✅ Glabāšanas apmaksa verificēta');
        if (txHash) {
            console.log(`🔗 Transakcija: https://sepolia.basescan.org/tx/${txHash}`);
        }
        if (uploadedFiles.length > 0) {
            console.log(`📤 No pārlūka augšupielādēti ${uploadedFiles.length} faili`);
        }
    } catch (e) {
        console.log('❌ Kļūda verificējot parakstu:', e.message);
        return;
    }

    // Apvienot failus no pārlūka un lokālās skenēšanas
    const allUploaded = {};
    for (const f of uploadedFiles) {
        allUploaded[f.path] = { hash: '', txId: f.txId, size: f.size };
    }
    for (const [fp, info] of Object.entries(changed)) {
        if (!allUploaded[fp]) {
            allUploaded[fp] = info;
        }
    }

    // Merkle root
    const allFiles = { ...unchanged, ...allUploaded };
    const { root: merkleRoot } = createMerkleTree(allFiles);
    console.log(`🌳 Merkle root: ${merkleRoot}`);

    // Manifests
    const manifest = createManifest(unchanged, allUploaded, repoName);

    // Lokālā kopija
    const backupDir = path.join(repoPath, CONFIG.PERMAREPO_DIR, CONFIG.BACKUPS_DIR);
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(backupDir, `manifest-${ts}.json`), JSON.stringify(manifest, null, 2));

    // Lock fails
    saveLock(repoPath, unchanged, allUploaded);
    if (deleted.length > 0) {
        console.log(`🗑️ Dzēstie faili izņemti no lock faila: ${deleted.join(', ')}`);
    }

    const totalSize = Object.values(allUploaded).reduce((s, f) => s + f.size, 0);
    
    console.log('=======================================================');
    console.log('✅ BACKUPS VEIKSMĪGS!');
    console.log(`📊 Faili:     ${Object.keys(allUploaded).length}`);
    console.log(`📦 Izmērs:    ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`🌳 Merkle:    ${merkleRoot}`);
    console.log('=======================================================');

    return {
        status: 'success',
        merkleRoot,
        filesChanged: Object.keys(allUploaded).length,
        totalSize,
        tokenId: tokenId.toString()
    };
}

function loadLock(repoPath) {
    const lockPath = path.join(repoPath, CONFIG.LOCK_FILE_NAME);
    if (!fs.existsSync(lockPath)) return { files: {} };
    try {
        const data = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        return { files: data.files || {} };
    } catch {
        console.warn('⚠️ Bojāts lock fails — sākam no jauna');
        return { files: {} };
    }
}

module.exports = { backup };
