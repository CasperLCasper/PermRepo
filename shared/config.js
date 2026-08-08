// ============================================
// PERMAREPO GLOBĀLĀ KONFIGURĀCIJA
// Visas vērtības iznestas uz mainīgajiem
// ============================================

const CONFIG = {
    // ==========================================
    // BLOCKCHAIN
    // ==========================================
    RPC_URL: process.env.RPC_URL || 'https://sepolia.base.org',
    CHAIN_ID: process.env.CHAIN_ID || '0x14a34',
    CHAIN_NAME: process.env.CHAIN_NAME || 'Base Sepolia',
    
    SUBSCRIPTION_ADDRESS: process.env.SUBSCRIPTION_ADDRESS || '0x29f1ed42C6C2E157B7571f9585a9C9Dd6fBcda51',
    NFT_ADDRESS: process.env.NFT_ADDRESS || '0xeD3eB455cAeb057a034d7bE2368cdCEA37Faa1d4',
    REGISTRY_ADDRESS: process.env.REGISTRY_ADDRESS || '0x2a5a7F926046BB1A011D9082aB70BF38bfcb9dc9',
    USDC_ADDRESS: process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    
    // ==========================================
    // ARWEAVE / TURBO
    // ==========================================
    TURBO_UPLOAD_URL: process.env.TURBO_UPLOAD_URL || 'https://upload.services.ar-io.dev',
    TURBO_PAYMENT_URL: process.env.TURBO_PAYMENT_URL || 'https://payment.services.ar-io.dev',
    ARWEAVE_GATEWAY: process.env.ARWEAVE_GATEWAY || 'https://arweave.net',
    TURBO_TOKEN_TYPE: process.env.TURBO_TOKEN_TYPE || 'ethereum',
    
    // ==========================================
    // WEB URL
    // ==========================================
    WEB_URL: process.env.WEB_URL || 'https://perma-repo.pages.dev',
    SIGN_PAGE: process.env.SIGN_PAGE || '/sign.html',
    PAY_PAGE: process.env.PAY_PAGE || '/pay.html',
    SUBSCRIBE_PAGE: process.env.SUBSCRIBE_PAGE || '/subscribe.html',
    
    // ==========================================
    // LAIKA IEROBEŽOJUMI
    // ==========================================
    SIGNATURE_TIMEOUT_SECONDS: parseInt(process.env.SIGNATURE_TIMEOUT_SECONDS || '600', 10),
    UPLOAD_TIMEOUT_MS: parseInt(process.env.UPLOAD_TIMEOUT_MS || '120000', 10),
    MANIFEST_UPLOAD_TIMEOUT_MS: parseInt(process.env.MANIFEST_UPLOAD_TIMEOUT_MS || '60000', 10),
    MAX_UPLOAD_RETRIES: parseInt(process.env.MAX_UPLOAD_RETRIES || '3', 10),
    
    // ==========================================
    // FAILU SKENĒŠANA
    // ==========================================
    IGNORE_PATTERNS: (process.env.IGNORE_PATTERNS || '.git,node_modules,.next,dist,build,.cache,coverage,.env,.env.local,permarepo.lock.json,.permrepo').split(','),
    MAX_FILE_SIZE_BYTES: parseInt(process.env.MAX_FILE_SIZE_BYTES || '104857600', 10), // 100MB
    
    // ==========================================
    // MANIFESTA IESTATĪJUMI
    // ==========================================
    MANIFEST_TYPE: process.env.MANIFEST_TYPE || 'arweave/paths',
    MANIFEST_VERSION: process.env.MANIFEST_VERSION || '0.2.0',
    MANIFEST_INDEX_FILE: process.env.MANIFEST_INDEX_FILE || 'README.md',
    
    // ==========================================
    // LOCK FAILA IESTATĪJUMI
    // ==========================================
    LOCK_FILE_NAME: process.env.LOCK_FILE_NAME || 'permarepo.lock.json',
    LOCK_FILE_VERSION: process.env.LOCK_FILE_VERSION || '1.0.0',
    
    // ==========================================
    // PERMAREPO DIREKTORIJA
    // ==========================================
    PERMAREPO_DIR: process.env.PERMAREPO_DIR || '.permrepo',
    BACKUPS_DIR: process.env.BACKUPS_DIR || 'backups',
    
    // ==========================================
    // APLIKĀCIJAS METADATI
    // ==========================================
    APP_NAME: process.env.APP_NAME || 'PermRepo',
    APP_VERSION: process.env.APP_VERSION || '1.0.0',
    APP_DESCRIPTION: process.env.APP_DESCRIPTION || 'Mūžīgs Git repo backups uz Arweave',
    
    // ==========================================
    // GITHUB ISSUE
    // ==========================================
    ISSUE_TITLE_PREFIX: process.env.ISSUE_TITLE_PREFIX || '[PermRepo Backup]',
    
    // ==========================================
    // SUBSCRIPTION
    // ==========================================
    SUBSCRIPTION_PRICE_USDC: parseFloat(process.env.SUBSCRIPTION_PRICE_USDC || '2'),
    SUBSCRIPTION_PERIOD_DAYS: parseInt(process.env.SUBSCRIPTION_PERIOD_DAYS || '30', 10),
    
    // ==========================================
    // MIME TIPI
    // ==========================================
    MIME_TYPES: {
        '.js': 'application/javascript',
        '.ts': 'application/typescript',
        '.json': 'application/json',
        '.md': 'text/markdown',
        '.html': 'text/html',
        '.css': 'text/css',
        '.sol': 'text/plain',
        '.yaml': 'application/x-yaml',
        '.yml': 'application/x-yaml',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.txt': 'text/plain',
        '.xml': 'application/xml',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip',
        '.gz': 'application/gzip',
        '.tar': 'application/x-tar'
    },
    DEFAULT_MIME_TYPE: 'application/octet-stream',
    
    // ==========================================
    // MERKLE TREE
    // ==========================================
    MERKLE_HASH_ALGORITHM: process.env.MERKLE_HASH_ALGORITHM || 'sha256',
    MERKLE_EMPTY_ROOT: '0x0000000000000000000000000000000000000000000000000000000000000000',
    
    // ==========================================
    // ACTION SPECIFISKI
    // ==========================================
    ACTION_NODE_VERSION: process.env.ACTION_NODE_VERSION || '20'
};

module.exports = CONFIG;
