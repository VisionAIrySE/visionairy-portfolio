// The first-contact message.
//
// Written once in Russ's voice, approved once, then sent to every business
// with only their own facts changed. Nothing here is generated per business —
// the wording is fixed, and only the opening observation moves.
//
// The voice is taken from Russ's own rewrites in ~/.claude/voice/samples/,
// the cold-outreach one in particular:
//   · greet by name with "Hi"
//   · one concrete thing about THEM before any explanation
//   · say what they GET, never what the software does
//   · no price in a first approach - his own edit removed one
//   · close warm and open, no meeting request
//   · American spelling

// The opening line, in the business's own terms. Ordered: the loudest tell
// that is also the least awkward to say out loud goes first.
const OPENERS = {
  hiring_admin_role:
    'I noticed you have an opening for an office role at the moment.',
  no_website:
    "I noticed you don't have a website, which usually means every question a customer has comes to you by phone.",
  downloadable_forms:
    'I noticed your forms are PDFs that people print out and fill in by hand.',
  fax_listed:
    'I noticed you still list a fax number.',
  no_online_booking:
    "I noticed there's no way to book with you online, so every appointment has to come through somebody on the phone.",
  no_customer_portal:
    "I noticed your customers don't have a login of their own, so every status question lands with your front desk.",
};
// Preference order when a business shows more than one.
const OPENER_ORDER = [
  'hiring_admin_role', 'downloadable_forms', 'no_website', 'fax_listed',
  'no_online_booking', 'no_customer_portal',
];

// The paperwork each trade actually does. This is what turns "I noticed you
// still list a fax number" into a sentence that sounds like somebody looked.
// A trade we cannot name falls back to the general line, which is still true.
const TRADE_WORK = {
  trades: 'service tickets and scheduling between the office and the trucks',
  construction: 'change orders, submittals and lien waivers',
  'real estate': 'listing paperwork, disclosures and chasing signatures',
  medical: 'records requests, referrals and insurance claims',
  dental: 'insurance claims, treatment plans and recall reminders',
  legal: 'engagement letters, discovery and filings',
  accounting: 'client documents, engagement letters and filings',
  insurance: 'applications, certificates and renewals',
  auto: 'estimates, approvals and parts ordering',
  'storage & logistics': 'rental agreements, bills of lading and dispatch paperwork',
  landscaping: 'estimates, scheduling and seasonal contracts',
  staffing: 'applications, timesheets and placements',
  'retail & food': 'orders, invoices and staff scheduling',
  manufacturing: 'quotes, work orders and shipping paperwork',
};

// How each opening lands once we know the trade. {work} is their own
// paperwork, and every line is written so it reads properly with any of them.
const TRADE_FOLLOW_ONS = {
  hiring_admin_role:
    "Before you fill it, it's worth knowing how much of that job is {work}, and how much of that stops needing a person at all once it is set up properly.",
  no_website:
    'Every one of those calls is somebody stopping what they were doing, on top of {work}, and it adds up faster than it feels like it should.',
  downloadable_forms:
    // Not "by hand" again — the opening line already said it.
    'Somebody is then retyping every one of those, on top of {work}, and that is usually hours a week nobody has ever added up.',
  fax_listed:
    // Phrased to sit before the list rather than after it — "{work} is still
    // moving" reads wrong the moment the trade's paperwork is plural.
    'That usually means paper is still moving somewhere between you and your customers, most likely {work}, and someone is handling every piece of it by hand.',
  no_online_booking:
    "That's fine when it's quiet, but your busiest days are the ones where somebody is tied to the phone on top of {work}.",
  no_customer_portal:
    'Every "where are we at" question lands with your front desk rather than answering itself, on top of {work}.',
};

// What each opening leads into — one sentence, always about what THEY lose,
// never about what software does.
const FOLLOW_ONS = {
  hiring_admin_role:
    "Before you fill it, it's worth knowing how much of that role is work that doesn't need a person at all, because in most offices I look at it's more than the owner expects.",
  no_website:
    'Every one of those calls is somebody on your team stopping what they were doing, and it adds up faster than it feels like it should.',
  downloadable_forms:
    "Somebody is retyping those into whatever system you keep them in, and that's usually hours a week nobody has ever added up.",
  fax_listed:
    "That usually means there's a paper trail somewhere between you and your customers that someone is handling by hand.",
  no_online_booking:
    "That's fine when it's quiet, but it means your busiest days are the ones where somebody is tied to the phone instead of doing the work.",
  no_customer_portal:
    "Every one of those is a small interruption, and they're the hardest hours to see because no single one of them feels like a problem.",
};

