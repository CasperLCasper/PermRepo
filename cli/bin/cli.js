#!/usr/bin/env node
const { Command } = require('commander');
const CONFIG = require('../src/config');
const { backup } = require('../src/commands/backup');
const { init } = require('../src/commands/init');
const { restore } = require('../src/commands/restore');

const program = new Command();
program.name('perm-repo').description(CONFIG.APP_DESCRIPTION).version(CONFIG.APP_VERSION);

program.command('backup').description('Veikt inkrementālu backupu')
    .option('-w, --wallet <addr>', 'Maka adrese')
    .option('-r, --repo <path>', 'Repo ceļš', '.')
    .action(async (opts) => {
        try { const r = await backup(opts); if (r) console.log(JSON.stringify(r)); }
        catch (e) { console.error('❌', e.message); process.exit(1); }
    });

program.command('init').description('Inicializēt PermRepo')
    .option('-r, --repo <path>', 'Repo ceļš', '.')
    .action((opts) => { try { init(opts.repo); } catch (e) { console.error('❌', e.message); process.exit(1); } });

program.command('restore').description('Atjaunot no Arweave')
    .argument('<manifestTxId>', 'Manifesta TX ID')
    .option('-o, --output <dir>', 'Izvades direktorija', '.')
    .action(async (id, opts) => { try { await restore(id, opts.output); } catch (e) { console.error('❌', e.message); process.exit(1); } });

program.parse();
