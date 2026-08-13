import { ethers } from 'ethers';

const CHAIN_ID = '0x14a34';
const TREASURY_ADDRESS = '0x349c78525Dbb6aCfE60c96546174dC1627028b62';

const params = new URLSearchParams(window.location.search);
const amountParam = params.get('amount') || '0.000001';

let signer;

async function init() {
    document.getElementById('amountDisplay').textContent = amountParam + ' ETH';
    
    if (!window.ethereum) {
        showError('Instalē MetaMask!');
        return;
    }
    
    try {
        await window.ethereum.request({ 
            method: 'wallet_switchEthereumChain', 
            params: [{ chainId: CHAIN_ID }] 
        });
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        
        const button = document.getElementById('payButton');
        button.onclick = payToTreasury;
    } catch (e) {
        showError(e.message);
    }
}

async function payToTreasury() {
    const button = document.getElementById('payButton');
    button.disabled = true;
    button.textContent = '⏳ Gaida apstiprinājumu...';
    
    try {
        const tx = await signer.sendTransaction({
            to: TREASURY_ADDRESS,
            value: ethers.parseEther(amountParam)
        });
        
        setStatus('⏳ Gaida transakcijas apstiprinājumu...');
        await tx.wait();
        
        setStatus('✅ Iemaksa veiksmīga! Tagad izveido Issue GitHub!');
        button.textContent = '✅ Gatavs!';
        
    } catch (e) {
        if (e.code === 'ACTION_REJECTED') {
            showError('Transakcija atcelta');
        } else {
            showError(e.message);
        }
        button.disabled = false;
        button.textContent = '💳 Iemaksāt ar MetaMask';
    }
}

function setStatus(msg) { document.getElementById('status').textContent = msg; }
function showError(msg) { document.getElementById('error').textContent = msg; }

init();
