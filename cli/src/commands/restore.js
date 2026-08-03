const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

async function restore(manifestTxId, outputDir = '.') {
    if (!manifestTxId) throw new Error('Nepieciešams manifesta TX ID');

    console.log(`📥 Atjauno no Arweave: ${manifestTxId}`);

    // 1. Lejupielādē manifest
    const manifest = await fetchJSON(`https://arweave.net/${manifestTxId}`);
    console.log(`📊 Faili: ${Object.keys(manifest.paths).length}`);

    // 2. Lejupielādē katru failu
    for (const [filePath, { id }] of Object.entries(manifest.paths)) {
        const fullPath = path.join(outputDir, filePath);
        const dir = path.dirname(fullPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        console.log(`   📄 ${filePath}`);
        const content = await fetchBuffer(`https://arweave.net/${id}`);
        fs.writeFileSync(fullPath, content);
    }

    console.log('✅ Atjaunošana pabeigta');
}

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
            res.on('error', reject);
        });
    });
}

function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
    });
}

module.exports = { restore };
