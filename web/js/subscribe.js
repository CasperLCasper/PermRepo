// ============================================
// PERMAREPO ABONĒŠANAS LAPA
// ============================================

const SUBSCRIPTION_ADDRESS = '0x29f1ed42C6C2E157B7571f9585a9C9Dd6fBcda51';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const CHAIN_ID = '0x14a34';
const CHAIN_NAME = 'Base Sepolia';
const SUBSCRIPTION_PRICE_USDC = 2;
const SUBSCRIPTION_PERIOD_DAYS = 30;

const ABI = ["function subscribe(uint256 tokenId) external"];
const ERC20_ABI = [
    "function approve(address,uint256) external returns(bool)",
    "function allowance(address,address) external view returns(uint256)",
    "function decimals() external view returns(uint8)"
];

let contract, usdc, signer, userAddress;

async function init() {
    if (!window.ethereum) { 
        showError('❌ Instalē MetaMask vai citu kripto maku'); 
        return; 
    }
    
    try {
        await ethereum.request({ 
            method: 'wallet_switchEthereumChain', 
            params: [{ chainId: CHAIN_ID }] 
        });
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        
        contract = new ethers.Contract(SUBSCRIPTION_ADDRESS, ABI, signer);
        usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
        
        const button = document.getElementById('btn');
        button.disabled = false;
        button.textContent = '💎 Aktivizēt abonementu';
        button.onclick = subscribe;
        
        setStatus(`✅ Savienots (${CHAIN_NAME})`);
    } catch (e) { 
        showError('❌ Kļūda: ' + e.message); 
    }
}

async function subscribe() {
    const tokenId = document.getElementById('tokenId').value;
    
    if (!tokenId || tokenId < 1) {
        showError('❌ Lūdzu, ievadi NFT Token ID');
        return;
    }
    
    try {
        const button = document.getElementById('btn');
        button.disabled = true;
        button.textContent = '⏳ Gaida apstiprinājumu...';

        // Aprēķināt cenu ar pareizu decimals skaitu
        const price = ethers.parseUnits(SUBSCRIPTION_PRICE_USDC.toString(), 6);

        // Pārbaudīt USDC atļauju
        const allowance = await usdc.allowance(userAddress, SUBSCRIPTION_ADDRESS);
        
        if (allowance < price) {
            setStatus('1/2: Apstiprini USDC atļauju...');
            const approveTx = await usdc.approve(SUBSCRIPTION_ADDRESS, price);
            await approveTx.wait();
        }

        setStatus('2/2: Apstiprini abonementu...');
        const tx = await contract.subscribe(tokenId);
        await tx.wait();

        setStatus(`✅ Abonements aktivizēts! Derīgs ${SUBSCRIPTION_PERIOD_DAYS} dienas.`);
        button.textContent = '✅ Gatavs';
    } catch (e) {
        if (e.code === 'ACTION_REJECTED') {
            showError('❌ Transakcija atcelta');
        } else {
            showError('❌ ' + e.message);
        }
        const button = document.getElementById('btn');
        button.disabled = false;
        button.textContent = '💎 Aktivizēt abonementu';
    }
}

function setStatus(message) {
    document.getElementById('status').textContent = message;
}

function showError(message) {
    document.getElementById('error').textContent = message;
}

init();
