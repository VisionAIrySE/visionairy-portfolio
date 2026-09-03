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
// What is allowed to open a message, strongest first. Every one of these is a
// timely fact about the business itself — they are hiring for a desk right
// now, or the same person is running several of these.
//
// A fax number and a page of downloadable forms used to be on this list and
// led 122 of 736 messages. Both are real tells about how a business runs, and
// both still count towards the score — but as an opening line they are a small
// observation scraped off a page, and they were beating the one thing we
// actually know: what that whole trade's week looks like. "You have a fax
// number up on your site" reads as a gotcha. "Submittals go out, change orders
// come back, and somebody spends their week chasing signatures" reads as
// somebody who has been in the room (Russ, 2026-08-27: "The fax machine seems
// way too heavily weighted to lead with").
const OPENER_ORDER = [
  'runs_several_businesses', 'hiring_several_office_roles', 'hiring_admin_role',
];
// Scored, but never spoken. These say something about the business worth
// knowing when deciding who to call first; they say nothing worth opening on.
const NEVER_LEADS = ['fax_listed', 'downloadable_forms'];
// Never leave a message with no opening: the trade's week is always available.
const TRADE_WEEK = 'trade_week';
// Openings that fire on an ABSENCE rather than on something read. Never allowed
// to open a message; named here so a check can prove they stay gone.
// 'no_website' joined them on 2026-08-27: it fires when no address is on the
// record, which means nobody found one — not that the business has none. It
// was telling 302 businesses "you do not have a site up", and a body shop with
// a perfectly good site reading that stops reading there.
const BANNED_OPENERS = ['no_online_booking', 'no_customer_portal', 'no_website'];

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

