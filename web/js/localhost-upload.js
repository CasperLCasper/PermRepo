const API_BASE = 'http://localhost:3000';
const CHAIN_ID = '0x14a34';

let files = [];
let repoName = '';

async function init() {
    try {
        const response = await fetch(`${API_BASE}/get-files`);
        const data = await response.json();
        files = data.files;
        repoName = data.repoName;
        
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = files.map(f => 
            `<div class="file"><span>${f.path}</span><span>${(f.size / 1024).toFixed(1)} KB</span></div>`
        ).join('');
        
        document.getElementById('status').textContent = `${files.length} faili, ${repoName}`;
        
        const button = document.getElementById('uploadButton');
        button.disabled = false;
        button.textContent = 'Apstiprinat ar MetaMask';
        button.onclick = uploadFiles;
    } catch (e) {
        document.getElementById('status').textContent = 'Kluda: ' + e.message;
    }
}

async function uploadFiles() {
    const button = document.getElementById('uploadButton');
    button.disabled = true;
    
    try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
        
        let uploadResults = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            button.textContent = `Augsupielade ${i + 1}/${files.length}...`;
            
            const fileData = new TextEncoder().encode(file.content);
            const tags = [
                { name: 'App-Name', value: 'PermRepo' },
                { name: 'Repo', value: repoName },
                { name: 'File-Path', value: file.path },
                { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
            ];
            
            const txId = await window.startUpload(fileData, tags);
            uploadResults.push({ path: file.path, txId: txId, size: fileData.length });
        }
        
        // Manifest
        button.textContent = 'Augsupielade manifestu...';
        const manifest = {
            manifest: 'arweave/paths', version: '0.2.0',
            index: { path: 'README.md' }, paths: {},
            metadata: { repo: repoName, timestamp: new Date().toISOString(), generatedBy: 'PermRepo v1.0.0' }
        };
        for (const f of uploadResults) manifest.paths[f.path] = { id: f.txId };
        
        const manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
        const manifestTags = [
            { name: 'App-Name', value: 'PermRepo' },
            { name: 'Type', value: 'path-manifest' },
            { name: 'Repo', value: repoName },
            { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
            { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
        ];
        
        const manifestTxId = await window.startUpload(manifestData, manifestTags);
        
        // Nosutit rezultatus atpakal CLI
        await fetch(`${API_BASE}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadedFiles: uploadResults, manifestTxId })
        });
        
        document.getElementById('status').textContent = 'Backups veiksmigs!';
        button.textContent = 'Gatavs!';
        
    } catch (e) {
        document.getElementById('error').textContent = 'Kluda: ' + e.message;
        button.disabled = false;
        button.textContent = 'Meginat velreiz';
    }
}

init();
