const { ethers } = require('ethers');

const SUBSCRIPTION_ABI = [
    "function isSubscribed(address user) external view returns (bool)"
];

async function checkSubscription(provider, subscriptionAddress, userAddress) {
    if (!subscriptionAddress) throw new Error('Nav norādīta Subscription līguma adrese');

    const contract = new ethers.Contract(subscriptionAddress, SUBSCRIPTION_ABI, provider);
    return await contract.isSubscribed(userAddress);
}

module.exports = { checkSubscription };