// Same rule as the trade subjects: lower case, short, about them. "Both of
// your businesses, {business}" produced "Both of your businesses, Home" where
// the business name was a page title, and "Both of your businesses, your
// office" where it was a heading (2026-08-27).
// Only three survive: the ones that name something SEEN on their own page.
// Everything else fell back to a fragment that means nothing in an inbox —
// "running more than one of these" (of what?), "the paperwork coming in",
// "A thought about your front desk". Russ read them cold and asked the right
// question: why would that get opened? It wouldn't (2026-08-28).
//
// A null falls through to the trade subject, which is a concrete noun out of
// that trade's own week — "chasing change orders", "the recall list", "the
// deals that went quiet" — and the first line of the message pays it off. No
// bait, nothing to be disappointed by.
const SUBJECTS = {
  hiring_several_office_roles: 'the office roles you are hiring for',
  hiring_admin_role: 'the office role you are hiring for',
  downloadable_forms: 'the forms on your site',
  runs_several_businesses: null,
  no_website: null,
  fax_listed: null,
  no_online_booking: null,
  no_customer_portal: null,
  // Not a line that gets sent — the wording version stores this as a
  // description of what the subject now is. Six places record a version and
  // every one of them needs a string; leaving it empty broke the send checks
  // (2026-08-28).
  default: "{the trade's own week}",
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
// The reason to believe a stranger promising money back, in one line, at the
// moment they decide. Four sentences of biography before the ask is a resume
// nobody requested; what earns belief is the shortest true thing that explains
// why he would know. Telling became showing (2026-08-27).
const CREDIBILITY = {
  FORMAL: 'I have run the offices I am offering to fix: finance, construction, my own businesses. I am not a software person guessing at how your week works.',
  NEUTRAL: "I've run the offices I'm offering to fix: finance, construction, my own businesses. I'm not a software person guessing at how your week works.",
  PLAIN: "I've run the offices I'm offering to fix: finance, construction, my own shops. I'm not a software person guessing at how your week works.",
};


// How the LinkedIn note ends. No calendar link — a link in a first message on
// LinkedIn is what gets an account restricted, and the whole point of this
// lane is that it never risks the account.
const LINKEDIN_CLOSES = [
  'Worth a conversation?',
  'Happy to say more if it is useful.',
  'Worth a short conversation?',
  'Glad to explain how, if it is of interest.',
];

// The invitation.
//
// LinkedIn has two doors and they are not the same size. An invitation to
// connect stops at 300 characters and goes to a stranger; a message can run
// longer but only reaches somebody who has already accepted. Every note built
// here ran 278-678 characters, so 1,235 of 1,283 fitted neither door properly
// — they only work on people Russ is already connected to (2026-08-27).
//
// The invitation has one job: get accepted. A number or an offer in it reads
// as a salesperson before any attention has been earned, so the promise is
// deliberately absent. Local, a person, one concrete thing from their trade,
// and no ask beyond connecting. The pitch waits for the door to open.
const INVITE_MAX = 300;
const INVITE_OPENINGS = [
  '{who}Russ Wright, here in Bend.',
  '{who}Russ Wright, based in Bend.',
  '{who}Russ Wright, local to Central Oregon.',
  '{who}Russ Wright, here in Central Oregon.',
];
const INVITE_WHAT_I_DO = [
  'I take repetitive office work off Central Oregon businesses',
  'I take the repetitive office work off small businesses around here',
  'I get repetitive office work off the desks of Central Oregon businesses',
  'I take repetitive office work off businesses in Central Oregon',
];
const INVITE_CLOSES = [
  "Thought I'd connect with another local.",
  "Thought I'd say hello.",
  'Thought it was worth connecting.',
  "Thought I'd reach out, one local to another.",
];
// The bit of their week that names the trade without pitching anything.
const INVITE_TRADE_DETAIL = {
  construction: 'the change orders, the chasing signatures',
  trades: 'the scheduling, the callbacks',
  'real estate': 'the re-typing, the follow-up that slips',
  medical: 'the records requests, the time on hold with insurers',
  dental: 'the reminder calls, the claims that come back',
  veterinary: 'the reminder calls, the front desk juggling three things',
  legal: 'the intake, the same details typed three times',
  accounting: 'the chasing documents, the re-keying',
  insurance: 'the renewals, the same details in three systems',
  auto: 'the estimate-chasing, the re-typing',
  landscaping: 'the scheduling, the three calls every time weather moves it',
  'storage & logistics': 'the paperwork moving between dispatch and the driver',
  staffing: 'the applications, the timesheets',
  'retail & food': 'the ordering, the rebuilt schedule',
  manufacturing: 'the quote that gets typed again as a work order',
  'personal care': 'the bookings, the no-shows',
  'fitness & recreation': 'the memberships, the lapsed members nobody chases',
  'lodging & hospitality': 'the bookings arriving from three places',
  'education & childcare': 'the enrollment forms, the billing',
  'cleaning & facilities': 'the routing, the cancellations',
  'professional services': 'the proposals that go quiet, the re-typing',
  agriculture: 'the load tickets, the paperwork after dark',
  'nonprofit & community': 'the donor follow-up, the grant reporting',
  'funeral & memorial': 'the same details on a dozen forms',
};

// The note that goes out WITH the invitation. Never longer than LinkedIn
// allows, and it never carries the offer.
function draftLinkedInInvite(prospect) {
  const V = require('./variants.js');
  const { tradeOf } = require('./queues.js');
  const trade = prospect.trade || tradeOf(prospect.name);
  const business = businessNameOf(prospect);
  const seed = business;
  const first = greetingFor(prospect);
  const detail = INVITE_TRADE_DETAIL[trade];

  const open = V.pick(INVITE_OPENINGS, seed, 'invite:open').replace('{who}', first ? `Hi ${first}, ` : '');
  const what = V.pick(INVITE_WHAT_I_DO, seed, 'invite:what');
  const close = V.pick(INVITE_CLOSES, seed, 'invite:close');

  // THE CONNECTION NOTE CARRIES THEIR OWN LINE WHEN IT FITS (2026-09-03).
  //
  // Measured across 2026 B2B outreach: a connection request with a
  // personalised note replies at 9.4% against 5.4% with none, and what
  // separates the teams at 15-25% from the ones at 1-5% is anchoring every
  // message to a real signal about that business. A generic trade line is
  // not a signal. Their own sentence is.
  //
  // Their sentence can run longer than the whole note is allowed, so only
  // its FIRST sentence is used, and only when the finished note fits inside
  // the limit. Nothing is ever truncated mid-thought: it falls back to the
  // trade detail, then to no detail at all.
  const theirLine = prospect.noticing
    ? String(prospect.noticing).split(/(?<=[.!?])\s+/)[0].trim().replace(/[.]$/, '')
    : null;
  //
  // Their line stands as its OWN sentence, never welded on after a colon the
  // way the trade detail is: "I take repetitive office work off businesses:
  // Somebody at your desk is walking through applications all day" does not
  // read as English.
  let body = null;
  if (theirLine) {
    for (const shape of [
      `${open} ${what}. ${theirLine}. ${close}`,
      `${open} ${what}. ${theirLine}.`,
      `${open} ${theirLine}. ${close}`,
    ]) {
      if (shape.length <= INVITE_MAX) { body = shape; break; }
    }
  }
  if (!body) {
    body = detail
      ? `${open} ${what}: ${detail}. ${close}`
      : `${open} ${what}. ${close}`;
  }
  // Never over the limit, whatever the wording does. Drop the trade detail
  // first, then the close, rather than sending something truncated.
  if (body.length > INVITE_MAX) body = `${open} ${what}. ${close}`;
  if (body.length > INVITE_MAX) body = `${open} ${what}.`;
  return { body, trade, length: body.length };
}

// The shape, reordered 2026-08-27 after reading it as a stranger would.
//
// It ran 265 words in five paragraphs and put the most unusual thing in it —
// money back if the hours are not there — third, where a scanning reader never
// reaches. The guarantee now lands immediately after their own week, the
// credibility is one line at the point of decision rather than a resume in the
// middle, and the year-line is gone: it was the third number in one paragraph,
// arguing with somebody who had not disagreed yet. About 230 words.
// The ask is now fifteen free minutes, not a nine-hundred-dollar audit.
//
// Four paragraphs instead of six. The guarantee, the floor line, the price
// anchor and the description of a written report are all gone from the first
// message — they are things to say to somebody who has already spoken to you,
// not to a stranger deciding in four seconds whether to keep reading.
// Three paragraphs, not four. A cold email is read on a phone in about four
// seconds and anything past the first screen is only read if the first screen
// earned it. The paragraph of credentials sat between the hook and the ask,
// which is exactly where people stop (2026-08-27).
//
// {proof} is one line of published research where the trade has one, and
// nothing where it does not.
const BODY = `Hi {greeting},

{opener} {followOn} {tradeLine}

{proof} {whatIDo}

{freeLook} {afterTheLook}

{close}

Best regards,
Russ Wright
Founder
VisionAIry
503-621-8000 · russ@visionairy.biz
VisionAIry.biz · LinkedIn
Grab a time on my calendar: https://calendly.com/visionairy/new-meeting`;

// ---------------------------------------------------------------------------
// the second and third touch
//
// One email gets a reply rate. Three gets roughly three times it, and the
// later ones are where most replies actually come from. Each is shorter than
// the last, each says something new, and none of them says "just following up"
// or "circling back", which are the two phrases that tell a reader they are on
// a list.

// FOUR MESSAGES, OVER TWO WEEKS (Russ, 2026-09-03).
//
// It was three, all asking for the same thing: fifteen minutes on a call. A
// person who is interested but will not book a calendar slot was never heard
// from, and that is the likeliest reason a good prospect goes quiet.
//
// The third message now lowers the bar instead of repeating the ask: reply
// with the one task that eats your week, and get an answer by email, no call.
// It costs them ten seconds, and a one-line reply says more about whether they
// are worth calling than a booked slot does.
//
// The close moves to day fourteen. Four messages in eight days is a drumbeat;
// over a fortnight it is a follow-up.
const FOLLOW_UP_DAYS = [0, 4, 8, 14];

// THE THIRD MESSAGE: a smaller ask, not the same ask again.
//
// One question, answerable in a line, no calendar. It deliberately does NOT
// give away what the fifteen minutes is for — Russ answers whether a tool
// exists, not which one it is, what it costs, or what to build. That is still
// the call.
const THIRD_ASK = [
  "Different question, and you can answer it in one line: what is the single task that eats the most time in your week? Reply and tell me, and I will tell you whether there is something off the shelf that handles it. No call, no calendar, just an answer.",
  "Let me make this easier. Tell me the one job that takes the most time out of your week, in a sentence, and I will come back and tell you whether a tool exists for it. That is the whole thing. No call needed.",
  "One question instead of fifteen minutes: what is the task that costs you the most time every week? Hit reply with it and I will tell you straight whether there is a tool that does it. Nothing to book.",
  "Simpler than a call: name the one thing that eats your week, in a line, and I will tell you whether somebody has already built the answer to it. Reply is all it takes.",
];

const THIRD_WHY = [
  'I ask because the tools worth having are the boring ones that take a specific job off a specific person, and I cannot point at the right one without knowing which job it is.',
  'I ask because the right tool is always the one aimed at a particular job, and until I know which job, anything I suggested would be a guess.',
  'The reason I ask: what makes one of these worth the money is that it takes a named task off a named person. Without the task, I would be guessing.',
  'I ask because a tool is only worth it when it takes a specific job off somebody. Which one it is changes the answer completely.',
];

const SIGN_OFF = `Best regards,

Russ Wright
Founder
VisionAIry
503-621-8000 · russ@visionairy.biz
VisionAIry.biz · LinkedIn
Grab a time on my calendar: https://calendly.com/visionairy/new-meeting`;

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

And if you'd rather just see it than read about it: I find at least {hours} hours a week of your team's time and name the software that takes that work on, or your money returns. The calendar is below.

One more thing, since this is the last note. If what you actually need is something built rather than bought, I do that too, and at a fraction of what a development shop would quote.

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
  return `They already run ${tools.slice(0, 3).join(', ')}. Worth raising on the call, not in writing, they never published it.`;
}

