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
  // The strongest opening there is: they run more than one thing, so the
  // hours are multiplied and nobody else writing to them has noticed.
  runs_several_businesses:
    'I gather you have more than one business going, which usually means the same office work landing on you twice over.',
  hiring_several_office_roles:
    'I noticed you have more than one office role open at the moment.',
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
  'runs_several_businesses', 'hiring_several_office_roles', 'hiring_admin_role',
  'downloadable_forms', 'no_website', 'fax_listed', 'no_online_booking', 'no_customer_portal',
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
  runs_several_businesses:
    'Each one has its own {work} and its own version of the same admin, and the hours do not add up so much as double.',
  hiring_several_office_roles:
    'Before you fill either, it is worth knowing how much of both jobs is {work}, because that part mostly stops needing a person once it is set up properly.',
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
  runs_several_businesses:
    'Each one carries its own version of the same admin, and the hours do not add up so much as double.',
  hiring_several_office_roles:
    'Before you fill either, it is worth knowing how much of both jobs is work that does not need a person once it is set up properly.',
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
  runs_several_businesses: 'Both of your businesses, {business}',
  hiring_several_office_roles: 'The office roles you are hiring for',
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
// Russ's own words for who he is, kept at three registers. The substance is
// identical and it is his: a career in senior management and working for
// himself, across sales, marketing and operations, in finance, construction
// and building AI platforms — and having personally hit almost every
// frustration the person reading this has.
const CREDIBILITY = {
  FORMAL: 'My own career has been split between senior management and working for myself, across sales, marketing and operations, in finance, construction and building AI platforms. I have run into almost every frustration a manager runs into, and what I build now comes out of that rather than out of a textbook.',
  NEUTRAL: "I've spent my career between senior management and running my own thing, in sales, marketing and operations, across finance, construction and building AI platforms, so I've hit just about every frustration you can hit in a management seat, and what I build now comes straight out of that.",
  PLAIN: "I've spent my career in senior management and running my own shops, in sales, marketing and operations, across finance, construction and AI platforms. I've hit just about every frustration you can hit, and what I build now comes out of that.",
};

const BODY = `Hi {greeting},

{intro}

{opener} {followOn}

{credibility} {whatIDo} In your case that would probably look like {valueIn}.

{guarantee}

{yearLine}

{close}

Best regards,
Russ Wright
Founder
VisionAIry
503-621-8000 · russ@visionairy.biz
VisionAIry.biz · LinkedIn`;

// ---------------------------------------------------------------------------
// the second and third touch
//
// One email gets a reply rate. Three gets roughly three times it, and the
// later ones are where most replies actually come from. Each is shorter than
// the last, each says something new, and none of them says "just following up"
// or "circling back", which are the two phrases that tell a reader they are on
// a list.

const FOLLOW_UP_DAYS = [0, 4, 11];   // first contact, then four days, then a week later

const SECOND_TOUCH = {
  subject: 'The bit I should have led with, {business}',
  body: `Hi {greeting},

I wrote last week about {shortTell}, and I think I led with the wrong thing.

Here is what I actually meant. {recognition}

I have been inside enough businesses like yours over the years to know that costs somewhere around {cost}, and that almost nobody has ever added it up.

{priceLine}

There is not much to weigh up, really. Either you get the hours back, or you find out for nothing.

Best regards,
Russ Wright
Founder
VisionAIry
503-621-8000 · russ@visionairy.biz
VisionAIry.biz · LinkedIn`,
};

const THIRD_TOUCH = {
  subject: 'Closing the loop, {business}',
  body: `Hi {greeting},

Last one from me, and no hard feelings either way.

If the timing is wrong, say the word and I will make a note for the spring rather than keep writing.

If it is not the timing but the idea, I would genuinely like to know that too. It is useful either way, and I would rather hear a no than keep guessing.

Best regards,
Russ Wright
Founder
VisionAIry
503-621-8000 · russ@visionairy.biz
VisionAIry.biz · LinkedIn`,
};

// A short way of naming what was noticed, for the second message.
const SHORT_TELLS = {
  runs_several_businesses: 'the fact you run more than one business',
  hiring_several_office_roles: 'the office roles you were advertising',
  hiring_admin_role: 'the office role you were advertising',
  no_website: 'how much comes to you by phone',
  downloadable_forms: 'the forms on your site',
  fax_listed: 'the fax number on your site',
  no_online_booking: 'booking by phone',
  no_customer_portal: 'questions landing with your front desk',
};

