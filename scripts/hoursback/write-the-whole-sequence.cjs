// ALL FOUR MESSAGES, WRITTEN AND STORED, IN THE SHAPE OF HIS LETTER.
//
// Until 8 September only the first message existed. The other three were built
// from the TRADE the moment a page was opened and thrown away — so a law firm
// whose site had been read was shown "At most law firms the same client details
// get typed three times": generic, presuming with "most", one job, no cost.
//
// Russ, 2026-09-08: "Why wait to create them until after the first is sent? Why
// not just create them now?" No reason. So they are written now, from that
// business's OWN recorded work, and stored — the page reads them and never
// invents one.
//
// WHAT WENT WRONG THE FIRST TIME, AND WHAT IS DIFFERENT (2026-09-08, later).
//
// Russ opened Bryant, Lovlien & Jarvis: "the messages are stunted abbreviations
// and do not reflect what we wrote at all." He was right. His first letter is
// six paragraphs and about 250 words — their week, who he is, why him, the
// offer, the ask. The follow-ups this wrote were 42 to 66 words: one floating
// observation and a sign-off. No offer. No ask. Nothing of his voice.
//
// The cause was mine. There was already a shape for these messages, built out
// of wordings he approved himself. I wrote new CONTENT and threw away the SHAPE
// along with it, so what came back was the true sentence with the letter
// stripped off around it.
//
// Now the model writes ONLY the passage about that business — the part that has
// to be theirs — and the letter is assembled around it from his own approved
// wordings, exactly the way the first message is built.
//
// TWO CALLS RUSS MADE ON 2026-09-08, both after I asked rather than assumed:
//
//   The standing line — "some may have that one covered, but still have three
//   or four more" — belongs to the FIRST message only. A version is picked per
//   business, and four repeats of it reads as a template.
//
//   The offer is restated on day 4 and day 14, not on day 8. Day 8's whole job
//   is one plain question, and an offer sitting under it weakens the question.
//   The offer never CHANGES across the four; that was the rule.
//
// They are stored as DRAFTS. Nothing sends until it is due.
//
//   node scripts/hoursback/write-the-whole-sequence.cjs --limit=5        (shows, saves nothing)
//   node scripts/hoursback/write-the-whole-sequence.cjs --limit=5 --do-it
const { PrismaClient } = require('@prisma/client');
const FC = require('../../src/hoursback/crm/firstContact.js');
const C = require('../../src/hoursback/crm/campaign.js');
const J = require('../../src/hoursback/crm/judgeTheLetter.js');
const { pick } = require('../../src/hoursback/crm/variants.js');
const { makeReaderPool } = require('../../src/hoursback/readerPool.js');
const { claimTheMachine } = require('../../src/hoursback/onlyOneCopy.js');

const db = new PrismaClient();
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const DO_IT = process.argv.includes('--do-it');
const LIMIT = Number(arg('limit', 0)) || 0;
const ONLY = arg('only', '');
const AT_ONCE = Math.max(1, Number(arg('at-once', 3)));

// EACH MESSAGE TAKES A DIFFERENT ANGLE ON THE SAME BUSINESS.
//
// Four messages naming the same job four ways reads as one message sent four
// times, and gets deleted as one. Day 0 names the two jobs. The rest each do
// something the one before did not.
//
// The brief asks for the PASSAGE ONLY. Everything around it — who he is, the
// offer, the ask, the sign-off — is his own approved wording, added below.
const THE_ANGLES = {
  2: {
    day: 4,
    subject: 'the part that never gets easier',
    brief: [
      'This is the SECOND message, four days after the first. He has not replied.',
      '',
      'Do NOT re-introduce yourself, do not describe the offer, and do not say',
      '"just following up" or "circling back". He knows who you are, and the',
      'offer is added underneath what you write.',
      '',
      'Take ONE of the two jobs already named and go a level deeper into it: the',
      'part of that job nobody mentions, the bit that makes it worse than it',
      'sounds. Then say what that part costs.',
      '',
      'Two or three sentences. Nothing else.',
    ],
  },
  3: {
    day: 8,
    subject: 'One question',
    brief: [
      'This is the THIRD message, eight days after the first. Still no reply.',
      '',
      'Raise a DIFFERENT job from the list below — not one of the two already',
      'named. One he might not have thought of as costing him anything. Say what',
      'it costs.',
      '',
      'Then ask him one plain question he could answer in a single line. No',
      'calendar, no offer, no pitch — none of those are added to this one. Just',
      'the observation and the question.',
      '',
      'Two or three sentences and the question.',
    ],
  },
  4: {
    day: 14,
    subject: 'Closing the loop',
    brief: [
      'This is the LAST message, two weeks after the first. No reply to any.',
      '',
      'Name in one or two sentences what you would have looked at for him, from',
      'the work below — specific, the way you would say it out loud.',
      '',
      'Do NOT say you are stopping, do not say goodbye, do not pitch and do not',
      'ask for anything. A line saying this is the last note goes ABOVE what you',
      'write, and the offer goes below it. Write only the middle.',
      '',
      'Two sentences. No question.',
    ],
  },
};

