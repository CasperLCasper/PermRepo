// ============================================
// PERMAREPO GLABĀŠANAS APMAKSAS LAPA
// ============================================

const CHAIN_ID = '0x14a34';
const TURBO_UPLOAD_URL = 'https://upload.services.ar-io.dev';
const TURBO_API_BASE = 'https://payment.ardrive.io/v1';
const TESTNET_FALLBACK_ADDRESS = '0x1000000000000000000000000000000000000000';

const params = new URLSearchParams(window.location.search);
const repoFromUrl = params.get('repo') || '';
const filesParam = params.get('files') || '';

let signer, userAddress, turboPaymentAddress;
let filesToUpload = [];

async function init() {
    document.getElementById('repoInput').value = repoFromUrl;
    document.getElementById('timestamp').textContent = new Date().toLocaleString();
    
    if (filesParam) {
        try {
            filesToUpload = JSON.parse(decodeURIComponent(filesParam));
            document.getElementById('fileCount').textContent = filesToUpload.length + ' faili';
        } catch (e) {
            filesToUpload = [];
        }
    }
    
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
        
        setStatus('⏳ Iegūst maksājuma informāciju...');
        turboPaymentAddress = await fetchTurboPaymentAddress();
        
        document.getElementById('paymentAddress').textContent = 
            turboPaymentAddress.substring(0, 10) + '...' + turboPaymentAddress.substring(turboPaymentAddress.length - 8);
        
        const totalSize = filesToUpload.reduce((s, f) => s + f.size, 0);
        const estimatedCost = Math.max(0.001, totalSize / 1000000 * 0.001).toFixed(4);
        document.getElementById('estimatedCost').textContent = `~${estimatedCost} ETH`;
        
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = filesToUpload.length > 0 ? '💳 Pirkt kredītus un augšupielādēt' : '💳 Pirkt kredītus un parakstīt';
        button.onclick = buyCreditsAndUpload;
        
        setStatus('✅ Gatavs apmaksai');
    } catch (e) {
        showError('❌ Kļūda: ' + e.message);
    }
}

async function fetchTurboPaymentAddress() {
    try {
        const response = await fetch(`${TURBO_API_BASE}/currencies`);
        if (response.ok) {
            const data = await response.json();
            const currencies = Array.isArray(data) ? data : (data.currencies || []);
            const baseEth = currencies.find(c => 
                c.token === 'base-eth' || c.network === 'base-sepolia' || c.chainId === 84532
            );
            if (baseEth && baseEth.destinationAddress) return baseEth.destinationAddress;
        }
    } catch (err) {
        console.warn('SSL/Tīkla kļūda, izmanto rezerves adresi:', err.message);
    }
    return TESTNET_FALLBACK_ADDRESS;
}

async function buyCreditsAndUpload() {
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
        
        button.textContent = '⏳ Apstiprini maksājumu MetaMask...';
        setStatus('1/3: Nosūti ETH uz Turbo...');
        
        const amount = ethers.parseEther('0.001');
        const tx = await signer.sendTransaction({ to: turboPaymentAddress, value: amount });
        setStatus('⏳ Gaida transakcijas apstiprinājumu...');
        await tx.wait();
        
        let uploadResults = [];
        if (filesToUpload.length > 0) {
            setStatus('2/3: Augšupielādē failus...');
            for (let i = 0; i < filesToUpload.length; i++) {
                const file = filesToUpload[i];
                button.textContent = `⏳ Augšupielādē ${i + 1}/${filesToUpload.length}...`;
                try {
                    const fileData = new TextEncoder().encode(file.content || '');
                    const uploadResponse = await fetch(`${TURBO_UPLOAD_URL}/v1/tx`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/octet-stream' },
                        body: fileData,
                        signal: AbortSignal.timeout(120000)
                    });
                    if (!uploadResponse.ok) throw new Error(`HTTP ${uploadResponse.status}`);
                    const result = await uploadResponse.json();
                    uploadResults.push({ path: file.path, txId: result.id, size: fileData.length });
                } catch (uploadError) {
                    console.warn(`⚠️ ${file.path}:`, uploadError.message);
                }
            }
        }
        
        button.textContent = '⏳ Paraksti autorizāciju...';
        setStatus('3/3: Paraksti ar maku...');
        
        const timestamp = Math.floor(Date.now() / 1000);
        const message = [
            'PermRepo Storage Payment Authorization',
            `Repository: ${repo}`, `Timestamp: ${timestamp}`, `Address: ${userAddress}`,
            `TxHash: ${tx.hash}`, `UploadedFiles: ${uploadResults.length}`
        ].join('\n');
        
        const signature = await signer.signMessage(message);
        const payload = { address: userAddress, signature, message, timestamp, txHash: tx.hash, uploadedFiles: uploadResults };
        const jsonBody = JSON.stringify(payload, null, 2);
        const body = '```json\n' + jsonBody + '\n```';
        const issueTitle = `[PermRepo Backup] ${userAddress.substring(0, 10)}...`;
        const issueUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(body)}`;
        
        setStatus('✅ Gatavs! Novirzam uz GitHub...');
        window.location.href = issueUrl;
        
    } catch (e) {
        if (e.code === 'ACTION_REJECTED') showError('❌ Transakcija atcelta');
        else showError('❌ Kļūda: ' + e.message);
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = filesToUpload.length > 0 ? '💳 Pirkt kredītus un augšupielādēt' : '💳 Pirkt kredītus un parakstīt';
    }
}

function setStatus(msg) { document.getElementById('status').textContent = msg; }
function showError(msg) { document.getElementById('error').textContent = msg; }
init();
