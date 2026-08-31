// THE CAMPAIGN — three emails, one offer, said three times.
//
// Written 2026-08-30 to Russ's own rewrite, saved at
// ~/.claude/voice/samples/2026-08-30-hoursback-email-russ-rewrite.md
//
// What broke before: the three emails sold three different things. Day 0 offered
// a free fifteen minutes, day 4 sold a $999 audit, day 8 promised money back on
// five hours. A reader who got all three was offered three different deals. The
// price is gone from the sequence entirely — it belongs after the call.
//
// And every message asserted a problem nobody had verified. 716 of 869 opened by
// telling a stranger what their week looks like. One wrong guess and the email is
// over. Now the claim is about the TRADE, and the next clause says outright that
// some have already fixed it — Russ, 2026-08-30: "Some firms may have that task
// handled but many have three or four more like it burning time in the wings."

// FOUR WAYS TO SAY EACH LINE, AND RUSS'S OWN IS ALWAYS THE FIRST.
//
// This was fixed once already, in August, after two dentists who both still
// listed a fax number were sent near-identical letters — in a town this size
// they might well know each other. Every fixed line got four wordings, chosen
// by the business's own name so it is the same for them every time and
// different across the list. Writing the campaign as one fixed script threw
// that away and eight lookalike businesses got one identical letter
// (2026-08-30). Hundreds of byte-identical emails also read as a mailshot to
// whatever is filtering them.
//
// Version one of every set is the sentence Russ wrote. The others say the same
// thing with the words moved — no new claim, nothing added, nothing dropped.

const { pick } = require('./variants.js');

const WHO_I_AM = [
  "I'm local to Central Oregon and I take repetitive office work off small businesses and hand it off to software automations and AI supported solutions to help save my customers time and money to focus on things that build their business.",
  "I'm local to Central Oregon. What I do is take the repetitive office work off small businesses and hand it to software automations and AI supported solutions, so my customers get their time and money back for the work that actually builds the business.",
  "I'm based here in Central Oregon and I take the repetitive office work off small businesses, handing it to software automations and AI supported solutions so the time and the money go back into building the business instead.",
  "I'm local to Central Oregon and my work is taking repetitive office tasks off small businesses and giving them to software automations and AI supported solutions, so my customers keep the time and money for what actually grows the place.",
];

// The concession. It is the line that keeps the email alive when the reader has
// already solved the thing being described — Russ, 2026-08-30, after asking
// what happens when the dentist already sends automated reminders.
const ALREADY_HANDLED = [
  'Some {they} may have that task handled, but many have three or four more like it burning time in the wings.',
  'Some {they} will have that one solved already. Most have three or four more like it burning time in the wings.',
  'Plenty of {they} have that task covered by now, and still have three or four more like it burning time in the wings.',
  'You may well have that one handled. Most {they} still have three or four more like it burning time in the wings.',
];

const WHY_ME = [
  "I've run the offices I'm offering to fix — finance, construction, my own businesses. I'm not a software person guessing at how your week works.",
  "I've sat in the offices I'm offering to fix: finance, construction, businesses of my own. This isn't a software person guessing at how your week runs.",
  "Finance, construction, my own companies — I've run the offices I'm offering to fix, so I'm not guessing at how the week actually goes.",
  "I've done the job I'm offering to take off you, in finance, in construction and in my own businesses. Not a software person guessing at your week.",
];

