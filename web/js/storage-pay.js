// ============================================
// PERMAREPO GLABĀŠANAS APMAKSAS LAPA (DINAMISKA CENA)
// ============================================

const CHAIN_ID = '0x14a34'; // Base Sepolia (84532)
const CHAIN_NAME = 'Base Sepolia';

const TURBO_API_BASE = 'https://payment.ardrive.io/v1'; // Vai https://payment.services.ar-io.dev/v1 testnetam
const TESTNET_FALLBACK_ADDRESS = '0x1000000000000000000000000000000000000000';

const params = new URLSearchParams(window.location.search);
const repoFromUrl = params.get('repo') || '';

let signer, userAddress, turboPaymentAddress;
let calculatedAmountWei = ethers.parseEther('0.001'); // Noklusējuma drošības vērtība

async function init() {
    document.getElementById('repoInput').value = repoFromUrl;
    document.getElementById('timestamp').textContent = new Date().toLocaleString('lv-LV');

    // Pievieno notikumu, lai pārrēķinātu cenu, tiklīdz lietotājs nomaina repozitorija nosaukumu
    document.getElementById('repoInput').addEventListener('change', updatePriceForRepo);

    if (!window.ethereum) {
        showError('❌ Instalē MetaMask vai citu Web3 maku');
        return;
    }

    try {
        await switchOrAddNetwork();

        const provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        setStatus('⏳ Iegūst maksājuma informāciju...');
        turboPaymentAddress = await fetchTurboPaymentAddress();

        const addrEl = document.getElementById('paymentAddress');
        if (addrEl) {
            addrEl.textContent = turboPaymentAddress.substring(0, 8) + '...' + turboPaymentAddress.substring(turboPaymentAddress.length - 6);
            addrEl.title = turboPaymentAddress;
        }

        // Aprēķina reālo cenu ievadītajam repo
        await updatePriceForRepo();

        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = '💳 Pirkt kredītus un parakstīt';
        button.onclick = buyCreditsAndSign;

        setStatus('✅ Gatavs apmaksai');
    } catch (e) {
        console.error(e);
        showError('❌ Kļūda: ' + e.message);
    }
}

// 1. Aprēķina reālo repozitorija izmēru un cenu no Turbo API
async function updatePriceForRepo() {
    let repo = document.getElementById('repoInput').value.trim();
    repo = repo.replace(/^https?:\/\/permrepo\.pages\.dev\//, '').replace(/^https?:\/\/.+\//, '');

    const totalEl = document.querySelector('.total');

    if (!repo || !repo.includes('/')) {
        if (totalEl) totalEl.textContent = '~0.001 ETH (Ievadi repo)';
        return;
    }

    try {
        if (totalEl) totalEl.textContent = '⏳ Aprēķina izmaksas...';

        // A. Iegūstam repozitorija izmēru no GitHub API (izmērs ir KB)
        const ghResponse = await fetch(`https://api.github.com/repos/${repo}`);
        if (!ghResponse.ok) throw new Error('Repozitorijs nav atrasts GitHub');

        const ghData = await ghResponse.json();
        const sizeInKB = ghData.size || 1024; // Ja nav datu, pieņem vismaz 1 MB
        
        // Pārvēršam baitos (vismaz 1MB min apjoms)
        const bytesCount = Math.max(sizeInKB * 1024, 1048576); 

        // B. Pieprasām Turbo cena par šo baitu daudzumu
        const priceResponse = await fetch(`${TURBO_API_BASE}/price/bytes/${bytesCount}?currency=base-eth`);
        
        if (priceResponse.ok) {
            const priceData = await priceResponse.json();

            // Ja API atgriež tiešo vērtību vai mērvienības
            if (priceData && (priceData.winc || priceData.actual)) {
                // Konvertējam saņemto summu uz Wei (ja cena ir dota ETH)
                const ethAmountStr = priceData.actual ? priceData.actual.amount : null;
                
                if (ethAmountStr) {
                    calculatedAmountWei = ethers.parseEther(ethAmountStr);
                }
            }
        } else {
            // Ja cenu API nav pieejams, aprēķinām aptuveni (piem., 1MB ~ 0.00005 ETH, min 0.0005 ETH)
            const estimatedEth = Math.max(0.0005, (bytesCount / 1048576) * 0.00005).toFixed(6);
            calculatedAmountWei = ethers.parseEther(estimatedEth.toString());
        }

        const formattedEth = ethers.formatEther(calculatedAmountWei);
        const mbSize = (bytesCount / (1024 * 1024)).toFixed(2);

        if (totalEl) {
            totalEl.textContent = `~${formattedEth} ETH (${mbSize} MB)`;
        }

    } catch (err) {
        console.warn('Neizdevās aprēķināt precīzo cenu:', err.message);
        calculatedAmountWei = ethers.parseEther('0.001'); // Fallback
        if (totalEl) totalEl.textContent = '~0.001 ETH (Noklusējums)';
    }
}

async function fetchTurboPaymentAddress() {
    try {
        const response = await fetch(`${TURBO_API_BASE}/currencies`);
        if (response.ok) {
            const data = await response.json();
            const currencies = Array.isArray(data) ? data : (data.currencies || []);
            const baseEth = currencies.find(c => c.token === 'base-eth' || c.network === 'base-sepolia' || c.chainId === 84532);
            if (baseEth && baseEth.destinationAddress) return baseEth.destinationAddress;
        }
    } catch (err) {
        console.warn('API kļūda, izmanto rezerves adresi');
    }
    return TESTNET_FALLBACK_ADDRESS;
}

async function switchOrAddNetwork() {
    try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
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
        } else { throw switchError; }
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

        button.textContent = '⏳ Apstiprini maksājumu MetaMask...';
        setStatus('1/2: Nosūti ETH uz Turbo...');

        // ŠEIT PIEPRASA APRĒĶINĀTO REĀLO SUMMU (calculatedAmountWei):
        const tx = await signer.sendTransaction({
            to: turboPaymentAddress,
            value: calculatedAmountWei
        });

        setStatus('⏳ Gaida darījuma apstiprinājumu tīklā...');
        await tx.wait();

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

        setStatus('✅ Apmaksa veikta! Pārejam uz GitHub...');
        window.location.href = issueUrl;

    } catch (e) {
        if (e.code === 'ACTION_REJECTED') {
            showError('❌ Transakcija tika atcelta makā');
        } else {
            showError('❌ Kļūda: ' + e.message);
        }
        const button = document.getElementById('payButton');
        button.disabled = false;
        button.textContent = '💳 Pirkt kredītus un parakstīt';
    }
}

function setStatus(msg) { document.getElementById('status').textContent = msg; }
function showError(msg) { document.getElementById('error').textContent = msg; }

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
