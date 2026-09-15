#!/usr/bin/env node
// Render runs this once on its schedule and then the process exits. No email
// can leave unless the current wording is approved and RESEND_API_KEY is set.

const fs = require('fs');
const path = require('path');
const { spawn } = require('node:child_process');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* Render supplies environment variables directly. */ }

const { PrismaClient } = require('@prisma/client');
const { dailySendRun } = require('../../src/hoursback/crm/scheduler.js');
const db = new PrismaClient();
const messageIds = process.env.HOURSBACK_MESSAGE_IDS
  ? process.env.HOURSBACK_MESSAGE_IDS.split(',').map((id) => id.trim()).filter(Boolean)
  : null;
const runStartedAt = new Date();

async function auditCompletedSend() {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(__dirname, 'audit-stage-completion.cjs'),
      '--stage=send', '--scope=selected',
      `--send-cutoff=${runStartedAt.toISOString()}`, '--strict', '--show=5',
    ], { cwd: process.cwd(), stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) process.exitCode = code;
}

dailySendRun(db, {
  from: process.env.HOURSBACK_EMAIL_FROM,
  reportTo: process.env.HOURSBACK_REPORT_TO,
  // No daily quota. A limit is used only when deliberately supplied for a recovery run.
  limit: process.env.HOURSBACK_SEND_LIMIT ? Number(process.env.HOURSBACK_SEND_LIMIT) : undefined,
  messageIds,
})
  .then(async (result) => {
    console.log(JSON.stringify(result));
    await auditCompletedSend();
  })
  .catch((error) => {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