// The offer, whole, and the only place the deliverable is described. Note what
// it does NOT say: no price, no fee, and no claim about a client Russ has
// served. "Customers like you have found" is what businesses in their position
// find, not a case study — he has no clients yet and must never write one.
const THE_OFFER = [
  "Give me fifteen minutes on the phone and I'll go away and do the research for you at no cost. I'll bring you back one tool that solves a specific challenge for you, what it costs to implement and why it makes sense, plus what it would take to build the parts nothing off the shelf covers. Customers like you have found anywhere from five to twenty hours a week of repetitive tasks and taken them off the table this way.",
  "Give me fifteen minutes on the phone and I'll go away and do the research at no cost to you. What comes back is one tool that solves something specific, what it costs to put in and why it makes sense, plus what building the parts nothing off the shelf covers would take. Customers like you have found five to twenty hours a week of repetitive tasks this way and taken them off the table.",
  "Fifteen minutes on the phone is all I need, and then I do the research for you at no cost. You get one tool that solves a specific challenge, what it costs to implement and why that one, plus what it would take to build whatever nothing off the shelf covers. Customers like you have taken anywhere from five to twenty hours a week off the table doing this.",
  "Fifteen minutes on the phone, then I go away and do the research at no cost. Back comes one tool that solves a specific challenge for you, what implementing it costs and why it makes sense, and what building the parts nothing off the shelf covers would involve. Customers like you have found five to twenty hours a week of repetitive work this way.",
];

const ASK_DAY0 = [
  'No charge for the review, nothing to sign and you get my best recommendation for a tool that will save your team significant time and money. Worth a quarter of an hour? Reply here, or take a time from my calendar below.',
  'No charge for the review, nothing to sign, and my best recommendation for a tool that saves your team real time and money. Worth a quarter of an hour? Reply here, or take a time from my calendar below.',
  "There's no charge for the review and nothing to sign — just my best recommendation for a tool that will save your team significant time and money. Worth a quarter of an hour? Reply, or take a time from my calendar below.",
  'No charge, nothing to sign, and you come away with my best recommendation for a tool that saves your team serious time and money. Worth a quarter of an hour? Reply here, or grab a time from my calendar below.',
];

const ASK_DAY4 = [
  'No charge, nothing to sign, and you get my best recommendation for a tool that will save your team real time and money. Fifteen minutes? Reply here, or take a time from my calendar below.',
  'No charge and nothing to sign, and what you get is my best recommendation for a tool that saves your team real time and money. Fifteen minutes? Reply here, or take a time from my calendar below.',
  "There's no charge and nothing to sign — just my best recommendation for a tool that will save your team time and money. Fifteen minutes? Reply, or take a time from my calendar below.",
  'Free, nothing to sign, and you come away with my best recommendation for a tool that saves your team real time and money. Fifteen minutes? Reply here, or grab a time from my calendar below.',
];

const DAY4_THE_PART = [
  "Here's the part most owners have never really considered. It isn't {task}. It's that the person doing it was hired to do something else, and that work waits while they spend time on repetitive, tedious tasks.",
  "Here's the part most owners have never really priced. It isn't {task} itself. It's that the person doing it was hired for something else, and that job waits while they work through repetitive, tedious tasks.",
  "The part most owners have never really considered isn't {task}. It's that whoever does it was hired to do something else, and that work sits waiting while they get through the repetitive, tedious stuff.",
  "Here's what most owners have never really weighed up. It isn't {task}. It's that the person doing it was hired for a different job, and that job waits while the repetitive, tedious work gets done.",
];

const DAY4_WHAT_ID_LOOK_FOR = [
  "That number and those tasks are what I'd go looking for in fifteen minutes — not to sell you on anything, but so you know what it's worth before you decide whether to fix it.",
  "That number, and the tasks behind it, are what I'd go looking for in fifteen minutes. Not to sell you anything — so you know what it's worth before deciding whether to fix it.",
  "Fifteen minutes is enough to find that number and the tasks behind it. Nothing is being sold on the call; the point is that you know what it's worth before you decide anything.",
  "What I'd go looking for in fifteen minutes is that number and the tasks behind it — not to sell you on anything, but so the decision about fixing it gets made with a real figure in front of you.",
];

const DAY8_OPEN = ['Last note from me.', 'This is the last one from me.', 'Final note from me.', 'Last one from me.'];

const DAY8_THATS_WHAT_ITS_FOR = [
  "That's what the fifteen minutes is for. I come back to you with the specific product, what it costs, and why it fits you.",
  "That's what the fifteen minutes is for — I come back with the specific product, its cost, and why it fits you.",
  "That's the job of the fifteen minutes. I go away and come back with the specific product, what it costs, and why it suits you.",
  "The fifteen minutes is for exactly that. I come back to you with the product, what it costs, and why it's the right one for you.",
];

