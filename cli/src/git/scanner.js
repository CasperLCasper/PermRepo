const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Skenē visus failus direktorijā un aprēķina SHA-256 hešus
 * @param {string} rootPath - Repozitorija saknes ceļš
 * @returns {Object} { "relatīvais/ceļš": { hash, size } }
 */
function scanFiles(rootPath) {
    const files = {};
    const ignore = [
        '.git', 'node_modules', '.next', 'dist', 'build',
        '.cache', 'coverage', '.env', '.env.local', 'permarepo.lock.json'
    ];

    const shouldIgnore = (relativePath) => {
        return ignore.some(pattern => {
            if (relativePath === pattern) return true;
            if (relativePath.startsWith(pattern + '/')) return true;
            if (relativePath.includes('/' + pattern + '/')) return true;
            return false;
        });
    };

    const walk = (dir) => {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (error) {
            console.warn(`⚠️ Nevar nolasīt direktoriju: ${dir}`);
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(rootPath, fullPath);

            if (shouldIgnore(relativePath)) continue;

            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile()) {
                try {
                    const content = fs.readFileSync(fullPath);
                    files[relativePath] = {
                        hash: crypto.createHash('sha256').update(content).digest('hex'),
                        size: content.length
                    };
                } catch (error) {
                    console.warn(`⚠️ Nevar nolasīt failu: ${relativePath}`);
                }
            }
        }
    };

    walk(rootPath);
    return files;
}

/**
 * Salīdzina pašreizējos failus ar lock faila datiem
 * @param {Object} current - Pašreizējie faili
 * @param {Object} lock - Lock faila dati
 * @returns {Object} { unchanged, changed, deleted }
 */
function compareWithLock(current, lock = {}) {
    const unchanged = {};
    const changed = {};
    const deleted = [];

    for (const [filePath, info] of Object.entries(current)) {
        if (lock[filePath] && lock[filePath].hash === info.hash) {
            unchanged[filePath] = { ...info, txId: lock[filePath].txId };
        } else {
            changed[filePath] = info;
        }
    }

    for (const filePath of Object.keys(lock)) {
        if (!current[filePath]) {
            deleted.push(filePath);
        }
    }

    return { unchanged, changed, deleted };
}

/**
 * Saglabā lock failu ar jaunajiem TX ID
 * @param {string} repoPath - Repozitorija saknes ceļš
 * @param {Object} unchanged - Nemainītie faili
 * @param {Object} uploaded - Augšupielādētie faili
 */
function saveLock(repoPath, unchanged, uploaded) {
    const files = {};

    for (const [filePath, info] of Object.entries(unchanged)) {
        files[filePath] = {
            hash: info.hash,
            txId: info.txId,
            size: info.size
        };
    }

    for (const [filePath, info] of Object.entries(uploaded)) {
        files[filePath] = {
            hash: info.hash,
            txId: info.txId,
            size: info.size
        };
    }

    const sorted = {};
    Object.keys(files)
        .sort((a, b) => a.localeCompare(b))
        .forEach(k => { sorted[k] = files[k]; });

    const lockPath = path.join(repoPath, 'permarepo.lock.json');
    const data = {
        version: '1.0.0',
        files: sorted,
        lastBackup: new Date().toISOString()
    };

    try {
        fs.writeFileSync(lockPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.warn(`⚠️ Nevar saglabāt lock failu: ${error.message}`);
    }
}

/**
 * Iegūst repo nosaukumu no Git remote URL
 * @param {string} repoPath - Repozitorija saknes ceļš
 * @returns {string} Repo nosaukums (lietotajs/repo)
 */
function getRepoName(repoPath) {
    // Pārbauda, vai ceļš eksistē un ir direktorija
    let isValidPath = false;
    try {
        isValidPath = fs.existsSync(repoPath) && fs.statSync(repoPath).isDirectory();
    } catch (error) {
        // Ceļš nav derīgs
    }

    if (!isValidPath) {
        return path.basename(repoPath);
    }

    try {
        // Izmanto git komandu tikai, ja ceļš ir validēts
        const remote = require('child_process')
            .execSync('git remote get-url origin', { cwd: repoPath, timeout: 5000 })
            .toString().trim();

        const match = remote.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
        return match ? match[1] : path.basename(repoPath);
    } catch (error) {
        // Nav git repo vai cita kļūda
        return path.basename(repoPath);
    }
}

module.exports = { scanFiles, compareWithLock, saveLock, getRepoName };
