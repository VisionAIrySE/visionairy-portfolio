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
const BODY = `Hi {greeting},

I'm local to Central Oregon and I build software that takes repetitive office work off people's plates, and rather than describe it I'd rather point at something specific.

{opener} {followOn}

What I actually do is spend a week inside an operation and come back with a plain list of where the hours are going, which of them can be fixed with tools that already exist, and which would need something built. You get the whole picture in your hands either way, and if I can't find at least ten hours a week your team could have back, you don't pay me.

I'm not asking for a meeting, I'd just welcome the chance to share more if it's useful!

Russ Wright
Visionairy
russ@visionairy.biz`;

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
function draftFirstContact(prospect, signals = []) {
  const key = chooseOpener(signals);
  if (!key) return null;
  const business = String(prospect.name || 'your business').replace(/, (LLC|Inc|Ltd)\.?$/i, '');
  const subject = (SUBJECTS[key] || SUBJECTS.default).replace(/\{business\}/g, business);
  const body = BODY
    .replace('{greeting}', greetingFor(prospect))
    .replace('{opener}', OPENERS[key])
    .replace('{followOn}', FOLLOW_ONS[key])
    .replace(/\{business\}/g, business);
  return { subject, body, openedWith: key };
}

// The LinkedIn version: shorter, same observation, same close. Never sent by
// the engine — this is what Russ pastes by hand.
function draftLinkedIn(prospect, signals = []) {
  const key = chooseOpener(signals);
  if (!key) return null;
  const body = `Hi ${greetingFor(prospect)} — I'm local to Central Oregon and I build software that takes repetitive office work off people's plates.

${OPENERS[key]} ${FOLLOW_ONS[key]}

I spend a week inside an operation and come back with a list of where the hours are going and what can be fixed. If I can't find at least ten hours a week, you don't pay.

Happy to share more if it's useful!`;
  return { subject: null, body, openedWith: key };
}

module.exports = {
  OPENERS, FOLLOW_ONS, OPENER_ORDER, SUBJECTS, BODY,
  chooseOpener, greetingFor, draftFirstContact, draftLinkedIn,
};
