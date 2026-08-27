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
//
// Only something somebody actually READ off their page belongs here. Two
// openings were dropped on 2026-08-26 — "no way to book online" and "no
// customer login" — because both fired when the website reader failed to FIND
// the words, not when the thing was genuinely absent. Between them they opened
// two thirds of the list, much of it at businesses nobody books in the first
// place. Where nothing was verified the message now opens with the trade's own
// week, which is true everywhere and cannot be wrong. See tradeOpening.js.
const OPENER_ORDER = [
  'runs_several_businesses', 'hiring_several_office_roles', 'hiring_admin_role',
  'downloadable_forms', 'no_website', 'fax_listed',
];
// Never leave a message with no opening: the trade's week is always available.
const TRADE_WEEK = 'trade_week';
// Openings that fire on an ABSENCE rather than on something read. Never allowed
// to open a message; named here so a check can prove they stay gone.
const BANNED_OPENERS = ['no_online_booking', 'no_customer_portal'];

// The paperwork each trade actually does. This is what turns "I noticed you
// still list a fax number" into a sentence that sounds like somebody looked.
// A trade we cannot name falls back to the general line, which is still true.
const TRADE_WORK = {
  trades: 'service tickets and scheduling between the office and the trucks',
  construction: 'change orders, submittals and lien waivers',
  'real estate': 'listing paperwork, disclosures and chasing signatures',
  medical: 'records requests, referrals and insurance claims',
  dental: 'insurance claims, treatment plans and recall reminders',
  veterinary: 'records, reminders and everything landing on the front desk',
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
  // These used to name the trade's paperwork, and then the line underneath
  // named it again two sentences later. Each part does one job now: this one
  // says what the tell COSTS them, and the line below shows he knows their
  // world (Russ, 2026-08-26 — "each message should resonate with them in
  // their individual business and industry").
  runs_several_businesses:
    'Each one carries its own version of the same admin, so the hours do not add up so much as double.',
  hiring_several_office_roles:
    'Before you fill either, it is worth knowing how much of both jobs stops needing a person once it is set up properly.',
  hiring_admin_role:
    "Before you fill it, it's worth knowing how much of that job stops needing a person at all once it is set up properly.",
  no_website:
    'Every one of those calls is somebody stopping what they were doing, and it adds up faster than it feels like it should.',
  downloadable_forms:
    'Somebody is then retyping every one of those, and that is usually hours a week nobody has ever added up.',
  fax_listed:
    // NOT "paper is still moving" — plenty of businesses run a digital fax
    // service and there is no paper anywhere. What holds either way is that a
    // faxed document arrives as a picture of a page, which nothing can read
    // and somebody has to type in (Russ caught this, 2026-08-26).
    // Russ's own wording: a faxed page is an IMAGE, so it either gets typed in
    // by hand or filed away as a picture nobody can search (2026-08-26).
    'Machine or digital service, what arrives is a picture of a page, so somebody types it in by hand or it gets filed where nobody can search it.',
  no_online_booking:
    "That's fine when it's quiet. Your busiest days are the ones where somebody is tied to the phone instead of the work.",
  no_customer_portal:
    'Every "where are we at" question lands with your front desk rather than answering itself.',
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
  fax_listed: 'The paperwork coming into {business}',
  no_online_booking: 'About the phone at {business}',
  no_customer_portal: 'A thought about your front desk',
  default: 'A thought about the admin hours at {business}',
};

// The one line that proves this was written for THEM and not for a list.
// A law firm has clients, a dental practice has patients, a garage has
// customers. Getting this wrong is the fastest way to look like a circular
// (Russ read one addressed to a law firm about its "customers", 2026-08-26).
const THEIR_PEOPLE = {
  legal: 'clients', accounting: 'clients', 'professional services': 'clients',
  insurance: 'clients', 'real estate': 'clients', staffing: 'clients',
  dental: 'patients', medical: 'patients', veterinary: 'clients',
  'personal care': 'clients', 'fitness & recreation': 'members',
  'nonprofit & community': 'the people you serve', 'lodging & hospitality': 'guests',
};
function theirPeople(trade) { return THEIR_PEOPLE[trade] || 'customers'; }

const TRADE_PLURAL = {
  dental: 'dental practices', medical: 'medical offices', legal: 'law firms',
  accounting: 'accounting firms', insurance: 'insurance agencies',
  'real estate': 'real estate offices', staffing: 'staffing offices',
  construction: 'construction offices', trades: 'trade shops', auto: 'repair shops',
  landscaping: 'landscaping outfits', 'storage & logistics': 'logistics offices',
  'retail & food': 'shops and kitchens', manufacturing: 'manufacturing offices',
  'professional services': 'firms like yours', 'cleaning & facilities': 'cleaning companies',
  'lodging & hospitality': 'places like yours', 'personal care': 'salons and studios',
  'fitness & recreation': 'gyms and studios', 'nonprofit & community': 'nonprofits',
  agriculture: 'farm offices', veterinary: 'veterinary clinics',
};