// A business that has been going thirty years has seen every version of this,
// and saying so is the least generic sentence in the whole message. Only used
// where their own site states it.
function longevityLine(prospect) {
  const y = prospect.yearsInBusiness;
  if (!y || y < 8) return '';
  const town = (String(prospect.address || '').match(/,\s*([A-Za-z ]+),\s*OR/) || [])[1];
  const where = town ? ` in ${town.trim()}` : ' in Central Oregon';
  if (y >= 40) return `Forty-odd years${where} means you have seen every version of this, so I will be brief. `;
  if (y >= 25) return `${y} years${where} is a long time to have watched the paperwork change. `;
  return `${y} years${where}, so none of this will be news to you. `;
}

// What they already pay for stays OUT of a cold message.
//
// The test is whether they chose to put it in the world. A fax number, a
// booking page, forty years on the homepage — all published, and noticing is
// flattering. The software behind their site was never broadcast, and naming
// it reads as somebody who went looking rather than somebody who looked. It
// stays on the card, for the call, where they are already talking to you.
function toolsLine() { return ''; }

// The same information, for Russ's eyes only, on the card and before a call.
function toolsNoteForRuss(prospect) {
  const tools = String(prospect.toolsInUse || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (!tools.length) return null;
  return `They already run ${tools.slice(0, 3).join(', ')}. Worth raising on the call, not in writing — they never published it.`;
}

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
  // The trade settled from their own website beats one guessed from the name.
  const trade = prospect.trade || tradeOf(prospect.name);
  const work = TRADE_WORK[trade];
  if (!work || !TRADE_FOLLOW_ONS[key]) return { line: FOLLOW_ONS[key], trade: null };
  return { line: TRADE_FOLLOW_ONS[key].replace('{work}', work), trade };
}

// The guarantee, in their own numbers where we know their team size. Ten hours
// is the floor at every band, so it is safe wherever the size is unknown.
// What an hour of Central Oregon staff time actually costs, wage plus
// overhead. Sourced in the business model; it is what makes the return 21x at
// every band. Not the $100 per guaranteed hour the FEE is set from.
const HOURLY_VALUE = 39.80;

const WORDS = { 10: 'ten', 15: 'fifteen', 20: 'twenty', 25: 'twenty-five', 35: 'thirty-five',
  50: 'fifty', 75: 'seventy-five', 100: 'a hundred', 150: 'a hundred and fifty' };
const MONTHS = { 520: 'three months', 780: 'four and a half months', 1040: 'six months',
  1300: 'seven and a half months', 1820: 'ten months', 2600: 'a year and a quarter',
  3900: 'nearly two years', 5200: 'two and a half years', 7800: 'nearly four years' };

// What the band means for this business. Ten hours is the floor everywhere, so
// it is safe wherever the team size is unknown.
function bandFacts(prospect) {
  const { resolveField } = require('../overrides.js');
  const count = resolveField(prospect, 'employeeCount');
  if (count) {
    const { bandForEmployeeCount } = require('../rules.js');
    const b = bandForEmployeeCount(count);
    if (b && b.guaranteedHours && b.auditFee) {
      const yearHours = b.guaranteedHours * 52;
      return { hours: b.guaranteedHours, fee: b.auditFee, yearHours, known: true,
        hoursWord: WORDS[b.guaranteedHours] || String(b.guaranteedHours),
        months: MONTHS[yearHours] || 'a good stretch' };
    }
  }
  return { hours: 10, fee: null, yearHours: 520, known: false, hoursWord: 'ten', months: 'three months' };
}

// The guarantee, in their own hours. No price in a first approach — Russ's own
// edit struck one out, and a number with no context becomes the whole
// conversation.
function guaranteeFor(prospect, seed) {
  const V = require('./variants.js');
  const f = bandFacts(prospect);
  return V.pick(V.GUARANTEE, seed, 'guarantee').replace(/\{hours\}/g, f.hoursWord);
}

// The hours as a slice of a working life, which cannot be argued with the way
// a dollar figure can.
function yearLineFor(prospect, seed) {
  const V = require('./variants.js');
  const f = bandFacts(prospect);
  return V.pick(V.YEAR_FRAMING, seed, 'year')
    .replace(/\{hours\}/g, f.hoursWord)
    .replace(/\{yearHours\}/g, f.yearHours.toLocaleString())
    .replace(/\{months\}/g, f.months);
}

