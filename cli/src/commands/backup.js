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
    console.log(`📦 Repozitorijs: ${repoName}`);
    console.log(`👛 Maks: ${walletAddress}`);

    const tokenId = await getExistingNFT(provider, CONFIG.NFT_ADDRESS, repoHash);
    if (tokenId === 0n || tokenId === 0) {
        console.log(`❌ Nav NFT. Izveido: ${CONFIG.WEB_URL}${CONFIG.NFT_PAGE}?repo=${encodeURIComponent(repoName)}`);
        return;
    }
    const nftContract = new ethers.Contract(CONFIG.NFT_ADDRESS, ['function ownerOf(uint256) view returns (address)'], provider);
    if ((await nftContract.ownerOf(tokenId)).toLowerCase() !== walletAddress.toLowerCase()) {
        console.log('❌ NFT nepieder šim makam.'); return;
    }
    console.log('✅ NFT īpašumtiesības apstiprinātas');

    if (!(await checkSubscription(provider, CONFIG.SUBSCRIPTION_ADDRESS, tokenId))) {
        console.log(`❌ Nav abonementa. Aktivizē: ${CONFIG.WEB_URL}${CONFIG.SUBSCRIBE_PAGE}`); return;
    }
    console.log('✅ Abonements aktīvs');

    const issueBody = process.env.ISSUE_BODY;
    if (!issueBody) {
        console.log(`💳 Nepieciešams apmaksāt glabāšanu: ${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?repo=${encodeURIComponent(repoName)}`);
        return;
    }

    let uploadedFiles = [];
    try {
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            console.log('❌ Nav JSON datu.');
            console.log(`💳 Apmaksāt glabāšanu: ${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?repo=${encodeURIComponent(repoName)}`);
            return;
        }
        const payload = JSON.parse(jsonMatch[1]);
        const { signature, message, timestamp, txHash, uploadedFiles: files } = payload;
        if (Math.floor(Date.now() / 1000) - timestamp > CONFIG.SIGNATURE_TIMEOUT_SECONDS) {
            console.log('❌ Paraksts novecojis.'); return;
        }
        if (ethers.verifyMessage(message, signature).toLowerCase() !== walletAddress.toLowerCase()) {
            console.log('❌ Paraksts neatbilst.'); return;
        }
        uploadedFiles = files || [];
        console.log('✅ Glabāšanas apmaksa verificēta');
        if (txHash) console.log(`🔗 Transakcija: https://sepolia.basescan.org/tx/${txHash}`);
        if (uploadedFiles.length > 0) console.log(`📤 Augšupielādēti ${uploadedFiles.length} faili no pārlūka`);
    } catch (e) {
        console.log('❌ Kļūda:', e.message); return;
    }

    console.log('📊 Skenē failus...');
    const currentFiles = scanFiles(repoPath);
    const lockData = loadLock(repoPath);
    const { unchanged, changed, deleted } = compareWithLock(currentFiles, lockData);
    
    if (Object.keys(changed).length === 0 && deleted.length === 0 && uploadedFiles.length === 0) {
        console.log('✅ Nav izmaiņu.'); return;
    }

    // Apvienot failus no pārlūka un lokālās skenēšanas
    const allUploaded = {};
    for (const f of uploadedFiles) allUploaded[f.path] = { hash: '', txId: f.txId, size: f.size };
    for (const [fp, info] of Object.entries(changed)) allUploaded[fp] = info;

    const allFiles = { ...unchanged, ...allUploaded };
    const { root: merkleRoot } = createMerkleTree(allFiles);
    console.log(`🌳 Merkle root: ${merkleRoot}`);

    const manifest = createManifest(unchanged, allUploaded, repoName);
    
    const backupDir = path.join(repoPath, CONFIG.PERMAREPO_DIR, CONFIG.BACKUPS_DIR);
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(backupDir, `manifest-${ts}.json`), JSON.stringify(manifest, null, 2));

    saveLock(repoPath, unchanged, allUploaded);
    if (deleted.length > 0) console.log(`🗑️ Dzēstie faili: ${deleted.join(', ')}`);

    const totalSize = Object.values(allUploaded).reduce((s, f) => s + f.size, 0);
    console.log('✅ BACKUPS VEIKSMĪGS!');
    console.log(`📊 Faili: ${Object.keys(allUploaded).length}`);
    console.log(`📦 Izmērs: ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`🌳 Merkle: ${merkleRoot}`);

    return { status: 'success', merkleRoot, filesChanged: Object.keys(allUploaded).length, totalSize, tokenId: tokenId.toString() };
}

function loadLock(repoPath) {
    const lockPath = path.join(repoPath, CONFIG.LOCK_FILE_NAME);
    if (!fs.existsSync(lockPath)) return { files: {} };
    try { return { files: JSON.parse(fs.readFileSync(lockPath, 'utf-8')).files || {} }; } catch { return { files: {} }; }
}

module.exports = { backup };