// What he knows about their TRADE, said as exactly that. Unattributed, it read
// as a claim about their particular office, which he cannot know and which
// lands as a non-sequitur two lines into a cold email (2026-08-26).
function tradeLineFor(trade) {
  const { painFor } = require('./painPoints.js');
  const said = painFor(trade || 'other').recognition;
  const who = TRADE_PLURAL[trade];
  const lower = said.charAt(0).toLowerCase() + said.slice(1);
  return who ? `In most ${who}, ${lower}` : `In most offices, ${lower}`;
}
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
  // Reassurance at the end, not a resume in the middle. The long version ran
  // five lines and Russ read it back to me (2026-08-26).
  FORMAL: 'My career has been split between senior management and working for myself, across finance, construction and building AI platforms. I have run into almost every frustration a manager runs into, and what I build now comes out of that.',
  NEUTRAL: "I've spent my career in senior management and running my own businesses, across finance, construction and AI. I've hit most of the frustrations you can hit in a management seat, and what I build now comes out of that.",
  PLAIN: "I've spent my career in senior management and running my own shops, across finance, construction and AI. I've hit most of the frustrations you can hit, and what I build now comes out of that.",
};


const BODY = `Hi {greeting},

{opener} {followOn} {tradeLine}

{whatIDo} For you that probably looks like {valueIn}.

{guarantee} {costAnchor} {yearLine}

{intro} {credibility}

{close}

Best regards,
Russ Wright
Founder
VisionAIry
503-621-8000 · russ@visionairy.biz
VisionAIry.biz · LinkedIn
Grab a time on my calendar: https://calendly.com/visionairy`;

// ---------------------------------------------------------------------------
// the second and third touch
//
// One email gets a reply rate. Three gets roughly three times it, and the
// later ones are where most replies actually come from. Each is shorter than
// the last, each says something new, and none of them says "just following up"
// or "circling back", which are the two phrases that tell a reader they are on
// a list.

const FOLLOW_UP_DAYS = [0, 4, 8];   // first contact, four days, then eight (Russ, 2026-08-26)

const SIGN_OFF = `Best regards,
Russ Wright
Founder
VisionAIry
503-621-8000 · russ@visionairy.biz
VisionAIry.biz · LinkedIn
Grab a time on my calendar: https://calendly.com/visionairy`;

// Four days after the first, not a week — an earlier version said "I wrote
// last week" on day four. It also opened with "I think I led with the wrong
// thing", which is a sales trick and undercuts the message it follows, and
// claimed he goes "inside" businesses, which contradicts the first message
// (Russ read the sequence, 2026-08-26).
const SECOND_TOUCH = {
  subject: 'The part that matters, {business}',
  body: `Hi {greeting},

I wrote a few days ago about {shortTell}. Here's the part that matters.

{recognition}

In places like yours that's usually {cost}, and almost nobody has ever added it up.

{priceLine}

Either you get the hours, or you find out for nothing.

Worth a look? Reply, or grab a time on my calendar below.

${SIGN_OFF}`,
};

