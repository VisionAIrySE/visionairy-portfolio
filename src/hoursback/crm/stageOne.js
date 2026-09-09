// Stage 1 — the free fifteen minutes.
//
// Two stages, and this is the first. Stage 1 is a free fact-find: fifteen
// minutes on the phone, five questions, and Russ comes back a couple of days
// later with ONE thing he would fix. Stage 2 is the $999 audit, and it only
// happens if Stage 1 earned it (Russ, 2026-08-27).
//
// THE RULE THAT MAKES IT WORK: nothing is prescribed on this call. Naming a
// tool live sounds like a guess. "Give me a couple of days to find the right
// fix" sounds like a professional, and it books the second conversation. Two
// touches beat one.
//
// What this is NOT: the deep discovery that justifies a paid engagement. That
// walks every department. This walks one problem.
//
// The questions are Corey Gamin's shape, sharpened by knowing the trade before
// dialling. His version asks "what do you repeat most often?" — a fine question
// from a stranger. Russ knows a construction firm chases signatures and an
// accounting firm chases documents, so he can ask about THAT and prove he has
// been in the room.

const { painFor } = require('./painPoints.js');
const { BY_TRADE, TYPES } = require('../toolLibrary.js');

// What the owner actually wants, asked first because the answer decides which
// half of everything else matters. Somebody whose phone is not ringing does not
// want their filing tidied.
const LEVERS = {
  money: {
    label: 'More money coming in',
    means: 'work they are not winning, or work they win too slowly',
    // Which kinds of work to look at when this is the answer.
    lookAt: ['lead_follow_up', 'quoting_and_proposals', 'outbound_prospecting',
      'social_content', 'reviews_and_reputation', 'local_search_presence',
      'referral_and_repeat', 'email_and_newsletter', 'website_and_capture'],
  },
  hours: {
    label: 'Hours back for me and my team',
    means: 'work that has to happen and nobody should be doing by hand',
    lookAt: ['document_collection', 'data_entry', 'scheduling', 'invoicing_and_collections',
      'approvals_and_signatures', 'field_capture', 'reporting', 'dispatch_and_routing',
      'records_requests', 'compliance_records', 'drafting_and_documents',
      'call_notes_and_follow_up', 'intake_and_onboarding'],
  },
  customers: {
    label: 'Happier customers',
    means: 'the experience of dealing with them',
    lookAt: ['client_communication', 'phone_answering', 'scheduling', 'live_chat',
      'intake_and_onboarding', 'reviews_and_reputation', 'translation_and_accessibility',
      'knowledge_lookup'],
  },
};

