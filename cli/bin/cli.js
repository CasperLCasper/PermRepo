#!/usr/bin/env node
const { Command } = require('commander');
const { backup } = require('../src/commands/backup');
const program = new Command();

program
    .name('perm-repo')
    .description('Mūžīgs Git repo backups uz Arweave')
    .version('1.0.0');

program
    .command('backup')
    .description('Veikt inkrementālu backupu')
    .option('-w, --wallet <addr>', 'Maka adrese', process.env.WALLET_ADDRESS)
    .option('-r, --repo <path>', 'Repo ceļš', '.')
    .option('-u, --rpc <url>', 'RPC URL', process.env.RPC_URL || 'https://sepolia.base.org')
    .option('--subscription <addr>', 'Subscription līguma adrese', process.env.SUBSCRIPTION_ADDRESS)
    .option('--nft <addr>', 'NFT līguma adrese', process.env.NFT_ADDRESS)
    .option('--registry <addr>', 'Registry līguma adrese', process.env.REGISTRY_ADDRESS)
    .option('--turbo-upload <url>', 'Turbo Upload URL', process.env.TURBO_UPLOAD_URL || 'https://upload.services.ar-io.dev')
    .option('--turbo-payment <url>', 'Turbo Payment URL', process.env.TURBO_PAYMENT_URL || 'https://payment.services.ar-io.dev')
    .action(async (opts) => {
        try {
            await backup(opts);
        } catch (e) {
            console.error('❌ Kļūda:', e.message);
            process.exit(1);
        }
    });

program.parse();