// Pick the tell this message should lead with. Something read off their own
// page wins; otherwise the trade's week, which is always available and always
// true. Nothing that fires on an absence can ever be chosen.
function chooseOpener(signals = []) {
  const names = signals.map((s) => (typeof s === 'string' ? s : s.signal));
  for (const key of OPENER_ORDER) if (names.includes(key)) return key;
  return TRADE_WEEK;
}

// WHAT TO CALL THEM IN THE LETTER.
//
// A name Russ corrected by hand beats the one that was scraped — the correction
// reaches the customer card already and had no way of reaching the message.
//
// And a name that is plainly not a name never reaches a letter. One record on
// the list is literally called "{businessName}": a placeholder saved as if it
// were a business, which composed into "My guess is a version of it runs at
// {businessName}." It read as a broken mailshot, which is the one impression a
// first message cannot recover from (2026-08-30).
const NOT_A_NAME = /[{}<>]|^\s*$|^(null|undefined|n\/a|unknown|business ?name|company ?name)$/i;

function businessNameOf(prospect) {
  const { resolveField } = require('../overrides.js');
  const { nameLooksLikeAPageTitle } = require('./names.js');
  const given = String(resolveField(prospect || {}, 'name') || '');
  if (NOT_A_NAME.test(given.trim())) return 'your business';
  // NEVER SAY A PAGE TITLE BACK TO THEM (Russ, 2026-09-03).
  //
  // 229 businesses are on file under the title bar of a web page rather than
  // their name: "HOME", "Best Vet Hospital In Redmond, OR", "Storage In
  // Oregon: Home". The day-four letter is addressed "The part that matters,
  // {business}", so one of those would have gone out as "The part that
  // matters, Home". A name Russ typed himself is never questioned; anything
  // else that reads like a page title becomes "your business", which is
  // plain and true, instead of a guess at what they are called.
  if (!String(prospect && prospect.nameManualValue || '').trim()
      && nameLooksLikeAPageTitle(given)) return 'your business';
  return given.replace(/, (LLC|Inc|Ltd)\.?$/i, '');
}

