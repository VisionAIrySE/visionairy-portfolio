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
  // What he SELLS, concretely, in one breath: hours of their time in, a
  // written report out, naming the tool and the hours for every job on it.
  // Earlier drafts said "what existing tools would take care of, and what
  // would need building", which tells a reader nothing they can picture
  // (Russ, 2026-08-26).
  "Here's what I do. A couple of hours with you and whoever runs your office, then a written report: every job AI or automation can take over, which tool does it, what it costs to set up, and the hours a week it gives you back.",
  "Here's what I do. I spend a couple of hours watching how your office really works, then hand you a written report naming every job AI or automation could do instead of a person, the tool for each one, what it costs to set up, and the hours it returns.",
  "What I do is simple. A couple of hours with you and your team, then a written report: the jobs a machine can take over, which tool does each, the setup cost, and the hours a week you get back.",
  "Here's the work. A couple of hours with whoever runs your office, then a written report listing every job AI or automation can handle, the tool that does it, what setting it up costs, and the time it hands back each week.",
];

// The guarantee, on its own line, where it cannot be missed. Four ways.
//
// Where the team size is known the numbers are theirs: their band's hours and
// their band's price, straight from the pricing table. Where it is not, the
// floor of ten hours stands, because that is the promise at every band.
const GUARANTEE = [
  // Two sentences. The fee is paid up front so the promise is a REFUND, and
  // five is a floor. An earlier version ran three sentences and sat beside a
  // two-sentence year line, which made a paragraph nobody would read.
  "I find you at least {hours} hours a week or you get your money back. Most come in higher.",
  "At least {hours} hours a week, or your fee comes back to you. Most offices have well more.",
  "If there aren't {hours} hours a week in it, I refund you in full. Most land higher than that.",
  "You get {hours} hours a week back or your money back. {Hours} is the floor, not the ceiling.",
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
  // One sentence, and every one says "hours a year" out loud, because that is
  // the figure that lands. The return is stated in TIME: a percentage would be
  // a dollar claim wearing a hat, and Russ took dollars out of the message.
  "{Hours} a week is {yearHours} hours a year, about {months} of somebody's life handed back.",
  "That comes to {yearHours} hours a year, roughly {months} of one person's time.",
  "{Hours} a week is {yearHours} hours a year, near enough {months} of somebody's working life.",
  "{Hours} a week comes to {yearHours} hours a year, which is about {months} of a working life.",
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
  // Two ways to answer, one of them a single click. The close used to leave a
  // reader with nothing to do but compose a reply (2026-08-26).
  FORMAL: [
    "If that is worth a look, reply here or take a time from my calendar below.",
    "If it is of use, a reply or a time from my calendar below is all it takes.",
    "Should that be worth exploring, reply or pick a time from the calendar below.",
    "If it is worth a conversation, reply here or choose a time below.",
  ],
  NEUTRAL: [
    "If that's worth a look, hit reply or grab a time from my calendar below.",
    "Worth a look? Reply, or pick a time from the calendar below.",
    "If it's useful, reply or take a time off my calendar below.",
    "If that's of interest, reply here or grab a slot below.",
  ],
  PLAIN: [
    "If that's worth a look, just reply or grab a time below.",
    "Worth a look? Reply, or pick a time below.",
    "If it's useful, hit reply or take a time off my calendar below.",
    "Sound useful? Reply or grab a time below.",
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

// What the audit costs, said as something they already pay for rather than as
// a number. Russ asked for a "for less than the cost of..." line, which turns
// out to be better than naming $999: the reader learns the scale, the price
// stays out of a first approach, and there is no figure to argue with. Matched
// to whatever was noticed about them, so it lands as part of the same thought
// (2026-08-26). A "pays for itself 5x in month one" claim was considered and
// rejected — five hours a week is about 21 hours in month one, which is worth
// less than the fee, so the claim was both a dollar claim and untrue.
const COST_ANCHOR = {
  hiring_admin_role: 'It costs less than the first week of the person you are about to hire.',
  hiring_several_office_roles: 'It costs less than the first week of any one of the people you are about to hire.',
  fax_listed: 'It costs less than the paper, postage and toner that fax line will run through this quarter.',
  downloadable_forms: 'It costs less than the hours somebody spends this month retyping those forms.',
  no_online_booking: 'It costs less than the jobs a month of missed calls quietly takes off you.',
  no_customer_portal: 'It costs less than a month of the phone calls a portal would have answered.',
  no_website: 'It costs less than a month of the calls nobody is there to pick up.',
  runs_several_businesses: 'It costs less than a month of doing the same paperwork twice.',
  default: 'It costs less than one month of a part-time office assistant.',
};

module.exports = {
  COST_ANCHOR, pick, OPENINGS, WHAT_I_DO, GUARANTEE, GUARANTEE_PRICED, YEAR_FRAMING, PRICE_FRAMING, CLOSES, TELL_WORDINGS };
