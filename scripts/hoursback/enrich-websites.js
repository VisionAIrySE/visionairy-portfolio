#!/usr/bin/env node
// Read the businesses' own websites and fill in what Google could not tell us:
// an email address, who owns it, how many people work there, and the tells
// that say the office is still doing work by hand.
//
// Costs nothing. No key, no account, no fee — these are public pages.
//
//   node scripts/hoursback/enrich-websites.js --budget=50        try 50 sites
//   node scripts/hoursback/enrich-websites.js --budget=2000      the whole list
//
// Ceilings are in the code, not in the hope: never more than HARD_CEILING
// websites in one run, never more than 5 pages from any one site, and a pause
// between every request so nobody's server notices us.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file — real environment variables win */ }

const HARD_CEILING = 2500;   // no run may ever fetch more websites than this
const DEFAULT_BUDGET = 50;   // a bare invocation stays small on purpose

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const { runSiteEnrichment } = require('../../src/hoursback/enrich.js');
  const db = new PrismaClient();

  const asked = Number(arg('budget', DEFAULT_BUDGET));
  const budget = Math.min(Number.isFinite(asked) ? asked : DEFAULT_BUDGET, HARD_CEILING);
  const concurrency = Math.min(Number(arg('concurrency', 10)) || 10, 16);
  if (asked > HARD_CEILING) console.log(`asked for ${asked}; the ceiling in this script is ${HARD_CEILING}`);

  const started = Date.now();
  let last = 0;
  console.log(`reading up to ${budget} websites, ${concurrency} at a time — nothing here costs money`);

  const result = await runSiteEnrichment(db, {
    budget,
    concurrency,
    attempts: 2,
    force: process.argv.includes('--force'),
    onProgress: (r) => {
      if (r.read - last < 25) return;
      last = r.read;
      const mins = ((Date.now() - started) / 60000).toFixed(1);
      console.log(`  ${r.read}/${budget} read · ${r.withEmail} emails · ${r.withHeadcount} team sizes · ${r.unreachable} unreachable · ${mins}m`);
    },
  });

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\ndone in ${mins} minutes`);
  console.log(`  websites read        ${result.read}`);
  console.log(`  email addresses      ${result.withEmail}`);
  console.log(`  team sizes           ${result.withHeadcount}`);
  console.log(`  could not reach      ${result.unreachable}`);
  console.log(`  no website at all    ${result.noWebsite}`);
  console.log(`  already done before  ${result.skippedAlreadyRead}`);
  console.log(`  records changed      ${result.changed}`);
  if (result.stoppedAt) console.log(`  stopped at "${result.stoppedAt}" — ${result.stoppedBecause}`);

  const scored = await db.prospect.count({ where: { automationScore: { gt: 0 } } });
  console.log(`  businesses now carrying a score: ${scored}`);
  await db.$disconnect();
})().catch((e) => { console.error('run failed:', e.message); process.exit(1); });