const DAY8_CLOSE = [
  "My calendar's below if it's worth a look.",
  "The calendar's below if it's worth a look.",
  "My calendar's below if you want it.",
  "Calendar's below if it's of use.",
];

const NOTE_CLOSE = [
  'No charge for the review, nothing to sign and you get my best recommendation for a tool that will save your team significant time and money. Worth a quarter of an hour?',
  'No charge for the review, nothing to sign, and my best recommendation for a tool that saves your team real time and money. Worth a quarter of an hour?',
  "There's no charge and nothing to sign — just my best recommendation for a tool that will save your team significant time and money. Worth a quarter of an hour?",
  'No charge, nothing to sign, and you come away with my best recommendation for a tool that saves your team serious time and money. Worth a quarter of an hour?',
];

// PER TRADE — four short pieces each.
//   week      the trade's own week, said about the TRADE and never about them
//   they      what to call a business of this kind, plural
//   task      the act itself, for "It isn't the ___"
//   hook      how day 4 refers back to day 0
//   firstLook what day 8 offers: where Russ would start, and the KIND of tool
//             that exists for it. Never a product name — naming the product is
//             what the call is for.
const TRADES = {
  accounting: {
    week: 'At most accounting firms half of January is chasing clients for documents they swear they already sent, and re-keying what finally arrives.',
    they: 'firms', task: 'the chasing', hook: 'the document chasing in January',
    firstLook: 'the document chase. There are tools now that request, chase and file client paperwork without anybody having to remember',
  },
  construction: {
    week: 'At most construction offices half the change orders are sitting somewhere unsigned, and somebody has to chase every one.',
    they: 'outfits', task: 'the chasing', hook: 'chasing change orders',
    firstLook: 'the change orders. There are tools now that send one out, chase the signature and file it without anybody remembering to',
  },
  dental: {
    week: 'At most dental practices somebody spends part of every week phoning patients who were due back six months ago.',
    they: 'practices', task: 'the phoning', hook: 'the recall calls',
    firstLook: 'the recall list. There are tools now that send the reminders on their own and check a claim for the missing field before it leaves',
  },
  medical: {
    week: 'At most medical offices the front desk spends its day on hold with insurers instead of with patients.',
    they: 'practices', task: 'the time on hold', hook: 'the time your front desk spends on hold',
    firstLook: 'the records requests and the authorisations. There are tools now that answer a records request without a phone call, and check a claim before it goes rather than after it comes back',
  },
  veterinary: {
    week: 'At most veterinary clinics the shot reminders go out when somebody at the front desk finds a spare ten minutes.',
    they: 'clinics', task: 'the phoning', hook: 'the shot reminders',
    firstLook: 'the reminders and the charts. There are tools now that send the shot and check-up reminders on their own, and have the chart finished before the next one walks in',
  },
  legal: {
    week: 'At most law firms the same client details get typed three times before anybody bills an hour.',
    they: 'firms', task: 'the typing', hook: 'the typing that happens before anybody bills',
    firstLook: 'intake. There are tools now that take the client details once and open the file the day it comes in',
  },
  insurance: {
    week: 'At most insurance agencies certificates get typed into the carrier portal and then typed again into the agency system.',
    they: 'agencies', task: 'the typing', hook: 'certificates typed twice',
    firstLook: 'renewals and certificates. There are tools now that surface a renewal weeks ahead instead of the day it lands, and enter the details once for every system',
  },
  'real estate': {
    week: 'At most real estate offices the deals that go quiet mostly go quiet because nobody had time to follow up.',
    they: 'offices', task: 'the following up', hook: 'the follow-up nobody had time for',
    firstLook: 'the follow-up. There are tools now that keep after an enquiry whether or not anybody remembers, and enter the client details once',
  },
  manufacturing: {
    week: 'At most manufacturing offices the quote becomes a work order becomes a packing slip, and each one is typed fresh.',
    they: 'shops', task: 'the typing', hook: 'the same numbers typed into three documents',
    firstLook: 'the quote-to-shipment chain. There are tools now that carry a quote through to work order and packing slip without it being typed again',
  },
  auto: {
    week: 'At most repair shops half the estimates never come back, and not because the customer went somewhere else.',
    they: 'shops', task: 'the chasing', hook: 'the estimates that never came back',
    firstLook: 'the estimates. There are tools now that chase every one without anybody having to remember, and order parts without somebody sitting on hold',
  },
  trades: {
    week: 'At most trade shops one person knows where every truck is, and none of it is written down anywhere.',
    they: 'shops', task: 'the remembering', hook: "the schedule living in one person's head",
    firstLook: "the schedule. There are tools now that hold it somewhere other than one person's head and send the callbacks out on their own",
  },
  landscaping: {
    week: 'At most landscaping outfits one rainy Tuesday turns the week into three phone calls per customer.',
    they: 'outfits', task: 'the phoning', hook: 'what the weather does to your week',
    firstLook: 'the schedule. There are tools now that move it when the weather moves, and tell the crew without three phone calls',
  },
  'cleaning & facilities': {
    week: 'At most cleaning companies one cancellation at seven in the morning is half an hour of phone calls.',
    they: 'companies', task: 'the phoning', hook: 'what one cancellation costs you in phone calls',
    firstLook: 'the morning reroute. There are tools now that move the crew when one job drops, without a morning of calls',
  },
  'storage & logistics': {
    week: 'At most logistics offices the same ticket gets re-typed at dispatch, in the cab, and again for the customer.',
    they: 'operations', task: 'the re-typing', hook: 'the same ticket typed three times',
    firstLook: 'the ticket. There are tools now that write it once and carry it through dispatch, driver and customer without it being typed again',
  },
  staffing: {
    week: 'At most staffing offices applications come in one format and timesheets in another, and somebody types both into payroll.',
    they: 'agencies', task: 'the typing', hook: 'moving applications and timesheets into payroll',
    firstLook: 'payroll. There are tools now that land applications and timesheets in it without anybody moving them across',
  },
  agriculture: {
    week: 'At most farm offices the load tickets get written in the field and typed up at nine at night.',
    they: 'operations', task: 'the typing', hook: 'the load tickets typed up at night',
    firstLook: 'the field paperwork. There are tools now that capture load tickets and compliance records once, in the field, rather than again at night',
  },
  'retail & food': {
    week: 'At most shops and kitchens ordering runs on somebody walking the shelves, and one call-out rebuilds the whole schedule.',
    they: 'places', task: 'the walking and the phoning', hook: 'ordering off what somebody saw on the shelf',
    firstLook: 'ordering and the rota. There are tools now that order off what actually sold, and fill the schedule when somebody calls in',
  },
  'personal care': {
    week: 'At most salons and studios every gap in the day is money that was already booked, and filling it means phoning round.',
    they: 'places', task: 'the phoning round', hook: 'the gaps in the day',
    firstLook: 'the gaps. There are tools now that fill a cancellation without anybody at the desk phoning round',
  },
  'fitness & recreation': {
    week: 'At most gyms and studios the members who quietly stopped coming are the ones nobody has time to ring.',
    they: 'places', task: 'the ringing', hook: 'the members nobody had time to ring',
    firstLook: 'the lapsed members. There are tools now that chase them without anybody getting to it, and get waivers signed before people arrive',
  },
  'professional services': {
    week: 'At most firms proposals go out, and the ones that go quiet mostly go quiet for want of a follow-up.',
    they: 'firms', task: 'the following up', hook: 'proposals that went quiet',
    firstLook: 'the follow-up. There are tools now that keep after a proposal whether or not anybody remembers, and enter the details once',
  },
  'nonprofit & community': {
    week: 'At most nonprofits the thank-you that matters most is the one nobody had time to send.',
    they: 'organisations', task: 'the writing', hook: 'the donor thank-you that slips',
    firstLook: 'donor communication. There are tools now that thank people without anybody finding the time, and assemble grant reporting rather than writing it',
  },
  'education & childcare': {
    week: 'At most preschools and daycares one family gets typed into three systems before their child sets foot in the building.',
    they: 'places', task: 'the typing', hook: 'one family typed into three systems',
    firstLook: 'enrollment. There are tools now that take a family once and show them in enrollment, records and billing',
  },
  'lodging & hospitality': {
    week: 'At most places bookings arrive from three different channels and somebody copies them into one calendar by hand.',
    they: 'places', task: 'the copying', hook: 'bookings copied into one calendar by hand',
    firstLook: 'the calendar. There are tools now that land every booking in one place on their own, whichever channel it came from',
  },
  other: {
    week: 'At most small offices the same information gets typed into two or three places by somebody whose actual job is something else.',
    they: 'offices', task: 'the typing', hook: 'the same details typed in two or three places',
    firstLook: 'the double entry. There are tools now that take the details once and show them everywhere they are needed',
  },
};
// ---------------------------------------------------------------------------
// RUSS'S OWN REWRITES, ALONGSIDE THE WRITTEN ONES.
//
// Editing a message on screen used to change that one message and nothing
// else. He asked twice for his edits to become the pattern: "I want my edits to
// spread as examples of how the rest should be written so I don't have to do it
// every fucking time" (2026-08-31).
//
// So a sentence he rewrites is kept in the database and joins the list it
// belongs to, as one more way of saying that line. It never replaces the
// written ones — his rewrite and the four originals all stay in the draw, so
// two neighbouring businesses still never get the same letter.
//
// Held in memory because drafting is synchronous and happens hundreds of times
// a run. Reloaded at start-up and again the moment he approves one.
const HIS_OWN = new Map();

