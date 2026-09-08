// ALL FOUR MESSAGES, WRITTEN AND STORED NOW.
//
// Until today only the first message existed. The other three were built from
// the TRADE the moment a page was opened and thrown away — so a law firm whose
// site had been read was shown "At most law firms the same client details get
// typed three times": generic, presuming with "most", one job, no cost. Every
// rule Russ set, broken, on the screen he reads. Nothing checked it because
// nothing saved it.
//
// Russ, 2026-09-08: "Why wait to create them until after the first is sent?
// Why not just create them now?" No reason. So they are written now, from that
// business's OWN recorded work, judged by the same rules as the first, and
// stored — the page reads them and never invents one.
//
// They are stored as DRAFTS. Nothing sends until it is due; the timing that
// already exists moves each one when its day comes.
//
//   node scripts/hoursback/write-the-whole-sequence.cjs --limit=3        (shows, saves nothing)
//   node scripts/hoursback/write-the-whole-sequence.cjs --do-it
const { PrismaClient } = require('@prisma/client');
const N = require('../../src/hoursback/crm/noticing.js');
const FC = require('../../src/hoursback/crm/firstContact.js');
const { makeReaderPool } = require('../../src/hoursback/readerPool.js');
const { claimTheMachine } = require('../../src/hoursback/onlyOneCopy.js');

const db = new PrismaClient();
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const DO_IT = process.argv.includes('--do-it');
const LIMIT = Number(arg('limit', 0)) || 0;
const AT_ONCE = Math.max(1, Number(arg('at-once', 3)));

// EACH MESSAGE TAKES A DIFFERENT ANGLE ON THE SAME BUSINESS.
//
// Four messages naming the same job four ways reads as one message sent four
// times, and gets deleted as one. Day 0 names the two jobs. The rest each do
// something the one before did not.
const THE_ANGLES = {
  2: {
    day: 4,
    subject: 'the part that never gets easier',
    brief: [
      'This is the SECOND message, four days after the first. He has not replied.',
      '',
      'Do NOT re-introduce yourself, do not repeat the offer in full, and do not',
      'say "just following up" or "circling back". He knows who you are.',
      '',
      'Take ONE of the two jobs already named and go a level deeper into it: the',
      'part of that job nobody mentions, the bit that makes it worse than it',
      'sounds. Then say what that part costs.',
      '',
      'Shorter than the first message. Three or four sentences of substance.',
    ],
  },
  3: {
    day: 8,
    subject: 'One question',
    brief: [
      'This is the THIRD message, eight days after the first. Still no reply.',
      '',
      'Raise a DIFFERENT job from the list below — not one of the two already',
      'named. One he might not have thought of as costing him anything.',
      '',
      'Then ask him one plain question he could answer in a single line. No',
      'calendar link, no offer, no pitch. Just the observation and the question.',
      '',
      'Short. Two or three sentences and the question.',
    ],
  },
  4: {
    day: 14,
    subject: 'Closing the loop',
    brief: [
      'This is the LAST message, two weeks after the first. No reply to any.',
      '',
      'Close it cleanly. Say you will stop writing. No guilt, no "just checking',
      'in one last time", no final pitch.',
      '',
      'Name in one clause what you would have looked at for him, so the door is',
      'left open without asking for anything. Then stop.',
      '',
      'The shortest of the four. Two or three sentences.',
    ],
  },
};

