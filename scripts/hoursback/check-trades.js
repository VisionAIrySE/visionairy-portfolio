#!/usr/bin/env node
// Is the industry on the record the industry the business actually is?
//
//   node scripts/hoursback/check-trades.js --dry-run --limit=50
//   node scripts/hoursback/check-trades.js --limit=50
//
// The whole first email is that trade's own week. Get the trade wrong and the
// reader gets a letter about somebody else's business — Bend Photo Tours filed
// under gyms and told about members who stopped coming, Pudding River
// Properties filed under shops and told about walking the shelves to build an
// order (found 2026-08-30).
//
// 666 were read by hand on 2026-08-28. The list is 869 now, so the rest have
// never been checked. This does not fetch anything: it reads the words already
// on the record — what they say they do, and what they call themselves — and
// asks whether the recorded trade fits. Nothing is written to the database; it
// writes a file for Russ to read, because a wrong trade correction is the same
// harm as a wrong trade.
//
// COST. Local Haiku through the Claude Code login on this machine, fifty at a
// time. No paid call, no OpenRouter — standing order from Russ, 2026-08-29.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const arg = (n, d) => { const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const DRY = process.argv.includes('--dry-run');
const LIMIT = Math.min(Number(arg('limit', 50)), 50);   // fifty at a time, in code
const OUT = arg('output', 'docs/hoursback/trade-check.md');
// WHAT HAS ALREADY BEEN READ.
//
// Without this the script takes the same top fifty every run — the second batch
// read the identical fifty businesses and found the identical two faults
// (2026-08-30). Ids are appended as they are checked, so each run moves on.
const SEEN = 'docs/hoursback/trade-check-done.json';
const MODEL = 'haiku';
const READS_PER_MINUTE = 40;

const TRADES = ['dental', 'veterinary', 'medical', 'legal', 'accounting', 'insurance',
  'real estate', 'construction', 'trades', 'auto', 'landscaping', 'manufacturing',
  'storage & logistics', 'retail & food', 'staffing', 'personal care',
  'fitness & recreation', 'lodging & hospitality', 'cleaning & facilities',
  'agriculture', 'education & childcare', 'nonprofit & community',
  'professional services', 'funeral & memorial'];

function ask(prompt) {
  return new Promise((resolve) => {
    execFile('claude', ['-p', prompt, '--model', MODEL], { timeout: 90000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve(null);
        const m = String(stdout).match(/\{[\s\S]*\}/);
        if (!m) return resolve(null);
        try { resolve(JSON.parse(m[0])); } catch { resolve(null); }
      });
  });
}

function questionFor(name, trade, words) {
  return `A customer record says this business is in one industry. Read what the business says about ITSELF and judge whether that is right.

Business name: ${name}
Industry on the record: ${trade}
What they say they do: ${words}

Answer with JSON only:
{
  "fits": true or false,
  "trade": the industry that actually fits, from ${JSON.stringify(TRADES)}, or null if you cannot tell,
  "why": one short sentence, in their own terms
}

Judge what the business IS, not what words appear. A firm of accountants that mentions dental insurance is accounting. A supplier who sells to roofers is not a roofing contractor. If the words do not make it clear, answer fits:true and trade:null rather than guessing — a wrong correction does the same harm as the wrong industry.`;
}

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  let done = [];
  try { done = JSON.parse(fs.readFileSync(SEEN, 'utf8')); } catch { done = []; }

  const rows = await db.prospect.findMany({
    where: {
      messages: { some: { lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] } } },
      trade: { not: null },
      id: { notIn: done },
      OR: [{ theirWork: { not: null } }, { selfDescription: { not: null } }],
    },
    select: { id: true, name: true, nameManualValue: true, trade: true, theirWork: true, selfDescription: true },
    orderBy: { automationScore: 'desc' },
    take: LIMIT,
  });
  const left = await db.prospect.count({
    where: {
      messages: { some: { lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] } } },
      trade: { not: null }, id: { notIn: done },
      OR: [{ theirWork: { not: null } }, { selfDescription: { not: null } }],
    },
  });

  console.log(`${rows.length} to check now, ${left} unread in total (fifty at a time, local ${MODEL})`);
  const lines = [];
  const gap = Math.ceil(60000 / READS_PER_MINUTE);
  let wrong = 0;

  for (const r of rows) {
    const name = r.nameManualValue || r.name || '';
    const words = [r.theirWork, r.selfDescription].filter(Boolean).join(' — ').slice(0, 1200);
    const said = await ask(questionFor(name, r.trade, words));
    await new Promise((s) => setTimeout(s, gap));
    if (!said) continue;
    done.push(r.id);
    if (said.fits === false && said.trade && said.trade !== r.trade) {
      wrong += 1;
      lines.push(`- **${name}** — recorded as *${r.trade}*, actually **${said.trade}**. ${said.why || ''}\n  - id: \`${r.id}\`\n  - their words: ${words.slice(0, 200)}`);
      console.log(`  ✗ ${name}: ${r.trade} → ${said.trade}`);
    }
  }

  // Findings accumulate across runs. Nothing is ever written to the record —
  // a wrong trade correction does the same harm as the wrong trade, so this is
  // a list for Russ to read.
  const before = (() => { try { return fs.readFileSync(OUT, 'utf8'); } catch { return ''; } })();
  const kept = before.split('\n').filter((l) => l.startsWith('- **'));
  const header = `# Industries that do not match the business's own words\n\n`
    + `${done.length} businesses with a live email read against what they say they do.\n`
    + `${kept.length + lines.length} do not match. Nothing has been written to the record.\n\n`;
  if (!DRY) {
    fs.writeFileSync(OUT, header + before.split('\n').filter((l) => l.startsWith('- **') || l.startsWith('  ')).join('\n') + '\n' + lines.join('\n') + '\n');
    fs.writeFileSync(SEEN, JSON.stringify(done));
  }
  console.log(`\n${wrong} of ${rows.length} wrong this batch. ${done.length} read so far, ${left - rows.length} left.`);
  await db.$disconnect();
})().catch((e) => { console.error('trade check failed:', e.message); process.exit(1); });