const SUBJECTS = {
  hiring_admin_role: 'About the office role you are hiring for',
  no_website: 'A thought about the calls coming into {business}',
  downloadable_forms: 'The forms on your site',
  fax_listed: 'A question about how {business} handles paperwork',
  no_online_booking: 'About the phone at {business}',
  no_customer_portal: 'A thought about your front desk',
  default: 'A thought about the admin hours at {business}',
};

// The fixed body. {greeting}, {opener}, {followOn} and {business} are the only
// things that move.
// Who he is, in one line, without a resume. The point is that he has run the
// jobs he is offering to fix, so he is not a software person guessing at how
// an office works. Options were written and Russ picked; the others are kept
// here so a change is a one-word edit rather than a rewrite.
const CREDIBILITY = {
  done_the_jobs: 'I have carried a bag, run the ops desk and built businesses from nothing, so I am not a software person guessing at how your week goes.',
  decades: 'Before this I spent decades running sales, service and operations, in start-ups and in some of the largest companies in their field, so I know what the work actually looks like from the inside.',
  short: 'I have run sales and operations for a living, so I am not a software person guessing at how your week goes.',
};
const CREDIBILITY_LINE = CREDIBILITY.decades;

const BODY = `Hi {greeting},

I'm local to Central Oregon and I build software that takes repetitive office work off people's plates, and rather than describe it I'd rather point at something specific.

{opener} {followOn}

{credibility} What I actually do is spend a week inside an operation and come back with a plain list of where the hours are going, which of them can be fixed with tools that already exist, and which would need something built. You get the whole picture in your hands either way, and if I can't find at least ten hours a week your team could have back, you don't pay me.

I'm not asking for a meeting, I'd just welcome the chance to share more if it's useful!

Russ Wright
Visionairy
russ@visionairy.biz`;

// ---------------------------------------------------------------------------
// the second and third touch
//
// One email gets a reply rate. Three gets roughly three times it, and the
// later ones are where most replies actually come from. Each is shorter than
// the last, each says something new, and none of them says "just following up"
// or "bumping this to the top of your inbox", which are the two phrases that
// tell a reader they are on a list.

const FOLLOW_UP_DAYS = [0, 4, 11];   // first contact, then four days, then a week later

const SECOND_TOUCH = {
  subject: 'The bit I should have led with, {business}',
  body: `Hi {greeting},

I wrote last week about {shortTell}, and I think I led with the wrong thing.

Here is what I actually meant. {recognition}

I have been inside enough businesses like yours over the years to know that costs somewhere around {cost}, and that almost nobody has ever added it up. That is the whole reason I do this as a week rather than a quote, and why you do not pay if the hours are not there. There is nothing to weigh up, really. You either get the hours back or you find out for nothing.

Russ Wright
Visionairy
russ@visionairy.biz`,
};

const THIRD_TOUCH = {
  subject: 'Closing the loop, {business}',
  body: `Hi {greeting},

Last one from me, and no hard feelings either way.

If the timing is wrong, say the word and I will make a note for the spring rather than keep writing.

If it is not the timing but the idea, I would genuinely like to know that too. It is useful either way, and I would rather hear a no than keep guessing.

Russ Wright
Visionairy
russ@visionairy.biz`,
};

// A short way of naming what was noticed, for the second message.
const SHORT_TELLS = {
  hiring_admin_role: 'the office role you were advertising',
  no_website: 'how much comes to you by phone',
  downloadable_forms: 'the forms on your site',
  fax_listed: 'the fax number on your site',
  no_online_booking: 'booking by phone',
  no_customer_portal: 'questions landing with your front desk',
};

// Pick the tell this message should lead with.
function chooseOpener(signals = []) {
  const names = signals.map((s) => (typeof s === 'string' ? s : s.signal));
  for (const key of OPENER_ORDER) if (names.includes(key)) return key;
  return null;
}

