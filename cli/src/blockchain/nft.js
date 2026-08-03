const { ethers } = require('ethers');

const NFT_ABI = [
    "function repositoryTokens(bytes32 repoHash) external view returns (uint256)",
    "function ownerOf(uint256 tokenId) external view returns (address)",
    "function addBackup(uint256 tokenId, bytes32 manifestHash, bytes32 merkleRoot, string calldata manifestURI, uint256 deadline, bytes calldata signature) external"
];

/**
 * Pārbauda, vai repo jau ir NFT
 * @param {ethers.Provider} provider
 * @param {string} nftAddress
 * @param {string} repoHash
 * @returns {Promise<bigint>} tokenId vai 0
 */
async function getExistingNFT(provider, nftAddress, repoHash) {
    if (!nftAddress) throw new Error('Nav norādīta NFT līguma adrese');

    const contract = new ethers.Contract(nftAddress, NFT_ABI, provider);
    return await contract.repositoryTokens(repoHash);
}

/**
 * Atjaunina NFT ar jauno backup informāciju
 * @param {Object} params - Parametru objekts
 * @param {ethers.Signer} params.signer - Parakstītājs
 * @param {string} params.nftAddress - NFT līguma adrese
 * @param {bigint} params.tokenId - NFT token ID
 * @param {string} params.manifestHash - Manifesta hash
 * @param {string} params.merkleRoot - Merkle root
 * @param {string} params.manifestURI - Manifesta URI
 * @param {bigint} params.deadline - Termiņš
 * @param {string} params.signature - EIP712 paraksts
 * @returns {Promise<ethers.TransactionResponse>}
 */
async function updateNFT({ signer, nftAddress, tokenId, manifestHash, merkleRoot, manifestURI, deadline, signature }) {
    if (!nftAddress) throw new Error('Nav norādīta NFT līguma adrese');

    const contract = new ethers.Contract(nftAddress, NFT_ABI, signer);
    const tx = await contract.addBackup(tokenId, manifestHash, merkleRoot, manifestURI, deadline, signature);
    await tx.wait();
    return tx;
}

module.exports = { getExistingNFT, updateNFT };
