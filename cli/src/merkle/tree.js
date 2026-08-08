const crypto = require('node:crypto');
const CONFIG = require('../../../shared/config');

const HASH_ALGORITHM = CONFIG.MERKLE_HASH_ALGORITHM;
const EMPTY_ROOT = CONFIG.MERKLE_EMPTY_ROOT;

/**
 * Izveido Merkle koku no failu saraksta
 * @param {Object} files - { "ceļš": { hash, size } }
 * @returns {Object} { root, tree, leaves }
 */
function createMerkleTree(files) {
    // 1. Izveido lapas no failu hash, sakārtotas pēc ceļa
    const leaves = Object.entries(files)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([filePath, info]) => ({
            path: filePath,
            hash: info.hash,
            size: info.size
        }));

    if (leaves.length === 0) {
        return { 
            root: EMPTY_ROOT, 
            tree: [], 
            leaves: [] 
        };
    }

    if (leaves.length === 1) {
        return { 
            root: leaves[0].hash, 
            tree: [leaves], 
            leaves 
        };
    }

    // 2. Veido koku no apakšas uz augšu
    let currentLevel = leaves.map(leaf => leaf.hash);
    const tree = [leaves];

    while (currentLevel.length > 1) {
        const nextLevel = [];

        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1] || left; // Nepāra skaits — dublē pēdējo

            const combined = crypto
                .createHash(HASH_ALGORITHM)
                .update(Buffer.concat([
                    Buffer.from(left.startsWith('0x') ? left.slice(2) : left, 'hex'),
                    Buffer.from(right.startsWith('0x') ? right.slice(2) : right, 'hex')
                ]))
                .digest('hex');

            nextLevel.push('0x' + combined);
        }

        tree.push(nextLevel.map(hash => ({ hash })));
        currentLevel = nextLevel;
    }

    const root = currentLevel[0];

    return { root, tree, leaves };
}

/**
 * Pārbauda faila integritāti pret Merkle root
 * @param {string} fileHash - Faila hash
 * @param {string} merkleRoot - Merkle tree root
 * @param {Array} proof - Merkle proof
 * @returns {boolean}
 */
function verifyFile(fileHash, merkleRoot, proof) {
    let currentHash = fileHash;

    for (const { position, hash } of proof) {
        const left = position === 'left' ? currentHash : hash;
        const right = position === 'right' ? currentHash : hash;

        currentHash = '0x' + crypto
            .createHash(HASH_ALGORITHM)
            .update(Buffer.concat([
                Buffer.from(left.startsWith('0x') ? left.slice(2) : left, 'hex'),
                Buffer.from(right.startsWith('0x') ? right.slice(2) : right, 'hex')
            ]))
            .digest('hex');
    }

    return currentHash === merkleRoot;
}

/**
 * Ģenerē Merkle proof vienam failam
 * @param {Object} files - Visi faili
 * @param {string} targetPath - Mērķa faila ceļš
 * @returns {Array} Merkle proof
 */
function generateProof(files, targetPath) {
    const sortedPaths = Object.keys(files).sort((a, b) => a.localeCompare(b));
    const targetIndex = sortedPaths.indexOf(targetPath);

    if (targetIndex === -1) return [];

    const leaves = sortedPaths.map(p => files[p].hash);
    const proof = [];

    let currentLevel = leaves;
    let currentIndex = targetIndex;

    while (currentLevel.length > 1) {
        const nextLevel = [];
        const isLeft = currentIndex % 2 === 0;
        const pairIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

        if (pairIndex < currentLevel.length) {
            proof.push({
                position: isLeft ? 'right' : 'left',
                hash: currentLevel[pairIndex]
            });
        }

        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1] || left;

            const combined = crypto
                .createHash(HASH_ALGORITHM)
                .update(Buffer.concat([
                    Buffer.from(left.startsWith('0x') ? left.slice(2) : left, 'hex'),
                    Buffer.from(right.startsWith('0x') ? right.slice(2) : right, 'hex')
                ]))
                .digest('hex');

            nextLevel.push('0x' + combined);
        }

        currentLevel = nextLevel;
        currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
}

module.exports = { createMerkleTree, verifyFile, generateProof };
