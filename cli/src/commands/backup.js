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
    console.log('=======================================================');
    console.log(`📦 Repozitorijs: ${repoName}`);
    console.log(`👛 Maks: ${walletAddress}`);

    // ==========================================
    // 1. NFT PĀRBAUDE
    // ==========================================
    const tokenId = await getExistingNFT(provider, CONFIG.NFT_ADDRESS, repoHash);
    
    if (tokenId === 0n || tokenId === 0) {
        console.log('❌ Nav izveidots NFT šim repozitorijam.');
        console.log(`🔗 Izveidot NFT: ${CONFIG.WEB_URL}${CONFIG.NFT_PAGE}?repo=${encodeURIComponent(repoName)}`);
        console.log('⚠️ Pēc NFT izveides, izveido jaunu Issue, lai palaistu backup.');
        return;
    }

    // ==========================================
    // 2. NFT ĪPAŠNIEKA PĀRBAUDE
    // ==========================================
    const nftContract = new ethers.Contract(CONFIG.NFT_ADDRESS, ['function ownerOf(uint256) view returns (address)'], provider);
    const nftOwner = await nftContract.ownerOf(tokenId);
    
    if (nftOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        console.log('❌ NFT nepieder šim makam.');
        console.log(`   NFT īpašnieks: ${nftOwner}`);
        console.log(`   Tavs maks:     ${walletAddress}`);
        return;
    }
    console.log('✅ NFT īpašumtiesības apstiprinātas');

    // ==========================================
    // 3. ABONEMENTA PĀRBAUDE
    // ==========================================
    const subscribed = await checkSubscription(provider, CONFIG.SUBSCRIPTION_ADDRESS, tokenId);
    
    if (!subscribed) {
        console.log(`❌ Nav aktīva abonementa.`);
        console.log(`🔗 Aktivizēt abonementu: ${CONFIG.WEB_URL}${CONFIG.SUBSCRIBE_PAGE}`);
        console.log('⚠️ Pēc abonementa iegādes, izveido jaunu Issue, lai palaistu backup.');
        return;
    }
    console.log('✅ Abonements aktīvs');

    // ==========================================
    // 4. GLABĀŠANAS APMAKSAS VERIFIKĀCIJA
    // ==========================================
    const issueBody = process.env.ISSUE_BODY;
    
    if (!issueBody) {
        console.log('💳 Nepieciešams iegādāties glabāšanas kredītus.');
        console.log(`🔗 Pirkt kredītus: ${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?repo=${encodeURIComponent(repoName)}`);
        console.log('⚠️ Pēc kredītu iegādes, izveido jaunu Issue.');
        return;
    }

    let txHash = null;
    
    try {
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            console.log('❌ Neizdevās atrast JSON datus Issue aprakstā.');
            console.log(`💳 Nepieciešams iegādāties glabāšanas kredītus.`);
            console.log(`🔗 Pirkt kredītus: ${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?repo=${encodeURIComponent(repoName)}`);
            return;
        }
        
        const payload = JSON.parse(jsonMatch[1]);
        const { signature, message, timestamp, txHash: issueTxHash } = payload;
        
        if (Math.floor(Date.now() / 1000) - timestamp > CONFIG.SIGNATURE_TIMEOUT_SECONDS) {
            console.log('❌ Paraksts ir novecojis (>10 min).');
            console.log(`🔗 Pirkt kredītus no jauna: ${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?repo=${encodeURIComponent(repoName)}`);
            return;
        }
        
        const recovered = ethers.verifyMessage(message, signature);
        if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
            console.log('❌ Paraksts neatbilst maka adresei.');
            return;
        }
        
        txHash = issueTxHash;
        console.log('✅ Glabāšanas apmaksa verificēta');
        if (txHash) {
            console.log(`🔗 Transakcija: https://sepolia.basescan.org/tx/${txHash}`);
        }
    } catch (e) {
        console.log('❌ Kļūda verificējot parakstu:', e.message);
        return;
    }

    // ==========================================
    // 5. FAILU SKENĒŠANA
    // ==========================================
    console.log('📊 Skenē failus...');
    const currentFiles = scanFiles(repoPath);
    console.log(`   Atrasti ${Object.keys(currentFiles).length} faili`);
    
    const lockData = loadLock(repoPath);
    const { unchanged, changed, deleted } = compareWithLock(currentFiles, lockData);
    
    console.log(`   Nemainīti: ${Object.keys(unchanged).length}`);
    console.log(`   Mainīti:   ${Object.keys(changed).length}`);
    console.log(`   Dzēsti:    ${deleted.length}`);
    
    if (Object.keys(changed).length === 0 && deleted.length === 0) {
        console.log('✅ Nav izmaiņu kopš pēdējā backupa.');
        return;
    }

    // ==========================================
    // 6. MERKLE ROOT
    // ==========================================
    const allFiles = { ...unchanged, ...changed };
    const { root: merkleRoot } = createMerkleTree(allFiles);
    console.log(`🌳 Merkle root: ${merkleRoot}`);

    // ==========================================
    // 7. AUGŠUPIELĀDE UZ ARWEAVE
    // ==========================================
    console.log('📤 Augšupielādē failus uz Arweave...');
    const uploader = new TurboUploader();
    
    try {
        const results = await uploader.uploadChangedFiles(repoPath, changed, repoName);
        console.log(`✅ Augšupielādēti ${Object.keys(results).length} faili`);

        // ==========================================
        // 8. MANIFESTS
        // ==========================================
        const manifest = createManifest(unchanged, results, repoName);
        const manifestTxId = await uploader.uploadManifest(manifest, repoName);
        const manifestURI = `ar://${manifestTxId}`;
        console.log(`📋 Manifests: ${manifestURI}`);

        // ==========================================
        // 9. LOKĀLĀ KOPIJA
        // ==========================================
        const permRepoDir = path.join(repoPath, CONFIG.PERMAREPO_DIR);
        const backupDir = path.join(permRepoDir, CONFIG.BACKUPS_DIR);
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const localPath = path.join(backupDir, `manifest-${ts}.json`);
        fs.writeFileSync(localPath, JSON.stringify(manifest, null, 2));
        console.log(`💾 Lokālā kopija: ${localPath}`);

        // ==========================================
        // 10. LOCK FAILS
        // ==========================================
        saveLock(repoPath, unchanged, results);
        if (deleted.length > 0) {
            console.log(`🗑️ Dzēstie faili izņemti no lock faila: ${deleted.join(', ')}`);
        }

        // ==========================================
        // 11. REZULTĀTS
        // ==========================================
        const totalSize = Object.values(results).reduce((s, f) => s + f.size, 0);
        
        console.log('=======================================================');
        console.log('✅ BACKUPS VEIKSMĪGS!');
        console.log(`🔗 Manifests: ${manifestURI}`);
        console.log(`📊 Faili:     ${Object.keys(results).length} mainīti, ${Object.keys(unchanged).length} nemainīti`);
        console.log(`📦 Izmērs:    ${(totalSize / 1024).toFixed(1)} KB`);
        console.log(`🌳 Merkle:    ${merkleRoot}`);
        console.log('=======================================================');

        return {
            status: 'success',
            manifestTxId,
            merkleRoot,
            filesChanged: Object.keys(results).length,
            totalSize,
            tokenId: tokenId.toString()
        };
    } catch (uploadError) {
        console.log('❌ Augšupielāde neizdevās:', uploadError.message);
        console.log(`💳 Iespējams, nepietiek kredītu. Pirkt vēlreiz: ${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?repo=${encodeURIComponent(repoName)}`);
        return;
    }
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
