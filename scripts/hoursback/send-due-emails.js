#!/usr/bin/env node
// Render runs this once on its schedule and then the process exits. No email
// can leave unless the current wording is approved and RESEND_API_KEY is set.

const fs = require('fs');
const path = require('path');
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

dailySendRun(db, {
  from: process.env.HOURSBACK_EMAIL_FROM,
  reportTo: process.env.HOURSBACK_REPORT_TO,
})
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
