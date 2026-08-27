#!/usr/bin/env node
// Re-work every score from everything now known — the tells on their website,
// and everything learned since: who owns them, how long they have been going,
// what they already pay for, how big the team is, and whether the same person
// runs other businesses on the list.
//
// Reads nobody's website. Everything it needs is already on file.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

// The tells a record carries live in one place now — src/hoursback/refresh.js
// — so the score a hand edit produces and the score this run produces are the
// same answer from the same rules. They used to be two copies, and only this
// script ever ran the fuller one, which is why a record could sit unscored
// forever unless somebody remembered to run it (Russ, 2026-08-27).
const { signalsFor } = require('../../src/hoursback/refresh.js');

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const { scoreAutomationFit } = require('../../src/hoursback/scoring.js');
  const db = new PrismaClient();
  const dryRun = process.argv.includes('--dry-run');

  const all = await db.prospect.findMany({
    select: {
      id: true, name: true, trade: true, siteStatus: true, email: true, website: true,
      automationScore: true, scoreEvidence: true, ownerName: true, contactName: true,
      openRoles: true, yearsInBusiness: true, employeeCount: true, employeeCountManualValue: true,
      toolsInUse: true, headcountSourceUrl: true,
    },
  });
  // Who is behind more than one business on this list.
  const ownerCounts = new Map();
  for (const p of all) if (p.ownerName) ownerCounts.set(p.ownerName, (ownerCounts.get(p.ownerName) || 0) + 1);

  let changed = 0; const moved = [];
  for (const p of all) {
    const scored = scoreAutomationFit({ signals: signalsFor(p, ownerCounts), category: p.trade });
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
  console.log(`owners running more than one business: ${[...ownerCounts.values()].filter((n) => n > 1).length}`);
  await db.$disconnect();
})().catch((e) => { console.error('re-score failed:', e.message); process.exit(1); });
