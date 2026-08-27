#!/usr/bin/env node
// Re-score everyone Russ can actually work, under the current rules.
//   node scripts/hoursback/rescore-workable.js --output <path>
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }
const outArg = process.argv.indexOf('--output');
const OUT = outArg > -1 ? process.argv[outArg + 1] : null;
const lines = [];
const say = (s) => { console.log(s); lines.push(s); };

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const { rescoreMany } = require('../../src/hoursback/refresh.js');
  const db = new PrismaClient();
  const where = { stage: { notIn: ['DORMANT', 'NEEDS_REVIEW'] }, doNotContact: false };
  const rows = await db.prospect.findMany({ where, select: { id: true } });
  const r = await rescoreMany(db, rows.map((x) => x.id));
  say(`moved ${r.moved} of ${r.scored}`);
  say(`still above 100: ${await db.prospect.count({ where: { automationScore: { gt: 100 } } })}`);
  const top = await db.prospect.findMany({
    where: { ...where, automationScore: { not: null } },
    select: { name: true, trade: true, automationScore: true },
    orderBy: { automationScore: 'desc' }, take: 12,
  });
  say('');
  say('WHO YOU CALL FIRST:');
  top.forEach((p) => say(`  ${String(p.automationScore).padStart(3)}  ${String(p.trade || 'unknown').padEnd(20)} ${p.name.slice(0, 40)}`));
  if (OUT) fs.writeFileSync(OUT, lines.join('\n'));
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
