const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('../../../shared/config');

/**
 * Inicializē PermRepo direktoriju
 * @param {string} repoPath - Repo ceļš (noklusējums '.')
 */
function init(repoPath = '.') {
    const permRepoDir = path.join(repoPath, CONFIG.PERMAREPO_DIR);
    const backupsDir = path.join(permRepoDir, CONFIG.BACKUPS_DIR);

    if (fs.existsSync(permRepoDir)) {
        console.log('⚠️ .permrepo jau eksistē');
        return;
    }

    // Izveido direktorijas
    fs.mkdirSync(backupsDir, { recursive: true });

    // Izveido konfigurāciju
    const config = {
        version: CONFIG.APP_VERSION,
        createdAt: new Date().toISOString(),
        appName: CONFIG.APP_NAME,
        directories: {
            root: CONFIG.PERMAREPO_DIR,
            backups: CONFIG.BACKUPS_DIR
        },
        lockFile: CONFIG.LOCK_FILE_NAME
    };

    fs.writeFileSync(
        path.join(permRepoDir, 'config.json'),
        JSON.stringify(config, null, 2)
    );

    console.log('✅ PermRepo inicializēts');
    console.log(`   📁 ${permRepoDir}/`);
    console.log(`   📁 ${backupsDir}/`);
    console.log(`   📄 ${permRepoDir}/config.json`);
}

module.exports = { init };
