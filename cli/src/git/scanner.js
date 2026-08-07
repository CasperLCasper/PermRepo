const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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
            console.warn({ warning: 'cannot_read_directory', path: dir, error: error.message });
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
                    console.warn({ warning: 'cannot_read_file', path: relativePath, error: error.message });
                }
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
        if (!current[filePath]) {
            deleted.push(filePath);
        }
    }

    return { unchanged, changed, deleted };
}

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
        console.warn({ warning: 'cannot_save_lock_file', error: error.message });
    }
}

function getRepoName(repoPath) {
    // 1. GitHub Actions vidē — izmanto GITHUB_REPOSITORY
    if (process.env.GITHUB_REPOSITORY) {
        console.log('DEBUG getRepoName: using GITHUB_REPOSITORY:', process.env.GITHUB_REPOSITORY);
        return process.env.GITHUB_REPOSITORY;
    }

    // 2. GitLab CI vidē — izmanto CI_PROJECT_PATH
    if (process.env.CI_PROJECT_PATH) {
        console.log('DEBUG getRepoName: using CI_PROJECT_PATH:', process.env.CI_PROJECT_PATH);
        return process.env.CI_PROJECT_PATH;
    }

    // 3. Bitbucket vidē — izmanto BITBUCKET_REPO_FULL_NAME
    if (process.env.BITBUCKET_REPO_FULL_NAME) {
        console.log('DEBUG getRepoName: using BITBUCKET_REPO_FULL_NAME:', process.env.BITBUCKET_REPO_FULL_NAME);
        return process.env.BITBUCKET_REPO_FULL_NAME;
    }

    // 4. Mēģina nolasīt no .git/config faila
    const gitConfigPath = path.join(repoPath, '.git', 'config');
    if (fs.existsSync(gitConfigPath)) {
        try {
            const configContent = fs.readFileSync(gitConfigPath, 'utf-8');
            const urlMatch = configContent.match(/url = (.+)/);
            if (urlMatch) {
                const remoteUrl = urlMatch[1].trim();
                console.log('DEBUG getRepoName: from .git/config remoteUrl:', remoteUrl);
                const repoMatch = remoteUrl.match(/\/([^/]+\/[^/]+?)(\.git)?$/);
                if (repoMatch) {
                    console.log('DEBUG getRepoName: from .git/config result:', repoMatch[1]);
                    return repoMatch[1];
                }
            }
        } catch (error) {
            console.warn({ warning: 'cannot_read_git_config', error: error.message });
        }
    }

    // 5. Fallback — direktorijas nosaukums
    try {
        if (fs.existsSync(repoPath) && fs.statSync(repoPath).isDirectory()) {
            const fallback = path.basename(repoPath);
            console.log('DEBUG getRepoName: fallback:', fallback);
            return fallback;
        }
    } catch (error) {
        console.warn({ warning: 'cannot_read_directory', path: repoPath, error: error.message });
    }

    console.log('DEBUG getRepoName: unknown-repo');
    return 'unknown-repo';
}

module.exports = { scanFiles, compareWithLock, saveLock, getRepoName };
