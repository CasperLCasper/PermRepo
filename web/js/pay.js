const NFT_ADDRESS = '0xeD3eB455cAeb057a034d7bE2368cdCEA37Faa1d4';
const CHAIN_ID = '0x14a34';
const params = new URLSearchParams(window.location.search);
const repo = params.get('repo') || '';

if (repo) {
    document.getElementById('repoInput').value = repo;
}

const ABI = ["function mintRepository(address,string) external returns(uint256)"];

let signer, userAddress;

async function init() {
    if (!window.ethereum) {
        document.getElementById('error').textContent = '❌ Instalē MetaMask vai citu kripto maku';
        return;
    }
    
    try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
        const provider = new ethers.BrowserProvider(ethereum);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        
        document.getElementById('mintButton').disabled = false;
        document.getElementById('mintButton').textContent = '🔒 Generate NFT';
        document.getElementById('mintButton').onclick = mintNFT;
        document.getElementById('status').textContent = '✅ Gatavs kalšanai';
    } catch(e) {
        document.getElementById('error').textContent = '❌ Kļūda: ' + e.message;
    }
}

async function mintNFT() {
    const repo = document.getElementById('repoInput').value.trim();
    
    if (!repo) {
        document.getElementById('error').textContent = '❌ Nav norādīts repozitorija nosaukums. Izmanto ?repo=lietotajs/repo';
        return;
    }
    
    try {
        document.getElementById('mintButton').disabled = true;
        document.getElementById('mintButton').textContent = '⏳ Gaida...';
        document.getElementById('status').textContent = `Veido NFT priekš: ${repo}`;
        document.getElementById('error').textContent = '';
        
        const contract = new ethers.Contract(NFT_ADDRESS, ABI, signer);
        const tx = await contract.mintRepository(userAddress, repo);
        await tx.wait();
        
        document.getElementById('status').textContent = `✅ NFT izveidots priekš: ${repo}`;
        document.getElementById('mintButton').textContent = '✅ Gatavs';
        
    } catch(e) {
        if (e.code === 'ACTION_REJECTED') {
            document.getElementById('error').textContent = '❌ Transakcija atcelta';
        } else {
            document.getElementById('error').textContent = '❌ Kļūda: ' + e.message;
        }
        document.getElementById('mintButton').disabled = false;
        document.getElementById('mintButton').textContent = '🔒 Generate NFT';
    }
}

init();
