const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('../config');
const { scanFiles, compareWithLock, saveLock, getRepoName } = require('../git/scanner');
const { createMerkleTree } = require('../merkle/tree');
const { getExistingNFT } = require('../blockchain/nft');
const { checkSubscription } = require('../blockchain/subscription');
const { TurboFactory, EthereumSigner } = require('@ardrive/turbo-sdk');

function getRepoHash(repoName) {
    return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], [repoName]));
}

const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || CONFIG.TREASURY_ADDRESS;

const TREASURY_ABI = [
    "function payTurbo(uint256 amount, bytes32 paymentId) external",
    "function balance() external view returns (uint256)"
];

async function backup(opts) {
    const walletAddress = opts.wallet || CONFIG.WALLET_ADDRESS;
    if (!walletAddress) { console.log('Nav iestatits WALLET_ADDRESS.'); return; }

    const repoPath = path.resolve(opts.repo || '.');
    const repoName = getRepoName(repoPath).trim();
    const repoHash = getRepoHash(repoName);
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    console.log('PermRepo — Inkrementals backups');
    console.log('=======================================================');
    console.log(`Repozitorijs: ${repoName}`);
    console.log(`Maks: ${walletAddress}`);

    // NFT parbaude
    const tokenId = await getExistingNFT(provider, CONFIG.NFT_ADDRESS, repoHash);
    if (tokenId === 0n || tokenId === 0) {
        console.log('Nav izveidots NFT sim repozitorijam.');
        console.log(`Izveidot NFT: ${CONFIG.WEB_URL}${CONFIG.NFT_PAGE}?repo=${encodeURIComponent(repoName)}`);
        return;
    }
    const nftContract = new ethers.Contract(CONFIG.NFT_ADDRESS, ['function ownerOf(uint256) view returns (address)'], provider);
    if ((await nftContract.ownerOf(tokenId)).toLowerCase() !== walletAddress.toLowerCase()) {
        console.log('NFT nepieder sim makam.'); return;
    }
    console.log('NFT ipasumtiesibas apstiprinatas');

    // Abonementa parbaude
    if (!(await checkSubscription(provider, CONFIG.SUBSCRIPTION_ADDRESS, tokenId))) {
        console.log('Nav aktiva abonementa.');
        console.log(`Aktivizet abonementu: ${CONFIG.WEB_URL}${CONFIG.SUBSCRIBE_PAGE}`);
        return;
    }
    console.log('Abonements aktivs');

    // Failu skenesana
    const currentFiles = scanFiles(repoPath);
    const lockData = loadLock(repoPath);
    const { unchanged, changed, deleted } = compareWithLock(currentFiles, lockData);
    
    if (Object.keys(changed).length === 0 && deleted.length === 0) {
        console.log('Nav izmainu kops pedeja backupa.'); return;
    }

    const totalChangedSize = Object.values(changed).reduce((s, f) => s + f.size, 0);
    console.log(`Mainiti: ${Object.keys(changed).length} faili, ${(totalChangedSize / 1024).toFixed(1)} KB`);

    // Glabasanas apmaksas verifikacija
    const issueBody = process.env.ISSUE_BODY;
    
    if (!issueBody) {
        // ==========================================
        // APRĒĶINĀT IZMAKSAS CAUR TURBO API
        // ==========================================
        const operatorPrivateKey = process.env.OPERATOR_PRIVATE_KEY;
        
        if (!operatorPrivateKey) {
            console.log('Nav OPERATOR_PRIVATE_KEY. Izlaizam precizu apmaksu.');
            return;
        }
        
        try {
            const turboSigner = new EthereumSigner(operatorPrivateKey);
            const turbo = TurboFactory.authenticated({
                signer: turboSigner,
                token: 'base-eth',
                uploadServiceConfig: { url: 'https://upload.services.ar-io.dev' },
                paymentServiceConfig: { url: 'https://payment.services.ar-io.dev' }
            });
            
            const costs = await turbo.getUploadCosts({ bytes: totalChangedSize });
            const costInfo = costs[0];
            
            if (!costInfo) {
                throw new Error('Neizdevas iegut izmaksas no Turbo');
            }
            
            const actualCostWei = ethers.parseEther(costInfo.tokenAmount.toString());
            const actualCostEth = ethers.formatEther(actualCostWei);
            
            const paymentUrl = `${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?repo=${encodeURIComponent(repoName)}&amount=${actualCostEth}`;
            
            console.log('Nepieciesams apmaksat glabasanu.');
            console.log(`Failu skaits: ${Object.keys(changed).length}`);
            console.log(`Kopejais izmers: ${(totalChangedSize / 1024).toFixed(1)} KB`);
            console.log(`Precizas izmaksas: ${actualCostEth} ETH`);
            console.log(`Apmaksas lapa: ${paymentUrl}`);
            console.log('Pec iemaksas izveido jaunu Issue ar GitHub, lai turpinatu backupu.');
            
        } catch (e) {
            console.warn('Neizdevas iegut precizu cenu:', e.message);
            const estimatedCostEth = (totalChangedSize / 1024 / 1024 * 0.00001).toFixed(8);
            const paymentUrl = `${CONFIG.WEB_URL}${CONFIG.STORAGE_PAY_PAGE}?repo=${encodeURIComponent(repoName)}&amount=${estimatedCostEth}`;
            console.log('Aptuvenas izmaksas:', estimatedCostEth, 'ETH');
            console.log('Apmaksas lapa:', paymentUrl);
        }
        
        return;
    }

    let uploadedFiles = [];
    let manifestTxId = null;
    
    try {
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            console.log('Neizdevas atrast JSON datus.');
            return;
        }
        
        const payload = JSON.parse(jsonMatch[1]);
        const { signature, message, timestamp, uploadedFiles: files, manifestTxId: issueManifestTxId } = payload;
        
        if (Math.floor(Date.now() / 1000) - timestamp > CONFIG.SIGNATURE_TIMEOUT_SECONDS) {
            console.log('Paraksts ir novecojis (>10 min).'); return;
        }
        
        const recovered = ethers.verifyMessage(message, signature);
        if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
            console.log('Paraksts neatbilst maka adresei.'); return;
        }
        
        uploadedFiles = files || [];
        manifestTxId = issueManifestTxId || null;
        
        console.log('Glabasanas apmaksa verificeta');
        if (uploadedFiles.length > 0) console.log(`Augsupieladeti ${uploadedFiles.length} faili`);
        if (manifestTxId) console.log(`Manifests: ar://${manifestTxId}`);
        
    } catch (e) {
        console.log('Kluda verificejot parakstu:', e.message); return;
    }

    // ==========================================
    // JA NAV FAILU NO PĀRLŪKA — AUGŠUPIELĀDĒJAM NO CLI
    // ==========================================
    if (uploadedFiles.length === 0 && Object.keys(changed).length > 0) {
        try {
            const operatorPrivateKey = process.env.OPERATOR_PRIVATE_KEY;
            if (!operatorPrivateKey) {
                throw new Error('OPERATOR_PRIVATE_KEY nav iestatits GitHub Secretos');
            }
            
            const operatorWallet = new ethers.Wallet(operatorPrivateKey, provider);
            console.log(`Operators: ${operatorWallet.address}`);
            
            const turboSigner = new EthereumSigner(operatorPrivateKey);
            const turbo = TurboFactory.authenticated({
                signer: turboSigner,
                token: 'base-eth',
                uploadServiceConfig: { url: 'https://upload.services.ar-io.dev' },
                paymentServiceConfig: { url: 'https://payment.services.ar-io.dev' }
            });
            
            const costs = await turbo.getUploadCosts({ bytes: totalChangedSize });
            const costInfo = costs[0];
            const actualCostWei = ethers.parseEther(costInfo.tokenAmount.toString());
            
            const treasuryContract = new ethers.Contract(TREASURY_ADDRESS, TREASURY_ABI, provider);
            const treasuryBalance = await treasuryContract.balance();
            console.log(`Treasury balance: ${ethers.formatEther(treasuryBalance)} ETH`);
            
            if (treasuryBalance < actualCostWei) {
                throw new Error('Treasury nav pietiekami lidzeklu.');
            }
            
            const paymentId = ethers.id(repoName + Date.now().toString());
            console.log('Apmaksajam glabasanu caur Treasury...');
            
            const treasuryWriteContract = new ethers.Contract(TREASURY_ADDRESS, TREASURY_ABI, operatorWallet);
            const payTx = await treasuryWriteContract.payTurbo(actualCostWei, paymentId);
            await payTx.wait();
            console.log('Turbo apmaksa veikta no Treasury');
            
            await turbo.topUpWithTokens({
                tokenAmount: costInfo.tokenAmount.toString()
            });
            console.log('Krediti nopirkti');
            
            console.log('Augsupielade failus...');
            for (const [filePath, info] of Object.entries(changed)) {
                const fullPath = path.join(repoPath, filePath);
                const fileData = fs.readFileSync(fullPath);
                
                const result = await turbo.uploadFile({
                    fileStreamFactory: () => fileData,
                    fileSizeFactory: () => fileData.length,
                    dataItemOpts: {
                        tags: [
                            { name: 'App-Name', value: 'PermRepo' },
                            { name: 'Repo', value: repoName },
                            { name: 'File-Path', value: filePath },
                            { name: 'Content-Type', value: 'text/plain' },
                            { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
                        ]
                    }
                });
                
                uploadedFiles.push({ path: filePath, txId: result.id, size: info.size });
                console.log(`Augsupieladets: ${filePath}`);
            }
            
            const manifest = {
                manifest: 'arweave/paths', version: '0.2.0',
                index: { path: 'README.md' }, paths: {},
                metadata: { repo: repoName, timestamp: new Date().toISOString(), generatedBy: 'PermRepo v1.0.0' }
            };
            for (const f of uploadedFiles) manifest.paths[f.path] = { id: f.txId };
            
            const manifestData = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
            const manifestResult = await turbo.uploadFile({
                fileStreamFactory: () => manifestData,
                fileSizeFactory: () => manifestData.length,
                dataItemOpts: {
                    tags: [
                        { name: 'App-Name', value: 'PermRepo' },
                        { name: 'Type', value: 'path-manifest' },
                        { name: 'Repo', value: repoName },
                        { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
                        { name: 'Unix-Time', value: String(Math.floor(Date.now() / 1000)) }
                    ]
                }
            });
            manifestTxId = manifestResult.id;
            console.log(`Manifests: ar://${manifestTxId}`);
            
        } catch (cliUploadError) {
            console.log('CLI augsupielade neizdevas:', cliUploadError.message);
            return;
        }
    }

    // Apvienot failus
    const allUploaded = {};
    for (const f of uploadedFiles) allUploaded[f.path] = { hash: '', txId: f.txId, size: f.size };
    for (const [fp, info] of Object.entries(unchanged)) allUploaded[fp] = info;

    // Merkle root
    const allFiles = { ...unchanged, ...allUploaded };
    const { root: merkleRoot } = createMerkleTree(allFiles);
    console.log(`Merkle root: ${merkleRoot}`);

    // Lokala manifesta kopija
    if (manifestTxId) {
        const manifest = {
            manifest: 'arweave/paths', version: '0.2.0',
            index: { path: 'README.md' }, paths: {},
            metadata: { repo: repoName, timestamp: new Date().toISOString(), generatedBy: 'PermRepo v1.0.0' }
        };
        for (const [fp, info] of Object.entries(allUploaded)) manifest.paths[fp] = { id: info.txId };
        
        const backupDir = path.join(repoPath, CONFIG.PERMAREPO_DIR, CONFIG.BACKUPS_DIR);
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(path.join(backupDir, `manifest-${ts}.json`), JSON.stringify(manifest, null, 2));
    }

    // Lock fails
    saveLock(repoPath, unchanged, allUploaded);
    if (deleted.length > 0) console.log(`Dzestie faili: ${deleted.join(', ')}`);

    // === AUTOMATISKI COMMIT LOCK FAILU ===
    if (process.env.GITHUB_TOKEN) {
        try {
            const { execSync } = require('node:child_process');
            execSync('git config user.name "github-actions[bot]"');
            execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
            execSync(`git add ${CONFIG.LOCK_FILE_NAME}`);
            execSync(`git commit -m "Update lock file after backup [skip ci]"`);
            execSync('git push');
            console.log('Lock fails commitots uz GitHub');
        } catch (e) {
            console.warn('Neizdevas commit lock failu:', e.message);
        }
    }

    const totalSize = Object.values(allUploaded).reduce((s, f) => s + f.size, 0);
    
    console.log('=======================================================');
    console.log('BACKUPS VEIKSMIGS!');
    console.log(`Faili: ${Object.keys(allUploaded).length}`);
    console.log(`Izmers: ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`Merkle: ${merkleRoot}`);
    if (manifestTxId) console.log(`Manifests: ar://${manifestTxId}`);
    console.log('=======================================================');

    return {
        status: 'success', manifestTxId, merkleRoot,
        filesChanged: Object.keys(allUploaded).length, totalSize, tokenId: tokenId.toString()
    };
}

function loadLock(repoPath) {
    const lockPath = path.join(repoPath, CONFIG.LOCK_FILE_NAME);
    if (!fs.existsSync(lockPath)) return { files: {} };
    try { return { files: JSON.parse(fs.readFileSync(lockPath, 'utf-8')).files || {} }; } catch { return { files: {} }; }
}

module.exports = { backup };
