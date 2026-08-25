#!/usr/bin/env node
// The monthly top-up entry point — what the host schedule fires. Refuses to
// run without the Places credential, with a named message and a non-zero exit.
// Cron starts jobs from $HOME — anchor to the repo before anything resolves,
// then load .env by hand: cron passes no environment, and the Places key
// lives only in that file.
process.chdir(require('path').resolve(__dirname, '../..'));
try {
  for (const line of require('fs').readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    // Fill only variables that are truly ABSENT. An explicitly empty value is
    // a deliberate refusal (the keyless check sets it) and must stay empty —
    // refilling it from .env made the "safe without a key" test run REAL
    // sweeps once a key existed. Learned expensively 2026-08-25.
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no .env — requireApiKey() will refuse with its named message */ }
const { PrismaClient } = require('@prisma/client');
const { runMonthlyTopUp, requireApiKey } = require('../../src/hoursback/places.js');
(async () => {
  try {
    requireApiKey();
    const db = new PrismaClient();
    const run = await runMonthlyTopUp({ db });
    console.log(`monthly top-up done: ${run.placesInserted} new of ${run.placesSeen} seen, cells ${run.cellsCompleted}/${run.cellsAttempted}`);
    await db.$disconnect();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
