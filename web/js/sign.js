const params = new URLSearchParams(window.location.search);
const repoFromUrl = params.get('repo') || '';
const CHAIN_ID = '0x14a34';

document.getElementById('repoInput').value = repoFromUrl;
document.getElementById('timestamp').textContent = new Date().toLocaleString();

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
        
        document.getElementById('signButton').disabled = false;
        document.getElementById('signButton').textContent = '✍️ Sign with Crypto Wallet';
        document.getElementById('signButton').onclick = signAndRedirect;
        document.getElementById('status').textContent = '✅ Gatavs parakstīšanai';
    } catch(e) {
        document.getElementById('error').textContent = '❌ Kļūda: ' + e.message;
    }
}

async function signAndRedirect() {
    const repo = document.getElementById('repoInput').value.trim();
    if (!repo) {
        document.getElementById('error').textContent = '❌ Lūdzu, ievadi repozitorija nosaukumu';
        return;
    }
    
    try {
        document.getElementById('signButton').disabled = true;
        document.getElementById('signButton').textContent = '⏳ Gaida parakstu...';
        document.getElementById('status').textContent = 'Lūdzu, apstiprini MetaMask...';
        
        const timestamp = Math.floor(Date.now() / 1000);
        const message = `PermRepo Backup Authorization\nRepository: ${repo}\nTimestamp: ${timestamp}\nAddress: ${userAddress}`;
        
        const signature = await signer.signMessage(message);
        
        const payload = {
            address: userAddress,
            signature: signature,
            message: message,
            timestamp: timestamp
        };
        
        const encodedPayload = encodeURIComponent(JSON.stringify(payload, null, 2));
        const issueTitle = `[PermRepo Backup] ${userAddress.substring(0, 10)}...`;
        const issueUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=\`\`\`json\n${encodedPayload}\n\`\`\``;
        
        document.getElementById('status').textContent = '✅ Paraksts veiksmīgs! Novirzam...';
        
        window.location.href = issueUrl;
        
    } catch(e) {
        if (e.code === 'ACTION_REJECTED') {
            document.getElementById('error').textContent = '❌ Parakstīšana atcelta';
        } else {
            document.getElementById('error').textContent = '❌ Kļūda: ' + e.message;
        }
        document.getElementById('signButton').disabled = false;
        document.getElementById('signButton').textContent = '✍️ Sign with Crypto Wallet';
    }
}

init();
