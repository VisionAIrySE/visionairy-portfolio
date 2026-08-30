// Understand a business's website the way a person would.
//
// Built 2026-08-28. Russ, having asked for this more than once and watched me
// write another pattern instead: "Stop doing keyword bullshit and use your
// semantic language capabilities to UNDERSTAND what is on the pages."
//
// Everything the old reader got wrong came from the same place. It looked for
// SHAPES — a capitalised pair of words that might be a name, a job title from
// a fixed list sitting next to it, an "@" with letters around it. Shapes can
// be found without understanding anything, which is why:
//
//   - Roles came back empty on most sites and the record said "their team page
//     gives no job titles". The pages said it. They just said it in a sentence
//     ("Dan keeps the trucks moving") instead of in a layout the pattern knew.
//   - Addresses were collected in a pile and handed to whichever name was
//     nearest, because "nearest" is measurable and "belongs to" is not.
//   - A shared inbox and a person's address look identical to a pattern.
//
// So this asks, in words, and accepts "I cannot tell" — the one answer no
// pattern can ever give.
//
// WHAT IT REFUSES TO DO, which matters more than what it fills in:
//   - never invents an address, a number or a profile that is not on the page
//   - never presents a shared inbox as a person's address
//   - never guesses a title; where the page does not say, the field stays empty
//   - never keeps a "person" who is really a company, a heading or a menu item

