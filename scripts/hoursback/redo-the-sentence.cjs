// REWRITE THE SENTENCE FROM WHAT IS ALREADY KNOWN.
//
// Redoing a sentence used to mean running the whole three-step job again:
// re-reading six pages of their website, finding the work afresh, checking it
// recurs, then writing. Four minutes a business, nine hours for 131 — for a
// sentence whose only fault is that it never says what the work costs.
//
// Nothing needs discovering. The two jobs are already chosen and recorded, the
// trade is known, and the sentence itself is on file. So this asks ONE
// question with all of that in hand, and the answer is judged by the same
// rules the writer applies before anything is saved.
//
// Russ, 2026-09-08: "WHY WOULD IT TAKE NINE HOURS TO RE-WRITE 131 FUCKING
// SENTENCES?" He was right. It was the heavy job because the heavy job was the
// one that existed, not because the work needed it.
//
//   node scripts/hoursback/redo-the-sentence.cjs --ids=a,b,c
//   node scripts/hoursback/redo-the-sentence.cjs --from=/tmp/need-rewrite.txt --limit=5
//   ... add --do-it to save; without it, nothing is written
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const C = require('../../src/hoursback/crm/campaign.js');
// ONE JUDGE, AND ONE PLACE THAT KNOWS WHERE A LETTER'S WRITTEN PASSAGE IS.
// This kept its own copies of both, and they had drifted from everybody
// else's — it could not see a letter Russ typed by hand at all (2026-09-08).
const J = require('../../src/hoursback/crm/judgeTheLetter.js');
const { makeReaderPool } = require('../../src/hoursback/readerPool.js');
const { claimTheMachine } = require('../../src/hoursback/onlyOneCopy.js');

const db = new PrismaClient();
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const DO_IT = process.argv.includes('--do-it');
const LIMIT = Number(arg('limit', 0)) || 0;
const AT_ONCE = Math.max(1, Number(arg('at-once', 3)));


function askFor({ name, trade, jobs, was, why }) {
  return [
    'Rewrite one passage of a cold email. Answer with JSON only:',
    '{"sentence":"..."}  — no preamble, no code fences.',
    '',
    `The business: ${name}${trade ? ` (${trade})` : ''}`,
    '',
    'The two jobs already chosen for them, from reading their own website:',
    ...jobs.map((j, i) => `  ${i + 1}. ${j}`),
    '',
    'What is there now, and it is wrong:',
    `  ${was}`,
    `  Why it fails: ${why}`,
    '',
    'WHAT THE NEW PASSAGE MUST DO.',
    '',
    'Name both jobs, and END EACH ONE ON WHAT IT COSTS THEM. The cost is money',
    'or a customer lost — never that they are busy. Being busy is what a good',
    'business feels like; an owner reads it, nods, and does nothing.',
    '',
    'THE TWO COSTS MUST BE DIFFERENT FROM EACH OTHER. Not two ways of saying',
    '"it takes time". One might be a job that never gets billed; the other, a',
    'caller who rang somebody else. Two different kinds of loss.',
    '',
    '  NOT: "...and it is the same handful of questions every time."',
    '       That is only busyness.',
    '  YES: "...and the ones who call while you are on site mostly do not call',
    '       back." — except never write "mostly". Say "some", or say nothing',
    '       about what others do.',
    '',
    'Two or three short sentences. Plain and spoken, the way one working person',
    'talks to another. No dashes, no questions, no exclamation marks. No',
    'marketing words. Never name software they run. Never say most, usually,',
    'typically, always, or everyone. Never address them by their job title.',
    'Never promise hours saved and never invent a figure about their business.',
    '',
    'Write it as if you have read their site and know their week.',
  ].join('\n');
}