// The last one. It still carries the offer in a line, because plenty of people
// only ever read the third email.
const THIRD_TOUCH = {
  subject: 'Closing the loop, {business}',
  body: `Hi {greeting},

Last one from me, and no hard feelings either way.

If it's the timing, say so and I'll make a note to check back rather than keep writing.

If it's the idea, I'd genuinely like to know. I'd rather hear a no than keep guessing.

And if you'd rather just see it than read about it: the tools, how to put them in, and at least {hours} hours a week back for your team, or your money returns. The calendar is below.

${SIGN_OFF}`,
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
  // A COUNT of years, not the year they opened — the website reader converts
  // "since 1994" before it stores anything. Guarded anyway: a raw year
  // slipping through here would tell a thirty-year-old shop it has been
  // around for forty-odd, in writing, to a stranger.
  const y = prospect.yearsInBusiness;
  if (!y || y < 8 || y > 120) return '';
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

// Pick the tell this message should lead with. Something read off their own
// page wins; otherwise the trade's week, which is always available and always
// true. Nothing that fires on an absence can ever be chosen.
function chooseOpener(signals = []) {
  const names = signals.map((s) => (typeof s === 'string' ? s : s.signal));
  for (const key of OPENER_ORDER) if (names.includes(key)) return key;
  return TRADE_WEEK;
}

// "Hi Dale," when we know who owns it. When we do not, the greeting drops the
// name rather than saying "Hi there," which reads like a circular the moment
// somebody reads it cold (2026-08-26).
function greetingFor(prospect) {
  const { nameFromEmail, firstNameOf } = require('./names.js');
  // A name we were told beats a name we worked out.
  const known = firstNameOf(prospect.contactName) || firstNameOf(prospect.ownerName);
  if (known) return known;
  // "dale@..." is Dale, but only when it is genuinely a name.
  const fromAddress = nameFromEmail(prospect.emailManualValue || prospect.email);
  return fromAddress || null;
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
// No hourly dollar value lives here any more. Russ sells HOURS, not dollars
// (his instruction, 2026-08-26). A dollar figure invites an argument about
// whose wage was used; hours counted against named tasks cannot be argued.
// $999 is the price floor, and the fee is the only dollar figure that exists.

const WORDS = { 3: 'three', 4: 'four', 5: 'five', 6: 'six', 8: 'eight',
  10: 'ten', 15: 'fifteen', 20: 'twenty', 25: 'twenty-five', 35: 'thirty-five',
  50: 'fifty', 75: 'seventy-five', 100: 'a hundred', 150: 'a hundred and fifty' };
const MONTHS = { 156: 'a working month', 208: 'five weeks', 260: 'six weeks',
  312: 'two months', 416: 'two and a half months',
  520: 'three months', 780: 'four and a half months', 1040: 'six months',
  1300: 'seven and a half months', 1820: 'ten months', 2600: 'a year and a quarter',
  3900: 'nearly two years', 5200: 'two and a half years', 7800: 'nearly four years' };

// What the band means for this business. Ten hours is the floor everywhere, so
// it is safe wherever the team size is unknown.
function bandFacts() {
  // One offer, every business: five hours a week found, or nothing to pay,
  // for $999. Russ, 2026-08-26. Nothing here varies by size or by trade.
  const { THE_OFFER } = require('../industryTiers.js');
  return { ...THE_OFFER, known: true };
}

// The guarantee, in their own hours. No price in a first approach — Russ's own
// edit struck one out, and a number with no context becomes the whole
// conversation.
function guaranteeFor(prospect, seed) {
  const V = require('./variants.js');
  const f = bandFacts(prospect);
  const word = f.hoursWord;
  const Word = word.charAt(0).toUpperCase() + word.slice(1);
  return V.pick(V.GUARANTEE, seed, 'guarantee')
    .replace(/\{Hours\}/g, Word)
    .replace(/\{hours\}/g, word);
}

// The hours as a slice of a working life, which cannot be argued with the way
// a dollar figure can.
function yearLineFor(prospect, seed) {
  const V = require('./variants.js');
  const f = bandFacts(prospect);
  // "Thirty-five hours a week does not sound like much" is absurd. That
  // wording only works while the weekly number is genuinely small, so above
  // ten hours the wordings that lean on it are dropped.
  const wordings = f.hours > 10
    ? V.YEAR_FRAMING.filter((w) => !/does not sound like much/.test(w))
    : V.YEAR_FRAMING;
  const Word = f.hoursWord.charAt(0).toUpperCase() + f.hoursWord.slice(1);
  return V.pick(wordings, seed, 'year')
    .replace(/\{Hours\}/g, Word)
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
  const TO = require('./tradeOpening.js');
  const business = String(prospect.name || 'your business').replace(/, (LLC|Inc|Ltd)\.?$/i, '');
  const { line } = followOnFor(key, prospect);
  // Settle the trade here rather than taking it from the follow-on, which
  // reports null whenever the chosen opening has no trade-specific wording —
  // and that made every trade-led message fall back to the general line
  // (2026-08-26).
  const { tradeOf } = require('./queues.js');
  const trade = prospect.trade || tradeOf(prospect.name);
  // Meet them where they write. His tone never moves; only the ceremony does.
  const register = registerFor(prospect.selfDescription);
  // Where the opening is the trade's own week, the whole first paragraph is
  // that: their week, where it is true, and a guess about them. The follow-on
  // and the trade line both belong to the verified openings and would repeat
  // it word for word here.
  const leadsWithTrade = key === TRADE_WEEK;
  const subject = leadsWithTrade
    ? TO.subjectFor(trade, business)
    // A third of the list carries a web page heading instead of a name, so a
    // subject built from it was unreadable: "The paperwork coming into Hanson
    // & Co PC | CPA Bend Oregon | Accountant Bend Oregon" (2026-08-26).
    : (SUBJECTS[key] || SUBJECTS.default).replace(/\{business\}/g, TO.shortName(business) || 'your office');
  // Two dentists both still listing a fax number were getting near-identical
  // letters, and in a town this size they might know each other. Each fixed
  // line has four wordings, chosen by the business's own name so it is the
  // same for them every time and different across the list.
  const V = require('./variants.js');
  const seed = business;
  const who = greetingFor(prospect);
  const body = BODY
    .replace('Hi {greeting},', who ? `Hi ${who},` : 'Hello,')
    .replace('{intro}', V.pick(V.OPENINGS[register], seed, 'intro'))
    .replace('{opener}', leadsWithTrade
      ? longevityLine(prospect) + TO.openingFor(trade, business, seed, prospect.theirWork)
      : longevityLine(prospect) + (V.TELL_WORDINGS[key] ? V.pick(V.TELL_WORDINGS[key], seed, `tell:${key}`) : OPENERS[key]))
    .replace('{followOn}', leadsWithTrade ? '' : line + toolsLine(prospect))
    .replace('{credibility}', CREDIBILITY[register])
    .replace('{whatIDo}', V.pick(V.WHAT_I_DO, seed, 'what'))
    .replace('{guarantee}', sentenceCase(guaranteeFor(prospect, seed)))
    .replace('{costAnchor}', V.COST_ANCHOR[key] || V.COST_ANCHOR.default)
    .replace('{tradeLine}', leadsWithTrade ? '' : tradeLineFor(trade))
    .replace(/\bcustomers\b/g, theirPeople(trade))
    .replace(/\bcustomer login\b/g, `${theirPeople(trade).replace(/s$/, '')} login`)
    .replace('{yearLine}', sentenceCase(yearLineFor(prospect, seed)))
    .replace('{close}', V.pick(V.CLOSES[register], seed, 'close'))
    .replace('{valueIn}', require('./painPoints.js').painFor(trade || 'other').valueIn)
    .replace(/\{business\}/g, business)
    // The trade opening fills one slot and leaves two empty, which would show
    // as a double space mid-paragraph.
    .replace(/[ \t]+\n/g, '\n')
    .replace(/([^\n]) {2,}/g, '$1 ');
  return { subject, body, openedWith: key, trade, register };
}

// The LinkedIn version: shorter, same observation, same close. Never sent by
// the engine — this is what Russ pastes by hand.
function draftLinkedIn(prospect, signals = []) {
  const key = chooseOpener(signals);
  if (!key) return null;
  const { line } = followOnFor(key, prospect);
  const { painFor } = require('./painPoints.js');
  const { THE_OFFER } = require('../industryTiers.js');
  const TO = require('./tradeOpening.js');
  const { tradeOf } = require('./queues.js');
  const trade = prospect.trade || tradeOf(prospect.name);
  const business = String(prospect.name || 'your business').replace(/, (LLC|Inc|Ltd)\.?$/i, '');
  const who = greetingFor(prospect);
  // Where the opening IS the trade's week, saying it twice reads like a fault.
  const leadsWithTrade = key === TRADE_WEEK;
  const lead = leadsWithTrade
    ? TO.openingFor(trade, business, business, prospect.theirWork)
    : `${OPENERS[key]} ${line}\n\n${painFor(trade || 'other').recognition}`;
  // This had gone stale: it still said "I spend a week inside an operation"
  // and promised ten hours, months after both were retired (2026-08-26). And
  // with no name on file it opened "Hi null," (2026-08-26).
  const body = `${who ? `Hi ${who}, I'm` : "Hello — I'm"} local to Central Oregon and I build software that takes repetitive office work off people.

${lead}

A conversation with you and whoever runs your office, then a written report: every task AI or automation can take over, the tool that does it, what it costs, and the hours a week it gives back. The list adds up to at least ${THE_OFFER.hoursWord} hours a week or you don't pay.

Happy to say more if it's useful.`;
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
    : `The audit is priced off the size of your team, from ${'$999'} up. At the smallest band it buys back ${f.yearHours.toLocaleString()} hours a year.`;
  const body = t.body
    .replace('{priceLine}', priceLine)
    .replace('Hi {greeting},', greetingFor(prospect) ? `Hi ${greetingFor(prospect)},` : 'Hello,')
    .replace('{shortTell}', SHORT_TELLS[openedWith] || 'the admin hours in your office')
    .replace('{recognition}', pain.recognition)
    .replace('{cost}', pain.cost)
    .replace('{lever}', pain.lever)
    .replace(/\{hours\}/g, f.hoursWord)
    .replace(/\{business\}/g, business);
  return { subject: t.subject.replace(/\{business\}/g, business), body, openedWith: `touch_${touch}` };
}

module.exports = {
  CREDIBILITY, longevityLine, toolsLine, toolsNoteForRuss, bandFacts, yearLineFor,
  FOLLOW_UP_DAYS, SECOND_TOUCH, THIRD_TOUCH, SHORT_TELLS,
  draftFollowUpTouch,
  OPENERS, FOLLOW_ONS, TRADE_WORK, TRADE_FOLLOW_ONS, OPENER_ORDER, SUBJECTS, BODY, followOnFor,
  chooseOpener, greetingFor, draftFirstContact, draftLinkedIn,
  TRADE_WEEK, BANNED_OPENERS,
};
