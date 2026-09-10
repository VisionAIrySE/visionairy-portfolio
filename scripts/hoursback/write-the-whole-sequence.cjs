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
// The current sequence puts the same clear action in every email: a free
// fifteen-minute review, one specific tool recommendation, and no obligation.
//
// They are stored as DRAFTS. Nothing sends until it is due.
//
//   node scripts/hoursback/write-the-whole-sequence.cjs --limit=5        (shows, saves nothing)
//   node scripts/hoursback/write-the-whole-sequence.cjs --limit=5 --do-it
const { PrismaClient } = require('@prisma/client');
const FC = require('../../src/hoursback/crm/firstContact.js');
const C = require('../../src/hoursback/crm/campaign.js');
const J = require('../../src/hoursback/crm/judgeTheLetter.js');
const L = require('../../src/hoursback/crm/lanes.js');
const { pick } = require('../../src/hoursback/crm/variants.js');
const { makeReaderPool } = require('../../src/hoursback/readerPool.js');
const { claimTheMachine } = require('../../src/hoursback/onlyOneCopy.js');

const db = new PrismaClient();
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const DO_IT = process.argv.includes('--do-it');
const LIMIT = Number(arg('limit', 0)) || 0;
const ONLY = arg('only', '');
const AT_ONCE = Math.max(1, Number(arg('at-once', 3)));
const TOUCH = Number(arg('touch', 0));
const OVERWRITE_EDITS = process.argv.includes('--overwrite-edits');

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
      'Develop the SECOND of the two jobs already named. Do not introduce a',
      'third problem. Show the hidden cost of this second job, then ask one',
      'plain diagnostic question the recipient could answer in a single line.',
      'The review offer and calendar line are added after this passage.',
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
      'Briefly bring the TWO original areas back together and name what you would',
      'have examined. Keep it specific and say it the way you would aloud.',
      '',
      'Do NOT say you are stopping, do not say goodbye, do not pitch and do not',
      'ask for anything. A line saying this is the last note goes ABOVE what you',
      'write, and the offer goes below it. Write only the middle.',
      '',
      'Two sentences. No question.',
    ],
  },
};

function askForFirst({ name, trade, roleTitle, jobs, otherJobs, why }) {
  const twoAreas = jobs.length >= 2;
  return [
    'Write the company-specific opening and subject for the FIRST cold email.',
    'Answer with JSON only: {"subject":"...","body":"...","question":"..."}.',
    '',
    `The business: ${name}${trade ? ` (${trade})` : ''}`,
    `The recipient's role: ${roleTitle || 'not recorded'}`,
    '',
    `${twoAreas ? 'Two recurring areas' : 'One recurring area'} verified from this company\'s own website:`,
    ...jobs.slice(0, 2).map((j, i) => `  ${i + 1}. ${j}`),
    ...(otherJobs.length ? ['', 'Other verified work for context only:', ...otherJobs.map((j) => `  · ${j}`)] : []),
    '',
    'Write one compact paragraph of exactly three short sentences, no more than',
    '350 characters total. Russ\'s introduction will appear immediately before',
    'this paragraph, so continue naturally from it. Sentence 1 says he was',
    'looking at the relevant work the company publicly describes. Sentence 2',
    `uses "That made me wonder whether" to name ${twoAreas ? 'BOTH areas' : 'that area'} where AI or`,
    'automation might help, in concrete language relevant to this recipient\'s',
    'role. Do not say Russ will examine, review, assess, or fix anything before',
    'the recipient accepts the offer. Sentence 3 explains the',
    'possible business cost conditionally: lost revenue, delayed payment, a',
    'cooled opportunity, an avoidable error, or higher-value work displaced.',
    'Sentence 3 must use at least one of these plain economic terms: revenue,',
    'money, invoice, paid hours, sits idle, lost customer, or went elsewhere.',
    'Name the consequence directly; "busy," "slower," and "takes attention"',
    'do not count as a cost.',
    '',
    'Never claim or imply how this company currently tracks, assigns, routes,',
    'or manages the work. In particular, do not mention memory, spreadsheets,',
    'email, inboxes, paper, manual work, missed steps, delays, or dropped work',
    'as current facts unless those exact facts appear in the verified areas.',
    'Use "if" or "when" for a possible failure or cost. Do not invent figures.',
    'Do not write "someone free to catch it," "someone available to notice it,"',
    'or similar staffing language. Say plainly that a next step may wait to be',
    'noticed, without guessing who works there or whether they are available.',
    '',
    `Safe pattern: "I was looking at how the company describes ${twoAreas ? 'X and Y' : 'X'}. That made`,
    `me wonder whether automation could help with ${twoAreas ? 'A and B' : 'A'}. If ${twoAreas ? 'either handoff' : 'that work'}`,
    'relies on a person catching the next step, the cost can show up as C."',
    'Do not copy these placeholder words.',
    '',
    `The question is one short ${twoAreas ? 'either-or question naming the same two areas' : 'yes-or-no question naming that same area'}.`,
    'It must be answerable in a few words and end with a question mark.',
    ...(twoAreas
      ? ['Example shape: "Which is harder to keep visible today: phase handoffs or crew routing?" Use the actual areas and do not copy the example.']
      : ['Example shape: "Would phase handoffs be worth a closer look?" Use the actual area and do not copy the example.']),
    '',
    'The subject should sound like a quiet note from one person, use a concrete',
    'noun from one of the two areas, and stay under 48 characters so the',
    'recipient\'s name can be added in front. Prefer a consequence or a plain',
    'operational question. Do not use the company name, an exclamation mark,',
    'title case, a promotional phrase, or words such as juggling, streamline,',
    'optimize, efficiency, solution, AI, automation, opportunity, or free.',
    '',
    'Do not introduce Russ, make the offer, ask for a meeting, add a greeting,',
    'or add a sign-off. Those parts are added after your opening.',
    '',
    'Plain and spoken. No dashes, hype, jargon, flattery, or unsupported claims.',
    'Write as an expert direct-response sales writer. The reader should quickly',
    'recognize the work, see why it may matter economically, and want to answer',
    `the simple ${twoAreas ? 'either-or' : 'yes-or-no'} question that follows later in the email.`,
    ...(why ? ['', `Your previous answer was rejected: ${why}`] : []),
  ].join('\n');
}

