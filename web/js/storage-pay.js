// ============================================
// PERMAREPO GLABASANAS APMAKSAS LAPA
// Augsupielade Arweave, izmantojot esosu kreditu atlikumu
// ============================================

const CHAIN_ID = '0x14a34';
const TURBO_UPLOAD_URL = 'https://upload.services.ar-io.dev';
const TURBO_PAYMENT_URL = 'https://payment.services.ar-io.dev';

const params = new URLSearchParams(window.location.search);
const repoFromUrl = params.get('repo') || '';
const filesParam = params.get('files') || '';

let signer, userAddress;
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
            console.error('Kluda parsejot filesParam:', e);
            filesToUpload = [];
        }
    }
    
    if (!window.ethereum) {
        showError('Instale MetaMask vai citu kripto maku');
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
        
        const totalSize = filesToUpload.reduce((s, f) => s + f.size, 0);
        document.getElementById('totalSize').textContent = `${(totalSize / 1024).toFixed(1)} KB`;
        
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = 'Augsupieladet un autorizet backupu';
        button.onclick = uploadAndSign;
        
        setStatus('Gatavs augsupieladei');
    } catch (e) {
        console.error('Init kluda:', e);
        showError('Kluda: ' + e.message);
    }
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

async function uploadAndSign() {
    console.log('=== uploadAndSign ===');
    
    let repo = document.getElementById('repoInput').value.trim();
    repo = repo.replace(/^https?:\/\/permrepo\.pages\.dev\//, '');
    repo = repo.replace(/^https?:\/\/.+\//, '');
    console.log('repo:', repo);
    
    if (!repo || repo.includes('http') || !repo.includes('/')) {
        showError('Ludzu, ievadi repozitorija nosaukumu (piem., lietotajs/repo)');
        return;
    }
    
    try {
        const button = document.getElementById('payButton');
        button.disabled = true;
        
        // 1. Lejupieladet failus no GitHub
        if (filesToUpload.length > 0) {
            button.textContent = 'Lejupielade failus...';
            setStatus('1/4: Lejupielade failus no GitHub...');
            
            for (let i = 0; i < filesToUpload.length; i++) {
                const file = filesToUpload[i];
                const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${file.path}`;
                console.log(`Lejupielade: ${rawUrl}`);
                
                try {
                    const response = await fetch(rawUrl);
                    console.log(`  Statuss: ${response.status}`);
                    if (response.ok) {
                        file.content = await response.text();
                        console.log(`  OK Saturs: ${file.content.substring(0, 50)}...`);
                    } else {
                        console.warn(`  Nevar lejupieladet`);
                    }
                } catch (e) {
                    console.error(`  Kluda:`, e.message);
                }
            }
        }
        
        const filesWithContent = filesToUpload.filter(f => f.content);
        console.log('Faili ar saturu:', filesWithContent.length);
        
        if (filesWithContent.length === 0) {
            showError('Nav failu augsupieladei. Parbaudi GitHub Raw piekluvi.');
            button.disabled = false;
            return;
        }
        
        // 2. Inicializet Turbo ar lietotaja maku
        const { TurboFactory, EthereumSigner } = await import('https://cdn.jsdelivr.net/npm/@ardrive/turbo-sdk@1.8.0/+esm');
        
        button.textContent = 'Savieno ar Turbo...';
        setStatus('2/4: Savieno ar Turbo...');
        
        // Izmantojam lietotaja MetaMask signer
        const turbo = TurboFactory.authenticated({
            signer: new EthereumSigner(window.ethereum),
            token: 'base-eth',
            uploadServiceConfig: { url: TURBO_UPLOAD_URL },
            paymentServiceConfig: { url: TURBO_PAYMENT_URL }
        });
        
        // 3. Augsupieladet failus
        let uploadResults = [];
        setStatus('3/4: Augsupielade failus...');
        
        for (let i = 0; i < filesWithContent.length; i++) {
            const file = filesWithContent[i];
            button.textContent = `Augsupielade ${i + 1}/${filesWithContent.length}...`;
            console.log(`Augsupielade: ${file.path}`);
            
            try {
                const fileData = new TextEncoder().encode(file.content);
                
                const result = await turbo.upload({
                    data: fileData,
                    dataItemOpts: {
                        tags: [
                            { name: 'App-Name', value: 'PermRepo' },
                            { name: 'Repo', value: repo },
                            { name: 'File-Path', value: file.path },
                            { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
                        ]
                    }
                });
                
                console.log(`  OK txId: ${result.id}`);
                uploadResults.push({ path: file.path, txId: result.id, size: fileData.length });
            } catch (uploadError) {
                console.error(`  Augsupielades kluda:`, uploadError.message);
                showError(`Augsupielades kluda: ${uploadError.message}. Parbaudi kreditu atlikumu.`);
                button.disabled = false;
                return;
            }
        }
        
        console.log('Augsupielades rezultati:', uploadResults.length);
        
        // 4. Izveidot un augsupieladet manifestu
        button.textContent = 'Augsupielade manifestu...';
        setStatus('4/4: Veido un augsupielade manifestu...');
        
        let manifestTxId = null;
        const manifest = buildManifest(uploadResults, repo);
        const manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
        console.log('Manifesta izmers:', manifestData.length);
        
        try {
            const manifestResult = await turbo.upload({
                data: manifestData,
                dataItemOpts: {
                    tags: [
                        { name: 'App-Name', value: 'PermRepo' },
                        { name: 'Type', value: 'path-manifest' },
                        { name: 'Repo', value: repo },
                        { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
                        { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
                    ]
                }
            });
            
            manifestTxId = manifestResult.id;
            console.log('OK Manifesta txId:', manifestTxId);
        } catch (e) {
            console.error('Manifesta augsupielade:', e.message);
        }
        
        // 5. Paraksts
        button.textContent = 'Paraksti autorizaciju...';
        setStatus('Paraksti ar maku...');
        
        const timestamp = Math.floor(Date.now() / 1000);
        const message = [
            'PermRepo Backup Authorization',
            `Repository: ${repo}`,
            `Timestamp: ${timestamp}`,
            `Address: ${userAddress}`,
            `UploadedFiles: ${uploadResults.length}`,
            `ManifestTxId: ${manifestTxId || 'N/A'}`
        ].join('\n');
        
        const signature = await signer.signMessage(message);
        const payload = { 
            address: userAddress, signature, message, timestamp, 
            uploadedFiles: uploadResults, manifestTxId 
        };
        
        console.log('Payload:', payload);
        
        const jsonBody = JSON.stringify(payload, null, 2);
        const body = '```json\n' + jsonBody + '\n```';
        const issueTitle = `[PermRepo Backup] ${userAddress.substring(0, 10)}...`;
        const issueUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(body)}`;
        
        setStatus('Gatavs! Novirzam uz GitHub...');
        console.log('Novirza uz:', issueUrl);
        window.location.href = issueUrl;
        
    } catch (e) {
        console.error('Galvena kluda:', e);
        if (e.code === 'ACTION_REJECTED') showError('Transakcija atcelta');
        else showError('Kluda: ' + e.message);
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = 'Augsupieladet un autorizet backupu';
    }
}

function setStatus(msg) { document.getElementById('status').textContent = msg; }
function showError(msg) { document.getElementById('error').textContent = msg; }
init();
