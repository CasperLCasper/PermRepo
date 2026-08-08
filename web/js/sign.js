// ============================================
// PERMAREPO PARAKSTĪŠANAS LAPA
// ============================================

const CHAIN_ID = '0x14a34';
const CHAIN_NAME = 'Base Sepolia';

const params = new URLSearchParams(window.location.search);
const repoFromUrl = params.get('repo') || '';

let signer, userAddress;

async function init() {
    // Aizpildīt repo nosaukumu
    document.getElementById('repoInput').value = repoFromUrl;
    document.getElementById('timestamp').textContent = new Date().toLocaleString();
    
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
        
        const button = document.getElementById('signButton');
        button.disabled = false;
        button.textContent = '✍️ Parakstīt ar maku';
        button.onclick = signAndRedirect;
        
        setStatus('✅ Gatavs parakstīšanai');
    } catch (e) {
        showError('❌ Kļūda: ' + e.message);
    }
}

async function signAndRedirect() {
    const repo = document.getElementById('repoInput').value.trim();
    
    if (!repo) {
        showError('❌ Lūdzu, ievadi repozitorija nosaukumu');
        return;
    }
    
    try {
        const button = document.getElementById('signButton');
        button.disabled = true;
        button.textContent = '⏳ Gaida parakstu...';
        setStatus('Lūdzu, apstiprini MetaMask...');
        
        const timestamp = Math.floor(Date.now() / 1000);
        const message = [
            'PermRepo Backup Authorization',
            `Repository: ${repo}`,
            `Timestamp: ${timestamp}`,
            `Address: ${userAddress}`
        ].join('\n');
        
        const signature = await signer.signMessage(message);
        
        const payload = {
            address: userAddress,
            signature: signature,
            message: message,
            timestamp: timestamp
        };
        
        const jsonBody = JSON.stringify(payload, null, 2);
        const encodedBody = encodeURIComponent(jsonBody);
        const issueTitle = `[PermRepo Backup] ${userAddress.substring(0, 10)}...`;
        const issueUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=\`\`\`json\n${encodedBody}\n\`\`\``;
        
        setStatus('✅ Paraksts veiksmīgs! Novirzam uz GitHub...');
        
        window.location.href = issueUrl;
        
    } catch (e) {
        if (e.code === 'ACTION_REJECTED') {
            showError('❌ Parakstīšana atcelta');
        } else {
            showError('❌ Kļūda: ' + e.message);
        }
        const button = document.getElementById('signButton');
        button.disabled = false;
        button.textContent = '✍️ Parakstīt ar maku';
    }
}

function setStatus(message) {
    document.getElementById('status').textContent = message;
}

function showError(message) {
    document.getElementById('error').textContent = message;
}

init();
