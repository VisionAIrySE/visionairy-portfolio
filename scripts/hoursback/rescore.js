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

// The tells a record carries, rebuilt from what was recorded plus everything
// that can be read straight off the record itself.
function signalsFor(p, ownerCounts) {
  let stored = [];
  try { stored = JSON.parse(p.scoreEvidence || '[]'); } catch { stored = []; }
  const DERIVED = ['category_tilt', 'no_website', 'no_email_published', 'runs_several_businesses',
    'hiring_several_office_roles', 'long_established', 'team_size_known', 'disconnected_tools', 'named_decision_maker'];
  const signals = stored
    .filter((e) => e.signal && !DERIVED.includes(e.signal))
    .map((e) => ({ signal: e.signal, url: e.url || null, quote: e.quote || null }));

  if (p.siteStatus === 'NO_WEBSITE') {
    return [{ signal: 'no_website', url: null, quote: 'no website anywhere, so every enquiry they get has to be a phone call' }];
  }
  if (p.siteStatus === 'READ' && !p.email) {
    signals.push({ signal: 'no_email_published', url: p.website || null, quote: 'no email address published anywhere on the site' });
  }

  // The same person registered behind more than one business on the list.
  if (p.ownerName && (ownerCounts.get(p.ownerName) || 0) > 1) {
    signals.push({
      signal: 'runs_several_businesses', url: null,
      quote: `${p.ownerName} is registered behind ${ownerCounts.get(p.ownerName)} businesses on this list`,
    });
  }
  if (p.openRoles && p.openRoles > 1) {
    signals.push({ signal: 'hiring_several_office_roles', url: p.website || null, quote: `${p.openRoles} office roles open at once` });
  }
  if (p.yearsInBusiness && p.yearsInBusiness >= 20) {
    signals.push({ signal: 'long_established', url: null, quote: `${p.yearsInBusiness} years in business` });
  }
  if (p.employeeCount || p.employeeCountManualValue) {
    signals.push({ signal: 'team_size_known', url: p.headcountSourceUrl || null, quote: `${p.employeeCountManualValue || p.employeeCount} people, so the price is settled before you dial` });
  }
  const tools = String(p.toolsInUse || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (tools.length >= 2) {
    signals.push({ signal: 'disconnected_tools', url: p.website || null, quote: `already paying for ${tools.slice(0, 3).join(', ')}` });
  }
  if (p.ownerName || p.contactName) {
    signals.push({ signal: 'named_decision_maker', url: null, quote: `you can ask for ${p.contactName || p.ownerName}` });
  }
  return signals;
}

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
