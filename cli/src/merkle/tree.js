const crypto = require('node:crypto');
const CONFIG = require('../config');

function createMerkleTree(files) {
    const leaves = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([fp, info]) => ({ path: fp, hash: info.hash, size: info.size }));
    if (leaves.length === 0) return { root: CONFIG.MERKLE_EMPTY_ROOT, tree: [], leaves: [] };
    if (leaves.length === 1) return { root: leaves[0].hash, tree: [leaves], leaves };
    let currentLevel = leaves.map(l => l.hash);
    const tree = [leaves];
    while (currentLevel.length > 1) {
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i], right = currentLevel[i + 1] || left;
            const hash = '0x' + crypto.createHash(CONFIG.MERKLE_HASH_ALGORITHM).update(Buffer.concat([Buffer.from(left.slice(2), 'hex'), Buffer.from(right.slice(2), 'hex')])).digest('hex');
            nextLevel.push(hash);
        }
        tree.push(nextLevel.map(h => ({ hash: h })));
        currentLevel = nextLevel;
    }
    return { root: currentLevel[0], tree, leaves };
}

module.exports = { createMerkleTree };
