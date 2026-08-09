// ============================================
// PERMAREPO GLABĀŠANAS APMAKSAS LAPA (DEV / TESTNET)
// ============================================

const CHAIN_ID = '0x14a34'; // Base Sepolia (Chain ID: 84532)
const CHAIN_NAME = 'Base Sepolia';

// AR-IO Testnet Sandbox API
const TESTNET_TURBO_API = 'https://payment.services.ar-io.dev/v1/currencies';

// Rezerves Base Sepolia adrese izstrādes stadijai (ja API met SSL/CORS kļūdu)
// Varat norādīt savu Base Sepolia testa maka adresi vai atstāt šo:
const TESTNET_FALLBACK_ADDRESS = '0x1000000000000000000000000000000000000000';

const params = new URLSearchParams(window.location.search);
const repoFromUrl = params.get('repo') || '';

let signer, userAddress, turboPaymentAddress;

async function init() {
    document.getElementById('repoInput').value = repoFromUrl;
    document.getElementById('timestamp').textContent = new Date().toLocaleString('lv-LV');

    if (!window.ethereum) {
        showError('❌ Instalē MetaMask vai citu Web3 maku');
        return;
    }

    try {
        // 1. Pārslēdzamies uz Base Sepolia tīklu
        await switchOrAddNetwork();

        const provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        // 2. Iegūstam vai iestatām testnet maksājuma adresi
        setStatus('⏳ Iegūst testnet maksājuma informāciju...');
        turboPaymentAddress = await fetchTurboPaymentAddress();

        const addrEl = document.getElementById('paymentAddress');
        if (addrEl) {
            addrEl.textContent = turboPaymentAddress.substring(0, 8) + '...' + turboPaymentAddress.substring(turboPaymentAddress.length - 6);
            addrEl.title = turboPaymentAddress;
        }

        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = '💳 Pirkt testnet kredītus un parakstīt';
        button.onclick = buyCreditsAndSign;

        setStatus('✅ Gatavs apmaksai (Base Sepolia Testnet)');
    } catch (e) {
        console.error('Inicēšanas kļūda:', e);
        showError('❌ Kļūda: ' + e.message);
    }
}

// Mēģina saņemt adresi no Testnet API, bet SSL/tīkla kļūdas gadījumā izmanto rezerves adresi
async function fetchTurboPaymentAddress() {
    try {
        const response = await fetch(TESTNET_TURBO_API);
        if (response.ok) {
            const data = await response.json();
            const currencies = Array.isArray(data) ? data : (data.currencies || []);
            const baseEth = currencies.find(c => 
                c.token === 'base-eth' || 
                c.network === 'base-sepolia' || 
                c.chainId === 84532
            );
            if (baseEth && baseEth.destinationAddress) {
                return baseEth.destinationAddress;
            }
        }
    } catch (err) {
        console.warn('⚠️ Testnet API SSL/tīkla kļūda. Izmanto rezerves testnet adresi izstrādei:', err.message);
    }

    // Izstrādes stadijā droši izmantojam testnet adresi
    return TESTNET_FALLBACK_ADDRESS;
}

async function switchOrAddNetwork() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CHAIN_ID }]
        });
    } catch (switchError) {
        if (switchError.code === 4902) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: CHAIN_ID,
                    chainName: CHAIN_NAME,
                    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                    rpcUrls: ['https://sepolia.base.org'],
                    blockExplorerUrls: ['https://sepolia.basescan.org']
                }]
            });
        } else {
            throw switchError;
        }
    }
}

async function buyCreditsAndSign() {
    let repo = document.getElementById('repoInput').value.trim();
    repo = repo.replace(/^https?:\/\/permrepo\.pages\.dev\//, '').replace(/^https?:\/\/.+\//, '');

    if (!repo || !repo.includes('/')) {
        showError('❌ Ievadi pareizu repozitoriju (piem., lietotajs/repo)');
        return;
    }

    try {
        const button = document.getElementById('payButton');
        button.disabled = true;

        // 1. Veic transakciju Base Sepolia tīklā
        button.textContent = '⏳ Apstiprini maksājumu MetaMask...';
        setStatus('1/2: Nosūti testnet ETH...');

        const tx = await signer.sendTransaction({
            to: turboPaymentAddress,
            value: ethers.parseEther('0.001') // 0.001 Base Sepolia ETH
        });

        setStatus('⏳ Gaida darījuma apstiprinājumu tīklā...');
        await tx.wait();

        // 2. Paraksta ziņojumu ar maku
        button.textContent = '⏳ Paraksti autorizāciju...';
        setStatus('2/2: Paraksti ar maku...');

        const timestamp = Math.floor(Date.now() / 1000);
        const message = [
            'PermRepo Storage Payment Authorization',
            `Repository: ${repo}`,
            `Timestamp: ${timestamp}`,
            `Address: ${userAddress}`,
            `TxHash: ${tx.hash}`
        ].join('\n');

        const signature = await signer.signMessage(message);

        const payload = {
            address: userAddress,
            signature: signature,
            message: message,
            timestamp: timestamp,
            txHash: tx.hash
        };

        const jsonBody = JSON.stringify(payload, null, 2);
        const body = '```json\n' + jsonBody + '\n```';
        const issueTitle = `[PermRepo Backup] ${userAddress.substring(0, 10)}...`;
        const issueUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(body)}`;

        setStatus('✅ Testnet apmaksa veikta! Pārejam uz GitHub...');
        window.location.href = issueUrl;

    } catch (e) {
        if (e.code === 'ACTION_REJECTED') {
            showError('❌ Transakcija tika atcelta makā');
        } else {
            showError('❌ Kļūda: ' + e.message);
        }
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = '💳 Pirkt testnet kredītus un parakstīt';
    }
}

function setStatus(msg) { document.getElementById('status').textContent = msg; }
function showError(msg) { document.getElementById('error').textContent = msg; }

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
