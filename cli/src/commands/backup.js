const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const { scanFiles, compareWithLock, saveLock, getRepoName } = require('../git/scanner');
const { TurboUploader } = require('../arweave/turbo');
const { createManifest } = require('../manifest/create');
const { createMerkleTree } = require('../merkle/tree');
const { checkSubscription } = require('../blockchain/subscription');
const { getExistingNFT, updateNFT } = require('../blockchain/nft');

async function backup(opts) {
    const wallet = opts.wallet;
    if (!wallet) throw new Error('Nepieciešama maka adrese (-w)');

    const repoPath = path.resolve(opts.repo || '.');
    const repoName = getRepoName(repoPath);
    const repoHash = ethers.id(repoName);

    const provider = new ethers.JsonRpcProvider(opts.rpc);

    // 1. Pārbauda abonementu
    const subscribed = await checkSubscription(provider, opts.subscription, wallet);
    if (!subscribed) {
        console.log(JSON.stringify({ status: 'no_subscription', message: 'Nav aktīva abonementa' }));
        return;
    }

    // 2. Pārbauda NFT
    const tokenId = await getExistingNFT(provider, opts.nft, repoHash);
    if (tokenId === 0n) {
        console.log(JSON.stringify({ status: 'no_nft', message: 'Nav izveidots NFT šim repo' }));
        return;
    }

    // 3. Pārbauda NFT īpašumtiesības
    const nftContract = new ethers.Contract(opts.nft, [
        'function ownerOf(uint256) view returns (address)',
        'function getNonce(uint256) view returns (uint256)'
    ], provider);
    const owner = await nftContract.ownerOf(tokenId);
    if (owner.toLowerCase() !== wallet.toLowerCase()) {
        throw new Error('NFT nepieder šim makam');
    }

    // 4. Skenē failus
    const currentFiles = scanFiles(repoPath);
    const lockData = loadLock(repoPath);
    const { unchanged, changed } = compareWithLock(currentFiles, lockData);

    if (!Object.keys(changed).length) {
        console.log(JSON.stringify({ status: 'skipped', reason: 'no_changes' }));
        return;
    }

    // 5. Aprēķina Merkle root no VISIEM failiem (pirms augšupielādes)
    const allFiles = { ...unchanged, ...changed };
    const { root: merkleRoot } = createMerkleTree(allFiles);

    // 6. Izveido manifestu un aprēķina tā hash
    const manifest = createManifest(unchanged, changed, repoName);
    const manifestHash = ethers.id(JSON.stringify(manifest));

    // 7. Pieprasa lietotāja EIP712 parakstu PIRMS augšupielādes
    const nonce = await nftContract.getNonce(tokenId);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    console.log(JSON.stringify({
        status: 'signature_required',
        message: 'Lūdzu, paraksti backupu ar MetaMask pirms augšupielādes',
        tokenId: tokenId.toString(),
        manifestHash: manifestHash,
        merkleRoot: merkleRoot,
        nonce: nonce.toString(),
        deadline: deadline,
        filesChanged: Object.keys(changed).length,
        totalFiles: Object.keys(allFiles).length,
        signUrl: `https://perma-repo.pages.dev/sign.html?tokenId=${tokenId}&manifestHash=${manifestHash}&merkleRoot=${merkleRoot}&nonce=${nonce}&deadline=${deadline}`
    }));

    // 8. Pārbauda, vai paraksts ir sniegts
    const signature = process.env.BACKUP_SIGNATURE;
    if (!signature) {
        console.log(JSON.stringify({ status: 'waiting_signature', message: 'Gaida lietotāja parakstu...' }));
        return;
    }

    // 9. Augšupielādē mainītos failus (tikai pēc paraksta saņemšanas)
    const uploader = new TurboUploader({
        uploadUrl: opts.turboUpload,
        paymentUrl: opts.turboPayment
    });
    const results = await uploader.uploadChangedFiles(repoPath, changed, repoName);

    // 10. Atjaunina manifestu ar reālajiem TX ID
    const finalManifest = createManifest(unchanged, results, repoName);
    const manifestTxId = await uploader.uploadManifest(finalManifest, repoName);

    // 11. Saglabā manifestu lokāli testēšanai
    const backupDir = path.join(repoPath, '.permrepo', 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const localManifestPath = path.join(backupDir, `manifest-${timestamp}.json`);
    fs.writeFileSync(localManifestPath, JSON.stringify(finalManifest, null, 2));
    console.log(`📁 Manifests saglabāts lokāli: ${localManifestPath}`);

    // 12. Izsauc addBackup ar lietotāja parakstu
    const totalSize = Object.values(results).reduce((s, f) => s + f.size, 0);

    try {
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY || ethers.ZeroHash, provider);
        await updateNFT({
            signer,
            nftAddress: opts.nft,
            tokenId,
            manifestHash: ethers.id(JSON.stringify(finalManifest)),
            merkleRoot,
            manifestURI: `ar://${manifestTxId}`,
            deadline,
            signature
        });
    } catch (error) {
        console.warn({ warning: 'nft_update_failed', error: error.message });
    }

    // 13. Saglabā lock failu
    saveLock(repoPath, unchanged, results);

    console.log(JSON.stringify({
        status: 'success',
        manifestTxId,
        localManifestPath,
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
