const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('../../../shared/config');
const { scanFiles, compareWithLock, saveLock, getRepoName } = require('../git/scanner');
const { TurboUploader } = require('../arweave/turbo');
const { createManifest } = require('../manifest/create');
const { createMerkleTree } = require('../merkle/tree');
const { getExistingNFT, addBackup } = require('../blockchain/nft');
const { checkSubscription } = require('../blockchain/subscription');

/**
 * Galvenā backup funkcija
 * @param {Object} opts - Opcijas no CLI
 */
async function backup(opts) {
    console.log('🚀 PermRepo — Inkrementāls backups uz Arweave');
    console.log('=======================================================');

    // ==========================================
    // 0. IEGŪT MAKA ADRESI
    // ==========================================
    const walletAddress = opts.wallet || process.env.WALLET_ADDRESS;
    if (!walletAddress) {
        console.log('❌ Nav iestatīts WALLET_ADDRESS. Palaid caur GitHub Action vai iestati vidi.');
        return;
    }
    console.log(`👛 Maks: ${walletAddress}`);

    // ==========================================
    // 1. IEGŪT REPO NOSAUKUMU UN HASH
    // ==========================================
    const repoPath = path.resolve(opts.repo || '.');
    let repoName = getRepoName(repoPath).trim();
    const repoHash = ethers.id(repoName);
    
    console.log(`📦 Repozitorijs: ${repoName}`);
    console.log(`🔑 Repo hash: ${repoHash}`);

    // ==========================================
    // 2. SAVIENOTIES AR BLOCKCHAIN
    // ==========================================
    const rpcUrl = opts.rpc || CONFIG.RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const nftAddress = opts.nft || CONFIG.NFT_ADDRESS;
    const subscriptionAddress = opts.subscription || CONFIG.SUBSCRIPTION_ADDRESS;

    // ==========================================
    // 3. PĀRBAUDĪT NFT EKSISTENCI
    // ==========================================
    console.log('🔍 Pārbauda NFT...');
    const tokenId = await getExistingNFT(provider, nftAddress, repoHash);
    
    if (tokenId === 0n || tokenId === 0) {
        const payUrl = `${CONFIG.WEB_URL}${CONFIG.PAY_PAGE}?repo=${encodeURIComponent(repoName)}`;
        console.log('❌ Nav izveidots NFT šim repozitorijam.');
        console.log(`🔗 Izveidot NFT: ${payUrl}`);
        console.log('⚠️ Pēc NFT izveides, palaid backup vēlreiz.');
        return;
    }
    console.log(`✅ NFT atrasts: tokenId=${tokenId}`);

    // ==========================================
    // 4. PĀRBAUDĪT NFT ĪPAŠNIEKU
    // ==========================================
    const ownerABI = ['function ownerOf(uint256) view returns (address)'];
    const nftContract = new ethers.Contract(nftAddress, ownerABI, provider);
    const nftOwner = await nftContract.ownerOf(tokenId);
    
    if (nftOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        console.log('❌ NFT nepieder šim makam.');
        console.log(`   NFT īpašnieks: ${nftOwner}`);
        console.log(`   Tavs maks:     ${walletAddress}`);
        return;
    }
    console.log('✅ NFT īpašumtiesības apstiprinātas');

    // ==========================================
    // 5. PĀRBAUDĪT ABONEMENTU
    // ==========================================
    console.log('🔍 Pārbauda abonementu...');
    const subscribed = await checkSubscription(provider, subscriptionAddress, tokenId);
    
    if (!subscribed) {
        const subscribeUrl = `${CONFIG.WEB_URL}${CONFIG.SUBSCRIBE_PAGE}`;
        console.log(`❌ NFT (tokenId: ${tokenId}) nav aktīva abonementa.`);
        console.log(`🔗 Aktivizēt abonementu: ${subscribeUrl}`);
        console.log('⚠️ Pēc abonementa iegādes, palaid backup vēlreiz.');
        return;
    }
    console.log('✅ Abonements aktīvs');

    // ==========================================
    // 6. VERIFICĒT PARAKSTU (ja ir ISSUE_BODY)
    // ==========================================
    let parsedSignature = null;
    let parsedAddress = null;
    
    const issueBody = process.env.ISSUE_BODY;
    if (issueBody) {
        try {
            const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
            if (!jsonMatch) {
                console.log('❌ Neizdevās atrast JSON datus Issue aprakstā.');
                return;
            }
            
            const payload = JSON.parse(jsonMatch[1]);
            const { signature, message, timestamp } = payload;
            
            // Timestamp pārbaude
            const now = Math.floor(Date.now() / 1000);
            if (now - timestamp > CONFIG.SIGNATURE_TIMEOUT_SECONDS) {
                console.log('❌ Paraksts ir novecojis (>10 min). Lūdzu, mēģiniet vēlreiz.');
                return;
            }
            
            // Paraksta verifikācija
            parsedAddress = ethers.verifyMessage(message, signature);
            if (parsedAddress.toLowerCase() !== walletAddress.toLowerCase()) {
                console.log('❌ Paraksts neatbilst maka adresei.');
                return;
            }
            
            parsedSignature = signature;
            console.log('✅ Paraksts veiksmīgi verificēts');
        } catch (error) {
            console.log('❌ Kļūda verificējot parakstu:', error.message);
            return;
        }
    } else {
        console.log('⚠️ Nav ISSUE_BODY — izlaiž paraksta verifikāciju (lokālais režīms)');
    }

    // ==========================================
    // 7. SKENĒT FAILUS UN SALĪDZINĀT
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
    // 8. APRĒĶINĀT MERKLE ROOT
    // ==========================================
    const allFiles = { ...unchanged, ...changed };
    const { root: merkleRoot } = createMerkleTree(allFiles);
    console.log(`🌳 Merkle root: ${merkleRoot}`);

    // ==========================================
    // 9. AUGŠUPIELĀDĒT MAINĪTOS FAILUS
    // ==========================================
    console.log('📤 Augšupielādē mainītos failus uz Arweave...');
    const uploader = new TurboUploader({
        uploadUrl: opts.turboUpload || CONFIG.TURBO_UPLOAD_URL,
        paymentUrl: opts.turboPayment || CONFIG.TURBO_PAYMENT_URL
    });
    
    const results = await uploader.uploadChangedFiles(repoPath, changed, repoName);
    console.log(`✅ Augšupielādēti ${Object.keys(results).length} faili`);

    // ==========================================
    // 10. IZVEIDOT UN AUGŠUPIELĀDĒT MANIFESTU
    // ==========================================
    const manifest = createManifest(unchanged, results, repoName);
    const manifestTxId = await uploader.uploadManifest(manifest, repoName);
    const manifestURI = `ar://${manifestTxId}`;
    console.log(`📋 Manifests: ${manifestURI}`);

    // ==========================================
    // 11. SAGLABĀT LOKĀLO BACKUP KOPIJU
    // ==========================================
    const permRepoDir = path.join(repoPath, CONFIG.PERMAREPO_DIR);
    const backupDir = path.join(permRepoDir, CONFIG.BACKUPS_DIR);
    
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const localPath = path.join(backupDir, `manifest-${timestamp}.json`);
    fs.writeFileSync(localPath, JSON.stringify(manifest, null, 2));
    console.log(`💾 Lokālā kopija: ${localPath}`);

    // ==========================================
    // 12. SAGLABĀT LOCK FAILU
    // ==========================================
    saveLock(repoPath, unchanged, results);
    if (deleted.length > 0) {
        console.log(`🗑️ Dzēstie faili izņemti no lock faila: ${deleted.join(', ')}`);
    }

    // ==========================================
    // 13. REĢISTRĒT BACKUPU BLOCKCHAIN
    // ==========================================
    if (parsedSignature) {
        try {
            const manifestHash = ethers.id(manifestTxId);
            const deadline = Math.floor(Date.now() / 1000) + CONFIG.SIGNATURE_TIMEOUT_SECONDS;
            
            // Nepieciešams signer — bet Action vidē nav privātās atslēgas.
            // Tāpēc addBackup tiek izsaukts ar parakstu no lietotāja.
            // Šeit mēs izmantojam provider, lai nosūtītu transakciju,
            // bet vajag wallet ar privāto atslēgu, lai nosegotu gas.
            // 
            // RISINĀJUMS: addBackup funkciju var izsaukt jebkurš,
            // jo validācija notiek pret parakstu. Bet transakcijas sūtītājam
            // vajag ETH gas. Tāpēc izmantojam relayer vai pašu Action
            // ar iebūvētu wallet.
            
            console.log('⚠️ Blockchain reģistrācija izlaista — nepieciešams signer ar ETH');
            console.log(`📝 Dati reģistrācijai:`);
            console.log(`   tokenId:      ${tokenId}`);
            console.log(`   manifestHash: ${manifestHash}`);
            console.log(`   merkleRoot:   ${merkleRoot}`);
            console.log(`   manifestURI:  ${manifestURI}`);
            console.log(`   deadline:     ${deadline}`);
            
        } catch (error) {
            console.warn(`⚠️ Neizdevās reģistrēt backupu blockchain: ${error.message}`);
        }
    }

    // ==========================================
    // 14. REZULTĀTS
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
}

/**
 * Ielādē lock failu
 */
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