// "Hi Dale," when we know who owns it. When we do not, the greeting drops the
// name rather than saying "Hi there," which reads like a circular the moment
// somebody reads it cold (2026-08-26).
function greetingFor(prospect) {
  const {
    nameFromEmail, firstNameOf, firstNameOfMarked, doctorGreetingFor,
  } = require('./names.js');
  const address = prospect.emailManualValue || prospect.email;
  // A DOCTOR IS GREETED AS ONE (Russ, 2026-09-03). Before anything else, and
  // only where the record actually says so: the title on their own name, a
  // doctor's job in their role, or their own dr-something address. A practice
  // being a dental practice proves nothing about the person reading.
  const doctor = doctorGreetingFor({
    name: prospect.contactName || prospect.ownerName,
    role: prospect.contactRole,
    email: address,
  });
  if (doctor) return doctor;
  // A name we were told beats a name we worked out.
  // Who Russ typed or ticked beats who the machine found, and one given name is
  // enough when it came from him.
  const known = firstNameOfMarked(prospect.contactName) || firstNameOf(prospect.ownerName);
  if (known) return known;
  // "dale@..." is Dale, but only when it is genuinely a name.
  const fromAddress = nameFromEmail(address);
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
function guaranteeFor(prospect, seed, trade) {
  const V = require('./variants.js');
  const { painFor } = require('./painPoints.js');
  const f = bandFacts(prospect);
  const word = f.hoursWord;
  const Word = word.charAt(0).toUpperCase() + word.slice(1);
  // What the software actually does, in this trade's own terms. Without it the
  // promise is abstract to anybody who has never bought automation.
  const looksLike = painFor(trade || 'other').looksLike;
  return V.pick(V.GUARANTEE, seed, 'guarantee')
    .replace(/\{Hours\}/g, Word)
    .replace(/\{hours\}/g, word)
    .replace(/\{looksLike\}/g, looksLike);
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
  const business = businessNameOf(prospect);
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
    // A signal subject only wins when it names something actually seen on
    // their page. Otherwise the trade's own week is the better line.
    : (SUBJECTS[key] || TO.subjectFor(trade, business));
  // Two dentists both still listing a fax number were getting near-identical
  // letters, and in a town this size they might know each other. Each fixed
  // line has four wordings, chosen by the business's own name so it is the
  // same for them every time and different across the list.
  const who = greetingFor(prospect);

  // THE MESSAGE, 2026-08-30.
  //
  // Rebuilt after Russ read a whole campaign end to end for the first time and
  // found the three emails selling three different things: day 0 offered a free
  // fifteen minutes, day 4 sold a $999 audit, day 8 promised money back on five
  // hours. The price is out of the sequence entirely now — it belongs after the
  // call — and all three say the same thing, getting shorter.
  //
  // And nothing here tells a stranger what their week looks like. 716 of 869
  // messages used to open by asserting a problem nobody had verified; one wrong
  // guess and the email is over. The claim is about the TRADE now, and the next
  // clause says outright that some have already fixed it.
  //
  // Every sentence below is Russ's own, from his rewrite on 2026-08-30, saved at
  // ~/.claude/voice/samples/2026-08-30-hoursback-email-russ-rewrite.md
  const C = require('./campaign.js');
  // THE NOTICING (2026-09-01). Where a sentence has been read off THIS
  // business's own site — recorded in the reading store, handed in on the
  // prospect as `noticing` — it stands where the trade's week sentence
  // stands, and nothing else moves: Russ's greeting, WHO_I_AM, the
  // concession line, WHY_ME, THE_OFFER and ASK_DAY0 are all exactly as they
  // were, still seeded by the business's own name. No noticing, no change.
  const t = prospect.noticing
    ? { ...C.tradeCopy(trade), week: String(prospect.noticing) }
    : C.tradeCopy(trade);
  const body = `${C.dayZero(who, t, business)}\n\n${SIGN_OFF}`
    .replace(/\{business\}/g, business)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/([^\n]) {2,}/g, '$1 ')
    .replace(/\n +/g, '\n');
  return { subject, body, openedWith: key, trade, register };
}