function askFor({
  name, trade, roleTitle, jobs, otherJobs, dayZero, touch, why,
}) {
  const a = THE_ANGLES[touch];
  const twoAreas = jobs.length >= 2;
  const brief = !twoAreas && touch === 3 ? [
    'This is the THIRD message, eight days after the first. Still no reply.',
    '',
    'Return to the one verified job from a different practical angle. Show one',
    'additional economic consequence, then ask one plain diagnostic question',
    'the recipient could answer in a single line. Do not invent another job.',
    'The review offer and calendar line are added after this passage.',
    '',
    'Two or three sentences and the question.',
  ] : !twoAreas && touch === 4 ? [
    'This is the LAST message, two weeks after the first. No reply to any.',
    '',
    'Briefly return to the one original area and name what you would have',
    'examined. Keep it specific and say it the way you would aloud.',
    '',
    'Do NOT say you are stopping, do not say goodbye, do not pitch and do not',
    'ask for anything. A line saying this is the last note goes ABOVE what you',
    'write, and the offer goes below it. Write only the middle.',
    '',
    'Two sentences. No question.',
  ] : a.brief;
  return [
    'Write ONE passage for a cold email. Answer with JSON only:',
    '{"body":"..."}  — no preamble, no code fences.',
    '',
    'Write the passage and NOTHING else. No greeting, no sign-off, no',
    'introduction of yourself, no offer, no calendar line. All of those are',
    'added around what you write.',
    '',
    `The business: ${name}${trade ? ` (${trade})` : ''}`,
    `The recipient's role: ${roleTitle || 'not recorded'}`,
    'Choose a problem that is relevant to both this industry and this role.',
    'Finance roles: billing, collections, reporting or data. Sales roles:',
    'enquiries, follow-up, proposals or referrals. Operations roles: scheduling,',
    'handoffs, field work or workflow. Administrative roles: intake, documents,',
    'reminders or data entry. Marketing roles: visibility, reviews, content or',
    'lead capture. Use only work found on this company\'s own site. If the role',
    'is not recorded, choose the strongest company-wide problem.',
    '',
    `The ${twoAreas ? 'two jobs' : 'one job'} named in the first message:`,
    ...jobs.map((j, i) => `  ${i + 1}. ${j}`),
    ...(otherJobs.length ? ['', 'Other repetitive work found on their own site:', ...otherJobs.map((j) => `  · ${j}`)] : []),
    '',
    'What the first message said to them:',
    `  ${dayZero}`,
    '',
    ...brief,
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
    '',
    'Write as an expert direct-response sales writer. Earn attention with a',
    'specific operational insight, make the economic consequence easy to see,',
    'and make replying feel simple. Never manufacture urgency or claim a fact',
    'that is not supported above.',
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
    parts.push(passage, say('ask4'));
  } else if (touch === 3) {
    // Day 8 keeps its one easy question, followed by the same clear call to
    // action as every other email: free review, one tool recommendation, and
    // no obligation.
    parts.push(passage, say('ask8'));
  } else {
    // Day 14: his own last-message wordings, with the passage in the middle.
    // "Last note from me." above it, what the fifteen minutes is for below,
    // then the calendar line. All four are wordings he approved.
    parts.push(say('last'), passage, say('forthat'), say('close8'));
  }
  return `${parts.filter(Boolean).join('\n\n')}\n\n${FC.SIGN_OFF}`;
}

