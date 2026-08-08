const { ethers } = require('ethers');
const CONFIG = require('../config');

const SUBSCRIPTION_ABI = [
    "function isSubscribed(uint256 tokenId) external view returns (bool)",
    "function getSubscriptionExpiry(uint256 tokenId) external view returns (uint256)"
];

async function checkSubscription(provider, subscriptionAddress, tokenId) {
    const address = subscriptionAddress || CONFIG.SUBSCRIPTION_ADDRESS;
    if (!address) throw new Error('Nav norādīta Subscription līguma adrese');
    const contract = new ethers.Contract(address, SUBSCRIPTION_ABI, provider);
    return await contract.isSubscribed(tokenId);
}

module.exports = { checkSubscription };
