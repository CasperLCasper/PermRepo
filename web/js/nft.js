const NFT_ADDRESS = '0xeD3eB455cAeb057a034d7bE2368cdCEA37Faa1d4';
const CHAIN_ID = '0x14a34';
const CHAIN_NAME = 'Base Sepolia';

const params = new URLSearchParams(window.location.search);
let repo = (params.get('repo') || '').trim().toLowerCase();

const ABI = ["function mintRepository(address,string) external returns(uint256)"];

let signer, userAddress;

async function init() {
    if (!window.ethereum) {
        showError('❌ Instalē MetaMask vai citu kripto maku');
        return;
    }
    
    try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
        const provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        
        if (repo) {
            document.getElementById('repoInput').value = repo;
            document.getElementById('repoDisplay').textContent = repo;
        }
        
        const button = document.getElementById('mintButton');
        button.disabled = false;
        button.textContent = '🔒 Izveidot NFT';
        button.onclick = mintNFT;
        
        setStatus('✅ Gatavs kalšanai');
    } catch (e) {
        showError('❌ Kļūda: ' + e.message);
    }
}

async function mintNFT() {
    repo = document.getElementById('repoInput').value.trim().toLowerCase();
    
    if (!repo) {
        showError('❌ Nav norādīts repozitorija nosaukums.');
        return;
    }
    
    try {
        const button = document.getElementById('mintButton');
        button.disabled = true;
        button.textContent = '⏳ Gaida apstiprinājumu...';
        setStatus(`Veido NFT priekš: ${repo}`);
        clearError();
        
        const contract = new ethers.Contract(NFT_ADDRESS, ABI, signer);
        const tx = await contract.mintRepository(userAddress, repo);
        
        setStatus('⏳ Gaida transakcijas apstiprinājumu...');
        await tx.wait();
        
        setStatus(`✅ NFT izveidots priekš: ${repo}`);
        button.textContent = '✅ Gatavs';
    } catch (e) {
        if (e.code === 'ACTION_REJECTED') {
            showError('❌ Transakcija atcelta');
        } else {
            showError('❌ Kļūda: ' + e.message);
        }
        const button = document.getElementById('mintButton');
        button.disabled = false;
        button.textContent = '🔒 Izveidot NFT';
    }
}

function setStatus(message) { document.getElementById('status').textContent = message; }
function showError(message) { document.getElementById('error').textContent = message; }
function clearError() { document.getElementById('error').textContent = ''; }

init();