function buildFirstLetter({ greeting, passage, question, seed }) {
  const S = C.slotsOfTheMessage();
  const say = (slot) => pick(S[slot], seed, slot);
  return `${[greeting, say('who'), passage, say('whyme'), say('offer'), question, say('afterDiagnostic')]
    .filter(Boolean).join('\n\n')}\n\n${FC.SIGN_OFF}`;
}

function acceptableSubject(subject) {
  const s = String(subject || '').trim();
  return s.length >= 8 && s.length <= 48 && !/[!\r\n]/.test(s)
    && !/\b(free|offer|opportunit\w*|quick question|ai|automation|solution|juggling|streamlin\w*|optimi[sz]\w*|efficien\w*)\b/i.test(s);
}

function addressedSubject(subject, greeting) {
  const person = String(greeting || '').replace(/^(hi|hello|dear)\s+/i, '').replace(/,$/, '').trim();
  if (!person || /^hello$/i.test(person)) return subject;
  const room = Math.max(8, 65 - person.length - 3);
  const raw = String(subject).trim();
  const shortened = raw.length <= room
    ? raw
    : raw.slice(0, room).replace(/\s+\S*$/, '').trim() || raw.slice(0, room);
  return `${person} — ${shortened}`;
}

function acceptableQuestion(question, jobCount) {
  const q = String(question || '').trim();
  return q.length >= 20 && q.length <= 120 && /\?$/.test(q)
    && !/[!—–\r\n]/.test(q)
    && (jobCount >= 2 ? /\b(or|which)\b/i.test(q) : /^(would|could|is|does|do|has|have|how)\b/i.test(q));
}

