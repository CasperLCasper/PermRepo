const { TurboFactory } = require('@ardrive/turbo-sdk');
const fs = require('node:fs');
const path = require('node:path');

class TurboUploader {
    constructor(opts = {}) {
        this.turbo = TurboFactory.unauthenticated({
            token: 'ethereum',
            uploadServiceConfig: opts.uploadUrl ? { url: opts.uploadUrl } : undefined,
            paymentServiceConfig: opts.paymentUrl ? { url: opts.paymentUrl } : undefined
        });
    }

    async uploadChangedFiles(repoPath, files, repoName) {
        const results = {};
        for (const [filePath, info] of Object.entries(files)) {
            const fullPath = path.join(repoPath, filePath);
            const result = await this.turbo.uploadFile({
                fileStreamFactory: () => fs.createReadStream(fullPath),
                fileSizeFactory: () => info.size,
                signal: AbortSignal.timeout(120000),
                dataItemOpts: {
                    tags: [
                        { name: 'App-Name', value: 'PermRepo' },
                        { name: 'Repo', value: repoName },
                        { name: 'File-Path', value: filePath },
                        { name: 'Content-Type', value: getMimeType(filePath) },
                        { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
                    ]
                }
            });
            results[filePath] = { hash: info.hash, txId: result.id, size: info.size };
        }
        return results;
    }

    async uploadManifest(manifestData, repoName) {
        const buffer = Buffer.from(JSON.stringify(manifestData, null, 2), 'utf-8');
        const result = await this.turbo.upload({
            data: buffer,
            signal: AbortSignal.timeout(60000),
            dataItemOpts: {
                tags: [
                    { name: 'App-Name', value: 'PermRepo' },
                    { name: 'Type', value: 'path-manifest' },
                    { name: 'Repo', value: repoName },
                    { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
                    { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
                ]
            }
        });
        return result.id;
    }
}

function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.js': 'application/javascript',
        '.ts': 'application/typescript',
        '.json': 'application/json',
        '.md': 'text/markdown',
        '.html': 'text/html',
        '.css': 'text/css',
        '.sol': 'text/plain',
        '.yaml': 'application/x-yaml',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = { TurboUploader };
