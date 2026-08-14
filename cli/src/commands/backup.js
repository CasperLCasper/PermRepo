const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CONFIG = require('../config');
const { scanFiles, compareWithLock, saveLock, getRepoName } = require('../git/scanner');
const { createMerkleTree } = require('../merkle/tree');
const { getExistingNFT } = require('../blockchain/nft');
const { checkSubscription } = require('../blockchain/subscription');

const RENDER_URL = process.env.RENDER_URL || 'https://virsburts-permrepo-server.onrender.com';
const RENDER_API_KEY = process.env.RENDER_API_KEY || '';

function getRepoHash(repoName) {
    return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], [repoName]));
}

async function backup(opts) {
    const walletAddress = opts.wallet || process.env.WALLET_ADDRESS;
    if (!walletAddress) { 
        console.log('Nav iestatits WALLET_ADDRESS.'); 
        return; 
    }

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
        console.log('❌ Nav atrasts NFT');
        console.log(`1. Izveido NFT: ${CONFIG.WEB_URL}${CONFIG.NFT_PAGE}?repo=${encodeURIComponent(repoName)}`);
        return;
    }
    
    const nftContract = new ethers.Contract(CONFIG.NFT_ADDRESS, ['function ownerOf(uint256) view returns (address)'], provider);
    const nftOwner = await nftContract.ownerOf(tokenId);
    if (nftOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        console.log('❌ NFT nepieder šai adresei');
        return;
    }
    console.log('✅ NFT atrasts');

    // Abonementa parbaude
    if (!(await checkSubscription(provider, CONFIG.SUBSCRIPTION_ADDRESS, tokenId))) {
        console.log('❌ Nav atrasts abonements');
        console.log(`1. Iegādājies abonementu: ${CONFIG.WEB_URL}${CONFIG.SUBSCRIBE_PAGE}?repo=${encodeURIComponent(repoName)}`);
        return;
    }
    console.log('✅ Abonements aktīvs');

    // Failu skenesana
    const currentFiles = scanFiles(repoPath);
    const lockData = loadLock(repoPath);
    const { unchanged, changed, deleted } = compareWithLock(currentFiles, lockData);
    
    if (Object.keys(changed).length === 0 && deleted.length === 0) {
        console.log('✅ Nav izmaiņu kopš pēdējā backupa.');
        return;
    }

    console.log(`Izmainīti: ${Object.keys(changed).length} faili`);
    console.log(`Nemainīti: ${Object.keys(unchanged).length} faili`);
    console.log(`Dzēsti: ${deleted.length} faili`);

    // Sūtīt uz Render
    console.log('Sūtam uz Render...');
    
    const changedArray = Object.entries(changed).map(([filePath, info]) => ({
        path: filePath,
        size: info.size,
        content: info.content,
        hash: info.hash
    }));
    
    const requestBody = {
        repoName,
        files: changedArray,
        unchangedFiles: unchanged,
        deletedFiles: deleted,
        walletAddress
    };
    
    const headers = {
        'Content-Type': 'application/json',
        ...(RENDER_API_KEY ? { 'X-API-Key': RENDER_API_KEY } : {})
    };
    
    const response = await fetch(`${RENDER_URL}/api/prepare-backup`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
    });
    
    const result = await response.json();
    
    if (!result.success) {
        console.log('❌ Kļūda:', result.error);
        return;
    }
    
    console.log('✅ Backups sagatavots!');
    console.log(`💰 Apmaksas summa: ${result.costEth} ETH`);
    console.log(`🔗 Apmaksas lapa: ${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?backupId=${result.backupId}&repo=${encodeURIComponent(repoName)}&amount=${result.costEth}`);
    
    return {
        status: 'pending',
        backupId: result.backupId,
        costEth: result.costEth
    };
}

function loadLock(repoPath) {
    const lockPath = path.join(repoPath, CONFIG.LOCK_FILE_NAME);
    if (!fs.existsSync(lockPath)) return { files: {} };
    try { 
        return { files: JSON.parse(fs.readFileSync(lockPath, 'utf-8')).files || {} }; 
    } catch { 
        return { files: {} }; 
    }
}

module.exports = { backup };
