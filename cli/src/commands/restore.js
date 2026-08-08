const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const CONFIG = require('../../../shared/config');

/**
 * Atjauno repozitoriju no Arweave manifesta
 * @param {string} manifestTxId - Manifesta transakcijas ID
 * @param {string} outputDir - Izvades direktorija (noklusējums '.')
 */
async function restore(manifestTxId, outputDir = '.') {
    if (!manifestTxId) {
        throw new Error('Nepieciešams manifesta TX ID');
    }

    const gateway = CONFIG.ARWEAVE_GATEWAY;
    const manifestUrl = `${gateway}/${manifestTxId}`;
    
    console.log(`📥 Atjauno no Arweave: ${manifestTxId}`);
    console.log(`🌐 Gateway: ${gateway}`);

    // 1. Lejupielādē manifestu
    const manifest = await fetchJSON(manifestUrl);
    const fileCount = Object.keys(manifest.paths).length;
    console.log(`📊 Faili manifestā: ${fileCount}`);

    // 2. Lejupielādē katru failu
    let downloaded = 0;
    let failed = 0;

    for (const [filePath, { id }] of Object.entries(manifest.paths)) {
        const fullPath = path.join(outputDir, filePath);
        const dir = path.dirname(fullPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        try {
            const fileUrl = `${gateway}/${id}`;
            console.log(`   📄 [${++downloaded}/${fileCount}] ${filePath}`);
            const content = await fetchBuffer(fileUrl);
            fs.writeFileSync(fullPath, content);
        } catch (error) {
            failed++;
            console.warn(`   ❌ Neizdevās lejupielādēt: ${filePath} — ${error.message}`);
        }
    }

    console.log('=======================================================');
    console.log('✅ Atjaunošana pabeigta');
    console.log(`   Veiksmīgi: ${downloaded - failed}/${fileCount}`);
    if (failed > 0) {
        console.log(`   Neizdevās: ${failed}`);
    }
}

/**
 * Lejupielādē JSON no URL
 */
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        const req = client.get(url, { timeout: CONFIG.MANIFEST_UPLOAD_TIMEOUT_MS }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchJSON(res.headers.location).then(resolve).catch(reject);
                return;
            }
            
            if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                return;
            }
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Nederīgs JSON: ' + e.message));
                }
            });
            res.on('error', reject);
        });
        
        req.on('timeout', () => { req.destroy(); reject(new Error('Pieprasījuma taimauts')); });
        req.on('error', reject);
    });
}

/**
 * Lejupielādē bināro saturu no URL
 */
function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        const req = client.get(url, { timeout: CONFIG.UPLOAD_TIMEOUT_MS }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchBuffer(res.headers.location).then(resolve).catch(reject);
                return;
            }
            
            if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        
        req.on('timeout', () => { req.destroy(); reject(new Error('Pieprasījuma taimauts')); });
        req.on('error', reject);
    });
}

module.exports = { restore };
