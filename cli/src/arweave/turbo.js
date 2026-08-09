const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('../config');

class TurboUploader {
    constructor() {
        this.maxRetries = CONFIG.MAX_UPLOAD_RETRIES;
        this.uploadTimeout = CONFIG.UPLOAD_TIMEOUT_MS;
        this.manifestTimeout = CONFIG.MANIFEST_UPLOAD_TIMEOUT_MS;
    }

    async uploadChangedFiles(repoPath, files, repoName) {
        const results = {};
        const fileEntries = Object.entries(files);
        
        for (let i = 0; i < fileEntries.length; i++) {
            const [filePath, info] = fileEntries[i];
            const fullPath = path.join(repoPath, filePath);
            
            let lastError = null;
            
            for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                try {
                    console.log(`📤 Augšupielādē: ${filePath} (mēģinājums ${attempt}/${this.maxRetries})`);
                    
                    const fileData = fs.readFileSync(fullPath);
                    
                    const response = await fetch(`${CONFIG.TURBO_UPLOAD_URL}/v1/tx`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/octet-stream' },
                        body: fileData,
                        signal: AbortSignal.timeout(this.uploadTimeout)
                    });
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP ${response.status}: ${errorText}`);
                    }
                    
                    const result = await response.json();
                    
                    results[filePath] = {
                        hash: info.hash,
                        txId: result.id,
                        size: info.size
                    };
                    
                    console.log(`✅ Augšupielādēts: ${filePath} → ${result.id}`);
                    break;
                    
                } catch (error) {
                    lastError = error;
                    console.warn(`⚠️ Kļūda: ${error.message}`);
                    if (attempt < this.maxRetries) {
                        const waitTime = Math.pow(2, attempt) * 1000;
                        console.log(`⏳ Gaida ${waitTime / 1000}s...`);
                        await new Promise(r => setTimeout(r, waitTime));
                    }
                }
            }
            
            if (!results[filePath]) {
                throw new Error(`Neizdevās augšupielādēt ${filePath} pēc ${this.maxRetries} mēģinājumiem.`);
            }
        }
        
        return results;
    }

    async uploadManifest(manifestData, repoName) {
        const data = Buffer.from(JSON.stringify(manifestData, null, 2), 'utf-8');
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`📤 Augšupielādē manifestu...`);
                
                const response = await fetch(`${CONFIG.TURBO_UPLOAD_URL}/v1/tx`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/octet-stream' },
                    body: data,
                    signal: AbortSignal.timeout(this.manifestTimeout)
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                
                const result = await response.json();
                console.log(`✅ Manifests: ${result.id}`);
                return result.id;
                
            } catch (error) {
                if (attempt === this.maxRetries) throw error;
                const waitTime = Math.pow(2, attempt) * 1000;
                console.log(`⏳ Gaida ${waitTime / 1000}s...`);
                await new Promise(r => setTimeout(r, waitTime));
            }
        }
    }
}

module.exports = { TurboUploader };
