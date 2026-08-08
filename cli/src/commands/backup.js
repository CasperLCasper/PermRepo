const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('../config');
const { scanFiles, compareWithLock, saveLock, getRepoName } = require('../git/scanner');
const { TurboUploader } = require('../arweave/turbo');
const { createManifest } = require('../manifest/create');
const { createMerkleTree } = require('../merkle/tree');
const { getExistingNFT } = require('../blockchain/nft');
const { checkSubscription } = require('../blockchain/subscription');

function getRepoHash(repoName) {
    return ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['string'], [repoName])
    );
}

async function backup(opts) {
    const walletAddress = opts.wallet || CONFIG.WALLET_ADDRESS;
    if (!walletAddress) {
        console.log('❌ Nav iestatīts WALLET_ADDRESS.');
        return;
    }

    const repoPath = path.resolve(opts.repo || '.');
    const repoName = getRepoName(repoPath).trim();
    const repoHash = getRepoHash(repoName);
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    console.log('🚀 PermRepo — Inkrementāls backups');
    console.log(`📦 Repo: ${repoName}`);
    console.log(`👛 Maks: ${walletAddress}`);

    // NFT pārbaude
    const tokenId = await getExistingNFT(provider, CONFIG.NFT_ADDRESS, repoHash);
    if (tokenId === 0n || tokenId === 0) {
        console.log(`❌ Nav NFT. Izveido: ${CONFIG.WEB_URL}${CONFIG.PAY_PAGE}?repo=${encodeURIComponent(repoName)}`);
        return;
    }

    // Īpašnieka pārbaude
    const nftContract = new ethers.Contract(CONFIG.NFT_ADDRESS, ['function ownerOf(uint256) view returns (address)'], provider);
    const nftOwner = await nftContract.ownerOf(tokenId);
    if (nftOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        console.log('❌ NFT nepieder šim makam.');
        return;
    }

    // Abonementa pārbaude
    const subscribed = await checkSubscription(provider, CONFIG.SUBSCRIPTION_ADDRESS, tokenId);
    if (!subscribed) {
        console.log(`❌ Nav abonementa. Aktivizē: ${CONFIG.WEB_URL}${CONFIG.SUBSCRIBE_PAGE}`);
        return;
    }

    // Paraksta verifikācija
    const issueBody = process.env.ISSUE_BODY;
    if (issueBody) {
        try {
            const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
            if (!jsonMatch) { console.log('❌ Nav JSON datu.'); return; }
            const payload = JSON.parse(jsonMatch[1]);
            const { signature, message, timestamp } = payload;
            if (Math.floor(Date.now() / 1000) - timestamp > CONFIG.SIGNATURE_TIMEOUT_SECONDS) {
                console.log('❌ Paraksts novecojis.'); return;
            }
            const recovered = ethers.verifyMessage(message, signature);
            if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
                console.log('❌ Paraksts neatbilst.'); return;
            }
            console.log('✅ Paraksts verificēts');
        } catch (e) {
            console.log('❌ Kļūda:', e.message);
            return;
        }
    }

    // Failu skenēšana
    const currentFiles = scanFiles(repoPath);
    const lockData = loadLock(repoPath);
    const { unchanged, changed, deleted } = compareWithLock(currentFiles, lockData);
    
    if (Object.keys(changed).length === 0 && deleted.length === 0) {
        console.log('✅ Nav izmaiņu.');
        return;
    }

    console.log(`📊 Mainīti: ${Object.keys(changed).length}, Dzēsti: ${deleted.length}`);

    // Merkle root
    const allFiles = { ...unchanged, ...changed };
    const { root: merkleRoot } = createMerkleTree(allFiles);

    // Augšupielāde
    const uploader = new TurboUploader();
    const results = await uploader.uploadChangedFiles(repoPath, changed, repoName);
    const manifest = createManifest(unchanged, results, repoName);
    const manifestTxId = await uploader.uploadManifest(manifest, repoName);

    // Lokālā kopija
    const backupDir = path.join(repoPath, CONFIG.PERMAREPO_DIR, CONFIG.BACKUPS_DIR);
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(backupDir, `manifest-${ts}.json`), JSON.stringify(manifest, null, 2));

    // Lock fails
    saveLock(repoPath, unchanged, results);

    const totalSize = Object.values(results).reduce((s, f) => s + f.size, 0);
    console.log('✅ BACKUPS VEIKSMĪGS!');
    console.log(`🔗 Manifests: ar://${manifestTxId}`);
    console.log(`📊 Faili: ${Object.keys(results).length}`);
    console.log(`📦 Izmērs: ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`🌳 Merkle: ${merkleRoot}`);

    return { status: 'success', manifestTxId, merkleRoot, filesChanged: Object.keys(results).length, totalSize, tokenId: tokenId.toString() };
}

function loadLock(repoPath) {
    const lockPath = path.join(repoPath, CONFIG.LOCK_FILE_NAME);
    if (!fs.existsSync(lockPath)) return { files: {} };
    try { return { files: JSON.parse(fs.readFileSync(lockPath, 'utf-8')).files || {} }; } catch { return { files: {} }; }
}

module.exports = { backup };
