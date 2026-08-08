const CONFIG = require('../config');

function createManifest(unchangedFiles, newUploads, repoName) {
    const manifest = {
        manifest: CONFIG.MANIFEST_TYPE,
        version: CONFIG.MANIFEST_VERSION,
        index: { path: CONFIG.MANIFEST_INDEX_FILE },
        paths: {},
        metadata: { repo: repoName, timestamp: new Date().toISOString(), generatedBy: `${CONFIG.APP_NAME} v${CONFIG.APP_VERSION}` }
    };
    for (const [filePath, info] of Object.entries(unchangedFiles)) manifest.paths[filePath] = { id: info.txId };
    for (const [filePath, info] of Object.entries(newUploads)) manifest.paths[filePath] = { id: info.txId };
    return manifest;
}

module.exports = { createManifest };
