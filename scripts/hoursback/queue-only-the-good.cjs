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
const N = require('../../src/hoursback/crm/noticing.js');
const db = new PrismaClient();
const DO_IT = process.argv.includes('--do-it');

// The paragraph naming their work: not the greeting, the who-I-am lines, the
// offer, or the sign-off.
// A LETTER RUSS TYPED HIMSELF MAY NOT HAVE BLANK LINES BETWEEN PARAGRAPHS.
// Splitting only on blank lines returned his whole Bryant, Lovlien letter as
// one block, so nothing could be judged and a perfectly good letter was
// reported as having no paragraph at all (2026-09-08). Fall back to single
// line breaks when that happens.
function theirParagraph(body) {
  const text = String(body || '');
  let blocks = text.split('\n\n');
  if (blocks.length <= 1) blocks = text.split('\n');
  return blocks.find((t) => t.length > 120
    && !/^Hi |sat in the offices|local to Central Oregon|Fifteen minutes|no charge for the review|Best regards/i.test(t.trim())) || '';
}

// JUDGE THE SENTENCE, NOT THE FIXED LINE STUCK ON AFTER IT.
//
// The letter's paragraph is the written sentence PLUS the standing line about
// three or four more jobs. The judge measures the written sentence — its
// length, its sentence count — so handing it both made 139 perfectly good
// letters fail on length alone. Cut the standing line off first.
const THE_STANDING_LINE = /\b(?:Some\s+\S+[\s\S]{0,40}?|You may well )(?:may have|will have|have|do have|had)\b[\s\S]*$|\b(?:Some|Most|Plenty)[\s\S]{0,60}?three or four[\s\S]*$/i;
function theSentenceOnly(paragraph) {
  return String(paragraph || '').replace(THE_STANDING_LINE, '').trim();
}

(async () => {
  const letters = await db.outreachMessage.findMany({
    // THE FIRST MESSAGE ONLY. Follow-ups are judged by their own rules when
    // they are written — a day-eight message asks a question and a day-fourteen
    // sign-off names no cost, and both would fail the first message's rules.
    where: {
      lane: 'EMAIL', sentAt: null,
      NOT: { openedWith: { startsWith: 'touch_' } },
      prospect: { doNotContact: false },
    },
    include: { prospect: { select: { name: true, email: true, emailManualValue: true } } },
  });

  const good = []; const bad = [];
  for (const m of letters) {
    const canSendTo = Boolean(m.prospect.email || m.prospect.emailManualValue);
    const p = theirParagraph(m.body);
    // The letter is judged by the SAME rules the writer applies. One place,
    // one answer — that is the whole point.
    // TWO JUDGEMENTS, BECAUSE THE PARAGRAPH IS TWO THINGS.
    //
    // The written sentence is judged by the full rules — length, cost, no
    // presuming, no naming their software. The standing line after it is
    // judged separately, against the wording Russ actually approved. Stripping
    // the standing line before judging hid the biggest fault of all: 297
    // letters still carry "Most have three or four", which he replaced on
    // 4 September and which the customer reads whatever the writer intended.
    const written = theSentenceOnly(p);
    let verdict = written ? N.passable(written, { jobs: ['a', 'b'] }) : { ok: false, why: 'no paragraph naming their work' };
    if (verdict.ok && /\b(most|mostly|usually|typically)\b/i.test(p)) {
      verdict = { ok: false, why: 'carries the standing line Russ replaced on 4 September ("Most have three or four...")' };
    }
    if (verdict.ok && /\bPlenty of\b/i.test(p)) {
      verdict = { ok: false, why: 'carries the "Plenty of" wording Russ rejected' };
    }
    if (canSendTo && verdict.ok) good.push(m);
    else bad.push({ m, why: canSendTo ? verdict.why : 'no email address to send to' });
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
