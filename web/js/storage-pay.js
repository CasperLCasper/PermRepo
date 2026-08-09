// ============================================
// PERMAREPO GLABĀŠANAS APMAKSAS LAPA
// Pērk Turbo kredītus UN augšupielādē failus caur MetaMask
// ============================================

const CHAIN_ID = '0x14a34';
const CHAIN_NAME = 'Base Sepolia';
const TURBO_UPLOAD_URL = 'https://upload.services.ar-io.dev';
const TURBO_PAYMENT_URL = 'https://payment.services.ar-io.dev';
const TURBO_CURRENCIES_URL = 'https://payment.services.ar-io.dev/v1/currencies';

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
        
        // Iegūt Turbo maksājumu adresi
        setStatus('⏳ Iegūst maksājuma informāciju...');
        
        const response = await fetch(TURBO_CURRENCIES_URL);
        const currencies = await response.json();
        const baseEthConfig = currencies.find(c => c.token === 'ethereum' && c.network === 'base');
        
        if (!baseEthConfig) {
            showError('❌ Nevar atrast Base ETH maksājumu informāciju');
            return;
        }
        
        turboPaymentAddress = baseEthConfig.destinationAddress;
        document.getElementById('paymentAddress').textContent = 
            turboPaymentAddress.substring(0, 10) + '...' + turboPaymentAddress.substring(turboPaymentAddress.length - 8);
        
        const button = document.getElementById('payButton');
        button.disabled = false;
        
        if (filesToUpload.length > 0) {
            button.textContent = '💳 Pirkt kredītus un augšupielādēt';
        } else {
            button.textContent = '💳 Pirkt kredītus un parakstīt';
        }
        
        button.onclick = buyCreditsAndUpload;
        setStatus('✅ Gatavs apmaksai');
    } catch (e) {
        showError('❌ Kļūda: ' + e.message);
    }
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
        
        // 1. Nosūtīt maksājumu caur MetaMask
        button.textContent = '⏳ Apstiprini maksājumu MetaMask...';
        setStatus('1/3: Nosūti ETH uz Turbo...');
        
        const amount = ethers.parseEther('0.001');
        
        const tx = await signer.sendTransaction({
            to: turboPaymentAddress,
            value: amount
        });
        
        setStatus('⏳ Gaida transakcijas apstiprinājumu...');
        await tx.wait();
        
        // 2. Augšupielādēt failus (ja ir)
        let uploadResults = [];
        
        if (filesToUpload.length > 0) {
            setStatus('2/3: Augšupielādē failus...');
            
            for (let i = 0; i < filesToUpload.length; i++) {
                const file = filesToUpload[i];
                button.textContent = `⏳ Augšupielādē ${i + 1}/${filesToUpload.length}...`;
                
                try {
                    const fileData = new TextEncoder().encode(file.content);
                    
                    // Izveidot ANS-104 data item ar tagiem
                    const tags = [
                        { name: 'App-Name', value: 'PermRepo' },
                        { name: 'Repo', value: repo },
                        { name: 'File-Path', value: file.path },
                        { name: 'Content-Type', value: getMimeType(file.path) },
                        { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
                    ];
                    
                    // Augšupielādēt caur Turbo API
                    const formData = new FormData();
                    formData.append('file', new Blob([fileData]), file.path);
                    
                    const uploadResponse = await fetch(`${TURBO_UPLOAD_URL}/v1/tx`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            'X-Tags': JSON.stringify(tags)
                        },
                        body: fileData,
                        signal: AbortSignal.timeout(120000)
                    });
                    
                    if (!uploadResponse.ok) {
                        const errorText = await uploadResponse.text();
                        throw new Error(`HTTP ${uploadResponse.status}: ${errorText}`);
                    }
                    
                    const result = await uploadResponse.json();
                    uploadResults.push({ path: file.path, txId: result.id, size: fileData.length });
                    
                } catch (uploadError) {
                    console.warn(`⚠️ Kļūda augšupielādējot ${file.path}:`, uploadError.message);
                }
            }
        }
        
        // 3. Parakstīt backup autorizāciju
        button.textContent = '⏳ Paraksti autorizāciju...';
        setStatus('3/3: Paraksti ar maku...');
        
        const timestamp = Math.floor(Date.now() / 1000);
        const message = [
            'PermRepo Storage Payment Authorization',
            `Repository: ${repo}`,
            `Timestamp: ${timestamp}`,
            `Address: ${userAddress}`,
            `TxHash: ${tx.hash}`,
            `UploadedFiles: ${uploadResults.length}`
        ].join('\n');
        
        const signature = await signer.signMessage(message);
        
        const payload = {
            address: userAddress,
            signature: signature,
            message: message,
            timestamp: timestamp,
            txHash: tx.hash,
            uploadedFiles: uploadResults
        };
        
        const jsonBody = JSON.stringify(payload, null, 2);
        const body = '```json\n' + jsonBody + '\n```';
        const encodedBody = encodeURIComponent(body);
        const issueTitle = `[PermRepo Backup] ${userAddress.substring(0, 10)}...`;
        const issueUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodedBody}`;
        
        setStatus('✅ Gatavs! Novirzam uz GitHub...');
        
        window.location.href = issueUrl;
        
    } catch (e) {
        if (e.code === 'ACTION_REJECTED') {
            showError('❌ Transakcija atcelta');
        } else {
            showError('❌ Kļūda: ' + e.message);
        }
        const button = document.getElementById('payButton');
        button.disabled = false;
        
        if (filesToUpload.length > 0) {
            button.textContent = '💳 Pirkt kredītus un augšupielādēt';
        } else {
            button.textContent = '💳 Pirkt kredītus un parakstīt';
        }
    }
}

function getMimeType(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes = {
        'js': 'application/javascript',
        'ts': 'application/typescript',
        'json': 'application/json',
        'md': 'text/markdown',
        'html': 'text/html',
        'css': 'text/css',
        'sol': 'text/plain',
        'yaml': 'application/x-yaml',
        'yml': 'application/x-yaml',
        'svg': 'image/svg+xml',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'txt': 'text/plain',
        'xml': 'application/xml',
        'pdf': 'application/pdf',
        'zip': 'application/zip',
        'gz': 'application/gzip',
        'tar': 'application/x-tar'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

function setStatus(message) {
    document.getElementById('status').textContent = message;
}

function showError(message) {
    document.getElementById('error').textContent = message;
}

init();
