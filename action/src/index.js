const { execSync } = require('child_process');
const core = require('@actions/core');

async function run() {
    try {
        const wallet = core.getInput('wallet_address', { required: true });
        const subscription = core.getInput('subscription_address', { required: true });
        const nft = core.getInput('nft_address', { required: true });
        const registry = core.getInput('registry_address', { required: true });
        const rpc = core.getInput('rpc_url');
        const turboUpload = core.getInput('turbo_upload_url');
        const turboPayment = core.getInput('turbo_payment_url');

        const cmd = [
            'npx perma-repo backup',
            `--wallet ${wallet}`,
            `--subscription ${subscription}`,
            `--nft ${nft}`,
            `--registry ${registry}`,
            `--rpc ${rpc}`,
            `--turbo-upload ${turboUpload}`,
            `--turbo-payment ${turboPayment}`,
            '--repo .'
        ].join(' ');

        execSync(cmd, { stdio: 'inherit' });
        core.setOutput('status', 'success');
    } catch (e) {
        core.setOutput('status', 'failed');
        core.setFailed(e.message);
    }
}
run();
