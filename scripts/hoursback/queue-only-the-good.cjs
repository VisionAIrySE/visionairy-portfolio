// ONLY THE LETTERS THAT PASS GO IN THE SEND QUEUE.
//
// On 2026-09-07 the send queue said 299 were ready. Reading them showed 297
// carried wording Russ replaced on 4 September, 118 named no cost at all, and
// 9 quoted a client's own software back at them. Every count until then had
// asked the records whether a letter was regenerated and never opened it.
//
// This opens every letter, judges it by the same rules the writer now applies
// before saving one, and puts ONLY the ones that pass in front of him. The
// rest go back to being drafts — not deleted, not archived, just not in the
// pile he sends from.
//
//   node scripts/hoursback/queue-only-the-good.cjs           — what would change
//   node scripts/hoursback/queue-only-the-good.cjs --do-it   — make it so
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const DO_IT = process.argv.includes('--do-it');

// ONE JUDGE, NOT A SECOND COPY OF THE RULES (2026-09-08).
//
// This kept its own idea of where a letter's written passage starts and ends,
// its own way of cutting off Russ's standing line, and its own patch for the
// invisible characters a browser puts in a letter he types himself. Three
// other places kept their own versions of all three, and none of the four
// agreed. judgeTheLetter is the only one now.
const J = require('../../src/hoursback/crm/judgeTheLetter.js');
const C = require('../../src/hoursback/crm/campaign.js');

(async () => {
  await C.loadHisWordings(db);
  const letters = await db.outreachMessage.findMany({
    // THE FIRST MESSAGE ONLY. Follow-ups are judged by their own rules when
    // they are written — a day-eight message asks a question and a day-fourteen
    // sign-off names no cost, and both would fail the first message's rules.
    where: {
      lane: 'EMAIL', sentAt: null,
      NOT: { openedWith: { startsWith: 'touch_' } },
      prospect: { doNotContact: false },
    },
    include: { prospect: { select: { name: true, email: true, emailManualValue: true, automationScore: true, website: true } } },
  });

  const good = []; const bad = [];
  // NOBODY GETS THE SAME LETTER TWICE (Russ, 2026-09-08: "what about the lists
  // of companies and the duplicates?").
  //
  // Six addresses on the reachable list belong to two business records each —
  // BARTLETT EXCAVATION AND PAVING and Bartlett Excavation and Paving, 541
  // PROPERTIES LLC and 541 PROPERTIES SALES & MANAGEMENT — the same firm
  // entered twice, or two records that share a front desk. None of them are in
  // the queue today. They would be the moment the pile grew, and the reader
  // would get two cold letters from the same stranger in one morning.
  //
  // The better-scoring record keeps its place; the other goes back to being a
  // draft with the reason on it. Nothing is deleted and no record is merged —
  // deciding two businesses are one is Russ's call, not this script's.
  // THE SAME FIRM UNDER TWO NAMES IS STILL THE SAME FIRM.
  //
  // Guarding on the address alone was not enough. 267 records share a website
  // with another record, and 11 of them are in the ready pile: Deschutes Family
  // Care and DESCHUTES FAMILY CARE, LLC. Ponderosa Forge and PONDEROSA FORGE &
  // IRONWORKS, INC. Bartlett Excavation and Paving, twice, plus BARTLETT
  // EXCAVATION AND CONSTRUCTION. One business, entered twice, often with two
  // different addresses at the same front desk — so the address check waves
  // them straight through and the firm gets two cold letters from one stranger.
  //
  // A shared website is the strongest sign of one business twice, so it counts
  // as the same claim. Where two records genuinely share a site and are NOT the
  // same firm, the second is held back rather than sent, and the reason says so
  // — that is the safer way round, and it puts the pair in front of Russ.
  const claimed = new Map();
  const siteOf = (m) => {
    try { return new URL(String(m.prospect.website)).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
  };
  const addressOf = (m) => String(m.prospect.email || m.prospect.emailManualValue || '').toLowerCase().trim();
  const claimsOf = (m) => [addressOf(m), siteOf(m)].filter(Boolean);
  for (const m of letters) {
    const canSendTo = Boolean(m.prospect.email || m.prospect.emailManualValue);
    // Judged by the rules that belong to this message, which for everything in
    // this pile is the first message's — the queue holds day 0 only.
    const verdict = J.judgeStored(m, { jobs: ['a', 'b'] });
    if (!canSendTo || !verdict.ok) {
      bad.push({ m, why: canSendTo ? verdict.why : 'no email address to send to' });
      continue;
    }
    const mine = claimsOf(m);
    const clash = mine.map((k) => claimed.get(k)).find(Boolean);
    if (!clash) { mine.forEach((k) => claimed.set(k, m)); good.push(m); continue; }
    // Two good letters, one firm. Keep the higher score; the other goes back to
    // drafts with the reason on it, so the pair is visible rather than silently
    // halved.
    const ours = m.prospect.automationScore || 0;
    const theirs = clash.prospect.automationScore || 0;
    const winner = ours > theirs ? m : clash;
    const loser = ours > theirs ? clash : m;
    if (winner === m) {
      const at = good.indexOf(clash);
      if (at >= 0) good.splice(at, 1);
      mine.forEach((k) => claimed.set(k, m));
      good.push(m);
    }
    const how = addressOf(m) && addressOf(m) === addressOf(clash) ? 'the same email address' : 'the same website';
    bad.push({ m: loser, why: `already being written to as "${winner.prospect.name}" — ${how}, so this is very likely the same business twice` });
  }

  const alreadyQueued = letters.filter((m) => m.state === 'QUEUED');
  const goodNotQueued = good.filter((m) => m.state !== 'QUEUED');
  const badButQueued = bad.filter((b) => b.m.state === 'QUEUED');

  console.log(`${letters.length} unsent letters read in full\n`);
  console.log(`  ${good.length} pass every rule`);
  console.log(`  ${bad.length} do not`);
  console.log(`\nthe send queue holds ${alreadyQueued.length} right now`);
  console.log(`  ${goodNotQueued.length} good ones are NOT in it and should be`);
  console.log(`  ${badButQueued.length} in it should NOT be`);

  if (badButQueued.length) {
    const counted = {};
    for (const b of badButQueued) { const k = String(b.why).slice(0, 60); counted[k] = (counted[k] || 0) + 1; }
    console.log('\n  why the ones being taken out fail:');
    for (const [why, n] of Object.entries(counted).sort((a, b2) => b2[1] - a[1])) console.log(`    ${n}  ${why}`);
  }

  if (!DO_IT) { console.log('\nNothing changed. Add --do-it to make it so.'); await db.$disconnect(); return; }

  // A letter Russ has edited by hand, or that is already sent, is never
  // touched. Everything else moves.
  let inn = 0; let out = 0;
  if (goodNotQueued.length) {
    const r = await db.outreachMessage.updateMany({
      where: { id: { in: goodNotQueued.map((m) => m.id) }, sentAt: null },
      data: { state: 'QUEUED', queuedAt: new Date() },
    });
    inn = r.count;
  }
  if (badButQueued.length) {
    const r = await db.outreachMessage.updateMany({
      where: { id: { in: badButQueued.map((b) => b.m.id) }, sentAt: null, editedAt: null },
      data: { state: 'DRAFT', queuedAt: null },
    });
    out = r.count;
  }
  console.log(`\nput in the queue: ${inn}`);
  console.log(`taken out of it : ${out}   (nothing deleted; they are drafts again)`);
  const now = await db.outreachMessage.count({ where: { lane: 'EMAIL', state: 'QUEUED' } });
  console.log(`the queue now holds: ${now}`);
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