async function loadHisWordings(db) {
  HIS_OWN.clear();
  const rows = await db.voiceWording.findMany({ where: { retiredAt: null }, select: { slot: true, wording: true } });
  for (const r of rows) {
    if (!HIS_OWN.has(r.slot)) HIS_OWN.set(r.slot, []);
    HIS_OWN.get(r.slot).push(r.wording);
  }
  return rows.length;
}

// The written wordings plus anything he has added for that line.
function waysToSay(list, slot) {
  const his = HIS_OWN.get(slot);
  return his && his.length ? list.concat(his) : list;
}

// Every line the message is assembled from, by the name used to pick it. This
// is what lets an edit be traced back to the sentence it replaced.
function slotsOfTheMessage() {
  return {
    who: WHO_I_AM,
    handled: ALREADY_HANDLED,
    whyme: WHY_ME,
    offer: THE_OFFER,
    ask0: ASK_DAY0,
    ask4: ASK_DAY4,
    part: DAY4_THE_PART,
    look: DAY4_WHAT_ID_LOOK_FOR,
    last: DAY8_OPEN,
    forthat: DAY8_THATS_WHAT_ITS_FOR,
    close8: DAY8_CLOSE,
    noteclose: NOTE_CLOSE,
  };
}

// Each line is chosen by the business's own name, so it reads the same for them
// on every redraft and differently from the shop down the road. The salt makes
// each line choose separately — without it, two businesses landing on the same
// wording for one line land on it for every line and the whole letter matches.
function dayZero(name, t, seed = '') {
  return [
    name ? `Hi ${name},` : 'Hello,',
    pick(waysToSay(WHO_I_AM, 'who'), seed, 'who'),
    `${t.week} ${pick(waysToSay(ALREADY_HANDLED, 'handled'), seed, 'handled').replace('{they}', t.they)}`,
    pick(waysToSay(WHY_ME, 'whyme'), seed, 'whyme'),
    pick(waysToSay(THE_OFFER, 'offer'), seed, 'offer'),
    pick(waysToSay(ASK_DAY0, 'ask0'), seed, 'ask0'),
  ].join('\n\n');
}

