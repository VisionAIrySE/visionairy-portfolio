#!/usr/bin/env node
// What is this business actually called?
//
//   node scripts/hoursback/name-from-their-site.js --limit=50
//
// 180 businesses Russ can contact are named after a web page rather than after
// themselves: "OR Auto & Home Insurance", "Dentist Near Me in Bend, OR",
// "Home". A letter opening on a name like that is over before it starts
// (2026-08-31).
//
// 69 were fixed for nothing — their own site had already told us the name and
// nobody had used it. The rest need reading, and reading means reading: the
// page goes to a model and it answers what the business is called, or says it
// cannot tell. A rule over the words in a domain is what put "Home" there.
//
// Nothing is written where the model is unsure. A wrong name is worse than an
// awkward one.
//
// COST. Local Haiku through the Claude Code login. Fifty at a time. No paid
// call — standing order, Russ, 2026-08-29.

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
const LIMIT = Math.min(Number(arg('limit', 50)), 50);
const MODEL = 'haiku';
const READS_PER_MINUTE = 40;

// A name that is really a page heading.
const LOOKS_LIKE_A_TITLE = /[|]|&#\d|Insurance &|,\s*(Auto|Home|Life)\b|\bin [A-Z][a-z]+, ?[A-Z]{2}\b|^(Home|About|Welcome|Contact|Services)\b/;

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

function questionFor(onRecord, domain, words) {
  return `A customer record has the wrong name for a business — what is on it is a web page heading, not what the business is called.

What the record says: ${onRecord}
Their web address: ${domain}
What their site says about itself: ${words || '(nothing on file)'}

Answer with JSON only:
{
  "name": what the business is actually called, or null,
  "why": one short sentence
}

The name is what somebody would say answering the phone — "Bend Family Dentistry", "Next Gen Auto Repair", "Kernutt Stokes". It is NOT a slogan, NOT a description of the service, NOT a town, and NOT a page heading like "Home" or "Dentist Near Me in Bend, OR".

Answer null unless you are sure. A wrong name goes out on a letter and cannot be taken back, so "I cannot tell" is a good answer.`;
}

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const { setOverride } = require('../../src/hoursback/overrides.js');
  const db = new PrismaClient();

  const rows = await db.prospect.findMany({
    where: { doNotContact: false, OR: [{ email: { not: null } }, { phone: { not: null } }] },
    select: { id: true, name: true, website: true, selfDescription: true, theirWork: true },
    orderBy: { automationScore: { sort: 'desc', nulls: 'last' } },
  });
  const wrong = rows.filter((r) => LOOKS_LIKE_A_TITLE.test(String(r.name || ''))).slice(0, LIMIT);
  console.log(`${wrong.length} named after a page, reading them (local ${MODEL})`);

  const gap = Math.ceil(60000 / READS_PER_MINUTE);
  let fixed = 0; let unsure = 0;
  for (const r of wrong) {
    const words = [r.selfDescription, r.theirWork].filter(Boolean).join(' — ').slice(0, 700);
    const said = await ask(questionFor(r.name, r.website || '(none)', words));
    await new Promise((s) => setTimeout(s, gap));
    if (!said || !said.name) { unsure += 1; continue; }
    const real = String(said.name).trim().replace(/\s+/g, ' ');
    if (real.length < 3 || real.length > 60 || LOOKS_LIKE_A_TITLE.test(real) || real === r.name) { unsure += 1; continue; }
    console.log(`  ${String(r.name).slice(0, 40)}  ->  ${real}`);
    if (!DRY) await setOverride(db, r.id, 'name', real, 'read from their own site, 2026-08-31');
    fixed += 1;
  }
  console.log(`\n${fixed} named properly, ${unsure} left alone because the answer was not certain.`);
  await db.$disconnect();
})().catch((e) => { console.error('naming failed:', e.message); process.exit(1); });
