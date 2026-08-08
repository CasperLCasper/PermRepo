const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const CONFIG = require('../config');

async function restore(manifestTxId, outputDir = '.') {
    if (!manifestTxId) throw new Error('Nepieciešams manifesta TX ID');
    const gateway = CONFIG.ARWEAVE_GATEWAY;
    console.log(`📥 Atjauno no Arweave: ${manifestTxId}`);
    const manifest = await fetchJSON(`${gateway}/${manifestTxId}`);
    const fileCount = Object.keys(manifest.paths).length;
    console.log(`📊 Faili: ${fileCount}`);
    let downloaded = 0, failed = 0;
    for (const [filePath, { id }] of Object.entries(manifest.paths)) {
        const fullPath = path.join(outputDir, filePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        try {
            const content = await fetchBuffer(`${gateway}/${id}`);
            fs.writeFileSync(fullPath, content);
            downloaded++;
            console.log(`   📄 [${downloaded}/${fileCount}] ${filePath}`);
        } catch (error) {
            failed++;
            console.warn(`   ❌ ${filePath}: ${error.message}`);
        }
    }
    console.log(`✅ Atjaunošana pabeigta (${downloaded - failed}/${fileCount})`);
}

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        client.get(url, { timeout: CONFIG.MANIFEST_UPLOAD_TIMEOUT_MS }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
            res.on('error', reject);
        }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
    });
}

function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        client.get(url, { timeout: CONFIG.UPLOAD_TIMEOUT_MS }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
    });
}

module.exports = { restore };