function askFor({
  name, trade, jobs, otherJobs, dayZero, touch, why,
}) {
  const a = THE_ANGLES[touch];
  return [
    'Write ONE passage for a cold email. Answer with JSON only:',
    '{"body":"..."}  — no preamble, no code fences.',
    '',
    'Write the passage and NOTHING else. No greeting, no sign-off, no',
    'introduction of yourself, no offer, no calendar line. All of those are',
    'added around what you write.',
    '',
    `The business: ${name}${trade ? ` (${trade})` : ''}`,
    '',
    'The two jobs named in the first message:',
    ...jobs.map((j, i) => `  ${i + 1}. ${j}`),
    ...(otherJobs.length ? ['', 'Other repetitive work found on their own site:', ...otherJobs.map((j) => `  · ${j}`)] : []),
    '',
    'What the first message said to them:',
    `  ${dayZero}`,
    '',
    ...a.brief,
    ...(why ? ['', `Your previous answer was rejected: ${why}`] : []),
    '',
    'THE RULES, THE SAME AS EVERY MESSAGE.',
    '',
    'Say what the work COSTS them — money, or a customer lost. Never that they',
    'are busy. Being busy is what a good business feels like; an owner reads it,',
    'nods, and does nothing.',
    '',
    'Never write most, usually, typically, always, or everyone. Say "some", or',
    'say nothing about what other businesses do.',
    '',
    'Never name software they run. Never address them by their job title. Never',
    'promise hours saved. Never invent a figure about their business.',
    '',
    'Plain and spoken, one working person to another. No dashes, no exclamation',
    'marks. No marketing words.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// THE LETTER, BUILT AROUND THE PASSAGE.
//
// The same way the first message is built: his approved wordings, chosen by the
// business's own name so a business reads the same wording every time and the
// shop down the road reads a different one.
//
// GREET WHOEVER THE FIRST LETTER GREETED (Russ, 2026-09-08).
//
// This used to look the contact up again, so 17 businesses got a sequence
// addressed to two different people — Bryant's first letter, which Russ had
// edited himself, said "Hi Alli," and all three follow-ups said "Hi Paul,". The
// first letter is the one he has read and approved; the rest follow it.
function greetingFrom(firstBody, prospect) {
  const line = J.tidy(firstBody).split('\n')[0].trim();
  if (/^(hi|hello|dear)\b/i.test(line)) return line;
  const who = FC.greetingFor(prospect);
  return who ? `Hi ${String(who).split(' ')[0]},` : 'Hello,';
}

// Every wording comes from slotsOfTheMessage, which is campaign.js's own
// answer to "what can this line say" — and already includes anything Russ has
// added by hand. Naming the arrays directly here would be a fourth copy of the
// approved wordings, which is the fault this whole day is about.
function buildLetter(touch, { greeting, passage, seed }) {
  const S = C.slotsOfTheMessage();
  const say = (slot) => pick(S[slot], seed, slot);
  const parts = [greeting];
  if (touch === 2) {
    // Day 4: their job, deeper. Then the offer and the ask, unchanged.
    parts.push(passage, say('offer'), say('ask4'));
  } else if (touch === 3) {
    // Day 8: the observation and the question, and nothing under it. An offer
    // here weakens the only question in the sequence (Russ, 2026-09-08).
    parts.push(passage);
  } else {
    // Day 14: his own last-message wordings, with the passage in the middle.
    // "Last note from me." above it, what the fifteen minutes is for below,
    // then the calendar line. All four are wordings he approved.
    parts.push(say('last'), passage, say('forthat'), say('close8'));
  }
  return `${parts.filter(Boolean).join('\n\n')}\n\n${FC.SIGN_OFF}`;
}

(async () => {
  let giveBack;
  try { giveBack = claimTheMachine('models', { label: 'writing the sequence' }); } catch (e) { console.error(`\n${e.message}\n`); process.exit(73); }
  const letGo = () => { try { giveBack(); } catch { /* gone */ } };
  process.on('exit', letGo);
  process.on('SIGINT', () => { letGo(); process.exit(130); });
  process.on('SIGTERM', () => { letGo(); process.exit(143); });

  await C.loadHisWordings(db);

  // Only businesses whose own site is read and who can be written to.
  const readable = (await db.reading.groupBy({ by: ['prospectId'], where: { pages: { some: {} } } })).map((r) => r.prospectId);
  let targets = [];
  for (let i = 0; i < readable.length; i += 200) {
    const part = await db.prospect.findMany({
      where: {
        id: { in: readable.slice(i, i + 200) },
        doNotContact: false,
        ...(ONLY ? { name: { contains: ONLY, mode: 'insensitive' } } : {}),
        OR: [{ email: { not: null } }, { emailManualValue: { not: null } }],
      },
      select: {
        id: true, name: true, trade: true, contactName: true, ownerName: true, contactRole: true, email: true, emailManualValue: true, automationScore: true,
      },
    });
    targets.push(...part);
  }
  targets.sort((a, b) => (b.automationScore || 0) - (a.automationScore || 0));
  if (LIMIT) targets = targets.slice(0, LIMIT);
  console.log(`${targets.length} businesses${DO_IT ? '' : '  (nothing will be saved)'}\n`);

  // One reader per business in flight, capped at three. Four cores is the real
  // limit on this machine and a fourth copy of the model makes every one of
  // them slower, not faster.
  const writer = makeReaderPool({ size: Math.min(AT_ONCE, 3), model: process.env.HOURSBACK_WRITER_MODEL || 'sonnet' });
  let wrote = 0; let already = 0; let refused = 0; let skipped = 0;

  async function one(p) {
    const dayZeroRow = await db.outreachMessage.findFirst({
      where: { prospectId: p.id, lane: 'EMAIL', NOT: { openedWith: { startsWith: 'touch_' } } },
    });
    if (!dayZeroRow) { skipped += 1; return; }

    const reading = await db.reading.findFirst({
      where: { prospectId: p.id, findings: { some: { field: 'noticingJob' } } },
      orderBy: { startedAt: 'desc' },
      include: { findings: true },
    });
    const jobs = reading ? reading.findings.filter((f) => f.field === 'noticingJob').map((f) => f.value).filter(Boolean) : [];
    if (!jobs.length) { console.log(`  · ${p.name}: no work recorded — skipped`); skipped += 1; return; }

    const others = reading.findings.filter((f) => f.field === 'noticingArea')
      .map((f) => { try { return JSON.parse(f.value).job; } catch { return null; } })
      .filter((j) => j && !jobs.includes(j));

    // What the first letter actually said to them, so the follow-ups do not
    // repeat it and do not contradict it.
    const zero = J.judgeLetter(dayZeroRow.body, { day: 0, jobs });
    const dayZero = (zero.passage || '').replace(/\s+/g, ' ').trim();
    const greeting = greetingFrom(dayZeroRow.body, p);

    for (const touch of [2, 3, 4]) {
      const have = await db.outreachMessage.findFirst({ where: { prospectId: p.id, lane: 'EMAIL', openedWith: `touch_${touch}` } });
      // NEVER OVERWRITE ANYTHING RUSS EDITED BY HAND. Standing order.
      if (have && have.editedAt) { already += 1; continue; }

      let full = null; let why = null;
      for (let go = 0; go < 3 && !full; go += 1) {
        const answer = await writer.ask(askFor({
          name: p.name, trade: p.trade, jobs, otherJobs: others, dayZero, touch, why,
        }));
        const got = answer && answer.answer ? String(answer.answer.body || '').trim().replace(/\n+/g, ' ') : '';
        if (!got) { why = 'the answer could not be read'; continue; }
        const candidate = buildLetter(touch, { greeting, passage: got, seed: p.name });
        // JUDGED BY THE ONE JUDGE, TOLD WHICH DAY IT IS. The same judge the
        // page, the send queue and the nightly check use — so a letter that
        // passes here cannot be reported as failing anywhere else.
        const v = J.judgeLetter(candidate, { day: THE_ANGLES[touch].day, jobs, roleTitle: p.contactRole });
        if (v.ok) full = candidate; else why = v.why;
      }
      if (!full) { console.log(`  ✗ ${p.name} day ${THE_ANGLES[touch].day}: ${String(why).slice(0, 80)}`); refused += 1; continue; }

      console.log(`  ✓ ${p.name} day ${THE_ANGLES[touch].day}`);
      if (!DO_IT) { console.log(`${full.split('\n').map((l) => `      ${l}`).join('\n')}\n`); continue; }
      if (have) {
        await db.outreachMessage.update({ where: { id: have.id }, data: { subject: THE_ANGLES[touch].subject, body: full } });
      } else {
        await db.outreachMessage.create({
          data: {
            prospectId: p.id,
            lane: 'EMAIL',
            state: 'DRAFT',
            subject: THE_ANGLES[touch].subject,
            body: full,
            openedWith: `touch_${touch}`,
          },
        });
      }
      wrote += 1;
    }
  }

  const queue = [...targets];
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, async () => {
    while (queue.length) {
      const p = queue.shift();
      try { await one(p); } catch (e) { console.log(`  ✗ ${p.name}: ${e.message}`); refused += 1; }
    }
  }));

  console.log(`\nwritten: ${wrote}   left alone (his own edit): ${already}   refused: ${refused}   skipped: ${skipped}`);
  if (!DO_IT) console.log('Nothing was saved. Add --do-it.');
  try { writer.close(); } catch { /* gone */ }
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