// The LinkedIn version: shorter, same observation, same close. Never sent by
// the engine — this is what Russ pastes by hand.
// The LinkedIn version.
//
// Not a shorter email — a different thing. Nobody reads six paragraphs in a
// message window, links get the account flagged, and a signature block on
// LinkedIn reads as a mailshot. So: the same true opening, the same promise,
// no price, no link, no sign-off. Under about 700 characters, which is what
// actually gets read.
//
// Never sent by the engine. Russ pastes each one by hand, because automating
// LinkedIn risks the account everything else runs on.
function draftLinkedIn(prospect, signals = []) {
  const key = chooseOpener(signals);
  if (!key) return null;
  const { tradeOf } = require('./queues.js');
  const C = require('./campaign.js');
  const trade = prospect.trade || tradeOf(prospect.name);
  const who = greetingFor(prospect);

  // THE SAME OFFER AS THE EMAIL, at the length a message window is read.
  //
  // The note used to promise the paid audit weeks after the email had moved to
  // the free fifteen minutes, so the channel Russ sends by hand contradicted
  // the one that sends itself. It is the same campaign now, shorter: who he is,
  // the trade's week with room to say "we have that one handled", and the offer
  // whole.
  //
  // Nothing of Russ's copy is cut to hit a length. An earlier version dropped
  // the build line and the five-to-twenty hours to fit 700 characters without
  // saying so — his words, quietly removed. The note runs to about 950 now and
  // that is the right trade (2026-08-30).
  // THE SAME SENTENCE THE EMAIL GOT (Russ, 2026-09-03).
  //
  // The note always used the trade's generic week, even for a business whose
  // own site had been read and whose email opened on something only true of
  // them. Russ sends both to the same person by hand: a personal email and a
  // generic note is worse than either alone.
  const t = prospect.noticing
    ? { ...C.tradeCopy(trade), week: String(prospect.noticing) }
    : C.tradeCopy(trade);
  const body = C.linkedInNote(who, t, businessNameOf(prospect));
  const invite = draftLinkedInInvite(prospect);
  return { subject: null, body, openedWith: key, trade, inviteBody: invite.body };
}



