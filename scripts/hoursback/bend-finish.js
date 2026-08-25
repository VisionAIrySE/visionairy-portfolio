// Finish the Bend passes only — the authorized test group. Loud per request.
const fs = require('fs');
process.chdir(require('path').resolve(__dirname, '../..'));
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/); if (m) process.env[m[1]] = m[2];
}
const { PrismaClient } = require('@prisma/client');
const { REGIONAL_CELLS, createPlacesClient, googleFetchPage, runRegionalCapture } = require('../../src/hoursback/places.js');
const db = new PrismaClient();
let requests = 0;
const client = createPlacesClient({
  fetchPage: async (cell, token) => {
    requests += 1;
    const t0 = Date.now();
    try {
      const page = await googleFetchPage(cell, token);
      console.log(`req ${requests}: ${cell.id} ${token ? 'page+' : 'page1'} -> ${page.places.length} places, ${Date.now() - t0}ms`);
      return page;
    } catch (e) {
      console.log(`req ${requests}: ${cell.id} ERROR ${e.message} after ${Date.now() - t0}ms`);
      throw e;
    }
  },
});
const bendCells = REGIONAL_CELLS.filter((c) => c.town === 'Bend');
(async () => {
  const run = await runRegionalCapture({ db, cells: bendCells, client });
  const out = {
    bendPassesCompletedThisRun: run.cellsCompleted, attempted: run.cellsAttempted,
    requestsThisRun: requests,
    totalBusinesses: await db.prospect.count({ where: { fieldSource: 'google_places' } }),
    duplicatesSkipped: await db.prospectDuplicate.count(),
    withPhone: await db.prospect.count({ where: { fieldSource: 'google_places', NOT: { phone: null } } }),
    needsReview: await db.prospect.count({ where: { stage: 'NEEDS_REVIEW' } }),
  };
  fs.writeFileSync('data/bend-sweep-result.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
  await db.$disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
