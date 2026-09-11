// READ THE LETTER THE CUSTOMER WILL READ.
//
// Every count before this one asked the records a question — was the sentence
// regenerated, is the version current — and never opened the letter. On
// 2026-09-07 that reported 299 letters "ready in the current wording" while
// 202 of them still carried wording Russ replaced on 4 September, seven named
// a client's own software in a cold email, and the one he pasted back named no
// cost at all. Every one of those is visible in the text in under a second.
//
// So this opens the letters. Nothing else.
//
// AND IT NO LONGER KEEPS ITS OWN RULES (2026-09-08).
//
// It did, and they had drifted from everybody else's. It recognised ONE of the
// four wordings of Russ's standing line, so it reported 202 letters carrying
// his own approved words as carrying words he had rejected — the real number
// was 17. It judged day-eight and day-fourteen messages by the FIRST message's
// rules, so correct sign-offs were counted as naming no cost. And it could not
// see either letter Russ typed by hand.
//
// One judge now, told which message it is reading. See judgeTheLetter.js.
//
//   node scripts/hoursback/check-the-letters.cjs          — the counts
//   node scripts/hoursback/check-the-letters.cjs --show 5 — and five examples
const { PrismaClient } = require('@prisma/client');
const C = require('../../src/hoursback/crm/campaign.js');
const J = require('../../src/hoursback/crm/judgeTheLetter.js');
const L = require('../../src/hoursback/crm/lanes.js');

const db = new PrismaClient();
const SHOW = Number((process.argv.find((a) => a.startsWith('--show=')) || '').split('=')[1]
  || (process.argv.includes('--show') ? 3 : 0));

const DAY_NAME = {
  0: 'day 0  — the first message, two jobs and two costs',
  4: 'day 4  — one of them taken deeper',
  8: 'day 8  — a different job, and one plain question',
  14: 'day 14 — the sign-off',
};

(async () => {
  // RUSS'S OWN WORDINGS COUNT AS APPROVED. They live in the database, not in
  // the file, so a check that never loads them judges his own words as
  // strangers' words.
  await C.loadHisWordings(db);

  // ONLY THE ONES CALLED READY. A letter is ready when the business has an
  // email address, their own site has been read, and the sentence was written
  // under the current wording. That is the pile Russ would actually send, and
  // the only one worth judging.
  const readyIds = (await db.reading.groupBy({
    by: ['prospectId'],
    where: {
      source: 'website', outcome: 'read',
      pages: { some: { AND: [{ text: { not: null } }, { NOT: { text: '' } }] } },
    },
  })).map((r) => r.prospectId);
  const storedLetters = await db.outreachMessage.findMany({
    where: {
      lane: 'EMAIL', sentAt: null, openedWith: { not: 'after_the_call' },
      prospectId: { in: readyIds },
      prospect: { doNotContact: false, OR: [{ email: { not: null } }, { emailManualValue: { not: null } }] },
    },
    include: { prospect: true },
  });

  // A few older imports left more than one unsent row for the same campaign
  // slot. The runtime keeps the first row for that prospect and touch, so the
  // audit must judge that same active row while reporting the dormant extras.
  const slots = new Map();
  for (const m of storedLetters.sort((a, b) => a.createdAt - b.createdAt)) {
    const key = `${m.prospectId}:${J.dayOf(m.openedWith)}`;
    if (!slots.has(key)) slots.set(key, m);
  }
  const letters = [...slots.values()];
  const dormantExtras = storedLetters.length - letters.length;

  const evidence = new Map();
  const prospects = new Map(letters.map((m) => [m.prospectId, m.prospect]));
  for (let i = 0; i < readyIds.length; i += 20) {
    const rows = await Promise.all(readyIds.slice(i, i + 20).map(async (id) => {
      const reading = await db.reading.findFirst({
        where: { prospectId: id, findings: { some: { field: 'noticingJob' } } },
        orderBy: { startedAt: 'desc' }, include: { findings: true },
      });
      const prospect = prospects.get(id);
      if (!reading || !prospect) return null;
      const jobs = reading.findings.filter((f) => f.field === 'noticingJob').map((f) => f.value).filter(Boolean);
      const { writeTo } = await L.whoTheLetterGoesTo(db, id, prospect);
      return [id, { jobs, roleTitle: writeTo.contactRole || null }];
    }));
    for (const row of rows) if (row) evidence.set(...row);
  }

  // COUNTED PER MESSAGE, BECAUSE THE FOUR ARE NOT THE SAME THING. One total
  // mixed 382 first messages with 158 follow-ups and judged them all alike,
  // which is how correct sign-offs came to be reported as faults.
  const byDay = {
    0: [], 4: [], 8: [], 14: [],
  };
  for (const m of letters) byDay[J.dayOf(m.openedWith)].push(m);

  let cleanAll = 0;
  console.log(`\n${dormantExtras} dormant duplicate campaign drafts excluded from the active-message counts.`);
  for (const day of [0, 4, 8, 14]) {
    const pile = byDay[day];
    const faults = {};
    let clean = 0;
    for (const m of pile) {
      const actual = evidence.get(m.prospectId) || { jobs: [], roleTitle: null };
      const v = J.judgeStored(m, actual);
      if (v.ok) { clean += 1; continue; }
      const key = String(v.why).slice(0, 72);
      (faults[key] = faults[key] || []).push({ m, p: v.passage });
    }
    cleanAll += clean;
    console.log(`\n${DAY_NAME[day]}`);
    console.log(`   ${pile.length} written, ${clean} pass every rule that belongs to them`);
    for (const [why, rows] of Object.entries(faults).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`   ${String(rows.length).padStart(4)}  ${why}`);
      if (SHOW) {
        for (const r of rows.slice(0, SHOW)) {
          console.log(`         ${r.m.prospect.name}: ${String(r.p).replace(/\s+/g, ' ').slice(0, 220)}`);
        }
      }
    }
  }

  console.log(`\n${cleanAll} of ${letters.length} letters, read in full, pass the rules that belong to them.`);
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
