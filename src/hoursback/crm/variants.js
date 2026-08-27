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
  // Reassurance, not the hook, so these run LATE and short. Formal keeps its
  // contractions out; plain is barest. Shortening them once collapsed formal
  // and neutral into the same sentence, which killed the register.
  FORMAL: ["I am local to Central Oregon.", "I am based here in Central Oregon.", "I work with businesses across Central Oregon.", "I am here in Central Oregon myself."],
  NEUTRAL: ["I'm local to Central Oregon.", "I'm here in Central Oregon.", "I work with businesses around Central Oregon.", "I'm based here in Bend."],
  PLAIN: ["I'm local.", "I'm right here in Bend.", "I'm local, same as you.", "I'm just up the road."],
};




// What he does, four ways. The promise is identical in all of them.
const WHAT_I_DO = [
  // Complete sentences. An earlier version ran two fragments back to back:
  // "A conversation with you and whoever runs your office, enough to
  // understand how the work really moves. Then a written report: ..." Neither
  // had a verb, and Russ caught it (2026-08-26).
  "Here's what I do about that. We talk, you and me and whoever runs your office, long enough for me to understand how the work really moves. Then I write it up: every task AI or automation can take over, the best tools on the market for each one, what they cost to set up, and how to put them in.",
  "What I do about it is simple. I talk to you and whoever does the work until I can follow how it actually happens. Then I send you a written report naming every task AI or automation could handle instead of a person, the best tools out there for each, what they cost, and how to put them in.",
  "Here's what I do. We have a conversation, you and your team and me, until I can see where the time really goes. Then I write you a report listing every task AI or automation can take off them, the best tools available for each, what they cost, and how to put them in.",
  "What I do about that starts with a conversation. I talk to you and whoever runs the office until I understand how the work moves. Then I put it in writing: every task AI or automation can handle, the best tools on the market for each, what they cost, and how to put them in.",
];

// The guarantee, on its own line, where it cannot be missed. Four ways.
//
// Where the team size is known the numbers are theirs: their band's hours and
// their band's price, straight from the pricing table. Where it is not, the
// floor of ten hours stands, because that is the promise at every band.
// The promise is about what the report CONTAINS. Every item in the list has to
// be a thing a report can actually hold.
//
// The earlier wordings hung three items off one verb — "the report names the
// tools, how to put them in, and at least five hours a week of your team's
// time" — and the third one is not a thing a report names. It is what the
// tools DO once they are in. Read plainly it says the report names some hours,
// which is nonsense (Russ, 2026-08-26: "Does this not read like the report
// names at least 5 hours?"). The fix is his: the third item is now HOW the
// tools give the time back, which a report genuinely can set out.
const GUARANTEE = [
  "You get the best tools for the job, how to put them in, and how they give you and your team back at least {hours} hours a week. Or you don't pay.",
  "You get the tools, how to implement them, and how they hand your people back at least {hours} hours a week. If not, you don't pay.",
  "The report names the tools, how to put them in, and how they give you and your team back at least {hours} hours a week. If it falls short, your money comes back.",
  "You get the tools, how to implement them, and how they free up at least {hours} hours a week for your team. Or you pay nothing.",
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
  // Say whose hours they are and what they go back to. A bare "260 hours a
  // year" is a number nobody pictures.
  "{Hours} hours a week is {yearHours} hours a year, about {months} of somebody's time back on the work that actually pays.",
  "That is {yearHours} hours a year, roughly {months} of one person's time returned to the job they were hired for.",
  "{Hours} a week comes to {yearHours} hours a year, near enough {months} of somebody's working life given back to the business.",
  "That is {yearHours} hours a year, about {months} of a person's time no longer spent on paperwork.",
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
  // Two ways to answer and one of them is a single click.
  FORMAL: [
    "If that is worth a look, reply here or take a time from my calendar below.",
    "Worth exploring? Reply, or choose a time from the calendar below.",
    "If it is of use, a reply or a time from the calendar below is all it takes.",
    "If that merits a conversation, reply here or pick a time below.",
  ],
  NEUTRAL: [
    "Worth a look? Reply here, or grab a time on my calendar below.",
    "If that's worth a look, reply or take a time off my calendar below.",
    "Sound useful? Reply, or pick a time from the calendar below.",
    "If it's of interest, reply here or grab a slot below.",
  ],
  PLAIN: [
    "Worth a look? Reply, or grab a time below.",
    "If that's useful, just reply or pick a time below.",
    "Sound worth it? Reply here or take a time off my calendar below.",
    "If it helps, reply or grab a time below.",
  ],
};



// The observation itself. This is the line most likely to repeat between two
// businesses in the same trade, so it varies the most.
const TELL_WORDINGS = {
  hiring_admin_role: [
    // Point at where it is PUBLISHED, never at "at the moment". A careers page
    // can sit untouched for two years, and being wrong in the first line of a
    // cold email is the worst place to be wrong (2026-08-26).
    'Your site lists an office role.',
    'I saw an office role listed on your site.',
    'You have an office role up on your careers page, which is what got my attention.',
    'I noticed the office position on your careers page.',
  ],
  hiring_several_office_roles: [
    'Your site lists more than one office role.',
    'I saw a couple of office positions listed on your site.',
    'You have more than one office role up on your careers page, which is what caught my eye.',
    'I noticed a couple of office roles on your careers page.',
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

// What the audit costs, said as something they already pay for rather than as
// a number. Russ asked for a "for less than the cost of..." line, which turns
// out to be better than naming $999: the reader learns the scale, the price
// stays out of a first approach, and there is no figure to argue with. Matched
// to whatever was noticed about them, so it lands as part of the same thought
// (2026-08-26). A "pays for itself 5x in month one" claim was considered and
// rejected — five hours a week is about 21 hours in month one, which is worth
// less than the fee, so the claim was both a dollar claim and untrue.
const COST_ANCHOR = {
  // Every one of these compares MONEY to MONEY. An earlier set said "it costs
  // less than the hours somebody spends", which does not parse: a price cannot
  // be less than an amount of time (2026-08-26). A "pays for itself 5x in
  // month one" line was also rejected — five hours a week is about 21 hours in
  // month one, worth less than the fee at any real wage.
  hiring_admin_role: 'It costs less than the first week of the person you are about to hire.',
  hiring_several_office_roles: 'It costs less than the first week of any one of the people you are about to hire.',
  fax_listed: "It costs less than a week's wages for whoever is doing that typing.",
  downloadable_forms: "It costs less than a week's wages for whoever is retyping those forms.",
  no_online_booking: 'It costs less than one month of the jobs that go elsewhere when nobody picks up.',
  no_customer_portal: "It costs less than a week's wages for your front desk.",
  no_website: 'It costs less than one month of the work that goes elsewhere when nobody picks up.',
  runs_several_businesses: 'It costs less than one month of doing the same paperwork twice.',
  default: 'It costs less than one month of a part-time office assistant.',
};


module.exports = {
  COST_ANCHOR, pick, OPENINGS, WHAT_I_DO, GUARANTEE, GUARANTEE_PRICED, YEAR_FRAMING, PRICE_FRAMING, CLOSES, TELL_WORDINGS };
