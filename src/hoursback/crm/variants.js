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
  // This used to be reassurance and nothing else — "I'm local to Central
  // Oregon." Russ replaced it on 2026-08-27 with what he actually does, and
  // his sentence is kept verbatim in every register. The line is his, so it
  // does not vary: every message now carries the same one. Ask him before
  // adding wordings around it.
  FORMAL: ['I help businesses around Central Oregon find these opportunities to improve efficiencies, increase profitability and implement and build these tools.'],
  NEUTRAL: ['I help businesses around Central Oregon find these opportunities to improve efficiencies, increase profitability and implement and build these tools.'],
  PLAIN: ['I help businesses around Central Oregon find these opportunities to improve efficiencies, increase profitability and implement and build these tools.'],
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
  // These run BEFORE the paragraph explaining what he does, so they cannot
  // lean on a report the reader has not heard of. Each stands on its own.
  //
  // {looksLike} is what the software actually DOES, in that trade's own terms.
  // Without it the promise was "I name the tools that free it up" — which
  // gives somebody who has never bought automation no picture at all of what
  // changes on Monday (Russ, 2026-08-27).
  //
  // Hours are what he FINDS. Never an item in a list of what a document holds.
  "I find at least {hours} hours a week of your team's time and name the software that does that work instead: {looksLike}. If I can't, you don't pay.",
  "I find at least {hours} hours a week of your people's time and name the software that takes it on instead: {looksLike}. If I don't, you don't pay.",
  "I find you at least {hours} hours a week and name the software that handles it instead of a person: {looksLike}. If it falls short, your money comes back.",
  "At least {hours} hours a week of your team's time, and the software that takes the work on: {looksLike}. Or you pay nothing.",
];

