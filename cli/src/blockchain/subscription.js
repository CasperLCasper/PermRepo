const { ethers } = require('ethers');
const CONFIG = require('../../../shared/config');

const SUBSCRIPTION_ABI = [
    "function isSubscribed(uint256 tokenId) external view returns (bool)",
    "function subscriptionExpiry(uint256 tokenId) external view returns (uint256)",
    "function getSubscriptionExpiry(uint256 tokenId) external view returns (uint256)"
];

/**
 * Pārbauda, vai NFT (repo) ir aktīvs abonements
 * @param {ethers.Provider} provider
 * @param {string} subscriptionAddress
 * @param {bigint|number} tokenId
 * @returns {Promise<boolean>}
 */
async function checkSubscription(provider, subscriptionAddress, tokenId) {
    const address = subscriptionAddress || CONFIG.SUBSCRIPTION_ADDRESS;
    if (!address) throw new Error('Nav norādīta Subscription līguma adrese');
    
    const contract = new ethers.Contract(address, SUBSCRIPTION_ABI, provider);
    const isSubscribed = await contract.isSubscribed(tokenId);
    return isSubscribed;
}

/**
 * Iegūst abonementa derīguma termiņu
 * @param {ethers.Provider} provider
 * @param {string} subscriptionAddress
 * @param {bigint|number} tokenId
 * @returns {Promise<bigint>}
 */
async function getSubscriptionExpiry(provider, subscriptionAddress, tokenId) {
    const address = subscriptionAddress || CONFIG.SUBSCRIPTION_ADDRESS;
    if (!address) throw new Error('Nav norādīta Subscription līguma adrese');
    
    const contract = new ethers.Contract(address, SUBSCRIPTION_ABI, provider);
    const expiry = await contract.getSubscriptionExpiry(tokenId);
    return expiry;
}

module.exports = { checkSubscription, getSubscriptionExpiry };
