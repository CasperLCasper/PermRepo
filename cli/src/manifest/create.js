function createManifest(unchangedFiles, newUploads, repoName) {
    const manifest = {
        manifest: 'arweave/paths',
        version: '0.2.0',
        index: { path: 'README.md' },
        paths: {},
        metadata: {
            repo: repoName,
            timestamp: new Date().toISOString(),
            generatedBy: 'PermRepo v1.0.0'
        }
    };

    for (const [filePath, info] of Object.entries(unchangedFiles)) {
        manifest.paths[filePath] = { id: info.txId };
    }

    for (const [filePath, info] of Object.entries(newUploads)) {
        manifest.paths[filePath] = { id: info.txId };
    }

    return manifest;
}

module.exports = { createManifest };