// "Hi Dale," when we know who owns it, "Hi there," when we don't. Never a
// bare name — Russ's own edit put the greeting back in.
function greetingFor(prospect) {
  const { nameFromEmail, firstNameOf } = require('./names.js');
  // A name we were told beats a name we worked out.
  const known = firstNameOf(prospect.contactName) || firstNameOf(prospect.ownerName);
  if (known) return known;
  // "dale@..." is Dale, but only when it is genuinely a name.
  const fromAddress = nameFromEmail(prospect.emailManualValue || prospect.email);
  return fromAddress || 'there';
}

// Build one message for one business. Returns null when there is nothing
// specific to open with — a message with no observation in it is a form
// letter, and those do not get sent.
// The sentence after the observation. Uses their own trade's paperwork when we
// can name it, and the general version when we cannot — never a guess.
function followOnFor(key, prospect) {
  const { tradeOf } = require('./queues.js');
  const trade = tradeOf(prospect.name);
  const work = TRADE_WORK[trade];
  if (!work || !TRADE_FOLLOW_ONS[key]) return { line: FOLLOW_ONS[key], trade: null };
  return { line: TRADE_FOLLOW_ONS[key].replace('{work}', work), trade };
}

function draftFirstContact(prospect, signals = []) {
  const key = chooseOpener(signals);
  if (!key) return null;
  const business = String(prospect.name || 'your business').replace(/, (LLC|Inc|Ltd)\.?$/i, '');
  const { line, trade } = followOnFor(key, prospect);
  const subject = (SUBJECTS[key] || SUBJECTS.default).replace(/\{business\}/g, business);
  const body = BODY
    .replace('{greeting}', greetingFor(prospect))
    .replace('{opener}', OPENERS[key])
    .replace('{followOn}', line)
    .replace('{credibility}', CREDIBILITY_LINE)
    .replace(/\{business\}/g, business);
  return { subject, body, openedWith: key, trade };
}

// The LinkedIn version: shorter, same observation, same close. Never sent by
// the engine — this is what Russ pastes by hand.
function draftLinkedIn(prospect, signals = []) {
  const key = chooseOpener(signals);
  if (!key) return null;
  const { line } = followOnFor(key, prospect);
  const body = `Hi ${greetingFor(prospect)}, I'm local to Central Oregon and I build software that takes repetitive office work off people's plates.

${OPENERS[key]} ${line}

I spend a week inside an operation and come back with a list of where the hours are going and what can be fixed. If I can't find at least ten hours a week, you don't pay.

Happy to share more if it's useful!`;
  return { subject: null, body, openedWith: key };
}

// Build the second or third message for a business, given what the first one
// opened on. Returns null when there is nothing honest to say.
function draftFollowUpTouch(prospect, openedWith, touch) {
  const { tradeOf } = require('./queues.js');
  if (touch !== 2 && touch !== 3) return null;
  const business = String(prospect.name || 'your business').replace(/, (LLC|Inc|Ltd)\.?$/i, '');
  const t = touch === 2 ? SECOND_TOUCH : THIRD_TOUCH;
  const { painFor } = require('./painPoints.js');
  const pain = painFor(tradeOf(prospect.name));
  const body = t.body
    .replace('{greeting}', greetingFor(prospect))
    .replace('{shortTell}', SHORT_TELLS[openedWith] || 'the admin hours in your office')
    .replace('{recognition}', pain.recognition)
    .replace('{cost}', pain.cost)
    .replace('{lever}', pain.lever)
    .replace(/\{business\}/g, business);
  return { subject: t.subject.replace(/\{business\}/g, business), body, openedWith: `touch_${touch}` };
}

module.exports = {
  CREDIBILITY, CREDIBILITY_LINE,
  FOLLOW_UP_DAYS, SECOND_TOUCH, THIRD_TOUCH, SHORT_TELLS,
  draftFollowUpTouch,
  OPENERS, FOLLOW_ONS, TRADE_WORK, TRADE_FOLLOW_ONS, OPENER_ORDER, SUBJECTS, BODY, followOnFor,
  chooseOpener, greetingFor, draftFirstContact, draftLinkedIn,
};
