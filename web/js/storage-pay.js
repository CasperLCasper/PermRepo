// ============================================
// PERMAREPO GLABĀŠANAS APMAKSAS LAPA
// Pērk Turbo kredītus ar base-eth (Sepolia)
// ============================================

const CHAIN_ID = '0x14a34';
const CHAIN_NAME = 'Base Sepolia';

const TURBO_PAYMENT_URL = 'https://payment.services.ar-io.dev';
const TOKEN_TYPE = 'base-eth';

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
        
        // Aprēķināt glabāšanas izmaksas
        await calculateStorageCost();
        
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = '💳 Pirkt kredītus un apmaksāt glabāšanu';
        button.onclick = buyCreditsAndSign;
        
        setStatus('✅ Gatavs apmaksai');
    } catch (e) {
        showError('❌ Kļūda: ' + e.message);
    }
}

async function calculateStorageCost() {
    try {
        // Iegūt cenu no Turbo payment API
        const response = await fetch(`${TURBO_PAYMENT_URL}/v1/info`);
        const info = await response.json();
        
        // Parādīt informāciju
        document.getElementById('costInfo').textContent = 
            `Augšupielādes izmaksas tiks aprēķinātas automātiski.`;
    } catch (e) {
        console.warn('Nevar iegūt cenu info:', e);
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
        button.textContent = '⏳ Pērk kredītus...';
        setStatus('1/3: Pērk Turbo kredītus...');
        
        // 1. Iegūt maksājuma adresi
        const infoRes = await fetch(`${TURBO_PAYMENT_URL}/v1/info`);
        const info = await infoRes.json();
        const paymentAddress = info.addresses[TOKEN_TYPE];
        
        if (!paymentAddress) {
            showError('❌ Nevar iegūt maksājuma adresi.');
            button.disabled = false;
            return;
        }
        
        // 2. Aprēķināt nepieciešamo summu (neliela summa testam)
        const amount = ethers.parseEther('0.001');
        
        // 3. Nosūtīt maksājumu
        setStatus('2/3: Apstiprini maksājumu MetaMask...');
        
        const tx = await signer.sendTransaction({
            to: paymentAddress,
            value: amount
        });
        
        setStatus('⏳ Gaida transakcijas apstiprinājumu...');
        await tx.wait();
        
        // 4. Parakstīt backup autorizāciju
        setStatus('3/3: Paraksti backup autorizāciju...');
        
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
        
        setStatus('✅ Kredīti nopirkti! Novirzam uz GitHub...');
        
        window.location.href = issueUrl;
        
    } catch (e) {
        if (e.code === 'ACTION_REJECTED') {
            showError('❌ Transakcija atcelta');
        } else {
            showError('❌ Kļūda: ' + e.message);
        }
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = '💳 Pirkt kredītus un apmaksāt glabāšanu';
    }
}

function setStatus(message) {
    document.getElementById('status').textContent = message;
}

function showError(message) {
    document.getElementById('error').textContent = message;
}

init();
