// ============================================
// PERMAREPO GLOBĀLĀ KONFIGURĀCIJA
// Visas vērtības cieti iekodētas, izņemot WALLET_ADDRESS
// ============================================

const CONFIG = {
    // ==========================================
    // BLOCKCHAIN
    // ==========================================
    RPC_URL: 'https://sepolia.base.org',
    CHAIN_ID: '0x14a34',
    CHAIN_NAME: 'Base Sepolia',
    
    SUBSCRIPTION_ADDRESS: '0x29f1ed42C6C2E157B7571f9585a9C9Dd6fBcda51',
    NFT_ADDRESS: '0xeD3eB455cAeb057a034d7bE2368cdCEA37Faa1d4',
    REGISTRY_ADDRESS: '0x2a5a7F926046BB1A011D9082aB70BF38bfcb9dc9',
    USDC_ADDRESS: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    
    // ==========================================
    // ARWEAVE / TURBO
    // ==========================================
    TURBO_UPLOAD_URL: 'https://upload.services.ar-io.dev',
    TURBO_PAYMENT_URL: 'https://payment.services.ar-io.dev',
    ARWEAVE_GATEWAY: 'https://arweave.net',
    TURBO_TOKEN_TYPE: 'base-usdc',
    
    // ==========================================
    // WEB URL
    // ==========================================
    WEB_URL: 'https://permrepo.pages.dev',
    NFT_PAGE: '/nft.html',
    SUBSCRIBE_PAGE: '/subscribe.html',
    STORAGE_PAY_PAGE: '/storage-pay.html',
    
    // ==========================================
    // VIENĪGAIS NO process.env
    // ==========================================
    get WALLET_ADDRESS() {
        return process.env.WALLET_ADDRESS;
    },
    
    // ==========================================
    // LAIKA IEROBEŽOJUMI
    // ==========================================
    SIGNATURE_TIMEOUT_SECONDS: 600,
    UPLOAD_TIMEOUT_MS: 120000,
    MANIFEST_UPLOAD_TIMEOUT_MS: 60000,
    MAX_UPLOAD_RETRIES: 3,
    
    // ==========================================
    // FAILU SKENĒŠANA
    // ==========================================
    IGNORE_PATTERNS: '.git,node_modules,.next,dist,build,.cache,coverage,.env,.env.local,permarepo.lock.json,.permrepo'.split(','),
    MAX_FILE_SIZE_BYTES: 104857600,
    
    // ==========================================
    // MANIFESTA IESTATĪJUMI
    // ==========================================
    MANIFEST_TYPE: 'arweave/paths',
    MANIFEST_VERSION: '0.2.0',
    MANIFEST_INDEX_FILE: 'README.md',
    
    // ==========================================
    // LOCK FAILA IESTATĪJUMI
    // ==========================================
    LOCK_FILE_NAME: 'permarepo.lock.json',
    LOCK_FILE_VERSION: '1.0.0',
    
    // ==========================================
    // PERMAREPO DIREKTORIJA
    // ==========================================
    PERMAREPO_DIR: '.permrepo',
    BACKUPS_DIR: 'backups',
    
    // ==========================================
    // APLIKĀCIJAS METADATI
    // ==========================================
    APP_NAME: 'PermRepo',
    APP_VERSION: '1.0.0',
    APP_DESCRIPTION: 'Mūžīgs Git repo backups uz Arweave',
    
    // ==========================================
    // GITHUB ISSUE
    // ==========================================
    ISSUE_TITLE_PREFIX: '[PermRepo Backup]',
    
    // ==========================================
    // SUBSCRIPTION
    // ==========================================
    SUBSCRIPTION_PRICE_USDC: 2,
    SUBSCRIPTION_PERIOD_DAYS: 30,
    
    // ==========================================
    // MERKLE TREE
    // ==========================================
    MERKLE_HASH_ALGORITHM: 'sha256',
    MERKLE_EMPTY_ROOT: '0x0000000000000000000000000000000000000000000000000000000000000000',
    
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
    // ACTION SPECIFISKI
    // ==========================================
    ACTION_NODE_VERSION: '20'
};

module.exports = CONFIG;