function dayFour(name, t, seed = '') {
  return [
    name ? `Hi ${name},` : 'Hello,',
    `I wrote to you earlier this week about ${t.hook}.`,
    pick(waysToSay(DAY4_THE_PART, 'part'), seed, 'part').replace('{task}', t.task),
    pick(waysToSay(DAY4_WHAT_ID_LOOK_FOR, 'look'), seed, 'look'),
    pick(waysToSay(ASK_DAY4, 'ask4'), seed, 'ask4'),
  ].join('\n\n');
}

function dayEight(name, t, tradeWord, seed = '') {
  return [
    name ? `Hi ${name},` : 'Hello,',
    pick(waysToSay(DAY8_OPEN, 'last'), seed, 'last'),
    `For ${tradeWord} the first thing I'd look at is ${t.firstLook}. Which one is right depends on how you actually work.`,
    pick(waysToSay(DAY8_THATS_WHAT_ITS_FOR, 'forthat'), seed, 'forthat'),
    pick(waysToSay(DAY8_CLOSE, 'close8'), seed, 'close8'),
  ].join('\n\n');
}

// A trade nobody recorded, or one this file has never heard of, gets the plain
// version rather than an empty paragraph. 11 businesses with a live email have
// no trade on the record at all (counted 2026-08-30).
function tradeCopy(trade) {
  return TRADES[String(trade || '').toLowerCase()] || TRADES.other;
}

