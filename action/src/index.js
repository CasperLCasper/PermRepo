const core = require('@actions/core');
const github = require('@actions/github');
const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RENDER_URL = process.env.RENDER_URL || core.getInput('render_url');
const RENDER_API_KEY = process.env.RENDER_API_KEY || core.getInput('render_api_key') || '';

const IGNORE_PATTERNS = '.git,node_modules,.next,dist,build,.cache,coverage,.env,.env.local,permarepo.lock.json,.permrepo'.split(',');
const MAX_FILE_SIZE_BYTES = 104857600; // 100 MB

function scanFiles(rootPath) {
    const files = [];
    const ignore = IGNORE_PATTERNS;

    const shouldIgnore = (relativePath) => {
        return ignore.some(pattern => {
            if (relativePath === pattern) return true;
            if (relativePath.startsWith(pattern + path.sep)) return true;
            return false;
        });
    };

    const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(rootPath, fullPath);
            if (shouldIgnore(relativePath)) continue;
            if (entry.isDirectory()) { walk(fullPath); }
            else if (entry.isFile()) {
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.size > MAX_FILE_SIZE_BYTES) { 
                        console.warn(`⚠️ Izlaists liels fails: ${relativePath}`); 
                        continue; 
                    }
                    const content = fs.readFileSync(fullPath);
                    files.push({
                        path: relativePath,
                        size: content.length,
                        content: content.toString('base64'),
                        hash: crypto.createHash('sha256').update(content).digest('hex')
                    });
                } catch (error) {
                    console.warn(`⚠️ Neizdevās nolasīt: ${relativePath}`);
                }
            }
        }
    };

    walk(rootPath);
    return files;
}

function getRepoName(repoPath) {
    let repoName;
    
    if (process.env.GITHUB_REPOSITORY) {
        repoName = process.env.GITHUB_REPOSITORY;
    } else {
        const gitConfigPath = path.join(repoPath, '.git', 'config');
        if (fs.existsSync(gitConfigPath)) {
            try {
                const content = fs.readFileSync(gitConfigPath, 'utf-8');
                const urlMatch = content.match(/url\s*=\s*(.+)/);
                if (urlMatch) {
                    const m = urlMatch[1].trim().match(/[:\/]([^\/]+\/[^\/]+?)(\.git)?$/);
                    if (m) repoName = m[1];
                }
            } catch {}
        }
        if (!repoName) {
            try {
                if (fs.existsSync(repoPath) && fs.statSync(repoPath).isDirectory()) {
                    repoName = path.basename(path.resolve(repoPath));
                }
            } catch {}
        }
    }
    
    return (repoName || 'unknown-repo').trim();
}

