const CONFIG = require('../../../shared/config');

/**
 * Izveido Arweave path manifestu no visiem failiem
 * @param {Object} unchangedFiles - Faili, kas nav mainījušies { "ceļš": { hash, txId, size } }
 * @param {Object} newUploads - Jaunie augšupielādētie faili { "ceļš": { hash, txId, size } }
 * @param {string} repoName - Repozitorija nosaukums
 * @returns {Object} Manifests
 */
function createManifest(unchangedFiles, newUploads, repoName) {
    const now = new Date().toISOString();
    
    const manifest = {
        manifest: CONFIG.MANIFEST_TYPE,
        version: CONFIG.MANIFEST_VERSION,
        index: { path: CONFIG.MANIFEST_INDEX_FILE },
        paths: {},
        metadata: {
            repo: repoName,
            timestamp: now,
            generatedBy: `${CONFIG.APP_NAME} v${CONFIG.APP_VERSION}`,
            totalFiles: Object.keys(unchangedFiles).length + Object.keys(newUploads).length,
            newFiles: Object.keys(newUploads).length,
            unchangedFiles: Object.keys(unchangedFiles).length
        }
    };

    // Pievieno nemainītos failus (saglabā to esošos TxID)
    for (const [filePath, info] of Object.entries(unchangedFiles)) {
        manifest.paths[filePath] = { id: info.txId };
    }

    // Pievieno jaunos failus
    for (const [filePath, info] of Object.entries(newUploads)) {
        manifest.paths[filePath] = { id: info.txId };
    }

    return manifest;
}

module.exports = { createManifest };