// Build the second or third message for a business, given what the first one
// opened on. Returns null when there is nothing honest to say.
function draftFollowUpTouch(prospect, openedWith, touch) {
  const { tradeOf } = require('./queues.js');
  if (touch !== 2 && touch !== 3 && touch !== 4) return null;
  const business = businessNameOf(prospect);
  const who = greetingFor(prospect);
  const trade = prospect.trade || tradeOf(prospect.name);

  // THE PRICE IS OUT OF THE SEQUENCE (2026-08-30).
  //
  // This used to say "It costs $999. What you get back is 260 hours a year" on
  // day 4, and promise money back on five hours a week on day 8 — while day 0
  // offered a free fifteen minutes. Three emails, three different offers. Russ
  // read the sequence end to end and that was the first thing in it.
  //
  // Now all three carry the same offer and nothing else, getting shorter. The
  // $999 is a conversation for after the call.
  const C = require('./campaign.js');
  const t = C.tradeCopy(trade);
  const tradeWord = C.tradeWordFor(trade);
  const written = touch === 2 ? C.dayFour(who, t, business)
    : touch === 3 ? C.daySmallAsk(who, t, business)
      : C.dayEight(who, t, tradeWord, business);
  const body = `${written}\n\n${SIGN_OFF}`
    .replace(/\{business\}/g, business)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n +/g, '\n');
  const subject = touch === 2 ? C.subjectDayFour(t)
    : touch === 3 ? 'One question'
      : 'Closing the loop';
  return { subject, body, openedWith: `touch_${touch}` };
}

module.exports = {
  CREDIBILITY, longevityLine, toolsLine, toolsNoteForRuss, bandFacts, yearLineFor,
  FOLLOW_UP_DAYS, SECOND_TOUCH, THIRD_TOUCH, SHORT_TELLS, THIRD_ASK, THIRD_WHY,
  draftFollowUpTouch,
  OPENERS, FOLLOW_ONS, TRADE_WORK, TRADE_FOLLOW_ONS, OPENER_ORDER, SUBJECTS, BODY, followOnFor,
  chooseOpener, greetingFor, draftFirstContact, draftLinkedIn,
  TRADE_WEEK, BANNED_OPENERS, NEVER_LEADS, OPENER_ORDER, LINKEDIN_CLOSES,
  INVITE_MAX, INVITE_OPENINGS, INVITE_WHAT_I_DO, INVITE_CLOSES, INVITE_TRADE_DETAIL, draftLinkedInInvite,
};