// A guarantee that starts with a number reads as a fragment unless the first
// letter is lifted: "fifty hours a week back" becomes "Fifty hours a week back".
function sentenceCase(t) {
  const s = String(t).trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function draftFirstContact(prospect, signals = []) {
  const key = chooseOpener(signals);
  if (!key) return null;
  const { registerFor, OPENING_BY_REGISTER, CLOSING_BY_REGISTER } = require('./register.js');
  const business = String(prospect.name || 'your business').replace(/, (LLC|Inc|Ltd)\.?$/i, '');
  const { line, trade } = followOnFor(key, prospect);
  // Meet them where they write. His tone never moves; only the ceremony does.
  const register = registerFor(prospect.selfDescription);
  const subject = (SUBJECTS[key] || SUBJECTS.default).replace(/\{business\}/g, business);
  // Two dentists both still listing a fax number were getting near-identical
  // letters, and in a town this size they might know each other. Each fixed
  // line has four wordings, chosen by the business's own name so it is the
  // same for them every time and different across the list.
  const V = require('./variants.js');
  const seed = business;
  const body = BODY
    .replace('{greeting}', greetingFor(prospect))
    .replace('{intro}', V.pick(V.OPENINGS[register], seed, 'intro'))
    .replace('{opener}', longevityLine(prospect) + (V.TELL_WORDINGS[key] ? V.pick(V.TELL_WORDINGS[key], seed, `tell:${key}`) : OPENERS[key]))
    .replace('{followOn}', line + toolsLine(prospect))
    .replace('{credibility}', CREDIBILITY[register])
    .replace('{whatIDo}', V.pick(V.WHAT_I_DO, seed, 'what'))
    .replace('{guarantee}', sentenceCase(guaranteeFor(prospect, seed)))
    .replace('{yearLine}', sentenceCase(yearLineFor(prospect, seed)))
    .replace('{close}', V.pick(V.CLOSES[register], seed, 'close'))
    .replace('{valueIn}', require('./painPoints.js').painFor(trade || 'other').valueIn)
    .replace(/\{business\}/g, business);
  return { subject, body, openedWith: key, trade, register };
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
  const pain = painFor(prospect.trade || tradeOf(prospect.name));
  const V2 = require('./variants.js');
  const f = bandFacts(prospect);
  // The price belongs HERE, not in a first approach — by now they have read
  // something honest, and the number arrives with context around it.
  const priceLine = f.known
    ? V2.pick(V2.PRICE_FRAMING, prospect.name || '', 'price')
      .replace(/\{fee\}/g, `$${f.fee.toLocaleString()}`)
      .replace(/\{yearHours\}/g, f.yearHours.toLocaleString())
      .replace(/\{value\}/g, `$${Math.round(f.yearHours * HOURLY_VALUE).toLocaleString()}`)
    : `The audit is priced off the size of your team. At the smallest band it buys back ${f.yearHours.toLocaleString()} hours a year, which is around $${Math.round(f.yearHours * HOURLY_VALUE).toLocaleString()} of time at what people actually cost around here.`;
  const body = t.body
    .replace('{priceLine}', priceLine)
    .replace('{greeting}', greetingFor(prospect))
    .replace('{shortTell}', SHORT_TELLS[openedWith] || 'the admin hours in your office')
    .replace('{recognition}', pain.recognition)
    .replace('{cost}', pain.cost)
    .replace('{lever}', pain.lever)
    .replace(/\{business\}/g, business);
  return { subject: t.subject.replace(/\{business\}/g, business), body, openedWith: `touch_${touch}` };
}

module.exports = {
  CREDIBILITY, longevityLine, toolsLine, toolsNoteForRuss, bandFacts, yearLineFor,
  FOLLOW_UP_DAYS, SECOND_TOUCH, THIRD_TOUCH, SHORT_TELLS,
  draftFollowUpTouch,
  OPENERS, FOLLOW_ONS, TRADE_WORK, TRADE_FOLLOW_ONS, OPENER_ORDER, SUBJECTS, BODY, followOnFor,
  chooseOpener, greetingFor, draftFirstContact, draftLinkedIn,
};
