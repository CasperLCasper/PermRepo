const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const { scanFiles, compareWithLock, saveLock, getRepoName } = require('../git/scanner');
const { TurboUploader } = require('../arweave/turbo');
const { createManifest } = require('../manifest/create');
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
        console.log(JSON.stringify({ status: 'no_subscription', message: 'Nav aktīva abonementa'}));
        return;
    }

    // 2. Pārbauda NFT
    const tokenId = await getExistingNFT(provider, opts.nft, repoHash);
    if (tokenId === 0n) {
        console.log(JSON.stringify({ status: 'no_nft', message: 'Nav izveidots NFT šim repo'}));
        return;
    }

    // 3. Pārbauda NFT īpašumtiesības
    const nftContract = new ethers.Contract(opts.nft, ['function ownerOf(uint256) view returns (address)'], provider);
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

    // 5. Augšupielādē mainītos failus
    const uploader = new TurboUploader({
        uploadUrl: opts.turboUpload,
        paymentUrl: opts.turboPayment
    });
    const results = await uploader.uploadChangedFiles(repoPath, changed, repoName);

    // 6. Izveido un augšupielādē manifest
    const manifest = createManifest(unchanged, results, repoName);
    const manifestTxId = await uploader.uploadManifest(manifest, repoName);

    // 7. Atjaunina NFT (ja ir paraksts)
    const totalSize = Object.values(results).reduce((s, f) => s + f.size, 0);
    // Šeit būtu EIP712 paraksta loģika
    // await updateNFT(...);

    // 8. Saglabā lock failu
    saveLock(repoPath, unchanged, results);

    console.log(JSON.stringify({
        status: 'success',
        manifestTxId,
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
