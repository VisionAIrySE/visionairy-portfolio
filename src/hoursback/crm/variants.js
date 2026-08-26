// Saying the same thing more than one way.
//
// The wording Russ approved is fixed, and that is the point — but two dentists
// who both still list a fax number were getting near-identical letters, and in
// a town this size they might well know each other.
//
// So each line has four wordings. Which one a business gets is decided by its
// own name, so it is the same every time for them and different across the
// list. Nothing is generated; every wording below was written once, in his
// voice, and can be read before it ever goes out.
//
// The bar: if a line sounds like it came out of a machine, it does not belong
// here. No "leverage", no "streamline", no "in today's fast-paced", no
// three-part lists for the sake of rhythm, no dashes.

// A stable number from a business name, so the same business always gets the
// same wording. Not random — random would give the same business a different
// letter every time it was redrafted.
// The salt matters: without it, two businesses landing on the same slot for
// one line land on it for every line, and the whole letter matches. With it,
// each line is decided separately, so a coincidence on one is just that.
function pick(list, key, salt = '') {
  const s = `${salt}|${String(key || '')}`;
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) { n ^= s.charCodeAt(i); n = Math.imul(n, 16777619) >>> 0; }
  // The low bits alone barely move between similar names, so three dentists
  // were landing on the same wording. This scrambles the whole number before
  // the choice is made.
  n ^= n >>> 16; n = Math.imul(n, 2246822507) >>> 0;
  n ^= n >>> 13; n = Math.imul(n, 3266489909) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;   // without this last step it can go negative, and a
  return list[n % list.length];   // negative index picks nothing at all
}

// The opening line. Same job, four ways.
const OPENINGS = {
  FORMAL: [
    "I'm local to Central Oregon, and I build software that takes repetitive office work off people's plates. Rather than describe it, I would rather speak to what look like some specific needs for your team.",
    "I'm based here in Central Oregon and I build software that takes the repetitive parts of office work off people. Rather than explain that in the abstract, I would rather speak to something I noticed about your team.",
    "I build software for businesses here in Central Oregon, aimed squarely at the office work that repeats. Rather than describe it in general terms, I would rather raise something specific to you.",
    "I work with businesses across Central Oregon on the office work that repeats itself. Rather than talk about that generally, I would rather point to something particular to your team.",
  ],
  NEUTRAL: [
    "I'm local to Central Oregon and I build software that takes repetitive office work off people's plates, and rather than describe it I'd rather talk to what seem to be some specific needs for your team.",
    "I'm here in Central Oregon and I build software that takes the repetitive office work off people, and rather than explain it in general I'd rather talk about something specific to your team.",
    "I build software for businesses around Central Oregon, mostly aimed at the office work that keeps repeating, and rather than describe that I'd rather raise something I noticed about yours.",
    "I'm local, and what I build takes the repetitive office work off people. Rather than describe it generally, I'd rather talk about what looks like a specific need on your side.",
  ],
  PLAIN: [
    "I'm local to Central Oregon and I build software that takes the repetitive office work off people's plates. Rather than describe it, I'd rather talk to what look like some specific needs for your team.",
    "I'm here in Central Oregon and I build software that takes repetitive office work off people. Rather than explain it, I'd rather talk about something specific I noticed at your place.",
    "I build software for local businesses, aimed at the office work that repeats. Rather than describe it, I'd rather raise something specific to you.",
    "I'm local and I build software that takes the repeating office work off people. Rather than talk in general, I'd rather talk about your shop.",
  ],
};

// What he does, four ways. The promise is identical in all of them.
const WHAT_I_DO = [
  "What I do is have a conversation with you and your team, enough to actually understand how the work moves, and then come back with a plain list of where the hours are going, which of them could be fixed with tools that already exist, and which would need something built.",
  "The way it works is a conversation with you and whoever does the work, long enough to see how things actually move, and then bring back a plain list of where the hours go, what could be fixed with tools that already exist, and what would need building.",
  "What that looks like in practice is a conversation with you and your team, enough to follow the work properly, and then a plain list of where the hours are going, which parts existing tools would handle, and which parts would need something made.",
  "In practice it is a conversation with you and the people doing the work, enough to understand how it actually moves, and come back with a plain list of where the hours sit, what off-the-shelf tools would take care of, and what would need building.",
];

// The guarantee, on its own line, where it cannot be missed. Four ways.
//
// Where the team size is known the numbers are theirs: their band's hours and
// their band's price, straight from the pricing table. Where it is not, the
// floor of ten hours stands, because that is the promise at every band.
const GUARANTEE = [
  // The fee is paid UP FRONT, so the promise is a refund, not an invoice that
  // never gets sent. An earlier wording said "no invoice" and Russ caught it,
  // along with "five is the least of it", which means nothing (2026-08-26).
  // Each one now says three things in order: the promise, the refund, and
  // that five is where it starts. No dashes: a dash reads as machine-written.
  "If I can't find you {hours} hours a week, you get your money back. {Hours} is the minimum. Most offices have well more.",
  "{Hours} hours a week is the least I'll find, or your fee comes back. In most places it is a good deal more.",
  "If there aren't {hours} hours a week in it for your team, I refund you in full. {Hours} is the floor. Most land higher.",
  "You get {hours} hours a week back, or you get your money back. {Hours} is what I promise. More is what I usually find.",
];