// Five is the floor, not the finding.
//
// Without this the guarantee reads as a cap — as if five hours is all there
// is. The research puts the average loss to repetitive work at around ten
// hours a week per worker, and accounting practices at twelve to twenty, so
// saying there is more than five sitting there is defensible without ever
// claiming a client he has not had (Russ, 2026-08-27: "it doesn't indicate 5
// is the floor but it's usually more").
const FLOOR_LINE = [
  "{Hours} is the floor I'll guarantee, not the number I expect: in most {plural} there's a good deal more than that sitting there.",
  "That {hours} is a floor, not a finding. In most {plural} there is more than that waiting to be picked up.",
  "{Hours} is what I'll guarantee, not what I expect to find. Most {plural} are carrying more than that.",
  "I guarantee {hours}. In most {plural} the real number is higher than that.",
];
const FLOOR_LINE_GENERAL = [
  "{Hours} is the floor I'll guarantee, not the number I expect: in most small offices there's a good deal more than that sitting there.",
  "That {hours} is a floor, not a finding. In most offices there is more than that waiting to be picked up.",
  "{Hours} is what I'll guarantee, not what I expect to find. Most offices are carrying more than that.",
  "I guarantee {hours}. In most offices the real number is higher than that.",
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
// The free fifteen minutes. This is the ASK now, and it replaces the paid
// audit in the first message entirely.
//
// A guarantee in a cold email from a stranger is a claim, not a reassurance:
// it has to be believed before it helps, and nothing in a first message earns
// that. Fifteen minutes to find one thing needs no belief at all, and it puts
// Russ in the room where the guarantee actually lands (Russ chose this over
// keeping the guarantee up front, 2026-08-27).
// The ask, in one sentence. It was sixty words across two (2026-08-27).
// The ask. Fifteen minutes, and they come off the call HOLDING something.
//
// Rewritten 2026-08-28 on Russ's instruction: "I want to spec 15 min with them
// free of charge and will provide a tool they can implement immediately that
// will save them time and money, then continue with the 'we can find more'
// conversation."
//
// The difference matters. "I'll come back with the one thing I'd fix first" is
// a promise of advice, and advice from a stranger is worth what it costs. One
// tool they can switch on the same day is a thing they own by the end of the
// call, and it is the reason to take the call at all.
//
// He can keep this. Every trade on the list has four places its hours go, each
// paired to platforms he can name and price on the spot (scenarios.js).
// The ask. Fifteen minutes, and then he goes and finds the right tool and
// comes back with it, free.
//
// Rewritten twice on 2026-08-28. First to "you leave the call holding a tool",
// then corrected by Russ to how the call actually ends: "I'll research this
// and find the best tool for you and return with my free recommendation and
// why."
//
// That order is the stronger one and it is also the honest one. Naming a tool
// inside fifteen minutes, before looking at anything, is what an unqualified
// person does. Going away, doing the work, and coming back with the reasoning
// is what somebody worth paying does — and the recommendation is still free,
// so there is nothing for them to weigh up.
const FREE_LOOK = [
  "Give me fifteen minutes on the phone to see where the time actually goes. Then I go and find the right tool for it and come back with what I would put in, what it costs, and why that one.",
  "Fifteen minutes on the phone about where your team's week goes. Then I do the research and come back with the tool I would use, the price, and the reasoning behind it.",
  "A quarter of an hour on the phone, and then I go away and find the best thing for what you have described — and come back with it, what it runs to, and why it is the one.",
];

// And then the rest, said once and lightly. This is the only place the bigger
// piece of work is mentioned at all: the recommendation has to stand on its
// own, or the call reads as a way in rather than something given.
const AFTER_THE_LOOK = [
  "The recommendation is free and there is nothing to sign. If it lands, there is usually more where it came from, and we can go looking then.",
  "No charge for any of that, and nothing to sign. There is normally more than one of these in a business, and that is a conversation for afterwards.",
  "Free either way, nothing to sign. If the first one is worth having there are usually others, and we can talk about those once you have seen it work.",
];

// What Russ does, without the paid audit in it. The old version described a
// written report somebody pays for, which is the wrong thing to describe when
// the ask is a free call.
// One line, not three. This sits between the hook and the ask, which is where
// people stop reading, so it earns exactly one sentence (2026-08-27).
const WHAT_I_DO_FREE = [
  "I'm local, and I find that kind of work and hand it to software — sometimes something off the shelf, sometimes built around how you actually run.",
  "I'm here in Central Oregon, and what I do is take that work off businesses: sometimes with something that already exists, sometimes with something built for them.",
  "I'm local to Central Oregon and I put in the software that does that work instead, whether it already exists or has to be built.",
];

// The same line, for a business nothing off the shelf actually fits.
//
// Russ, 2026-08-30: "I build a Custom CRM for a company for 1/10 of the cost
// from off the shelf or a dev shop, why is that bad and not a great
// opportunity on its own?" The generic line says "sometimes built for them" to
// everybody, true or not. These say WHY, and only go to a business whose build
// score reached 60 — four or more genuinely different operations run from one
// office, or seats paid for every month on software built for a company ten
// times its size.
//
// Still one sentence. It sits in the same place between the hook and the ask,
// where people stop reading, so it earns exactly one — same as the other family.
// No price, no promise of a build, no figure. It names the reason and stops;
// what it costs is a conversation, not a cold email (2026-08-30).
// {reason} is filled from the record — never a guess. Russ, 2026-08-30: "name
// the reason, it shows I've researched and makes it personal as long as it is
// relevant and valid." So the line quotes the business's OWN published words
// back, and where the record cannot supply one the whole family is skipped and
// the ordinary sentence goes instead. A sentence that says "running four
// different operations" at a business that runs one is worse than saying
// nothing.
const WHAT_I_DO_BUILD = [
  "I'm local, and I find that work and hand it to software — though with {reason}, I doubt anything off the shelf covers the half of it.",
  "I'm here in Central Oregon and I take that work off businesses. With {reason}, I'd expect the ready-made stuff to fit badly, and that is usually where the money goes.",
  "I'm local to Central Oregon and I put software in to do that work instead — and with {reason}, that often means something built rather than bought.",
];

// The reason, in the business's own terms, from what the reading found. Returns
// null when the record cannot support a specific claim — and null means the
// build family is not used at all for that business.
function buildReasonFor(prospect, buildScore) {
  if (!prospect || (buildScore || 0) < 60) return null;

  // 1. Several genuinely different operations, read off their own page rather
  // than counted from commas. This is the strongest and most specific reason.
  const ops = Number(prospect.separateOperations || 0);
  if (ops >= 4) {
    // Their own words, trimmed to the thing itself. The first attempt left the
    // whole clause in and produced "provide professional excavation, junk
    // removal, snow plowing all run out of one office" — the lead-in of the
    // sentence dragged along with the first item (2026-08-30).
    const listed = String(prospect.theirWork || '')
      .replace(/^[^:]*?\b(provides?|offers?|specialis\w+|specializ\w+|is a|are a)\b/i, '')
      .split(/,| and /)
      .map((x) => x.trim().toLowerCase()
        .replace(/^(we |our |the |a |an |professional |full[- ]service |complete |quality )+/g, '')
        .replace(/\s+(services?|solutions?|work)\b.*$/, '')
        .replace(/[.!?]+$/, '')
        .trim())
      .filter((x) => x.length > 3 && x.length < 30 && !/^(oregon|central oregon|across|serving|throughout)/.test(x))
      .slice(0, 3);
    if (listed.length >= 3) return `${listed.join(', ')} all run out of one office`;
    return `${ops} different operations run out of one office`;
  }

  // 2. Nothing specific enough was read. Better to send the ordinary sentence
  // than to invent a reason — an unfounded "your unusual setup" reads as a
  // mail-merge and costs the reply.
  return null;
}

// One line of proof, from published research rather than from Russ's own
// clients — he has none yet, and a case study about work he has not done is
// the one thing he must never write.
//
// REBUILT 2026-08-28. What was here before was a McKinsey figure — 57% of US
// work hours technically automatable — sent to 1,640 businesses. Russ threw it
// out on sight: "WHAT THE FUCK IS THE MCKINSEY REFERENCE WITH 57%, THAT MEANS
// NOTHING." He was right. It is an economy-wide statistic and it says nothing
// to somebody running a crane company.
//
// Alongside it sat a line beginning "Deloitte found" with no study, no year and
// no link. There is no such published finding. It came off a vendor blog.
//
// What replaced them: research matched to the ONE THING that message opens
// with, and nothing else. A message about deals going quiet carries the study
// about answering enquiries. A message about recall calls carries the trial
// about reminders. A message about unsigned change orders carries nothing,
// because nobody has measured that — and a message with no line in it is
// better than a line a reader can catch.
//
// Only a source read on the publisher's own page may be quoted word for word.
// That rule lives in evidence.js and is enforced by a check.

const { quotableFor, quotableForWork } = require('../evidence.js');

// What the message OPENS on, and therefore which study belongs beside it.
// A trade whose opening is about paperwork gets nothing — that is the honest
// answer, not a gap to be filled.
const WORK_BEHIND_THE_OPENING = {
  'follow-up': 'lead_follow_up',       // Harvard Business Review, 2011
  scheduling: 'scheduling',            // Cochrane Review, eight randomised trials
  billing: 'invoicing_and_collections',
  inventory: 'inventory_and_ordering',
  paper: null,
  hiring: null,
};

// The reminder trial measured people TURNING UP to an appointment they had
// booked. That is a real fact about dentists, vets and salons. It is not a
// fact about a landscaping crew, whose customer does not have to be anywhere —
// and quoting a healthcare trial at a landscaper is the kind of stretch a
// reader catches, which costs more than the line was worth (2026-08-28).
const CUSTOMERS_HAVE_TO_TURN_UP = new Set([
  'dental', 'medical', 'veterinary', 'personal care', 'fitness & recreation',
  'lodging & hospitality', 'education & childcare', 'trades', 'auto',
]);

function proofFor(trade) {
  const t = String(trade || '').toLowerCase();
  // 1. Their own trade body measured their own week. Strongest thing there is.
  const own = quotableFor(t);
  if (own) return own.line;
  // 2. Somebody measured the KIND OF WORK this message opens on. Following up
  //    an enquiry is the same act in a roofing company and a dental practice.
  const { painFor } = require('./painPoints.js');
  let work = WORK_BEHIND_THE_OPENING[painFor(t || 'other').function];
  if (work === 'scheduling' && !CUSTOMERS_HAVE_TO_TURN_UP.has(t)) work = null;
  const byWork = work ? quotableForWork(work) : null;
  if (byWork) return byWork.line;
  // 3. Nothing published fits. The message goes without one.
  return null;
}

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
    // Russ's own edit, 2026-08-27: "lists an office role" could be read as a
    // staff page. Saying what the listing IS settles it.
    "Your site lists an office role you're hiring for.",
    "I saw an office role you're hiring for listed on your site.",
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
  FLOOR_LINE, FLOOR_LINE_GENERAL,
  COST_ANCHOR, pick, OPENINGS, WHAT_I_DO, WHAT_I_DO_FREE, WHAT_I_DO_BUILD, buildReasonFor, FREE_LOOK, AFTER_THE_LOOK,
  WORK_BEHIND_THE_OPENING, proofFor, GUARANTEE, GUARANTEE_PRICED, YEAR_FRAMING, PRICE_FRAMING, CLOSES, TELL_WORDINGS };
