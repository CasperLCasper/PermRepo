// 1. OBLIGĀTI: Pievienojam /web beigās un izmantojam WebTurboFactory
import { WebTurboFactory, EthereumSigner } from '@ardrive/turbo-sdk/web';
import { ethers } from 'ethers';

const TURBO_UPLOAD_URL = 'https://upload.services.ar-io.dev';
const TURBO_PAYMENT_URL = 'https://payment.services.ar-io.dev';

window.startUpload = async function(fileData, tags) {
    if (!window.ethereum) throw new Error("Nav atrasts MetaMask (window.ethereum)!");
    
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    // 2. Izmantojam WebTurboFactory
    const turbo = WebTurboFactory.authenticated({
        signer: new EthereumSigner(signer),
        token: 'base-eth',
        uploadServiceConfig: { url: TURBO_UPLOAD_URL },
        paymentServiceConfig: { url: TURBO_PAYMENT_URL }
    });

    const result = await turbo.upload({ data: fileData, dataItemOpts: { tags } });
    return result.id;
};
