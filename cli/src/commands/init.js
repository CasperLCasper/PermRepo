const fs = require('node:fs');
const path = require('node:path');

function init(repoPath = '.') {
    const permRepoDir = path.join(repoPath, '.permrepo');

    if (fs.existsSync(permRepoDir)) {
        console.log('⚠️ .permrepo jau eksistē');
        return;
    }

    fs.mkdirSync(permRepoDir, { recursive: true });

    const config = {
        version: '1.0.0',
        createdAt: new Date().toISOString()
    };

    fs.writeFileSync(
        path.join(permRepoDir, 'config.json'),
        JSON.stringify(config, null, 2)
    );

    console.log('✅ PermRepo inicializēts');
    console.log('   .permrepo/config.json izveidots');
}

module.exports = { init };
