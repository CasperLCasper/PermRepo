// ============================================
// PERMAREPO KOPĪGĀ KONFIGURĀCIJA
// ============================================

const CONFIG = {
    // Blockchain
    RPC_URL: process.env.RPC_URL || 'https://sepolia.base.org',
    CHAIN_ID: '0x14a34', // Base Sepolia
    
    // Līgumu adreses
    SUBSCRIPTION_ADDRESS: process.env.SUBSCRIPTION_ADDRESS || '0x29f1ed42C6C2E157B7571f9585a9C9Dd6fBcda51',
    NFT_ADDRESS: process.env.NFT_ADDRESS || '0xeD3eB455cAeb057a034d7bE2368cdCEA37Faa1d4',
    REGISTRY_ADDRESS: process.env.REGISTRY_ADDRESS || '0x2a5a7F926046BB1A011D9082aB70BF38bfcb9dc9',
    USDC_ADDRESS: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    
    // Arweave / Turbo
    TURBO_UPLOAD_URL: process.env.TURBO_UPLOAD_URL || 'https://upload.services.ar-io.dev',
    TURBO_PAYMENT_URL: process.env.TURBO_PAYMENT_URL || 'https://payment.services.ar-io.dev',
    
    // Web
    WEB_URL: process.env.WEB_URL || 'https://perma-repo.pages.dev',
    
    // Laika ierobežojumi
    SIGNATURE_TIMEOUT: 600, // 10 minūtes
    UPLOAD_TIMEOUT: 120000, // 2 minūtes
    MANIFEST_TIMEOUT: 60000, // 1 minūte
    MAX_RETRIES: 3
};

module.exports = CONFIG;
