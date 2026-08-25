#!/usr/bin/env node
// The monthly top-up entry point — what the host schedule fires. Refuses to
// run without the Places credential, with a named message and a non-zero exit.
// Cron starts jobs from $HOME — anchor to the repo before anything resolves.
process.chdir(require('path').resolve(__dirname, '../..'));
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
