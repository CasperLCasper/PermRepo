// ============================================
// PERMAREPO GLABĀŠANAS APMAKSAS LAPA
// Pērk Turbo kredītus caur MetaMask (base-eth)
// ============================================

const CHAIN_ID = '0x14a34'; // Base Sepolia (84532)
const CHAIN_NAME = 'Base Sepolia';
const TURBO_CURRENCIES_URL = 'https://payment.services.ar-io.dev/v1/currencies';

const params = new URLSearchParams(window.location.search);
const repoFromUrl = params.get('repo') || '';

let signer, userAddress, turboPaymentAddress;

async function init() {
    document.getElementById('repoInput').value = repoFromUrl;
    document.getElementById('timestamp').textContent = new Date().toLocaleString('lv-LV');

    if (!window.ethereum) {
        showError('❌ Instalē MetaMask vai citu kripto maku');
        return;
    }

    try {
        // 1. Pārslēgt vai pievienot Base Sepolia tīklu
        await switchOrAddNetwork();

        const provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        // 2. Iegūt Turbo maksājumu adresi
        setStatus('⏳ Iegūst maksājuma informāciju...');

        const response = await fetch(TURBO_CURRENCIES_URL);
        if (!response.ok) throw new Error('Neizdevās saņemt datus no Turbo API');

        const rawData = await response.json();
        const currencies = Array.isArray(rawData) ? rawData : (rawData.currencies || []);

        // Elastīgāks meklētājs Base ETH atbilstībai
        const baseEthConfig = currencies.find(c => 
            (c.token === 'ethereum' || c.token === 'eth' || c.symbol === 'ETH') && 
            (c.network === 'base' || c.network === 'base-sepolia' || c.chainId === 84532)
        ) || currencies.find(c => c.destinationAddress);

        if (!baseEthConfig || !baseEthConfig.destinationAddress) {
            showError('❌ Nevar atrast Base ETH maksājumu informāciju');
            return;
        }

        turboPaymentAddress = baseEthConfig.destinationAddress;
        
        const addrEl = document.getElementById('paymentAddress');
        if (addrEl) {
            addrEl.textContent = turboPaymentAddress.substring(0, 10) + '...' + turboPaymentAddress.substring(turboPaymentAddress.length - 8);
            addrEl.title = turboPaymentAddress;
        }

        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = '💳 Pirkt kredītus un parakstīt';
        button.onclick = buyCreditsAndSign;

        setStatus('✅ Gatavs apmaksai');
    } catch (e) {
        showError('❌ Kļūda: ' + e.message);
    }
}

// Nodrošina pareiza tīkla pieslēgšanu un tā pievienošanu, ja tas nav makiem
async function switchOrAddNetwork() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CHAIN_ID }]
        });
    } catch (switchError) {
        // 4902 kļūda nozīmē, ka tīkls vēl nav pievienots MetaMask
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

    repo = repo.replace(/^https?:\/\/permrepo\.pages\.dev\//, '');
    repo = repo.replace(/^https?:\/\/.+\//, '');

    if (!repo || repo.includes('http') || !repo.includes('/')) {
        showError('❌ Lūdzu, ievadi repozitorija nosaukumu (piem., lietotajs/repo)');
        return;
    }

    if (!turboPaymentAddress || !ethers.isAddress(turboPaymentAddress)) {
        showError('❌ Nav pieejama derīga Turbo maksājuma adrese');
        return;
    }

    try {
        const button = document.getElementById('payButton');
        button.disabled = true;

        // 1. Nosūtīt maksājumu caur MetaMask
        button.textContent = '⏳ Apstiprini maksājumu MetaMask...';
        setStatus('1/2: Nosūti ETH uz Turbo...');

        const amount = ethers.parseEther('0.001');

        const tx = await signer.sendTransaction({
            to: turboPaymentAddress,
            value: amount
        });

        setStatus('⏳ Gaida transakcijas apstiprinājumu...');
        await tx.wait();

        // 2. Parakstīt backup autorizāciju
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
        const encodedBody = encodeURIComponent(body);
        const issueTitle = `[PermRepo Backup] ${userAddress.substring(0, 10)}...`;
        const issueUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodedBody}`;

        setStatus('✅ Apmaksa veikta! Novirzam uz GitHub...');

        window.location.href = issueUrl;

    } catch (e) {
        if (e.code === 'ACTION_REJECTED') {
            showError('❌ Transakcija atcelta');
        } else {
            showError('❌ Kļūda: ' + e.message);
        }
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = '💳 Pirkt kredītus un parakstīt';
    }
}

function setStatus(message) {
    document.getElementById('status').textContent = message;
}

function showError(message) {
    document.getElementById('error').textContent = message;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