// The same, when we know their team size and can put their own number on it.
const GUARANTEE_PRICED = [
  "{hours} hours a week back, for {fee}. If I can't find them, you don't pay. That's the whole deal.",
  "For {fee} I find you {hours} hours a week, or you owe me nothing. That is the entire arrangement.",
  "{fee}, for {hours} hours a week of your team's time back. No hours, no invoice.",
  "{hours} hours a week, guaranteed, for {fee}. If they are not there, there's nothing to pay.",
];

// The first message states the hours as a YEAR, never as a price. A number
// with no context becomes the whole conversation; the same hours as a slice of
// somebody's working life cannot be argued with.
const YEAR_FRAMING = [
  '{hours} hours a week is {yearHours} hours a year, which is about {months} of somebody\'s working life handed back.',
  'Put another way, {hours} hours a week comes to {yearHours} hours a year, roughly {months} of one person\'s time.',
  '{hours} hours a week does not sound like much until it is {yearHours} hours a year, which is about {months} of a working life.',
  'Across a year {hours} hours a week is {yearHours} hours, near enough {months} of one person\'s working time.',
];

// The SECOND message is where the price belongs. It names the fee and the
// hours, and nothing else — no dollar value put on an hour, no multiple, no
// return. Russ sells HOURS, not dollars (his instruction, 2026-08-26): a
// dollar figure invites an argument about whose wage was used, and the hours
// cannot be argued with.
const PRICE_FRAMING = [
  'The audit is {fee}, and what comes back is {yearHours} hours a year.',
  'It costs {fee}. What you get back is {yearHours} hours a year.',
  '{fee} for the audit. {yearHours} hours a year returned.',
  'The number is {fee}, against {yearHours} hours a year back in the building.',
];

// The close, four ways, at each register.
const CLOSES = {
  FORMAL: [
    "No need for a meeting, and no obligation either way. If it is useful, I would welcome the chance to share more.",
    "There is no meeting to sit through and no obligation. If any of that is useful, I would be glad to say more.",
    "Nothing formal needed, and no obligation on your side. If it is worth a look, I would welcome the chance to share more.",
    "No meeting required and nothing owed either way. If it is of use, I would be glad to go further.",
  ],
  NEUTRAL: [
    "No meeting needed and no obligation, I'd just welcome the chance to share more if it's useful!",
    "No meeting and nothing owed either way, I'd just be glad to say more if it's useful!",
    "There's no meeting to sit through and nothing to sign, I'd just welcome the chance to share more if it helps!",
    "No obligation and no meeting needed, I'd be glad to go further if any of that is useful!",
  ],
  PLAIN: [
    "No meeting, no obligation. If it's useful, happy to share more!",
    "No meeting and nothing owed. If any of that's useful, happy to say more!",
    "Nothing to sit through, nothing to sign. If it helps, happy to go further!",
    "No meeting needed, no obligation. Glad to say more if it's useful!",
  ],
};

// The observation itself. This is the line most likely to repeat between two
// businesses in the same trade, so it varies the most.
const TELL_WORDINGS = {
  hiring_admin_role: [
    'I noticed you have an opening for an office role at the moment.',
    'I saw you are looking for someone for the office at the moment.',
    'You have an office role advertised at the moment, which is what got my attention.',
    'I noticed the office position you are trying to fill.',
  ],
  hiring_several_office_roles: [
    'I noticed you have more than one office role open at the moment.',
    'I saw you are trying to fill a couple of office positions at once.',
    'You have more than one office role advertised at the moment, which is what caught my eye.',
    'I noticed a couple of office roles open at the same time.',
  ],
  runs_several_businesses: [
    'I gather you have more than one business going, which usually means the same office work landing on you twice over.',
    'I gather there is more than one business under you, which normally means carrying the same office work twice.',
    'You seem to have more than one thing going at once, which usually means the same paperwork twice over.',
    'I gather you are running more than one business, and that usually means doing the same office work twice.',
  ],
  downloadable_forms: [
    'I noticed your forms are PDFs that people print out and fill in by hand.',
    'I see the forms on your site are PDFs, so people are printing them and filling them in.',
    'Your forms come down as PDFs, which means somebody is filling them in with a pen.',
    'I noticed the forms on your site have to be printed and written on.',
  ],
  fax_listed: [
    'I noticed you still list a fax number.',
    'I saw there is still a fax number on your site.',
    'You have a fax number up on your site, which is what caught my eye.',
    'I noticed the fax number on your contact page.',
  ],
  no_online_booking: [
    "I noticed there's no way to book with you online, so every appointment has to come through somebody on the phone.",
    'There is no way to book with you online, which means every appointment goes through a person.',
    'I could not find a way to book online, so I gather every appointment comes in by phone.',
    'Everything looks like it gets booked by phone rather than online.',
  ],
  no_customer_portal: [
    "I noticed your customers don't have a login of their own, so every status question lands with your front desk.",
    'There is no login for your customers, so every question about where things stand comes to your desk.',
    'Your customers have nowhere to check on things themselves, which means asking you.',
    'I could not find a customer login, so I gather every "where are we at" comes through the office.',
  ],
  no_website: [
    "I noticed you don't have a website, which usually means every question a customer has comes to you by phone.",
    'You do not have a site up, which normally means every question comes in by phone.',
    'I could not find a website for you, and that usually means the phone carries everything.',
    'There is no site to look at, which I take to mean the phone handles it all.',
  ],
};

module.exports = { pick, OPENINGS, WHAT_I_DO, GUARANTEE, GUARANTEE_PRICED, YEAR_FRAMING, PRICE_FRAMING, CLOSES, TELL_WORDINGS };