// What to call a business of this kind in day 8's opening line.
const TRADE_WORD = {
  accounting: 'an accounting firm', construction: 'a construction outfit', dental: 'a dental practice',
  medical: 'a medical office', veterinary: 'a veterinary clinic', legal: 'a law firm',
  insurance: 'an insurance agency', 'real estate': 'a real estate office',
  manufacturing: 'a manufacturing shop', auto: 'a repair shop', trades: 'a trade shop',
  landscaping: 'a landscaping outfit', 'cleaning & facilities': 'a cleaning company',
  'storage & logistics': 'a logistics operation', staffing: 'a staffing agency',
  agriculture: 'a farm office', 'retail & food': 'a shop or kitchen',
  'personal care': 'a salon or studio', 'fitness & recreation': 'a gym or studio',
  'professional services': 'a firm like yours', 'nonprofit & community': 'a nonprofit',
  'education & childcare': 'a preschool or daycare', 'lodging & hospitality': 'a place like yours',
  other: 'a small office',
};
function tradeWordFor(trade) { return TRADE_WORD[String(trade || '').toLowerCase()] || TRADE_WORD.other; }

// Day 4's subject, named with no verb so a plural hook ("the recall calls")
// does not produce "What the recall calls actually costs".
function subjectDayFour(t) { return `The cost of ${t.hook}`; }

// THE LINKEDIN NOTE — the same offer, at the length a message window is read.
//
// Nothing of Russ's copy is cut to hit a length. An earlier version dropped the
// build line and the five-to-twenty hours to fit 700 characters without saying
// so — his words, quietly removed. The credibility line goes, because the
// profile carries it; the offer does not (2026-08-30).
const WHO_I_AM_SHORT =
  "I'm local to Central Oregon and I take repetitive office work off small businesses and hand it to software automations and AI supported solutions.";

function linkedInNote(name, t, seed = '') {
  return [
    `${name ? `Hi ${name},` : 'Hello,'} ${WHO_I_AM_SHORT}`,
    `${t.week} ${pick(waysToSay(ALREADY_HANDLED, 'handled'), seed, 'handled').replace('{they}', t.they)}`,
    pick(waysToSay(THE_OFFER, 'offer'), seed, 'offer'),
    pick(waysToSay(NOTE_CLOSE, 'noteclose'), seed, 'noteclose'),
  ].join('\n\n');
}

module.exports = {
  WHO_I_AM, WHO_I_AM_SHORT, WHY_ME, THE_OFFER, ALREADY_HANDLED, TRADES,
  tradeCopy, tradeWordFor, subjectDayFour, dayZero, dayFour, dayEight, linkedInNote,
  loadHisWordings, waysToSay, slotsOfTheMessage,
};