async function run() {
    console.log('=== PERMAREPO ACTION SĀKAS ===');
    
    const githubToken = core.getInput('github_token') || process.env.GITHUB_TOKEN;
    const octokit = github.getOctokit(githubToken);
    const issueBody = core.getInput('issue_body') || process.env.ISSUE_BODY || '';
    const issueNumber = Number.parseInt(core.getInput('issue_number') || github.context.issue.number || '0');
    const { owner, repo } = github.context.repo;
    
    console.log('DEBUG INFO:');
    console.log('  owner:', owner);
    console.log('  repo:', repo);
    console.log('  issueNumber:', issueNumber);
    console.log('  issueBody garums:', issueBody.length);
    console.log('  RENDER_URL:', RENDER_URL || 'NAV');
    console.log('  RENDER_API_KEY:', RENDER_API_KEY ? 'IR' : 'NAV');
    
    if (!RENDER_URL) {
        console.error('❌ RENDER_URL nav konfigurēts');
        await closeIssue(octokit, owner, repo, issueNumber, '❌ Servera konfigurācijas kļūda: RENDER_URL nav iestatīts.');
        return;
    }
    
    try {
        // 1. PARSE JSON
        console.log('1. Parsejam JSON no Issue...');
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            console.log('❌ Nav JSON');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Neizdevās atrast JSON datus.');
            return;
        }
        console.log('✅ JSON atrasts');
        
        let payload;
        try {
            payload = JSON.parse(jsonMatch[1]);
        } catch (parseError) {
            console.error('❌ JSON parse kļūda:', parseError.message);
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Neizdevās noparsēt JSON: ' + parseError.message);
            return;
        }
        
        const { address, signature, message, timestamp } = payload;
        
        if (!address || !signature || !message || !timestamp) {
            console.log('❌ Trūkst dati JSON');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ JSON trūkst nepieciešamie lauki (address, signature, message, timestamp).');
            return;
        }
        console.log('✅ JSON parse veiksmīgs');
        
        // 2. TIMESTAMP PĀRBAUDE
        console.log('2. Pārbaudam timestamp...');
        const now = Math.floor(Date.now() / 1000);
        if (now - timestamp > 600) {
            console.log('❌ Paraksts novecojis');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Paraksts ir novecojis (>10 min).');
            return;
        }
        console.log('✅ Timestamp OK');
        
        // 3. PARAKSTA VERIFIKĀCIJA
        console.log('3. Verificējam parakstu...');
        let recoveredAddress;
        try {
            recoveredAddress = ethers.verifyMessage(message, signature);
            console.log('✅ Paraksts verificēts, adrese:', recoveredAddress);
        } catch (verifyError) {
            console.error('❌ Paraksta verifikācijas kļūda:', verifyError.message);
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Neizdevās verificēt parakstu: ' + verifyError.message);
            return;
        }
        
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            console.log('❌ Adreses nesakrīt');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Paraksts neatbilst adresei.');
            return;
        }
        
        // 4. REPO NOSAUKUMS
        console.log('4. Iegūstam repo nosaukumu...');
        const repoMatch = message.match(/Repository: (.+)/);
        const repoName = repoMatch ? repoMatch[1] : `${owner}/${repo}`;
        console.log('  repoName:', repoName);
        
        // 5. SKENĒT FAILUS
        console.log('5. Skenējam failus...');
        const files = scanFiles(process.cwd());
        console.log(`  Atrasti ${files.length} faili`);
        
        if (files.length === 0) {
            console.log('❌ Nav failu');
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Nav atrasti faili backupam.');
            return;
        }
        
        const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
        console.log(`  Kopējais izmērs: ${(totalBytes / 1024).toFixed(1)} KB`);
        
        // 6. SŪTĪT UZ RENDER
        console.log('6. Sūtam uz Render serveri...');
        console.log('  URL:', RENDER_URL + '/api/execute-backup');
        
        const requestBody = {
            repoName,
            files,
            signature,
            message,
            timestamp,
            address
        };
        
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (RENDER_API_KEY) {
            headers['X-API-Key'] = RENDER_API_KEY;
        }
        
        let response;
        try {
            response = await fetch(`${RENDER_URL}/api/execute-backup`, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(300000) // 5 minūtes timeout
            });
        } catch (fetchError) {
            console.error('❌ Fetch kļūda:', fetchError.message);
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Neizdevās sazināties ar Render serveri: ' + fetchError.message);
            return;
        }
        
        let result;
        try {
            result = await response.json();
        } catch (jsonError) {
            console.error('❌ Response nav JSON:', jsonError.message);
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Render serveris atgrieza nekorektu atbildi.');
            return;
        }
        
        if (!response.ok || !result.success) {
            const errorMsg = result.error || `Render serveris atgrieza ${response.status}`;
            console.error('❌ Render kļūda:', errorMsg);
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Backupa kļūda: ' + errorMsg);
            return;
        }
        
        console.log('✅ Render serveris veiksmīgi izpildīja backupu');
        console.log('  Manifesta TX:', result.manifestTxId);
        console.log('  Faili:', result.uploadedFiles.length);
        console.log('  Izmaksas:', result.costEth, 'ETH');
        
        // 7. AIZVĒRT ISSUE AR PANĀKUMU
        console.log('7. Aizveram Issue ar panākumu...');
        await closeIssue(octokit, owner, repo, issueNumber,
            '✅ Backups veiksmīgs!\n\n' +
            `🔗 Manifests: \`${result.manifestTxId}\`\n` +
            `📊 Faili: ${result.uploadedFiles.length}\n` +
            `📦 Izmērs: ${(result.totalSize / 1024).toFixed(1)} KB\n` +
            `💰 Izmaksas: ${result.costEth} ETH\n` +
            `🎫 Token ID: \`${result.tokenId}\``
        );
        
    } catch (error) {
        console.error('💥 VISPĀRĒJA KĻŪDA:', error.message);
        console.error('Pilna kļūda:', error);
        await closeIssue(octokit, owner, repo, issueNumber, '❌ Kļūda: ' + error.message);
    }
    
    console.log('=== ACTION BEIDZAS ===');
}

async function closeIssue(octokit, owner, repo, issueNumber, message) {
    console.log(`Mēģinām aizvērt: ${owner}/${repo} issue #${issueNumber}`);
    if (!issueNumber || issueNumber === 0) {
        console.warn('Nav issueNumber');
        return;
    }
    try {
        await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body: message });
        console.log('✅ Komentārs pievienots');
        await octokit.rest.issues.update({ owner, repo, issue_number: issueNumber, state: 'closed' });
        console.log('✅ Issue aizvērts');
    } catch (error) {
        console.error('❌ Kļūda aizverot Issue:', error.message);
    }
}

run();