function acceptableOpening(passage) {
  const p = String(passage || '');
  return /\b(wonder|curious|could|might)\b/i.test(p)
    && !/\b(?:I(?:'d| would)|we(?:'d| would))\s+(?:examine|review|assess|fix)\b/i.test(p);
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
  const readable = (await db.reading.groupBy({
    by: ['prospectId'],
    where: {
      source: 'website', outcome: 'read',
      pages: { some: { AND: [{ text: { not: null } }, { NOT: { text: '' } }] } },
    },
  })).map((r) => r.prospectId);
  let targets = [];
  for (let i = 0; i < readable.length; i += 200) {
    const part = await db.prospect.findMany({
      where: {
        id: { in: readable.slice(i, i + 200) },
        doNotContact: false,
        ...(ONLY ? { name: { contains: ONLY, mode: 'insensitive' } } : {}),
        ...(TOUCH === 1 ? {
          messages: {
            some: {
              lane: 'EMAIL', sentAt: null, deliveryState: null,
              ...(OVERWRITE_EDITS ? {} : { editedAt: null }),
              openedWith: { not: 'after_the_call' },
              NOT: { openedWith: { startsWith: 'touch_' } },
            },
          },
        } : {}),
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
  let stopReason = null;

  async function one(p) {
    const dayZeroRow = await db.outreachMessage.findFirst({
      where: {
        prospectId: p.id, lane: 'EMAIL',
        openedWith: { not: 'after_the_call' },
        NOT: { openedWith: { startsWith: 'touch_' } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!dayZeroRow) { skipped += 1; return; }

    const { writeTo } = await L.whoTheLetterGoesTo(db, p.id, p);
    const roleTitle = writeTo.contactRole || null;

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

    const greeting = greetingFrom(dayZeroRow.body, p);

    // The first email and all three follow-ups are one campaign. Earlier this
    // script regenerated only touches 2-4, leaving an older opening in touch 1.
    // Rebuild touch 1 from the same two verified jobs before giving it to the
    // follow-up prompts. Sent messages always remain untouchable. Hand-edited
    // drafts are replaced only for a run that explicitly carries the one-time
    // --overwrite-edits instruction Russ approved for this inaugural rewrite.
    if ((!TOUCH || TOUCH === 1) && !dayZeroRow.sentAt
      && (!dayZeroRow.editedAt || OVERWRITE_EDITS) && !dayZeroRow.deliveryState) {
      let first = null; let firstSubject = null; let whyFirst = null;
      for (let go = 0; go < 3 && !first; go += 1) {
        const answer = await writer.ask(askForFirst({
          name: p.name, trade: p.trade, roleTitle, jobs, otherJobs: others, why: whyFirst,
        }));
        if (answer && answer.readerExhausted) {
          stopReason = answer.why;
          return;
        }
        const passage = answer && answer.answer ? String(answer.answer.body || '').trim().replace(/\s+/g, ' ') : '';
        const subject = answer && answer.answer ? String(answer.answer.subject || '').trim() : '';
        const question = answer && answer.answer ? String(answer.answer.question || '').trim() : '';
        if (!passage || !acceptableOpening(passage) || !acceptableSubject(subject) || !acceptableQuestion(question, jobs.length)) {
          whyFirst = !passage ? 'the opening could not be read'
            : !acceptableOpening(passage) ? 'the opening did not explain the reason for raising the two areas'
              : !acceptableSubject(subject) ? 'the subject was generic, promotional, or the wrong length'
                : 'the reply question was not a short either-or question';
          continue;
        }
        const candidate = buildFirstLetter({ greeting, passage, question, seed: p.name });
        const v = J.judgeLetter(candidate, { day: 0, jobs, roleTitle });
        if (v.ok) { first = candidate; firstSubject = addressedSubject(subject, greeting); } else whyFirst = v.why;
      }
      if (!first) {
        console.log(`  ✗ ${p.name} day 0: ${String(whyFirst).slice(0, 80)}`);
        refused += 1;
        return;
      }
      console.log(`  ✓ ${p.name} day 0`);
      if (!DO_IT) console.log(`      Subject: ${firstSubject}\n\n${first.split('\n').map((l) => `      ${l}`).join('\n')}\n`);
      else {
        await db.outreachMessage.update({
          where: { id: dayZeroRow.id },
          data: { subject: firstSubject, body: first, openedWith: 'tailored_first', editedAt: null },
        });
        dayZeroRow.subject = firstSubject;
        dayZeroRow.body = first;
        dayZeroRow.openedWith = 'tailored_first';
        wrote += 1;
      }
    } else if (!TOUCH || TOUCH === 1) {
      already += 1;
    }

    // Give every follow-up the first email that will actually precede it.
    const zero = J.judgeLetter(dayZeroRow.body, { day: 0, jobs, roleTitle });
    const dayZero = (zero.passage || '').replace(/\s+/g, ' ').trim();

    for (const touch of [2, 3, 4].filter((n) => !TOUCH || TOUCH === n)) {
      const have = await db.outreachMessage.findFirst({ where: { prospectId: p.id, lane: 'EMAIL', openedWith: `touch_${touch}` } });
      if (have && have.sentAt) { already += 1; continue; }
      if (have && have.deliveryState) { already += 1; continue; }
      if (have && have.editedAt && !OVERWRITE_EDITS) { already += 1; continue; }

      let full = null; let why = null;
      for (let go = 0; go < 3 && !full; go += 1) {
        const answer = await writer.ask(askFor({
          name: p.name, trade: p.trade, roleTitle, jobs, otherJobs: others, dayZero, touch, why,
        }));
        if (answer && answer.readerExhausted) {
          stopReason = answer.why;
          return;
        }
        const got = answer && answer.answer ? String(answer.answer.body || '').trim().replace(/\n+/g, ' ') : '';
        if (!got) { why = 'the answer could not be read'; continue; }
        const candidate = buildLetter(touch, { greeting, passage: got, seed: p.name });
        // JUDGED BY THE ONE JUDGE, TOLD WHICH DAY IT IS. The same judge the
        // page, the send queue and the nightly check use — so a letter that
        // passes here cannot be reported as failing anywhere else.
        const v = J.judgeLetter(candidate, { day: THE_ANGLES[touch].day, jobs, roleTitle });
        if (v.ok) full = candidate; else why = v.why;
      }
      if (!full) { console.log(`  ✗ ${p.name} day ${THE_ANGLES[touch].day}: ${String(why).slice(0, 80)}`); refused += 1; continue; }

      console.log(`  ✓ ${p.name} day ${THE_ANGLES[touch].day}`);
      if (!DO_IT) { console.log(`${full.split('\n').map((l) => `      ${l}`).join('\n')}\n`); continue; }
      if (have) {
        await db.outreachMessage.update({ where: { id: have.id }, data: { subject: THE_ANGLES[touch].subject, body: full, editedAt: null } });
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
    while (queue.length && !stopReason) {
      const p = queue.shift();
      try { await one(p); } catch (e) { console.log(`  ✗ ${p.name}: ${e.message}`); refused += 1; }
    }
  }));

  console.log(`\nwritten: ${wrote}   protected: ${already}   refused: ${refused}   skipped: ${skipped}`);
  if (stopReason) console.log(`Stopped early: ${stopReason}`);
  if (!DO_IT) console.log('Nothing was saved. Add --do-it.');
  try { writer.close(); } catch { /* gone */ }
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