(async () => {
  let giveBack;
  try { giveBack = claimTheMachine('models', { label: 'redoing sentences' }); }
  catch (e) { console.error(`\n${e.message}\n`); process.exit(73); }
  const letGo = () => { try { giveBack(); } catch { /* gone */ } };
  process.on('exit', letGo);
  process.on('SIGINT', () => { letGo(); process.exit(130); });
  process.on('SIGTERM', () => { letGo(); process.exit(143); });

  let ids = String(arg('ids', '')).split(',').map((s) => s.trim()).filter(Boolean);
  const from = arg('from', null);
  // A LIST IS A LIST, HOWEVER IT IS SEPARATED. This split on commas only, so a
  // file with one business per line — which is what every other script writes —
  // came back as a single unusable id and the whole run did nothing but say it
  // had skipped one (2026-09-08). Commas, line breaks or spaces, all fine now.
  if (!ids.length && from) ids = String(fs.readFileSync(from, 'utf8')).split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  if (LIMIT) ids = ids.slice(0, LIMIT);
  if (!ids.length) { console.error('no businesses given'); process.exit(1); }

  console.log(`${ids.length} sentences to redo, ${AT_ONCE} at a time${DO_IT ? '' : '  (nothing will be saved)'}\n`);

  const writer = makeReaderPool({ size: 1, model: process.env.HOURSBACK_WRITER_MODEL || 'sonnet' });
  let done = 0; let refused = 0; let skipped = 0;

  async function one(id) {
    const p = await db.prospect.findUnique({ where: { id }, select: { name: true, trade: true } });
    // THE FIRST MESSAGE, NOT WHICHEVER ONE COMES BACK FIRST. Without this it
    // could pick up a day-eight follow-up and rewrite it as an opening letter.
    const m = await db.outreachMessage.findFirst({
      where: {
        prospectId: id, lane: 'EMAIL', sentAt: null, editedAt: null,
        NOT: { openedWith: { startsWith: 'touch_' } },
      },
    });
    if (!p || !m) { skipped += 1; return; }

    const reading = await db.reading.findFirst({
      where: { prospectId: id, findings: { some: { field: 'noticingJob' } } },
      orderBy: { startedAt: 'desc' }, include: { findings: true },
    });
    const jobs = reading ? reading.findings.filter((f) => f.field === 'noticingJob').map((f) => f.value).filter(Boolean) : [];
    if (!jobs.length) { console.log(`  · ${p.name}: no jobs on file — needs the full read, skipped`); skipped += 1; return; }

    // The judge finds the passage, strips the invisible characters a browser
    // leaves behind, and says what is wrong with it — the same judge the page,
    // the send queue and the nightly check use.
    const body = J.tidy(m.body);
    const verdict = J.judgeLetter(body, { day: 0, jobs });
    if (verdict.ok) { console.log(`  · ${p.name}: already passes — left alone`); skipped += 1; return; }
    const para = verdict.passage;
    if (!para) { console.log(`  · ${p.name}: no passage about them to rewrite — needs the full read`); skipped += 1; return; }
    const { written: was, standing } = J.splitOffStandingLine(para);

    // Two goes. A judge's refusal is handed back so the second try knows why.
    let sentence = null; let lastWhy = verdict.why;
    for (let go = 0; go < 2 && !sentence; go += 1) {
      const answer = await writer.ask(askFor({ name: p.name, trade: p.trade, jobs, was, why: lastWhy }));
      const got = answer && answer.answer ? (answer.answer.sentence || '') : '';
      if (!got) { lastWhy = 'the answer could not be read'; continue; }
      // Judged inside the whole letter, exactly as it will be read — not as a
      // loose sentence. A passage that passes on its own and fails in place is
      // how a bad letter got saved looking clean.
      const candidate = String(got).trim();
      const rebuiltTry = body.replace(para, `${candidate}${standing ? ` ${standing}` : ''}`);
      const v = J.judgeLetter(rebuiltTry, { day: 0, jobs });
      if (v.ok) sentence = candidate;
      else lastWhy = v.why;
    }
    if (!sentence) { console.log(`  ✗ ${p.name}: still not right after two goes — ${String(lastWhy).slice(0, 80)}`); refused += 1; return; }

    const rebuilt = body.replace(para, `${sentence}${standing ? ` ${standing}` : ''}`);
    console.log(`  ✓ ${p.name}: ${sentence.slice(0, 190)}`);
    if (DO_IT) await db.outreachMessage.update({ where: { id: m.id }, data: { body: rebuilt } });
    done += 1;
  }

  const queue = [...ids];
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      try { await one(id); } catch (e) { console.log(`  ✗ ${id}: ${e.message}`); refused += 1; }
    }
  }));

  console.log(`\nrewritten: ${done}   still not right: ${refused}   skipped: ${skipped}`);
  if (!DO_IT) console.log('Nothing was saved. Add --do-it.');
  try { writer.close(); } catch { /* gone */ }
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