// ---------------------------------------------------------------------------
// The page as a reader would see it.
//
// Stripping the tags loses every address and number that lives in a link —
// <a href="mailto:dan@x.com">Email Dan</a> becomes "Email Dan", and the one
// fact worth having is gone. So links to people are folded into the text where
// they sit, before anything is stripped.
function readableText(html) {
  return String(html || '')
    // Characters that are not text. A site in the list carries a null byte in
    // its markup, and the question is handed to the reader as a command line,
    // which refuses one outright — so a single page killed the entire pass over
    // 1,141 businesses, twice (2026-08-28). Nothing here is ever readable and
    // none of it is on the page as far as a person is concerned.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // SQUARE brackets, not angle brackets. Written as <dan@firkus.com> the
    // address was put back into the text and then stripped four lines below by
    // the rule that removes tags, which cannot tell an address in angle
    // brackets from a tag. Every address that lives only inside a "click here
    // to email" link — which is most of them on a small business site — was
    // silently lost (2026-08-28, caught by a check, not by looking).
    .replace(/<a[^>]*href=["']mailto:([^"'?\s]+)[^>]*>([\s\S]*?)<\/a>/gi, ' $2 [email $1] ')
    .replace(/<a[^>]*href=["']tel:([^"']+)[^>]*>([\s\S]*?)<\/a>/gi, ' $2 [tel $1] ')
    .replace(/<a[^>]*href=["'](https?:\/\/[^"']*linkedin\.com\/in\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, ' $2 [linkedin $1] ')
    .replace(/<img[^>]*alt=["']([^"']{3,60})["'][^>]*>/gi, ' $1 ')
    .replace(/<\/(p|div|h[1-6]|li|td|th|tr|section|article|header|footer|nav|ul|ol|blockquote|figcaption|label)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#8211;|&ndash;/gi, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// The trades a business can be filed under. Anything that does not fit is
// left unfiled rather than forced into the nearest box.
const TRADES = ['dental', 'veterinary', 'medical', 'legal', 'accounting', 'insurance',
  'real estate', 'construction', 'trades', 'auto', 'landscaping', 'manufacturing',
  'storage & logistics', 'retail & food', 'staffing', 'personal care',
  'fitness & recreation', 'lodging & hospitality', 'cleaning & facilities',
  'agriculture', 'education & childcare', 'nonprofit & community',
  'professional services', 'funeral & memorial'];

// How much of each page is worth handing over. A business says what it is and
// names its people in the first part of a page; below that is blog posts and
// footers, where any word can appear and nothing is being claimed.
const PER_PAGE_CHARS = 4500;
const TOTAL_CHARS = 20000;

// Everything the reader is given, as one document with the pages labelled so
// the answer can say where a fact was seen.
function pagesAsDocument(pages = []) {
  const parts = [];
  let used = 0;
  for (const page of pages) {
    const text = readableText(page.html).slice(0, PER_PAGE_CHARS);
    if (text.length < 40) continue;
    const block = `--- page: ${page.url} ---\n${text}`;
    if (used + block.length > TOTAL_CHARS) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// The question.
//
// Written as a question a person would answer, not a schema to fill. Every
// rule below is here because the old reader broke it.
function questionAbout(businessName, document) {
  return `You are reading a small business's own website to fill in a customer record for a salesperson. Read it for MEANING. Never pattern-match.

The record says the business is called: ${businessName}

Here are pages from their website. Email addresses that were inside links appear as [email ...], phone numbers as [tel ...], LinkedIn profiles as [linkedin ...].

${document}

--- end of pages ---

Answer with JSON only, no other words, in this shape:

{
  "theirOwnSite": true if these pages are the business's OWN website, false if they are a directory, a licence lookup, a listing, a marketplace, a parked domain, or another company's site,
  "trade": one of ${JSON.stringify(TRADES)} or null,
  "tradeSure": true or false,
  "whatTheyDo": one short sentence in their own terms, or null,
  "realName": what this business is CALLED — the trading name the owner would say answering the phone — or null if the site never states it plainly,
  "people": [
    {
      "name": "the person's full name as printed",
      "role": "what they actually do, in two or three words, or null",
      "roleWasPrinted": true if a job title was printed, false if you worked it out from a sentence about them,
      "email": "their own address, or null",
      "phone": "their direct number, or null",
      "linkedIn": "their profile URL, or null",
      "seenOn": "the page URL you read them from"
    }
  ],
  "sharedEmail": "the general inbox like info@ or office@, or null",
  "mainPhone": "the main number, or null",
  "waysToReachThem": array of any of ["published email","contact form","online booking","live chat","phone only"],
  "canBookOnline": true if a visitor can book or schedule without phoning, false if not, null if you cannot tell,
  "formsToPrint": true if they ask people to download, print or fill in a document and bring or send it back,
  "listsAFax": true if a fax number appears anywhere,
  "hiringOffice": true if they are advertising an office, admin, reception, bookkeeping or scheduling job right now,
  "yearsInBusiness": a number if they say how long they have been going, else null,
  "separateOperations": how many genuinely DIFFERENT businesses this one company runs, as a number — 1 for a company doing one trade however many services it lists, higher only where the operations are truly different from each other,
  "stalledBuild": one plain sentence quoting what on the page suggests they already wanted software built and did not get it, or null,
  "cannotTell": one plain sentence naming what this site never says, or null
}

Rules that matter more than filling a field in:

TRADE. Judge what the business IS, not what words appear. A firm of accountants whose benefits page mentions dental insurance is accounting. A supplier who sells to roofers is not a roofing contractor. A crane company that works on building sites is not a builder. If it is genuinely between two, set trade to null and say so in cannotTell — a wrong answer costs far more than a blank.

WHAT THEY ARE CALLED. Answer realName for every site, not only where something looks wrong. It is the name on the sign, the one a customer would say out loud — "La Pine Tool Rental", "Bend Family Dentistry", "Fortress Construction". It is NOT the browser tab title ("Home - Ewing", "Welcome - La Pine Ace Rentals"), NOT a slogan or a promise ("Knowledge, Experience, and proven results"), NOT a description of the service, NOT a page name, and NOT a location on its own. Strip any tacked-on tagline, city, or trade blurb and give the name alone. If the pages genuinely never say what the business is called, answer null — a null here is a true answer and a tagline in its place is a record nobody can find.

PEOPLE. Only actual human beings who work there. Not the company, not a page heading, not a menu item, not a testimonial customer, not a partner firm.

And not a PROJECT, a BUILDING, a PLACE or a CLIENT. A contractor's portfolio reads "Deschutes Children's Foundation", "Hood River Middle School", "Central Oregon Community College" beside words like director, principal and superintendent — those are the jobs the contractor BUILT, and the words next to them belong to the client, not to anybody who works here. Before you keep a name, ask whether a human being with that name draws a wage at this business. If the answer is anything other than clearly yes, leave them out. If a name appears with no indication they work there, leave them out.

ROLES. A role written as a sentence still counts. "Dan keeps the trucks moving" makes Dan operations — set role to "operations" and roleWasPrinted to false. But never guess: if the page names someone and says nothing about what they do, role is null. An empty role is a true answer; an invented one is a lie in a salesperson's hands.

ADDRESSES. Only the address that belongs to that specific person. If one address is published for the whole business — info@, office@, contact@, hello@, admin@, frontdesk@ — it goes in sharedEmail and NOWHERE else. Never hand a shared inbox to a person. Never construct an address from a naming pattern you noticed; if it is not printed, it is null.

NUMBERS. A direct line is one printed beside that person. The number in the header or footer is the main number and goes in mainPhone. Do not give the main number to a person.

PROFILES. Only a LinkedIn URL that appears on the page. Never guess one from a name.

BOOKING. "Can a visitor book without phoning" means a real booking or scheduling tool, or a request form that starts an appointment. A phone number, however prominent, is not online booking. If the business is one nobody books — a manufacturer, a wholesaler — answer null, not false.

HOW MANY BUSINESSES ARE REALLY IN HERE. An electrician who does "wiring, additions, panel replacements and service work" is running ONE business and listing what electricians do — answer 1. A contractor who does "junk removal, snow plowing, excavation, septic services and equipment transport" is running four or five genuinely different operations out of one office, each with its own customers, kit and season — answer 5. The test is not how many things are listed but whether a customer of one would ever be a customer of another. Counting the commas gets this wrong every time, which is why you are being asked rather than a rule.

SOMETHING THEY ALREADY WANTED BUILT. Russ's biggest single deal came from a man who had already decided what he wanted, been quoted three hundred thousand dollars for it by a development shop, and shelved it. He was not persuaded of anything — he was waiting for a price he could say yes to. Answer stalledBuild only when the PAGE ITSELF shows that shape: a piece of SOFTWARE announced and never delivered — a client portal, an online booking system, an app, a member area, a dashboard — or a page that has been "coming soon" long enough to look abandoned, an advert for a developer or a technical hire, a named tool or platform they clearly resent or say they are moving off, two systems described with a person typing between them, or a service offered that plainly needs software behind it and visibly has none. Quote the words that made you say it. It must be about SOFTWARE. A coaching programme, a new service line, a shop opening, a course or a product that is "coming soon" is a business launching something, not somebody who was quoted for a build and shelved it — the first read of this question flagged a counsellor whose one-to-one coaching was marked coming soon, and an email about a shelved software project would have been nonsense to him. Answer null unless the page genuinely shows it — this is rare, and a guess here sends a stranger an email about a project they never had.

WHOSE SITE IS THIS. Answer theirOwnSite first, before anything else, because everything else depends on it. A directory that lists this business names it, describes it, and often prints a phone number — so "does this page mention the business" proves nothing. What you are judging is whether the business WROTE these pages. A page that says "verify a contractor's licence", "find a provider near you", "claim this listing", "compare quotes", or that carries many other businesses alongside this one, is somebody else's site. If theirOwnSite is false, return people as an empty array and every contact field as null, and say whose site it is in cannotTell — an address taken off a directory belongs to the directory, and writing to it reaches a stranger.`;
}

// ---------------------------------------------------------------------------
// Taking the answer, and refusing the parts that break the rules above.
//
// The reader is good but it is not a guarantee, and a fact that reaches the
// record is a fact Russ will say out loud on a phone call. So everything is
// checked back against the page it claims to come from: an address that is not
// in the text was not read, it was constructed.
const SHARED_MAILBOX = /^(info|office|contact|hello|admin|mail|email|team|sales|support|help|service|reception|frontdesk|front[._-]?desk|inquiries|enquiries|general|main|customerservice|billing|accounts|accounting|hr|jobs|careers|marketing|webmaster|noreply|no-reply|orders|scheduling|appointments|booking|reservations)@/i;

// AN ADDRESS THAT NOBODY WILL EVER ANSWER.
//
// Two veterinary clinics carry privacy@nva.com — the legal inbox of the group
// that owns them. It is a real, working address, so every test for "is this a
// real address" passes it, and it reaches a compliance department that will
// never read a note about office hours. It is the same harm as a placeholder:
// a blank shows as missing and gets worked; this looks like a way in and
// quietly costs Russ the business (2026-08-28).
const NEVER_ANSWERS = /^(privacy|legal|dmca|abuse|postmaster|noreply|no-reply|donotreply|do-not-reply|unsubscribe|compliance|webmaster|hostmaster|security|spam)@/i;

// An address that is not an address. Horner Law's record came back with
// "your@email" as its email — the grey placeholder text inside their own
// contact form. It was genuinely on the page, so "did you actually read this"
// was not enough of a test. A placeholder in the email field is worse than a
// blank: a blank shows as missing, a placeholder looks like a working address
// and quietly bounces every message written to it.
const NOT_REALLY_AN_ADDRESS = [
  /^(your|you|name|firstname|first|last|lastname|username|user|someone|somebody|me|my|our|the)@/i,
  /@(email|domain|example|yourdomain|yoursite|website|site|company|address|mail|mailservice|emailservice|yourwebsite)\b/i,
  // Four businesses carried mymail@mailservice.com — the address a website
  // template ships with, left in place by whoever built the site (2026-08-28).
  /^(mymail|myemail|youremail|contactme)@/i,
  /^(email|e-mail|enter|type|address|sample|test|placeholder|abc|xyz|aaa)@/i,
  /example\.(com|org|net)$/i,
  /@[^.]+$/,                     // no dot after the @ at all
  /\.(png|jpe?g|gif|svg|webp|css|js)$/i,
  /[\\<>"'(){}[\]\s,;]/,         // punctuation no address ever carries
];
function isARealAddress(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v || v.length < 6 || v.length > 100) return false;
  if ((v.match(/@/g) || []).length !== 1) return false;
  const [box, host] = v.split('@');
  if (!box || !host) return false;
  if (!/^[a-z0-9][a-z0-9._%+-]*[a-z0-9]$/.test(box) && !/^[a-z0-9]$/.test(box)) return false;
  if (!/^[a-z0-9.-]+\.[a-z]{2,24}$/.test(host)) return false;
  return !NOT_REALLY_AN_ADDRESS.some((re) => re.test(v));
}

// A person's name has to be a person's name. Two rules, both about the string
// itself, which is the only place a pattern belongs.
// A single first name is a real person. Plenty of team pages list staff as
// "Linda — Office Manager" and nothing more. An earlier version of this
// demanded two words and would have deleted 304 of them (2026-08-28). So one
// word is allowed, on the condition that something is attached to it — a job,
// an address, a number. A bare word on its own is the shape a heading takes.
function looksLikeAHuman(name, hasSomethingAttached = true) {
  const n = String(name || '').trim();
  if (n.length < 2 || n.length > 60) return false;
  if (!/^[A-Z]/.test(n)) return false;
  const words = n.split(/\s+/);
  if (words.length > 5) return false;
  if (words.length === 1 && !hasSomethingAttached) return false;
  if (/\b(LLC|Inc|Corp|Company|Co\.|Ltd|LLP|PC|PLLC|Group|Services|Solutions|Team|Department|Center|Centre|Clinic|Office|Associates|Partners|Enterprises|Industries|Systems|Insurance|Dental|Medical|Law|Realty|Construction|Supply|Products|Holdings)\b/i.test(n)) return false;
  if (/[@\d]|https?:/.test(n)) return false;
  // A heading, a menu item, a call to action — never a person.
  // "Skip" is deliberately not in this list. It is a menu word ("Skip to
  // content") and it is also a man's name — Skip David Shields is on this
  // list and is a real person, so only the menu phrase is refused.
  if (/^skip\s+to\b/i.test(n)) return false;
  if (/^(Home|About|Contact|Menu|Search|Learn|Read|More|View|Book|Call|Get|Our|Your|We|The|This|Meet|Team|Staff|Welcome|Privacy|Terms|Careers|Blog|News|Services|Products|Locations|Reviews|Testimonials|FAQ|Copyright|Español|Espanol)\b/i.test(n)) return false;
  return true;
}

const A_PHONE = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/;
function tidyPhone(v) {
  const m = A_PHONE.exec(String(v || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// The name a business is called, kept only where the page actually printed it.
//
// Every test here is about the STRING — was it in the text, is it the shape of
// a browser tab title rather than a name. What the business is CALLED is a
// question about meaning and belongs to the reader. This only refuses what the
// reader plainly could not have read off the page.
function nameThatWasPrinted(value, haystack, businessName) {
  const n = String(value || '').trim().replace(/\s+/g, ' ');
  if (n.length < 3 || n.length > 70) return null;
  if (n.toLowerCase() === String(businessName || '').trim().toLowerCase()) return null;
  if (/&(amp|nbsp|quot|apos|#\d+);/i.test(n)) return null;      // raw page code
  if (/ [-|–—] /.test(n)) return null;                           // a tab title, joined up
  if (/^(home|about|contact|welcome|index|menu|services)\b/i.test(n)) return null;
  if (/\b(near me|click here|read more|learn more)\b/i.test(n)) return null;
  // A name that is not in the text was not read off their site, it was composed.
  if (!String(haystack || '').includes(n.toLowerCase())) return null;
  return n;
}

// Everything kept has to be findable in what was actually read.
function keepOnlyWhatWasRead(answer, document, businessName) {
  const haystack = String(document || '').toLowerCase();
  const said = answer && typeof answer === 'object' ? answer : {};

  // WHOSE SITE WAS THAT. HALL Electric's record came back with
  // info@ccblookup.com as its email — a contractor licence lookup, not their
  // business. The reader had said so plainly in its own note and the answer
  // was saved anyway (2026-08-28). Nothing off somebody else's page is worth
  // having: the address reaches a stranger, the people work elsewhere, and the
  // trade was written by a directory that files everyone the same way.
  if (said.theirOwnSite === false) {
    return {
      trade: null, tradeUnsure: false, whatTheyDo: null, realName: null,
      people: [], sharedEmail: null, mainPhone: null, waysToReachThem: [],
      canBookOnline: null, formsToPrint: false, listsAFax: false,
      hiringOffice: false, yearsInBusiness: null, stalledBuild: null, separateOperations: 1,
      notTheirSite: true,
      cannotTell: typeof said.cannotTell === 'string' && said.cannotTell.trim().length > 5
        ? said.cannotTell.trim().slice(0, 240)
        : 'these pages belong to a directory or another company, not to this business',
      dropped: [],
    };
  }
  const out = {
    // Kept only when the reader quoted enough to be checkable. A one-word
    // "yes" here would put a stranger on a list of people who wanted software
    // built, and the email that follows would be about a project they never had.
    stalledBuild: typeof said.stalledBuild === 'string' && said.stalledBuild.trim().length > 20
      ? said.stalledBuild.trim().slice(0, 240) : null,
    separateOperations: Number.isFinite(said.separateOperations)
      ? Math.max(1, Math.min(8, Math.round(said.separateOperations))) : 1,
    trade: TRADES.includes(said.trade) && said.tradeSure !== false ? said.trade : null,
    tradeUnsure: Boolean(said.trade) && said.tradeSure === false,
    whatTheyDo: typeof said.whatTheyDo === 'string' && said.whatTheyDo.trim().length > 8
      ? said.whatTheyDo.trim().slice(0, 200) : null,
    // The name it came back with, checked the only way a rule honestly can:
    // was it actually printed on the page, and is it the shape of a name rather
    // than the shape of a tab title. 194 of 1,268 businesses carry a name a
    // person would call wrong — "Home", "Circulars - Grocery Outlet", "Bend
    // Dentist — Bend Family Dentistry — Third Street — Bend, OR" — so this is
    // the most visible field on the whole list (2026-08-28).
    realName: nameThatWasPrinted(said.realName, haystack, businessName),
    people: [],
    sharedEmail: null,
    mainPhone: tidyPhone(said.mainPhone),
    waysToReachThem: Array.isArray(said.waysToReachThem)
      ? said.waysToReachThem.filter((w) => typeof w === 'string').slice(0, 6) : [],
    // Three-state on purpose. false means "checked, they cannot"; null means
    // "the question does not apply here" — nobody books a fabrication shop, so
    // that shop must not lose points for having no booking button.
    canBookOnline: said.canBookOnline === true ? true : said.canBookOnline === false ? false : null,
    formsToPrint: said.formsToPrint === true,
    listsAFax: said.listsAFax === true,
    hiringOffice: said.hiringOffice === true,
    yearsInBusiness: Number.isFinite(Number(said.yearsInBusiness)) && Number(said.yearsInBusiness) > 0
      && Number(said.yearsInBusiness) < 200 ? Math.round(Number(said.yearsInBusiness)) : null,
    cannotTell: typeof said.cannotTell === 'string' && said.cannotTell.trim().length > 5
      ? said.cannotTell.trim().slice(0, 240) : null,
    dropped: [],
  };

  if (typeof said.sharedEmail === 'string' && isARealAddress(said.sharedEmail)
      && !NEVER_ANSWERS.test(said.sharedEmail.trim())
      && haystack.includes(said.sharedEmail.trim().toLowerCase())) {
    out.sharedEmail = said.sharedEmail.trim().toLowerCase();
  }

  const takenEmails = new Set();
  for (const p of Array.isArray(said.people) ? said.people : []) {
    if (!p || typeof p !== 'object') continue;
    const name = String(p.name || '').trim();
    if (!looksLikeAHuman(name)) { out.dropped.push(`${name || '(no name)'} — not a person's name`); continue; }
    // Their name has to actually be on the page they were read from.
    if (!haystack.includes(name.toLowerCase())) { out.dropped.push(`${name} — not found on the pages`); continue; }

    let email = isARealAddress(p.email) && !NEVER_ANSWERS.test(String(p.email).trim())
      ? p.email.trim().toLowerCase() : null;
    if (email && !haystack.includes(email)) email = null;          // constructed, not read
    if (email && SHARED_MAILBOX.test(email)) {                      // a shared inbox is nobody's
      if (!out.sharedEmail) out.sharedEmail = email;
      email = null;
    }
    if (email && takenEmails.has(email)) email = null;              // one address, one person
    if (email) takenEmails.add(email);

    let phone = tidyPhone(p.phone);
    if (phone && out.mainPhone && phone === out.mainPhone) phone = null;   // the switchboard is nobody's direct line

    let linkedIn = typeof p.linkedIn === 'string' && /linkedin\.com\/in\//i.test(p.linkedIn)
      ? p.linkedIn.trim() : null;
    if (linkedIn && !haystack.includes(linkedIn.toLowerCase().replace(/\/$/, ''))) linkedIn = null;

    const role = typeof p.role === 'string' && p.role.trim().length > 1 && p.role.trim().length < 60
      ? p.role.trim() : null;

    out.people.push({
      name, role,
      roleWasPrinted: role ? p.roleWasPrinted !== false : null,
      email, phone, linkedIn,
      seenOn: typeof p.seenOn === 'string' ? p.seenOn : null,
    });
  }
  return out;
}

module.exports = {
  TRADES, PER_PAGE_CHARS, TOTAL_CHARS, SHARED_MAILBOX,
  readableText, pagesAsDocument, questionAbout, looksLikeAHuman, tidyPhone, nameThatWasPrinted,
  keepOnlyWhatWasRead, isARealAddress, NOT_REALLY_AN_ADDRESS, NEVER_ANSWERS,
};
