const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const { scanFiles, compareWithLock, saveLock, getRepoName } = require('../git/scanner');
const { TurboUploader } = require('../arweave/turbo');
const { createManifest } = require('../manifest/create');
const { createMerkleTree } = require('../merkle/tree');

const CONFIG = {
    RPC_URL: 'https://sepolia.base.org',
    SUBSCRIPTION_ADDRESS: '0x29f1ed42C6C2E157B7571f9585a9C9Dd6fBcda51',
    NFT_ADDRESS: '0xeD3eB455cAeb057a034d7bE2368cdCEA37Faa1d4',
    REGISTRY_ADDRESS: '0x2a5a7F926046BB1A011D9082aB70BF38bfcb9dc9',
    TURBO_UPLOAD_URL: 'https://upload.services.ar-io.dev',
    TURBO_PAYMENT_URL: 'https://payment.services.ar-io.dev',
    WEB_URL: 'https://perma-repo.pages.dev'
};

async function backup(opts) {
    const wallet = process.env.WALLET_ADDRESS;
    if (!wallet) {
        console.log(JSON.stringify({ status: 'no_wallet', message: 'Nav iestatīts WALLET_ADDRESS GitHub Secrets.' }));
        return;
    }

    const repoPath = path.resolve(opts.repo || '.');
    const repoName = getRepoName(repoPath);
    const repoHash = ethers.id(repoName);
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    // 1. PĀRBAUDA NFT
    const nftABI = ['function repositoryTokens(bytes32) view returns (uint256)'];
    const nftContract = new ethers.Contract(CONFIG.NFT_ADDRESS, nftABI, provider);
    const tokenId = await nftContract.repositoryTokens(repoHash);

    if (tokenId === 0n) {
        console.log(JSON.stringify({
            status: 'no_nft',
            message: 'Nav izveidots NFT šim repozitorijam.',
            nftUrl: `${CONFIG.WEB_URL}/pay.html?repo=${encodeURIComponent(repoName)}`
        }));
        return;
    }

    // 2. PĀRBAUDA NFT ĪPAŠUMTIESĪBAS
    const ownerABI = ['function ownerOf(uint256) view returns (address)'];
    const nftOwnerContract = new ethers.Contract(CONFIG.NFT_ADDRESS, ownerABI, provider);
    const nftOwner = await nftOwnerContract.ownerOf(tokenId);
    if (nftOwner.toLowerCase() !== wallet.toLowerCase()) {
        console.log(JSON.stringify({
            status: 'not_owner',
            message: 'NFT nepieder šim makam.',
            expectedOwner: nftOwner,
            providedWallet: wallet
        }));
        return;
    }

    // 3. PĀRBAUDA ABONEMENTU
    const subABI = ['function isSubscribed(uint256) view returns (bool)'];
    const subContract = new ethers.Contract(CONFIG.SUBSCRIPTION_ADDRESS, subABI, provider);
    const isSubscribed = await subContract.isSubscribed(tokenId);
    if (!isSubscribed) {
        console.log(JSON.stringify({
            status: 'no_subscription',
            message: `NFT (tokenId: ${tokenId}) nav aktīva abonementa.`,
            subscribeUrl: `${CONFIG.WEB_URL}/subscribe.html`
        }));
        return;
    }

    // 4. PĀRBAUDA PARAKSTU
    const issueBody = process.env.ISSUE_BODY;
    if (!issueBody) {
        console.log(JSON.stringify({
            status: 'signature_required',
            message: 'Lūdzu, paraksti backupu ar MetaMask.',
            signUrl: `${CONFIG.WEB_URL}/sign.html?repo=${encodeURIComponent(repoName)}`
        }));
        return;
    }

    let address;
    try {
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            console.log(JSON.stringify({ status: 'invalid_signature', message: 'Neizdevās atrast JSON datus.' }));
            return;
        }
        const payload = JSON.parse(jsonMatch[1]);
        const { signature, message, timestamp } = payload;
        if (Math.floor(Date.now() / 1000) - timestamp > 600) {
            console.log(JSON.stringify({ status: 'expired_signature', message: 'Paraksts ir novecojis (>10 min).' }));
            return;
        }
        address = ethers.verifyMessage(message, signature);
        if (address.toLowerCase() !== wallet.toLowerCase()) {
            console.log(JSON.stringify({ status: 'wrong_signer', message: 'Paraksts neatbilst maka adresei.' }));
            return;
        }
    } catch (error) {
        console.log(JSON.stringify({ status: 'invalid_signature', message: error.message }));
        return;
    }

    // 5. SKENĒ UN AUGŠUPIELĀDĒ
    const currentFiles = scanFiles(repoPath);
    const lockData = loadLock(repoPath);
    const { unchanged, changed } = compareWithLock(currentFiles, lockData);
    if (!Object.keys(changed).length) {
        console.log(JSON.stringify({ status: 'skipped', reason: 'no_changes' }));
        return;
    }

    const allFiles = { ...unchanged, ...changed };
    const { root: merkleRoot } = createMerkleTree(allFiles);

    const uploader = new TurboUploader({ uploadUrl: CONFIG.TURBO_UPLOAD_URL, paymentUrl: CONFIG.TURBO_PAYMENT_URL });
    const results = await uploader.uploadChangedFiles(repoPath, changed, repoName);
    const manifest = createManifest(unchanged, results, repoName);
    const manifestTxId = await uploader.uploadManifest(manifest, repoName);

    const backupDir = path.join(repoPath, '.permrepo', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const localPath = path.join(backupDir, `manifest-${ts}.json`);
    fs.writeFileSync(localPath, JSON.stringify(manifest, null, 2));

    saveLock(repoPath, unchanged, results);
    const totalSize = Object.values(results).reduce((s, f) => s + f.size, 0);

    console.log(JSON.stringify({
        status: 'success',
        manifestTxId,
        localManifestPath: localPath,
        merkleRoot,
        filesChanged: Object.keys(results).length,
        totalSize
    }));
}

function loadLock(repoPath) {
    const lockPath = path.join(repoPath, 'permarepo.lock.json');
    if (!fs.existsSync(lockPath)) return {};
    try { return JSON.parse(fs.readFileSync(lockPath, 'utf-8')).files || {}; } catch { return {}; }
}

module.exports = { backup };
