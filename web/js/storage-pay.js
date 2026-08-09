// ============================================
// PERMAREPO GLABĀŠANAS APMAKSAS LAPA
// Lejupielādē failus, pērk kredītus, augšupielādē, veido manifestu
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
    console.log('=== INIT ===');
    console.log('repoFromUrl:', repoFromUrl);
    console.log('filesParam:', filesParam);
    
    document.getElementById('repoInput').value = repoFromUrl;
    document.getElementById('timestamp').textContent = new Date().toLocaleString();
    
    if (filesParam) {
        try {
            filesToUpload = JSON.parse(decodeURIComponent(filesParam));
            console.log('filesToUpload:', filesToUpload);
            document.getElementById('fileCount').textContent = filesToUpload.length + ' faili';
        } catch (e) {
            console.error('Kļūda parsējot filesParam:', e);
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
        console.log('userAddress:', userAddress);
        
        setStatus('⏳ Iegūst maksājuma informāciju...');
        turboPaymentAddress = await fetchTurboPaymentAddress();
        console.log('turboPaymentAddress:', turboPaymentAddress);
        
        document.getElementById('paymentAddress').textContent = 
            turboPaymentAddress.substring(0, 10) + '...' + turboPaymentAddress.substring(turboPaymentAddress.length - 8);
        
        const totalSize = filesToUpload.reduce((s, f) => s + f.size, 0);
        const estimatedCost = Math.max(0.001, totalSize / 1000000 * 0.001).toFixed(4);
        document.getElementById('estimatedCost').textContent = `~${estimatedCost} ETH`;
        document.getElementById('totalCost').textContent = `~${estimatedCost} ETH (Base Sepolia)`;
        
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = filesToUpload.length > 0 ? '💳 Pirkt kredītus un augšupielādēt' : '💳 Pirkt kredītus un parakstīt';
        button.onclick = buyCreditsAndUpload;
        
        setStatus('✅ Gatavs apmaksai');
    } catch (e) {
        console.error('Init kļūda:', e);
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

function buildManifest(uploadedFiles, repoName) {
    const manifest = {
        manifest: 'arweave/paths',
        version: '0.2.0',
        index: { path: 'README.md' },
        paths: {},
        metadata: {
            repo: repoName,
            timestamp: new Date().toISOString(),
            generatedBy: 'PermRepo v1.0.0'
        }
    };
    
    for (const file of uploadedFiles) {
        manifest.paths[file.path] = { id: file.txId };
    }
    
    return manifest;
}

async function buyCreditsAndUpload() {
    console.log('=== buyCreditsAndUpload ===');
    
    let repo = document.getElementById('repoInput').value.trim();
    repo = repo.replace(/^https?:\/\/permrepo\.pages\.dev\//, '');
    repo = repo.replace(/^https?:\/\/.+\//, '');
    console.log('repo:', repo);
    
    if (!repo || repo.includes('http') || !repo.includes('/')) {
        showError('❌ Lūdzu, ievadi repozitorija nosaukumu (piem., lietotajs/repo)');
        return;
    }
    
    try {
        const button = document.getElementById('payButton');
        button.disabled = true;
        
        // 1. Lejupielādēt failus no GitHub
        if (filesToUpload.length > 0) {
            button.textContent = '⏳ Lejupielādē failus...';
            setStatus('1/5: Lejupielādē failus no GitHub...');
            
            for (let i = 0; i < filesToUpload.length; i++) {
                const file = filesToUpload[i];
                const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${file.path}`;
                console.log(`Lejupielādē: ${rawUrl}`);
                
                try {
                    const response = await fetch(rawUrl);
                    console.log(`  Statuss: ${response.status}`);
                    if (response.ok) {
                        file.content = await response.text();
                        console.log(`  ✅ Saturs: ${file.content.substring(0, 50)}...`);
                    } else {
                        console.warn(`  ❌ Nevar lejupielādēt`);
                    }
                } catch (e) {
                    console.error(`  ❌ Kļūda:`, e.message);
                }
            }
        }
        
        console.log('Faili ar saturu:', filesToUpload.filter(f => f.content).length);
        
        // 2. Maksājums
        button.textContent = '⏳ Apstiprini maksājumu MetaMask...';
        setStatus('2/5: Nosūti ETH uz Turbo...');
        
        const amount = ethers.parseEther('0.001');
        console.log('Sūta:', amount.toString(), 'uz', turboPaymentAddress);
        
        const tx = await signer.sendTransaction({ to: turboPaymentAddress, value: amount });
        console.log('TX hash:', tx.hash);
        
        setStatus('⏳ Gaida transakcijas apstiprinājumu...');
        await tx.wait();
        console.log('TX apstiprināts');
        
        // 3. Augšupielādēt failus
        let uploadResults = [];
        const filesWithContent = filesToUpload.filter(f => f.content);
        console.log('Faili augšupielādei:', filesWithContent.length);
        
        if (filesWithContent.length > 0) {
            setStatus('3/5: Augšupielādē failus...');
            for (let i = 0; i < filesWithContent.length; i++) {
                const file = filesWithContent[i];
                button.textContent = `⏳ Augšupielādē ${i + 1}/${filesWithContent.length}...`;
                console.log(`Augšupielādē: ${file.path}`);
                
                try {
                    const fileData = new TextEncoder().encode(file.content);
                    const uploadResponse = await fetch(`${TURBO_UPLOAD_URL}/v1/tx`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/octet-stream' },
                        body: fileData,
                        signal: AbortSignal.timeout(120000)
                    });
                    console.log(`  Statuss: ${uploadResponse.status}`);
                    
                    if (!uploadResponse.ok) {
                        const errorText = await uploadResponse.text();
                        console.error(`  ❌ Kļūda:`, errorText);
                        throw new Error(`HTTP ${uploadResponse.status}: ${errorText}`);
                    }
                    
                    const result = await uploadResponse.json();
                    console.log(`  ✅ txId: ${result.id}`);
                    uploadResults.push({ path: file.path, txId: result.id, size: fileData.length });
                } catch (uploadError) {
                    console.error(`  ❌ Augšupielādes kļūda:`, uploadError.message);
                }
            }
        }
        
        console.log('Augšupielādes rezultāti:', uploadResults.length);
        
        // 4. Izveidot un augšupielādēt manifestu
        button.textContent = '⏳ Augšupielādē manifestu...';
        setStatus('4/5: Veido un augšupielādē manifestu...');
        
        let manifestTxId = null;
        const manifest = buildManifest(uploadResults, repo);
        const manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
        console.log('Manifesta izmērs:', manifestData.length);
        
        try {
            const manifestResponse = await fetch(`${TURBO_UPLOAD_URL}/v1/tx`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: manifestData,
                signal: AbortSignal.timeout(60000)
            });
            console.log(`Manifesta statuss: ${manifestResponse.status}`);
            
            if (manifestResponse.ok) {
                const manifestResult = await manifestResponse.json();
                manifestTxId = manifestResult.id;
                console.log(`✅ Manifesta txId: ${manifestTxId}`);
            } else {
                const errorText = await manifestResponse.text();
                console.error(`❌ Manifesta kļūda:`, errorText);
            }
        } catch (e) {
            console.error('❌ Manifesta augšupielāde:', e.message);
        }
        
        // 5. Paraksts
        button.textContent = '⏳ Paraksti autorizāciju...';
        setStatus('5/5: Paraksti ar maku...');
        
        const timestamp = Math.floor(Date.now() / 1000);
        const message = [
            'PermRepo Storage Payment Authorization',
            `Repository: ${repo}`, `Timestamp: ${timestamp}`, `Address: ${userAddress}`,
            `TxHash: ${tx.hash}`, `UploadedFiles: ${uploadResults.length}`,
            `ManifestTxId: ${manifestTxId || 'N/A'}`
        ].join('\n');
        
        const signature = await signer.signMessage(message);
        const payload = { 
            address: userAddress, signature, message, timestamp, 
            txHash: tx.hash, uploadedFiles: uploadResults, manifestTxId 
        };
        
        console.log('Payload:', payload);
        
        const jsonBody = JSON.stringify(payload, null, 2);
        const body = '```json\n' + jsonBody + '\n```';
        const issueTitle = `[PermRepo Backup] ${userAddress.substring(0, 10)}...`;
        const issueUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(body)}`;
        
        setStatus('✅ Gatavs! Novirzam uz GitHub...');
        console.log('Novirza uz:', issueUrl);
        window.location.href = issueUrl;
        
    } catch (e) {
        console.error('💥 Galvenā kļūda:', e);
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
