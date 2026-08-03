const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function scanFiles(rootPath) {
    const files = {};
    const ignore = ['.git', 'node_modules', '.next', 'dist', 'build', '.cache', 'coverage', '.env', 'permarepo.lock.json'];

    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(rootPath, fullPath);
            if (ignore.some(p => relativePath.includes(p))) continue;
            if (entry.isDirectory()) {
                walk(fullPath);
            } else {
                const content = fs.readFileSync(fullPath);
                files[relativePath] = {
                    hash: crypto.createHash('sha256').update(content).digest('hex'),
                    size: content.length
                };
            }
        }
    };

    walk(rootPath);
    return files;
}

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
        if (!current[filePath]) deleted.push(filePath);
    }

    return { unchanged, changed, deleted };
}

function saveLock(repoPath, unchanged, uploaded) {
    const files = {};
    for (const [fp, info] of Object.entries(unchanged)) {
        files[fp] = { hash: info.hash, txId: info.txId, size: info.size };
    }
    for (const [fp, info] of Object.entries(uploaded)) {
        files[fp] = { hash: info.hash, txId: info.txId, size: info.size };
    }

    const sorted = {};
    Object.keys(files).sort((a, b) => a.localeCompare(b)).forEach(k => { sorted[k] = files[k]; });

    fs.writeFileSync(
        path.join(repoPath, 'permarepo.lock.json'),
        JSON.stringify({ version: '1.0.0', files: sorted, lastBackup: new Date().toISOString() }, null, 2)
    );
}

function getRepoName(repoPath) {
    try {
        const remote = require('child_process').execSync('git remote get-url origin', { cwd: repoPath }).toString().trim();
        const match = remote.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
        return match ? match[1] : path.basename(repoPath);
    } catch {
        return path.basename(repoPath);
    }
}

module.exports = { scanFiles, compareWithLock, saveLock, getRepoName };
