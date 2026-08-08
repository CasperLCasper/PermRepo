const { TurboFactory } = require('@ardrive/turbo-sdk');
const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('../config');

class TurboUploader {
    constructor() {
        this.turbo = TurboFactory.unauthenticated({
            token: CONFIG.TURBO_TOKEN_TYPE,
            uploadServiceConfig: { url: CONFIG.TURBO_UPLOAD_URL },
            paymentServiceConfig: { url: CONFIG.TURBO_PAYMENT_URL }
        });
        
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
                    const result = await this.turbo.uploadFile({
                        fileStreamFactory: () => fs.createReadStream(fullPath),
                        fileSizeFactory: () => info.size,
                        signal: AbortSignal.timeout(this.uploadTimeout),
                        dataItemOpts: {
                            tags: this._buildFileTags(repoName, filePath)
                        }
                    });
                    
                    results[filePath] = { hash: info.hash, txId: result.id, size: info.size };
                    console.log(`✅ Augšupielādēts: ${filePath}`);
                    break;
                } catch (error) {
                    lastError = error;
                    if (attempt < this.maxRetries) {
                        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
                    }
                }
            }
            
            if (!results[filePath]) {
                throw new Error(`Neizdevās augšupielādēt ${filePath}: ${lastError?.message}`);
            }
        }
        
        return results;
    }

    async uploadManifest(manifestData, repoName) {
        const buffer = Buffer.from(JSON.stringify(manifestData, null, 2), 'utf-8');
        
        let lastError = null;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const result = await this.turbo.upload({
                    data: buffer,
                    signal: AbortSignal.timeout(this.manifestTimeout),
                    dataItemOpts: {
                        tags: [
                            { name: 'App-Name', value: CONFIG.APP_NAME },
                            { name: 'Type', value: 'path-manifest' },
                            { name: 'Repo', value: repoName },
                            { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
                            { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
                        ]
                    }
                });
                
                return result.id;
            } catch (error) {
                lastError = error;
                if (attempt < this.maxRetries) {
                    await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
                }
            }
        }
        
        throw new Error(`Neizdevās augšupielādēt manifestu: ${lastError?.message}`);
    }

    _buildFileTags(repoName, filePath) {
        return [
            { name: 'App-Name', value: CONFIG.APP_NAME },
            { name: 'Repo', value: repoName },
            { name: 'File-Path', value: filePath },
            { name: 'Content-Type', value: this._getMimeType(filePath) },
            { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
        ];
    }

    _getMimeType(filename) {
        const ext = path.extname(filename).toLowerCase();
        return CONFIG.MIME_TYPES[ext] || CONFIG.DEFAULT_MIME_TYPE;
    }
}

module.exports = { TurboUploader };
