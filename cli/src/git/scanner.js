const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CONFIG = require('../config');

function scanFiles(rootPath) {
    const files = {};
    const ignore = CONFIG.IGNORE_PATTERNS;
    const maxFileSize = CONFIG.MAX_FILE_SIZE_BYTES;

    const shouldIgnore = (relativePath) => {
        return ignore.some(pattern => {
            if (relativePath === pattern) return true;
            if (relativePath.startsWith(pattern + path.sep)) return true;
            return false;
        });
    };

    const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(rootPath, fullPath);
            if (shouldIgnore(relativePath)) continue;
            if (entry.isDirectory()) { walk(fullPath); }
            else if (entry.isFile()) {
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.size > maxFileSize) { console.warn(`⚠️ Izlaists liels fails: ${relativePath}`); continue; }
                    const content = fs.readFileSync(fullPath);
                    files[relativePath] = { hash: crypto.createHash(CONFIG.MERKLE_HASH_ALGORITHM).update(content).digest('hex'), size: content.length };
                } catch {}
            }
        }
    };

    walk(rootPath);
    return files;
}

function compareWithLock(current, lock = {}) {
    const lockFiles = lock.files || lock;
    const unchanged = {}, changed = {}, deleted = [];
    for (const [filePath, info] of Object.entries(current)) {
        if (lockFiles[filePath] && lockFiles[filePath].hash === info.hash) { unchanged[filePath] = { ...info, txId: lockFiles[filePath].txId }; }
        else { changed[filePath] = info; }
    }
    for (const filePath of Object.keys(lockFiles)) { if (!current[filePath]) deleted.push(filePath); }
    return { unchanged, changed, deleted };
}

function saveLock(repoPath, unchanged, uploaded) {
    const files = {};
    for (const [fp, info] of Object.entries(unchanged)) files[fp] = { hash: info.hash, txId: info.txId, size: info.size };
    for (const [fp, info] of Object.entries(uploaded)) files[fp] = { hash: info.hash, txId: info.txId, size: info.size };
    const sorted = {};
    Object.keys(files).sort((a, b) => a.localeCompare(b)).forEach(k => { sorted[k] = files[k]; });
    const lockPath = path.join(repoPath, CONFIG.LOCK_FILE_NAME);
    try { fs.writeFileSync(lockPath, JSON.stringify({ version: CONFIG.LOCK_FILE_VERSION, files: sorted, lastBackup: new Date().toISOString() }, null, 2)); } catch {}
}

function getRepoName(repoPath) {
    let repoName;
    
    if (process.env.GITHUB_REPOSITORY) {
        repoName = process.env.GITHUB_REPOSITORY;
    } else if (process.env.CI_PROJECT_PATH) {
        repoName = process.env.CI_PROJECT_PATH;
    } else if (process.env.BITBUCKET_REPO_FULL_NAME) {
        repoName = process.env.BITBUCKET_REPO_FULL_NAME;
    } else {
        const gitConfigPath = path.join(repoPath, '.git', 'config');
        if (fs.existsSync(gitConfigPath)) {
            try {
                const content = fs.readFileSync(gitConfigPath, 'utf-8');
                const urlMatch = content.match(/url\s*=\s*(.+)/);
                if (urlMatch) {
                    const m = urlMatch[1].trim().match(/[:\/]([^\/]+\/[^\/]+?)(\.git)?$/);
                    if (m) repoName = m[1];
                }
            } catch {}
        }
        if (!repoName) {
            try {
                if (fs.existsSync(repoPath) && fs.statSync(repoPath).isDirectory()) {
                    repoName = path.basename(path.resolve(repoPath));
                }
            } catch {}
        }
    }
    
    return (repoName || 'unknown-repo').trim().toLowerCase();
}

module.exports = { scanFiles, compareWithLock, saveLock, getRepoName };
