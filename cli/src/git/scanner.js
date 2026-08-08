const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CONFIG = require('../../../shared/config');

/**
 * Skenē visus failus repozitorijā, ignorējot noteiktus patternus
 * @param {string} rootPath - Repo saknes ceļš
 * @returns {Object} { "relatīvais/ceļš": { hash, size } }
 */
function scanFiles(rootPath) {
    const files = {};
    const ignore = CONFIG.IGNORE_PATTERNS;
    const maxFileSize = CONFIG.MAX_FILE_SIZE_BYTES;

    const shouldIgnore = (relativePath) => {
        const parts = relativePath.split(path.sep);
        return parts.some(part => ignore.includes(part)) ||
               ignore.some(pattern => {
                   if (relativePath === pattern) return true;
                   if (relativePath.startsWith(pattern + path.sep)) return true;
                   if (relativePath.includes(path.sep + pattern + path.sep)) return true;
                   return false;
               });
    };

    const walk = (dir) => {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (error) {
            console.warn(`⚠️ Nevar nolasīt direktoriju: ${dir} — ${error.message}`);
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
                    const stat = fs.statSync(fullPath);
                    
                    if (stat.size > maxFileSize) {
                        console.warn(`⚠️ Izlaists pārāk liels fails: ${relativePath} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
                        continue;
                    }
                    
                    const content = fs.readFileSync(fullPath);
                    files[relativePath] = {
                        hash: crypto.createHash(CONFIG.MERKLE_HASH_ALGORITHM).update(content).digest('hex'),
                        size: content.length
                    };
                } catch (error) {
                    console.warn(`⚠️ Nevar nolasīt failu: ${relativePath} — ${error.message}`);
                }
            }
        }
    };

    walk(rootPath);
    return files;
}

/**
 * Salīdzina pašreizējos failus ar lock failu
 * @param {Object} current - Pašreizējie faili
 * @param {Object} lock - Lock faila dati { files: { "ceļš": { hash, txId, size } } }
 * @returns {Object} { unchanged, changed, deleted }
 */
function compareWithLock(current, lock = {}) {
    const lockFiles = lock.files || lock;
    const unchanged = {};
    const changed = {};
    const deleted = [];

    // Atrast nemainītos un mainītos failus
    for (const [filePath, info] of Object.entries(current)) {
        if (lockFiles[filePath] && lockFiles[filePath].hash === info.hash) {
            unchanged[filePath] = { 
                ...info, 
                txId: lockFiles[filePath].txId 
            };
        } else {
            changed[filePath] = info;
        }
    }

    // Atrast dzēstos failus
    for (const filePath of Object.keys(lockFiles)) {
        if (!current[filePath]) {
            deleted.push(filePath);
        }
    }

    return { unchanged, changed, deleted };
}

/**
 * Saglabā lock failu
 * @param {string} repoPath - Repo ceļš
 * @param {Object} unchanged - Nemainītie faili
 * @param {Object} uploaded - Augšupielādētie faili
 */
function saveLock(repoPath, unchanged, uploaded) {
    const files = {};

    // Apvieno nemainītos un jaunos failus
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

    // Sakārto alfabētiski
    const sorted = {};
    Object.keys(files)
        .sort((a, b) => a.localeCompare(b))
        .forEach(key => { 
            sorted[key] = files[key]; 
        });

    const lockPath = path.join(repoPath, CONFIG.LOCK_FILE_NAME);
    const data = {
        version: CONFIG.LOCK_FILE_VERSION,
        files: sorted,
        totalFiles: Object.keys(sorted).length,
        lastBackup: new Date().toISOString(),
        generatedBy: `${CONFIG.APP_NAME} v${CONFIG.APP_VERSION}`
    };

    try {
        fs.writeFileSync(lockPath, JSON.stringify(data, null, 2));
        console.log(`🔒 Lock fails saglabāts: ${lockPath} (${Object.keys(sorted).length} faili)`);
    } catch (error) {
        console.warn(`⚠️ Nevar saglabāt lock failu: ${error.message}`);
    }
}

/**
 * Iegūst repozitorija nosaukumu no dažādiem avotiem
 * @param {string} repoPath - Repo ceļš
 * @returns {string}
 */
function getRepoName(repoPath) {
    // 1. GitHub Actions vide
    if (process.env.GITHUB_REPOSITORY) {
        return process.env.GITHUB_REPOSITORY;
    }

    // 2. GitLab CI vide
    if (process.env.CI_PROJECT_PATH) {
        return process.env.CI_PROJECT_PATH;
    }

    // 3. Bitbucket vide
    if (process.env.BITBUCKET_REPO_FULL_NAME) {
        return process.env.BITBUCKET_REPO_FULL_NAME;
    }

    // 4. .git/config fails
    const gitConfigPath = path.join(repoPath, '.git', 'config');
    if (fs.existsSync(gitConfigPath)) {
        try {
            const configContent = fs.readFileSync(gitConfigPath, 'utf-8');
            const urlMatch = configContent.match(/url\s*=\s*(.+)/);
            if (urlMatch) {
                const remoteUrl = urlMatch[1].trim();
                const repoMatch = remoteUrl.match(/[:\/]([^\/]+\/[^\/]+?)(\.git)?$/);
                if (repoMatch) {
                    return repoMatch[1];
                }
            }
        } catch (error) {
            console.warn(`⚠️ Nevar nolasīt .git/config: ${error.message}`);
        }
    }

    // 5. Fallback — direktorijas nosaukums
    try {
        if (fs.existsSync(repoPath) && fs.statSync(repoPath).isDirectory()) {
            return path.basename(path.resolve(repoPath));
        }
    } catch (error) {
        console.warn(`⚠️ Nevar noteikt direktorijas nosaukumu: ${error.message}`);
    }

    return 'unknown-repo';
}

module.exports = { scanFiles, compareWithLock, saveLock, getRepoName };