// What to ask NEXT, once a top-level question has found something.
//
// Five questions is three minutes each, and nobody talks like that. A real
// fifteen minutes is twelve to fifteen questions, and most of them are
// follow-ups to what was just said (Russ, 2026-08-27: "you think 5 questions
// fills 15 minutes? 3 minutes per question is ridiculously short").
//
// These only get asked where the answer above them said there IS something
// there. A business that says "no, that's handled" gets moved past
// immediately, which is what keeps the call from being tedious.
//
// Three groups, because what you need to know next depends on what kind of
// thing they just described.
const FOLLOW_UPS = {
  // After they name a piece of repetitive work.
  work: [
    { ask: 'Walk me through it — what actually happens, start to finish?', why: 'The steps are where the automatable part hides. Ask for the whole thing, not a summary.' },
    { ask: 'How often does that happen — every day, every job, once a week?', why: 'Frequency times minutes is the hours figure. You need both halves.' },
    { ask: 'Who does it, and is it always them?', why: 'One person carrying it is a risk they already feel. Several people means no single fix.' },
    { ask: 'What does it arrive as — email, paper, a phone call, a form?', why: 'How something arrives decides which tools can even touch it.' },
    { ask: 'Where does it end up when it is finished?', why: 'The last step is usually somebody typing it into a second system.' },
    { ask: 'What happens when it goes wrong or somebody forgets?', why: 'The cost of the failure is usually bigger than the cost of the work.' },
  ],
  // After they name something that gets stuck or dropped.
  friction: [
    { ask: 'How often does that actually happen?', why: 'Something that happens twice a year is a story, not a problem.' },
    { ask: 'What does it cost you when it does — a day, a job, a customer?', why: 'This is the sentence you quote back to them.' },
    { ask: 'How do you find out it has happened?', why: 'If the answer is "when the customer rings", that is its own finding.' },
    { ask: 'Who picks it up when it goes wrong?', why: 'Usually the owner, and usually at night.' },
    { ask: 'Have you tried to fix it before?', why: 'What failed before tells you what not to recommend and why their guard is up.' },
  ],
  // After they say what they want, before you go looking for it.
  want: [
    { ask: 'What does that look like if it works — what changes on a Monday?', why: 'Vague wants produce vague recommendations.' },
    { ask: 'Is that new, or has it been like that a while?', why: 'A new pain has a cause. An old one has been survived and needs a reason to move.' },
    { ask: 'What have you already got in place for it?', why: 'The cheapest recommendation is often a feature of something already on their bill.' },
    { ask: 'If nothing changes, what does that cost you over a year?', why: 'Their number, not yours. It is what the paid work is measured against.' },
  ],
  // After the hours figure, to make it defensible.
  hours: [
    { ask: 'Is that a normal week or a busy one?', why: 'Seasonal businesses quote their worst week. Ask which one you just heard.' },
    { ask: 'Does anybody else touch it?', why: 'The hours belong to a business, not a person. Two people at three hours is six.' },
    { ask: 'What would they be doing instead?', why: 'Hours saved are worth what the person would otherwise be doing.' },
  ],
};

// Which set of follow-ups belongs under each of the five.
const FOLLOW_UP_SET = {
  lever: 'want',
  repetition: 'work',
  friction: 'friction',
  hours: 'hours',
  wand: null,     // the last question is the close; nothing follows it
};

// The five questions, in order, broad to specific.
//
// Two and three are written FROM THE TRADE, so they name the work rather than
// asking the owner to summarise it. That is the whole advantage of knowing who
// you are calling before you dial.
function questionsFor(trade) {
  const pain = painFor(trade || 'other');
  const types = (BY_TRADE[String(trade || 'other').toLowerCase()] || BY_TRADE.other);
  const biggest = TYPES[types[0]];
  const second = TYPES[types[1]];

  return [
    {
      key: 'lever',
      ask: 'If I could fix one thing in the next month, would you want it to bring more money in, give you and your team hours back, or make your customers happier?',
      why: 'Decides everything after it. Somebody whose phone is not ringing does not want their filing tidied.',
      answers: Object.entries(LEVERS).map(([k, v]) => ({ value: k, label: v.label })),
      thenAsk: FOLLOW_UPS.want,
    },
    {
      key: 'repetition',
      // Their trade's own week, said back to them as a question.
      ask: biggest ? `${biggest.question}` : 'What is the task you or your team repeat most every week?',
      context: pain.recognition,
      why: 'Asked about their actual work rather than in the abstract, so the answer is specific and it proves you know the trade.',
      thenAsk: FOLLOW_UPS.work,
    },
    {
      key: 'friction',
      ask: second ? `${second.question}` : 'Where do things most often slow down, get stuck, or fall through the cracks?',
      why: 'The second-biggest thing in their trade. Where the first question found nothing, this usually does.',
      thenAsk: FOLLOW_UPS.friction,
    },
    {
      key: 'hours',
      ask: 'How many hours a week does that eat, and who is doing it?',
      why: 'THE number. It is what the guarantee is measured against and what the paid work is priced against. Write it down.',
      capture: ['hoursPerWeek', 'whoDoesIt'],
      thenAsk: FOLLOW_UPS.hours,
    },
    {
      key: 'wand',
      ask: 'If that one thing ran itself, what would change for you?',
      why: 'Confirms it is worth solving. An answer with no weight in it means you have found a chore, not a problem.',
    },
  ];
}

