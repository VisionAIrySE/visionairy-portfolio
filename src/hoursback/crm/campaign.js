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

// FIXED — the same for every business, in Russ's words.
const WHO_I_AM =
  "I'm local to Central Oregon and I take repetitive office work off small businesses and hand it off to software automations and AI supported solutions to help save my customers time and money to focus on things that build their business.";

const WHY_ME =
  "I've run the offices I'm offering to fix — finance, construction, my own businesses. I'm not a software person guessing at how your week works.";

// The offer, whole, and the only place the deliverable is described. Note what it
// does NOT say: no price, no fee, and no claim about a client Russ has served.
// "Customers like you have found" is what businesses in their position find, not
// a case study — he has no clients yet and must never write one.
const THE_OFFER =
  "Give me fifteen minutes on the phone and I'll go away and do the research for you at no cost. I'll bring you back one tool that solves a specific challenge for you, what it costs to implement and why it makes sense, plus what it would take to build the parts nothing off the shelf covers. Customers like you have found anywhere from five to twenty hours a week of repetitive tasks and taken them off the table this way.";

const ASK_DAY0 = "No charge for the review, nothing to sign and you get my best recommendation for a tool that will save your team significant time and money. Worth a quarter of an hour? Reply here, or take a time from my calendar below.";
const ASK_DAY4 = "No charge, nothing to sign, and you get my best recommendation for a tool that will save your team real time and money. Fifteen minutes? Reply here, or take a time from my calendar below.";
const ASK_DAY8 = "My calendar's below if it's worth a look.";

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

function dayZero(name, t) {
  return [
    name ? `Hi ${name},` : 'Hello,',
    WHO_I_AM,
    `${t.week} Some ${t.they} may have that task handled, but many have three or four more like it burning time in the wings.`,
    WHY_ME,
    THE_OFFER,
    ASK_DAY0,
  ].join('\n\n');
}

function dayFour(name, t) {
  return [
    name ? `Hi ${name},` : 'Hello,',
    `I wrote to you earlier this week about ${t.hook}.`,
    `Here's the part most owners have never really considered. It isn't ${t.task}. It's that the person doing it was hired to do something else, and that work waits while they spend time on repetitive, tedious tasks.`,
    "That number and those tasks are what I'd go looking for in fifteen minutes — not to sell you on anything, but so you know what it's worth before you decide whether to fix it.",
    ASK_DAY4,
  ].join('\n\n');
}

function dayEight(name, t, tradeWord) {
  return [
    name ? `Hi ${name},` : 'Hello,',
    'Last note from me.',
    `For ${tradeWord} the first thing I'd look at is ${t.firstLook}. Which one is right depends on how you actually work.`,
    "That's what the fifteen minutes is for. I come back to you with the specific product, what it costs, and why it fits you.",
    ASK_DAY8,
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

// Day 4's subject is the same concrete noun day 0 opened on, said shorter. The
// subject and the first line must not repeat each other.
// Named with no verb, so a plural hook ("the recall calls") does not produce
// "What the recall calls actually costs".
function subjectDayFour(t) { return `The cost of ${t.hook}`; }

module.exports = { WHO_I_AM, WHY_ME, THE_OFFER, TRADES, tradeCopy, tradeWordFor, subjectDayFour, dayZero, dayFour, dayEight };

// THE LINKEDIN NOTE — the same offer, at the length a message window is read.
//
// A note is read to about 700 characters and abandoned after that, so this is
// the email's three paragraphs boiled to three sentences. Nothing new is
// promised and nothing is dropped: who Russ is, the trade's week with the room
// to say "we've done that one", and the free fifteen minutes with what comes
// back from it. The credibility line and the study both go — on this channel
// there is no room, and the profile carries the credibility anyway.
const WHO_I_AM_SHORT =
  "I'm local to Central Oregon and I take repetitive office work off small businesses and hand it to software automations and AI supported solutions.";

function linkedInNote(name, t) {
  return [
    `${name ? `Hi ${name},` : 'Hello,'} ${WHO_I_AM_SHORT}`,
    `${t.week} Some ${t.they} may have that one handled, but many have three or four more like it burning time in the wings.`,
    "Give me fifteen minutes and I'll go away and do the research for you at no cost. I'll bring you back one tool that solves a specific challenge for you, what it costs to implement and why it makes sense, plus what it would take to build the parts nothing off the shelf covers. Customers like you have found anywhere from five to twenty hours a week of repetitive tasks and taken them off the table this way.",
    'No charge for the review, nothing to sign and you get my best recommendation for a tool that will save your team significant time and money. Worth a quarter of an hour?',
  ].join('\n\n');
}

module.exports.linkedInNote = linkedInNote;
module.exports.WHO_I_AM_SHORT = WHO_I_AM_SHORT;
