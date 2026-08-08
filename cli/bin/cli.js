#!/usr/bin/env node
const { Command } = require('commander');
const CONFIG = require('../../shared/config');
const { backup } = require('../src/commands/backup');
const { init } = require('../src/commands/init');
const { restore } = require('../src/commands/restore');

const program = new Command();

program
    .name('perm-repo')
    .description(CONFIG.APP_DESCRIPTION)
    .version(CONFIG.APP_VERSION);

// ==========================================
// BACKUP KOMANDA
// ==========================================
program
    .command('backup')
    .description('Veikt inkrementālu backupu uz Arweave')
    .option('-w, --wallet <addr>', 'Maka adrese', process.env.WALLET_ADDRESS)
    .option('-r, --repo <path>', 'Repo ceļš', '.')
    .option('-u, --rpc <url>', 'RPC URL', process.env.RPC_URL || CONFIG.RPC_URL)
    .option('--subscription <addr>', 'Subscription līguma adrese', process.env.SUBSCRIPTION_ADDRESS || CONFIG.SUBSCRIPTION_ADDRESS)
    .option('--nft <addr>', 'NFT līguma adrese', process.env.NFT_ADDRESS || CONFIG.NFT_ADDRESS)
    .option('--registry <addr>', 'Registry līguma adrese', process.env.REGISTRY_ADDRESS || CONFIG.REGISTRY_ADDRESS)
    .option('--turbo-upload <url>', 'Turbo Upload URL', process.env.TURBO_UPLOAD_URL || CONFIG.TURBO_UPLOAD_URL)
    .option('--turbo-payment <url>', 'Turbo Payment URL', process.env.TURBO_PAYMENT_URL || CONFIG.TURBO_PAYMENT_URL)
    .action(async (opts) => {
        try {
            const result = await backup(opts);
            if (result) {
                console.log(JSON.stringify(result));
            }
        } catch (e) {
            console.error('❌ Kļūda:', e.message);
            process.exit(1);
        }
    });

// ==========================================
// INIT KOMANDA
// ==========================================
program
    .command('init')
    .description('Inicializēt PermRepo direktoriju')
    .option('-r, --repo <path>', 'Repo ceļš', '.')
    .action((opts) => {
        try {
            init(opts.repo);
        } catch (e) {
            console.error('❌ Kļūda:', e.message);
            process.exit(1);
        }
    });

// ==========================================
// RESTORE KOMANDA
// ==========================================
program
    .command('restore')
    .description('Atjaunot repozitoriju no Arweave manifesta')
    .argument('<manifestTxId>', 'Manifesta transakcijas ID')
    .option('-o, --output <dir>', 'Izvades direktorija', '.')
    .action(async (manifestTxId, opts) => {
        try {
            await restore(manifestTxId, opts.output);
        } catch (e) {
            console.error('❌ Kļūda:', e.message);
            process.exit(1);
        }
    });

program.parse();
