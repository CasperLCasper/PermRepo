const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('../config');

function init(repoPath = '.') {
    const permRepoDir = path.join(repoPath, CONFIG.PERMAREPO_DIR);
    if (fs.existsSync(permRepoDir)) { console.log('⚠️ .permrepo jau eksistē'); return; }
    fs.mkdirSync(path.join(permRepoDir, CONFIG.BACKUPS_DIR), { recursive: true });
    fs.writeFileSync(path.join(permRepoDir, 'config.json'), JSON.stringify({ version: CONFIG.APP_VERSION, createdAt: new Date().toISOString() }, null, 2));
    console.log('✅ PermRepo inicializēts');
}

module.exports = { init };
