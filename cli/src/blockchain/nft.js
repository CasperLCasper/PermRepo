const { ethers } = require('ethers');

const NFT_ABI = [
    "function repositoryTokens(bytes32 repoHash) external view returns (uint256)",
    "function ownerOf(uint256 tokenId) external view returns (address)",
    "function addBackup(uint256 tokenId, bytes32 manifestHash, bytes32 merkleRoot, string calldata manifestURI, uint256 deadline, bytes calldata signature) external"
];

async function getExistingNFT(provider, nftAddress, repoHash) {
    if (!nftAddress) throw new Error('Nav norādīta NFT līguma adrese');
    const contract = new ethers.Contract(nftAddress, NFT_ABI, provider);
    return await contract.repositoryTokens(repoHash);
}

async function updateNFT({ signer, nftAddress, tokenId, manifestHash, merkleRoot, manifestURI, deadline, signature }) {
    if (!nftAddress) throw new Error('Nav norādīta NFT līguma adrese');
    const contract = new ethers.Contract(nftAddress, NFT_ABI, signer);
    const tx = await contract.addBackup(tokenId, manifestHash, merkleRoot, manifestURI, deadline, signature);
    await tx.wait();
    return tx;
}

module.exports = { getExistingNFT, updateNFT };
