const SUBSCRIPTION_ADDRESS = '0x29f1ed42C6C2E157B7571f9585a9C9Dd6fBcda51';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const CHAIN_ID = '0x14a34';

const ABI = ["function subscribe(uint256 tokenId) external"];
const ERC20_ABI = ["function approve(address,uint256) external returns(bool)","function allowance(address,address) external view returns(uint256)"];

let contract, usdc, signer, userAddress;

async function init() {
    if (!window.ethereum) { 
        document.getElementById('error').textContent = '❌ Instalē MetaMask'; 
        return; 
    }
    try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
        const p = new ethers.BrowserProvider(ethereum);
        signer = await p.getSigner();
        userAddress = await signer.getAddress();
        contract = new ethers.Contract(SUBSCRIPTION_ADDRESS, ABI, signer);
        usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
        document.getElementById('btn').disabled = false;
        document.getElementById('btn').textContent = '💎 Aktivizēt abonementu';
        document.getElementById('btn').onclick = subscribe;
        document.getElementById('status').textContent = '✅ Savienots (Base Sepolia)';
    } catch(e) { 
        document.getElementById('error').textContent = '❌ Kļūda: ' + e.message; 
    }
}

async function subscribe() {
    const tokenId = document.getElementById('tokenId').value;
    if (!tokenId || tokenId < 1) {
        document.getElementById('error').textContent = '❌ Lūdzu, ievadi NFT Token ID';
        return;
    }
    
    try {
        document.getElementById('btn').disabled = true;
        document.getElementById('btn').textContent = '⏳ Gaida apstiprinājumu...';

        const price = ethers.parseUnits('2', 6);
        const allowance = await usdc.allowance(userAddress, SUBSCRIPTION_ADDRESS);
        if (allowance < price) {
            document.getElementById('status').textContent = '1/2: Apstiprini USDC atļauju...';
            const approveTx = await usdc.approve(SUBSCRIPTION_ADDRESS, price);
            await approveTx.wait();
        }

        document.getElementById('status').textContent = '2/2: Apstiprini abonementu...';
        const tx = await contract.subscribe(tokenId);
        await tx.wait();

        document.getElementById('status').textContent = '✅ Abonements aktivizēts!';
        document.getElementById('btn').textContent = '✅ Gatavs';
    } catch(e) {
        document.getElementById('error').textContent = '❌ ' + e.message;
        document.getElementById('btn').disabled = false;
        document.getElementById('btn').textContent = '💎 Aktivizēt abonementu';
    }
}

init();
