#!/usr/bin/env node
// Re-work every business's score from what is already on file.
//
// Reads nobody's website. The tells were recorded the first time round, so
// changing what a tell is worth — or adding a new one — only needs this.
//
//   node scripts/hoursback/rescore.js            re-score everything
//   node scripts/hoursback/rescore.js --dry-run  show what would change

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file — real environment variables win */ }

// The tells a record carries, rebuilt from what was recorded plus the two
// that are read straight off the record itself.
function signalsFor(p) {
  let stored = [];
  try { stored = JSON.parse(p.scoreEvidence || '[]'); } catch { stored = []; }
  const signals = stored
    .filter((e) => e.signal && e.signal !== 'category_tilt' && e.signal !== 'no_website' && e.signal !== 'no_email_published')
    .map((e) => ({ signal: e.signal, url: e.url || null, quote: e.quote || null }));

  if (p.siteStatus === 'NO_WEBSITE') {
    return [{ signal: 'no_website', url: null, quote: 'no website anywhere — every enquiry they get has to be a phone call' }];
  }
  if (p.siteStatus === 'READ' && !p.email) {
    signals.push({ signal: 'no_email_published', url: p.website || null, quote: 'no email address published anywhere on the site' });
  }
  return signals;
}

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const { scoreAutomationFit } = require('../../src/hoursback/scoring.js');
  const db = new PrismaClient();
  const dryRun = process.argv.includes('--dry-run');

  const all = await db.prospect.findMany({
    select: { id: true, name: true, siteStatus: true, email: true, website: true, automationScore: true, scoreEvidence: true },
  });
  let changed = 0;
  const moved = [];
  for (const p of all) {
    const scored = scoreAutomationFit({ signals: signalsFor(p) });
    if (scored.score === p.automationScore) continue;
    changed += 1;
    if (moved.length < 8) moved.push(`${p.name}: ${p.automationScore === null ? '–' : p.automationScore} → ${scored.score}`);
    if (!dryRun) {
      await db.prospect.update({
        where: { id: p.id },
        data: { automationScore: scored.score, scoreEvidence: JSON.stringify(scored.evidence) },
      });
    }
  }
  console.log(`${changed} of ${all.length} businesses ${dryRun ? 'would move' : 'moved'}`);
  moved.forEach((m) => console.log('  ', m));
  await db.$disconnect();
})().catch((e) => { console.error('re-score failed:', e.message); process.exit(1); });