function askFor({ name, trade, jobs, otherJobs, dayZero, touch, why }) {
  const a = THE_ANGLES[touch];
  return [
    'Write one message in a cold email sequence. Answer with JSON only:',
    '{"body":"..."}  — no preamble, no code fences. Do not include a greeting',
    'line or a sign-off; both are added afterwards.',
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

// The sign-off and greeting are the letter's, not the model's.
function wrap(prospect, body) {
  const who = FC.greetingFor ? FC.greetingFor(prospect) : (prospect.contactName || prospect.ownerName || '');
  const hello = who ? `Hi ${String(who).split(' ')[0]},` : 'Hello,';
  return `${hello}\n\n${String(body).trim()}\n\n${FC.SIGN_OFF || 'Best regards,\n\nRuss Wright'}`;
}

(async () => {
  let giveBack;
  try { giveBack = claimTheMachine('models', { label: 'writing the sequence' }); }
  catch (e) { console.error(`\n${e.message}\n`); process.exit(73); }
  const letGo = () => { try { giveBack(); } catch { /* gone */ } };
  process.on('exit', letGo);
  process.on('SIGINT', () => { letGo(); process.exit(130); });
  process.on('SIGTERM', () => { letGo(); process.exit(143); });

  // Only businesses whose own site is read and who can be written to.
  const readable = (await db.reading.groupBy({ by: ['prospectId'], where: { pages: { some: {} } } })).map((r) => r.prospectId);
  let targets = [];
  for (let i = 0; i < readable.length; i += 200) {
    const part = await db.prospect.findMany({
      where: {
        id: { in: readable.slice(i, i + 200) },
        doNotContact: false,
        OR: [{ email: { not: null } }, { emailManualValue: { not: null } }],
      },
      select: { id: true, name: true, trade: true, contactName: true, ownerName: true },
    });
    targets.push(...part);
  }
  if (LIMIT) targets = targets.slice(0, LIMIT);
  console.log(`${targets.length} businesses${DO_IT ? '' : '  (nothing will be saved)'}\n`);

  const writer = makeReaderPool({ size: 1, model: process.env.HOURSBACK_WRITER_MODEL || 'sonnet' });
  let wrote = 0; let already = 0; let refused = 0; let skipped = 0;

  async function one(p) {
    const dayZeroRow = await db.outreachMessage.findFirst({
      where: { prospectId: p.id, lane: 'EMAIL', OR: [{ openedWith: null }, { NOT: { openedWith: { startsWith: 'touch_' } } }] },
    });
    if (!dayZeroRow) { skipped += 1; return; }

    const reading = await db.reading.findFirst({
      where: { prospectId: p.id, findings: { some: { field: 'noticingJob' } } },
      orderBy: { startedAt: 'desc' }, include: { findings: true },
    });
    const jobs = reading ? reading.findings.filter((f) => f.field === 'noticingJob').map((f) => f.value).filter(Boolean) : [];
    if (!jobs.length) { console.log(`  · ${p.name}: no work recorded — skipped`); skipped += 1; return; }

    const others = reading.findings.filter((f) => f.field === 'noticingArea')
      .map((f) => { try { return JSON.parse(f.value).job; } catch { return null; } })
      .filter((j) => j && !jobs.includes(j));

    const dayZero = String(dayZeroRow.body).split('\n\n')[1] || '';

    for (const touch of [2, 3, 4]) {
      const have = await db.outreachMessage.findFirst({ where: { prospectId: p.id, lane: 'EMAIL', openedWith: `touch_${touch}` } });
      if (have && have.editedAt) { already += 1; continue; }   // his own words, never touched
      if (have && !DO_IT) { already += 1; continue; }

      let body = null; let why = null;
      for (let go = 0; go < 2 && !body; go += 1) {
        const answer = await writer.ask(askFor({
          name: p.name, trade: p.trade, jobs, otherJobs: others, dayZero, touch, why,
        }));
        const got = answer && answer.answer ? String(answer.answer.body || '').trim() : '';
        if (!got) { why = 'the answer could not be read'; continue; }
        // Judged by the same rules as the first message. Touch 4 is a
        // sign-off and is allowed to carry no cost; the rest are not.
        // WHICH RULES APPLY TO WHICH MESSAGE.
        //
        // Day 4 is judged in full, like the first message.
        //
        // Day 8's whole job is to ask one plain question, and the full judge
        // bans questions — that rule belongs to the FIRST message, where a
        // question to a stranger reads as a trick. So it is judged on the
        // things that matter here: it must say what the work costs, must not
        // presume, and must not name their software.
        //
        // Day 14 is a sign-off. It carries no cost because there is nothing
        // left to sell; it only has to not presume.
        const flat = got.replace(/\n+/g, ' ');
        const presumes = /\b(most|mostly|usually|typically|always|everyone)\b/i.test(flat);
        const theirSoftware = /\b(QuickBooks|Xero|Sage|FreshBooks|Salesforce|HubSpot|ServiceTitan|Jobber|Housecall|Mindbody|Shopify|Toast|Dentrix|Eaglesoft|Clio|MyCase|Yardi|AppFolio|Buildium|Procore|Mailchimp|Calendly|Acuity|Square)\b/i.test(flat);
        let v;
        if (touch === 4) {
          v = presumes ? { ok: false, why: 'presumes about other businesses' } : { ok: true };
        } else if (touch === 3) {
          if (presumes) v = { ok: false, why: 'presumes about other businesses' };
          else if (theirSoftware) v = { ok: false, why: 'names their own software' };
          else if (!(flat.match(/\?/))) v = { ok: false, why: 'does not actually ask a question, which is the whole point of this one' };
          else v = N.passable(flat.replace(/\?/g, '.'), { jobs });
        } else {
          v = N.passable(flat, { jobs });
        }
        if (v.ok) body = got; else why = v.why;
      }
      if (!body) { console.log(`  ✗ ${p.name} day ${THE_ANGLES[touch].day}: ${String(why).slice(0, 70)}`); refused += 1; continue; }

      const full = wrap(p, body);
      console.log(`  ✓ ${p.name} day ${THE_ANGLES[touch].day}: ${body.replace(/\n+/g, ' ').slice(0, 130)}`);
      if (!DO_IT) continue;
      if (have) {
        await db.outreachMessage.update({ where: { id: have.id }, data: { subject: THE_ANGLES[touch].subject, body: full } });
      } else {
        await db.outreachMessage.create({
          data: {
            prospectId: p.id, lane: 'EMAIL', state: 'DRAFT',
            subject: THE_ANGLES[touch].subject, body: full, openedWith: `touch_${touch}`,
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

  console.log(`\nwritten: ${wrote}   already there: ${already}   refused: ${refused}   skipped: ${skipped}`);
  if (!DO_IT) console.log('Nothing was saved. Add --do-it.');
  try { writer.close(); } catch { /* gone */ }
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
