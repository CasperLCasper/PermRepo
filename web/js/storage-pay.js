// ============================================
// PERMAREPO GLABASANAS APMAKSAS LAPA
// WebTurboFactory + MetaMask + failu augsupielade
// ============================================

const CHAIN_ID = '0x14a34';

const params = new URLSearchParams(window.location.search);
const repoFromUrl = params.get('repo') || '';
const filesParam = params.get('files') || '';

let filesToUpload = [];

async function init() {
    document.getElementById('repoInput').value = repoFromUrl;
    document.getElementById('timestamp').textContent = new Date().toLocaleString();
    
    if (filesParam) {
        try {
            filesToUpload = JSON.parse(decodeURIComponent(filesParam));
            document.getElementById('fileCount').textContent = filesToUpload.length + ' faili';
            const totalSize = filesToUpload.reduce((s, f) => s + f.size, 0);
            document.getElementById('totalSize').textContent = `${(totalSize / 1024).toFixed(1)} KB`;
        } catch (e) {
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
        
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = 'Maksat ar MetaMask un Augsupieladet';
        button.onclick = uploadWithMetaMask;
        
        setStatus('Gatavs augsupieladei');
    } catch (e) {
        showError('Kluda: ' + e.message);
    }
}

async function uploadWithMetaMask() {
    let repo = document.getElementById('repoInput').value.trim();
    repo = repo.replace(/^https?:\/\/permrepo\.pages\.dev\//, '');
    repo = repo.replace(/^https?:\/\/.+\//, '');
    
    if (!repo || repo.includes('http') || !repo.includes('/')) {
        showError('Ludzu, ievadi repozitorija nosaukumu (piem., lietotajs/repo)');
        return;
    }

    if (filesToUpload.length === 0) {
        showError('Nav failu augsupieladei');
        return;
    }

    const button = document.getElementById('payButton');
    button.disabled = true;

    try {
        button.textContent = 'Lejupielade failus...';
        setStatus('1/4: Lejupielade failus no GitHub...');

        for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i];
            try {
                const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${file.path}`;
                const response = await fetch(rawUrl);
                if (response.ok) {
                    file.content = await response.text();
                }
            } catch (e) {
                console.warn('Nevar lejupieladet:', file.path);
            }
        }

        const filesWithContent = filesToUpload.filter(f => f.content);
        if (filesWithContent.length === 0) {
            showError('Neizdevas lejupieladet nevienu failu.');
            button.disabled = false;
            return;
        }

        button.textContent = 'Savienojas ar MetaMask...';
        setStatus('2/4: Savienojas ar MetaMask...');

        const { WebTurboFactory, EthereumSigner } = await import(
            'https://cdn.jsdelivr.net/npm/@ardrive/turbo-sdk@1.8.0/+esm'
        );
        const { ethers } = await import(
            'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js'
        );

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const userAddress = await signer.getAddress();

        const turbo = WebTurboFactory.authenticated({
            signer: new EthereumSigner(signer),
            token: 'base-eth',
            uploadServiceConfig: { url: 'https://upload.services.ar-io.dev' },
            paymentServiceConfig: { url: 'https://payment.services.ar-io.dev' }
        });

        let uploadResults = [];
        for (let i = 0; i < filesWithContent.length; i++) {
            const file = filesWithContent[i];
            button.textContent = `Augsupielade ${i + 1}/${filesWithContent.length}...`;
            setStatus(`3/4: Apstiprini MetaMask... (${i + 1}/${filesWithContent.length})`);

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

            uploadResults.push({ path: file.path, txId: result.id, size: fileData.length });
        }

        button.textContent = 'Augsupielade manifestu...';
        setStatus('4/4: Augsupielade manifestu...');

        const manifest = {
            manifest: 'arweave/paths', version: '0.2.0',
            index: { path: 'README.md' }, paths: {},
            metadata: { repo, timestamp: new Date().toISOString(), generatedBy: 'PermRepo v1.0.0' }
        };
        for (const f of uploadResults) manifest.paths[f.path] = { id: f.txId };

        const manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
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

        const manifestTxId = manifestResult.id;

        setStatus('Izveido Issue...');

        const timestamp = Math.floor(Date.now() / 1000);
        const message = [
            'PermRepo Backup Authorization',
            `Repository: ${repo}`, `Timestamp: ${timestamp}`, `Address: ${userAddress}`,
            `UploadedFiles: ${uploadResults.length}`, `ManifestTxId: ${manifestTxId}`
        ].join('\n');

        const signature = await signer.signMessage(message);
        const payload = {
            address: userAddress, signature, message, timestamp,
            uploadedFiles: uploadResults, manifestTxId
        };

        const jsonBody = JSON.stringify(payload, null, 2);
        const body = '```json\n' + jsonBody + '\n```';
        const issueTitle = `[PermRepo Backup] ${userAddress.substring(0, 10)}...`;
        const issueUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(body)}`;

        setStatus('Gatavs! Novirzam uz GitHub...');
        window.location.href = issueUrl;

    } catch (e) {
        if (e.code === 'ACTION_REJECTED') showError('Transakcija atcelta');
        else showError('Kluda: ' + e.message);
        button.disabled = false;
        button.textContent = 'Maksat ar MetaMask un Augsupieladet';
    }
}

function setStatus(msg) { document.getElementById('status').textContent = msg; }
function showError(msg) { document.getElementById('error').textContent = msg; }
init();