// What to say to close the call. Names the problem back to them and books the
// second conversation. Nothing is prescribed.
function closingLine(answers = {}) {
  const hours = answers.hoursPerWeek;
  const what = String(answers.friction || answers.repetition || 'that').trim();
  const leak = hours
    ? `the ${hours} hours a week going into ${what.toLowerCase()}`
    : what.toLowerCase();
  // Russ's own words for how the call ends, 2026-08-28: "I'll research this
  // and find the best tool for you and return with my free recommendation and
  // why." The word FREE has to be in it — it is what makes the second call
  // something they agreed to rather than something they were sold.
  return `It sounds like the real leak is ${leak}. Give me a couple of days to research this and find the best tool for you, and I'll come back with my recommendation and why — free, either way.`;
}

// Between the two calls: which kinds of work to look at, given what they said.
// Their trade's own four come first, then anything else the lever points at.
function whereToLook(trade, lever) {
  const own = BY_TRADE[String(trade || 'other').toLowerCase()] || BY_TRADE.other;
  const byLever = (LEVERS[lever] || {}).lookAt || [];
  const seen = new Set();
  const order = [];
  // What matters in their trade AND matches what they asked for, first.
  for (const t of own) if (byLever.includes(t) && !seen.has(t)) { seen.add(t); order.push(t); }
  // Then the rest of their trade's own.
  for (const t of own) if (!seen.has(t)) { seen.add(t); order.push(t); }
  // Then anything else the lever points at.
  for (const t of byLever) if (!seen.has(t)) { seen.add(t); order.push(t); }
  return order.map((t) => ({ type: t, ...TYPES[t] }));
}

// Is this call finished? Not a judgement — the four things that have to be on
// the record before Russ can do the homework.
function whatIsMissing(answers = {}) {
  const need = [
    ['lever', 'what they actually want'],
    ['repetition', 'the work they repeat'],
    ['hoursPerWeek', 'how many hours it eats'],
    ['whoDoesIt', 'who is doing it'],
  ];
  return need.filter(([k]) => !answers[k] && answers[k] !== 0).map(([, label]) => label);
}

// ---------------------------------------------------------------------------
// The second call — the prescription.
//
// The first call found the bottleneck. This one delivers the fix, free, as
// promised. Three things go into it and nothing else: what the tool is, what
// it costs, and the first thing they do this week.
//
// Then the door opens. This one sentence is what turns a free fifteen minutes
// into a paying client, and it works because it offers two ways to say yes
// rather than one way to say no.
const DOOR = [
  'I can hand this off so you can run with it, or I can set it up with you so it is working by next week. Want me to put together what that would look like?',
  'You can take this and run with it, or I can put it in for you and have it working next week. Shall I write up what that would take?',
  'That is yours either way. If you would rather not do it yourself, I can set it up with you and have it running by next week. Want me to price that?',
];

// Which bottleneck to fix, when the call surfaced more than one.
//
// Corey's rule is frequency times friction, weighted toward the lever they
// chose. The weighting is the part that matters: fixing the most painful thing
// is worth nothing if it is not the thing they said they cared about.
function pickTheOne(candidates = [], lever) {
  const wanted = new Set(((LEVERS[lever] || {}).lookAt) || []);
  return [...candidates].sort((a, b) => {
    const score = (c) => (Number(c.hoursPerWeek) || 0) * (wanted.has(c.type) ? 2 : 1);
    return score(b) - score(a);
  })[0] || null;
}

// What has to be ready before the second call. Not a judgement — the three
// things Corey says to walk in with, and the one thing that opens the door.
function whatIsMissingForTheFix(fix = {}) {
  const need = [
    ['tool', 'what the fix is'],
    ['cost', 'what it costs'],
    ['firstStep', 'the first thing they do this week'],
  ];
  return need.filter(([k]) => !fix[k]).map(([, label]) => label);
}

module.exports = {
  LEVERS, DOOR, FOLLOW_UPS, FOLLOW_UP_SET, questionsFor, closingLine, whereToLook, whatIsMissing,
  pickTheOne, whatIsMissingForTheFix,
};
