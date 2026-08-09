// ============================================
// PERMAREPO GLABĀŠANAS APMAKSAS LAPA
// Pērk Turbo kredītus caur MetaMask (base-eth)
// ============================================

const CHAIN_ID = '0x14a34';
const CHAIN_NAME = 'Base Sepolia';
const TURBO_PAYMENT_ADDRESS = '0x29f1ed42C6C2E157B7571f9585a9C9Dd6fBcda51';

const params = new URLSearchParams(window.location.search);
const repoFromUrl = params.get('repo') || '';

let signer, userAddress;

async function init() {
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
        
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = '💳 Pirkt kredītus un parakstīt';
        button.onclick = buyCreditsAndSign;
        
        setStatus('✅ Gatavs apmaksai');
    } catch (e) {
        showError('❌ Kļūda: ' + e.message);
    }
}

async function buyCreditsAndSign() {
    let repo = document.getElementById('repoInput').value.trim();
    
    repo = repo.replace(/^https?:\/\/permrepo\.pages\.dev\//, '');
    repo = repo.replace(/^https?:\/\/.+\//, '');
    
    if (!repo || repo.includes('http') || !repo.includes('/')) {
        showError('❌ Lūdzu, ievadi repozitorija nosaukumu (piem., lietotajs/repo)');
        return;
    }
    
    try {
        const button = document.getElementById('payButton');
        button.disabled = true;
        
        // 1. Nosūtīt maksājumu caur MetaMask
        button.textContent = '⏳ Apstiprini maksājumu MetaMask...';
        setStatus('1/2: Nosūti maksājumu...');
        
        const amount = ethers.parseEther('0.001');
        
        const tx = await signer.sendTransaction({
            to: TURBO_PAYMENT_ADDRESS,
            value: amount
        });
        
        setStatus('⏳ Gaida transakcijas apstiprinājumu...');
        await tx.wait();
        
        // 2. Parakstīt backup autorizāciju
        button.textContent = '⏳ Paraksti autorizāciju...';
        setStatus('2/2: Paraksti ar maku...');
        
        const timestamp = Math.floor(Date.now() / 1000);
        const message = [
            'PermRepo Storage Payment Authorization',
            `Repository: ${repo}`,
            `Timestamp: ${timestamp}`,
            `Address: ${userAddress}`,
            `TxHash: ${tx.hash}`
        ].join('\n');
        
        const signature = await signer.signMessage(message);
        
        const payload = {
            address: userAddress,
            signature: signature,
            message: message,
            timestamp: timestamp,
            txHash: tx.hash
        };
        
        const jsonBody = JSON.stringify(payload, null, 2);
        const body = '```json\n' + jsonBody + '\n```';
        const encodedBody = encodeURIComponent(body);
        const issueTitle = `[PermRepo Backup] ${userAddress.substring(0, 10)}...`;
        const issueUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodedBody}`;
        
        setStatus('✅ Apmaksa veikta! Novirzam uz GitHub...');
        
        window.location.href = issueUrl;
        
    } catch (e) {
        if (e.code === 'ACTION_REJECTED') {
            showError('❌ Transakcija atcelta');
        } else {
            showError('❌ Kļūda: ' + e.message);
        }
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = '💳 Pirkt kredītus un parakstīt';
    }
}

function setStatus(message) {
    document.getElementById('status').textContent = message;
}

function showError(message) {
    document.getElementById('error').textContent = message;
}

init();
