const { ethers } = require('ethers');
const CONFIG = require('../config');

const NFT_ABI = [
    "function repositoryTokens(bytes32 repoHash) external view returns (uint256)",
    "function ownerOf(uint256 tokenId) external view returns (address)",
    "function addBackup(uint256 tokenId, bytes32 manifestHash, bytes32 merkleRoot, string calldata manifestURI, uint256 deadline, bytes calldata signature) external",
    "function backupCount(uint256 tokenId) external view returns (uint256)",
    "function getRepositoryHash(uint256 tokenId) external view returns (bytes32)",
    "function getBackupCount(uint256 tokenId) external view returns (uint256)",
    "function getNonce(uint256 tokenId) external view returns (uint256)"
];

async function getExistingNFT(provider, nftAddress, repoHash) {
    const address = nftAddress || CONFIG.NFT_ADDRESS;
    if (!address) throw new Error('Nav noradita NFT liguma adrese');
    const contract = new ethers.Contract(address, NFT_ABI, provider);
    return await contract.repositoryTokens(repoHash);
}

async function getNFTBackupCount(provider, nftAddress, tokenId) {
    const address = nftAddress || CONFIG.NFT_ADDRESS;
    const contract = new ethers.Contract(address, NFT_ABI, provider);
    return await contract.backupCount(tokenId);
}

async function addBackup({ provider, nftAddress, tokenId, manifestHash, merkleRoot, manifestURI, deadline, signature }) {
    const address = nftAddress || CONFIG.NFT_ADDRESS;
    if (!address) throw new Error('Nav noradita NFT liguma adrese');
    
    const contract = new ethers.Contract(address, NFT_ABI, provider);
    
    console.log(`Ieraksta backupu blockchain (tokenId: ${tokenId})...`);
    const tx = await contract.addBackup(tokenId, manifestHash, merkleRoot, manifestURI, deadline, signature);
    console.log(`Gaida transakcijas apstiprinajumu: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Transakcija apstiprinata bloka: ${receipt.blockNumber}`);
    
    return { tx, receipt };
}

async function getNFTNonce(provider, nftAddress, tokenId) {
    const address = nftAddress || CONFIG.NFT_ADDRESS;
    const contract = new ethers.Contract(address, NFT_ABI, provider);
    return await contract.getNonce(tokenId);
}

module.exports = { 
    getExistingNFT, 
    getNFTBackupCount, 
    addBackup, 
    getNFTNonce 
};
