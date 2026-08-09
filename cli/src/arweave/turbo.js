const { TurboFactory } = require('@ardrive/turbo-sdk');
const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('../config');

class TurboUploader {
    constructor() {
        this.turbo = TurboFactory.unauthenticated({
            token: CONFIG.TURBO_TOKEN_TYPE || 'ETH',
            uploadServiceConfig: { url: CONFIG.TURBO_UPLOAD_URL },
            paymentServiceConfig: { url: CONFIG.TURBO_PAYMENT_URL }
        });
        this.maxRetries = CONFIG.MAX_UPLOAD_RETRIES || 3;
        this.uploadTimeout = CONFIG.UPLOAD_TIMEOUT_MS || 30000;
        this.manifestTimeout = CONFIG.MANIFEST_UPLOAD_TIMEOUT_MS || 30000;
    }

    async uploadChangedFiles(repoPath, files, repoName) {
        const results = {};
        const fileEntries = Object.entries(files);

        for (const [filePath, info] of fileEntries) {
            const fullPath = path.join(repoPath, filePath);

            for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                try {
                    const fileData = fs.readFileSync(fullPath);
                    
                    const result = await this.turbo.uploadRawX402Data({
                        data: fileData,
                        signal: AbortSignal.timeout(this.uploadTimeout),
                        dataItemOpts: { tags: this._buildFileTags(repoName, filePath) }
                    });

                    results[filePath] = { hash: info.hash, txId: result.id, size: info.size };
                    break;
                } catch (error) {
                    if (attempt === this.maxRetries) throw error;
                    await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
                }
            }
        }
        return results;
    }

    async uploadManifest(manifestData, repoName) {
        const data = Buffer.from(JSON.stringify(manifestData, null, 2), 'utf-8');

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const result = await this.turbo.uploadRawX402Data({
                    data: data,
                    signal: AbortSignal.timeout(this.manifestTimeout),
                    dataItemOpts: {
                        tags: [
                            { name: 'App-Name', value: String(CONFIG.APP_NAME || 'PermRepo') },
                            { name: 'Type', value: 'path-manifest' },
                            { name: 'Repo', value: String(repoName || '') },
                            { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
                            { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
                        ]
                    }
                });
                return result.id;
            } catch (error) {
                if (attempt === this.maxRetries) throw error;
                await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
            }
        }
    }

    _buildFileTags(repoName, filePath) {
        // Normalizē slīpsvītras priekš Windows un nodrošina, ka nav undefined
        const normalizedPath = String(filePath).replace(/\\/g, '/');
        const mimeType = this._getMimeType(normalizedPath);

        return [
            { name: 'App-Name', value: String(CONFIG.APP_NAME || 'PermRepo') },
            { name: 'Repo', value: String(repoName || '') },
            { name: 'File-Path', value: normalizedPath },
            { name: 'Content-Type', value: mimeType },
            { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
        ];
    }

    _getMimeType(filename) {
        const ext = path.extname(filename).toLowerCase();
        
        // Pievienots atsevišķs atbalsts .yml un .yaml failiem
        if (ext === '.yml' || ext === '.yaml') {
            return 'text/yaml';
        }

        if (CONFIG.MIME_TYPES && CONFIG.MIME_TYPES[ext]) {
            return String(CONFIG.MIME_TYPES[ext]);
        }

        return String(CONFIG.DEFAULT_MIME_TYPE || 'application/octet-stream');
    }
}

module.exports = { TurboUploader };
