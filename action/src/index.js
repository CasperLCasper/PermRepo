const core = require('@actions/core');
const github = require('@actions/github');
const { ethers } = require('ethers');
const CONFIG = require('../../shared/config');

// ============================================
// PERMAREPO ACTION — GALVENĀ LOĢIKA
// ============================================

async function run() {
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    const issueBody = process.env.ISSUE_BODY;
    const issueNumber = Number.parseInt(process.env.ISSUE_NUMBER, 10);
    const { owner, repo } = github.context.repo;
    
    try {
        // 1. Parsēt JSON no Issue body
        const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            await closeIssue(octokit, owner, repo, issueNumber, '❌ Neizdevās atrast JSON datus Issue aprakstā.');
            return;
        }
        
        const payload = JSON.parse(jsonMatch[1]);
        const { address, signature, message, timestamp } = payload;
        
        // 2. Timestamp pārbaude
        const now = Math.floor(Date.now() / 1000);
        if (now -
