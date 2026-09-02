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

// How much of each page one model call is handed. The allowance is PER
// PURPOSE GROUP, not per site: the old single site-wide budget stopped the
// reader at roughly four pages however many the crawl fetched, which is the
// cap this replaces (2026-09-01). A group whose pages exceed the allowance is
// read in batches — nothing is dropped, and any page that had to be shortened
// is named in a cut marker so the loss is visible, never silent.
const PER_PAGE_CHARS = 4500;
const GROUP_CHARS = 18000;

// One flat document from a list of pages, for callers that still read a site
// in one question (the OpenRouter-based reader keeps this shape). The budget
// is an argument now, not a hidden site-wide constant.
function pagesAsDocument(pages = [], allowance = GROUP_CHARS) {
  const withText = pages.map((p) => ({ url: p.url, text: p.text !== undefined && p.text !== null ? String(p.text) : readableText(p.html) }));
  const { batches } = groupDocuments(withText, { allowance });
  return batches.length ? batches[0].document : '';
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
      "seenOn": "the page URL you read them from",
      "basedAt": "the town or office THIS PERSON works from, if the pages say so — else null"
    }
  ],
  "locations": [
    { "town": "a town this business operates from", "isHeadOffice": true or false, "seenOn": "the page URL that says so" }
  ],
  "sharedEmail": "the general inbox like info@ or office@, or null",
  "mainPhone": "the main number, or null",
  "postalAddress": "their street address as printed, or null — the place of business, never a page heading and never the words around a 'Get Directions' link",
  "companyProfile": "the BUSINESS's own LinkedIn company page URL, or null — never a person's profile",
  "teamSize": a number ONLY where the site states how many people work there ("a team of 12", "our 30 staff"), else null — never counted from how many names happen to be listed,
  "openOfficeRoles": how many office, admin, reception, bookkeeping or scheduling jobs they are advertising right now, as a number, or 0,
  "toolsInUse": array of software products the site shows they already use or pay for — a named booking widget, a scheduler, a payment provider, a review platform, a client portal — each as the product's own name, or an empty array,
  "whoRunsIt": "the name of the owner, principal or most senior person, where the pages make that plain — else null. Being listed first is not evidence.",
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

WHERE THEY ARE, AND WHERE EACH PERSON IS. A firm can have offices in several towns and one staff page listing everybody in all of them. Kernutt Stokes has offices in Bend, Corvallis, Eugene and Hillsboro; its team page names ninety-five people and says beside none of them which office they sit in, so ninety-five strangers went onto a record about Bend. Somebody in Corvallis is a hundred and thirty miles from the person we are writing to.

List every town the business operates from in "locations", each with the page that says so, and mark the head office if the pages name one.

Then, for each person, answer "basedAt" ONLY where the pages actually place them — their own profile page naming an office, a heading they are listed under, a direct line with a town beside it. **A bare staff directory with no office against a name tells you nothing: answer null.** Null is the correct and expected answer for most people on a firm-wide team page, and guessing from the head office, from the first town on the site, or from a surname is exactly the mistake that put a whole state's staff on one town's record.

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
      // separateOperations stays null: these pages are somebody else's, so
      // nothing was learned about this business — not "one operation".
      hiringOffice: false, yearsInBusiness: null, stalledBuild: null, separateOperations: null,
      locations: [],
      // Nothing off somebody else's page belongs on this record — not their
      // address, not their team size, not the software THEY pay for.
      postalAddress: null, companyProfile: null, teamSize: null,
      openOfficeRoles: null, toolsInUse: [], whoRunsIt: null, recentNews: null,
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
    // NULL WHERE THE READER DID NOT ANSWER, never 1.
    //
    // This used to fall back to 1, so "asked, and it runs one operation" and
    // "never asked" became the same value — permanently, on 105 records, with
    // no way back. Absence is data (2026-09-01, docs/hoursback/evidence-store.md).
    separateOperations: Number.isFinite(said.separateOperations)
      ? Math.max(1, Math.min(8, Math.round(said.separateOperations))) : null,
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
    // EVERY TOWN THIS BUSINESS WORKS FROM. A firm with offices in four towns
    // and one staff page listing everybody is why this exists: without it,
    // people who work a hundred and thirty miles away land on a record about
    // Bend and there is no way to tell (2026-09-01).
    // Asked for the first time 2026-09-01. Every one of these was already
    // visible on the page and was being thrown away, so the record stayed half
    // empty and a second pass over 1,602 sites would have been needed to get
    // them. The reader is on the page anyway; a question costs nothing.
    postalAddress: typeof said.postalAddress === 'string' && said.postalAddress.trim().length > 8
      ? said.postalAddress.trim().slice(0, 200) : null,
    companyProfile: typeof said.companyProfile === 'string' && /linkedin\.com\/company\//i.test(said.companyProfile)
      ? said.companyProfile.trim().slice(0, 300) : null,
    // Only where the site SAYS it. A count of names on a page is a floor, not
    // a team size, and the two must not be confused.
    teamSize: Number.isFinite(Number(said.teamSize)) && Number(said.teamSize) > 0
      && Number(said.teamSize) < 5000 ? Math.round(Number(said.teamSize)) : null,
    openOfficeRoles: Number.isFinite(Number(said.openOfficeRoles)) && Number(said.openOfficeRoles) >= 0
      ? Math.min(20, Math.round(Number(said.openOfficeRoles))) : null,
    toolsInUse: Array.isArray(said.toolsInUse)
      ? said.toolsInUse.filter((t) => typeof t === 'string' && t.trim().length > 1)
        .map((t) => t.trim().slice(0, 60)).slice(0, 12)
      : [],
    whoRunsIt: typeof said.whoRunsIt === 'string' && looksLikeAHuman(said.whoRunsIt)
      ? said.whoRunsIt.trim().slice(0, 80) : null,
    // What the news pages announced inside the last year. Asked of the news
    // group only (2026-09-01).
    recentNews: typeof said.recentNews === 'string' && said.recentNews.trim().length > 8
      ? said.recentNews.trim().slice(0, 300) : null,
    locations: Array.isArray(said.locations)
      ? said.locations
        .filter((l) => l && typeof l.town === 'string' && l.town.trim().length > 1)
        .slice(0, 12)
        .map((l) => ({
          town: l.town.trim().slice(0, 60),
          isHeadOffice: l.isHeadOffice === true,
          seenOn: typeof l.seenOn === 'string' ? l.seenOn : null,
        }))
      : [],
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
      // WHICH OFFICE THIS PERSON SITS IN, and null wherever the pages did not
      // say. Null is the expected answer on a firm-wide staff list, and it is
      // the honest one: Kernutt Stokes named 95 people across four Oregon
      // offices with no office beside any of them, and all 95 landed on a
      // record about Bend (2026-09-01).
      basedAt: typeof p.basedAt === 'string' && p.basedAt.trim().length > 1
        ? p.basedAt.trim().slice(0, 60) : null,
    });
  }
  return out;
}


// ---------------------------------------------------------------------------
// THE WHOLE-SITE READ, in purpose groups (2026-09-01).
//
// Russ: read every page, and sort each by what it is FOR. Six purposes —
// identity, services, contact, people, hiring, news — and a page may carry
// more than one: a contact page that names staff is read once with the
// contact questions and once with the people questions. Each non-empty group
// gets ONE focused model read (in batches where its text outgrows the
// allowance), the groups run in parallel, and a group with no pages costs
// zero model calls and is recorded as could_not_tell — never guessed at.

const PURPOSES = ['identity', 'services', 'contact', 'people', 'hiring', 'news'];

// The one honest answer a classifier can give that no pattern ever could.
// Same spelling as the reading store's status, on purpose.
const COULD_NOT_TELL = 'could_not_tell';

// What a page's ADDRESS says it is for.
const PURPOSE_PATHS = {
  identity: /^\/$|(^|\/)(about|about-us|our-story|story|company|who-we-are|history|mission|values)([/.]|$)/i,
  services: /(^|\/)(services?|what-we-do|solutions|capabilities|practice-areas|treatments?|procedures?|products?|shop|store|pricing|rates|rentals?|equipment|catalog|menu)([/.]|$)/i,
  contact: /(^|\/)(contact|contact-us|locations?|offices?|directions|find-us|hours|visit(-us)?)([/.]|$)/i,
  people: /(^|\/)(team|our-team|meet-the-team|staff|our-people|people|leadership|management|providers|attorneys|agents|doctors|dentists|physicians|associates|employees|bios?|directory)([/.]|$)/i,
  hiring: /(^|\/)(careers?|jobs?|join-our-team|join-us|employment|hiring|apply|work-with-us|opportunities|now-hiring)([/.]|$)/i,
  news: /(^|\/)(blog|news|articles?|posts?|press|media|updates?|events?|newsletter)([/.]|$)/i,
};

// What a page's WORDS say it is for — so a purpose is never missed just
// because the address gave nothing away.
const PURPOSE_WORDS = {
  identity: /\b(about us|our story|our mission|who we are|family[- ]owned|locally owned|founded in (19|20)\d{2}|serving [a-z .,-]+ since|in business since)\b/i,
  services: /\b(our services|services include|services we (offer|provide)|we (offer|provide|specialize in|install|repair|build|clean|design|deliver))\b/i,
  contact: /\b(contact us|get in touch|give us a call|reach (us|out)|our office is|visit us at|find us at)\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b\d+ [A-Z][A-Za-z]+ (Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Way|Court|Ct\.?|Highway|Hwy\.?|Suite|Ste\.?)\b/,
  people: /\b(our team|meet (the|our) team|our (staff|people)|leadership team|team members?)\b/i,
  hiring: /\b(we'?re hiring|now hiring|join (our|the) team|apply (now|today|online)|career opportunities|open positions?|employment opportunities|help wanted)\b/i,
  news: /\b(latest news|recent posts?|posted (on|by)|published (on|by)|press release|read more)\b/i,
};

// A name with a job title beside it is people evidence even where nobody
// wrote the words "our team" — a contact page listing "Jane Smith, Office
// Manager" belongs in the people group as well as the contact group.
const NAME_BESIDE_A_ROLE = /[A-Z][a-z]+(?: [A-Z]\.?)? [A-Z][a-z]+\s*[,–—|-]\s*(?:[A-Za-z]+ )?(owner|founder|president|ceo|coo|cfo|principal|partner|manager|director|attorney|paralegal|doctor|dentist|hygienist|physician|nurse|technician|estimator|receptionist|bookkeeper|accountant|coordinator|scheduler|dispatcher|broker|agent)\b/i;

// What one fetched page is FOR. Returns every purpose it carries — a page is
// never forced into a single box — and, beside each purpose, the address and
// the words the call rested on, so a reader can see WHY a page was called
// people as well as contact. A page that fits nothing is COULD_NOT_TELL, and
// no default purpose is ever written in its place: absence is data.
function classify(page) {
  let pathname = '';
  try { pathname = new URL(page.url).pathname; } catch { pathname = String(page.url || ''); }
  const text = page.text !== undefined && page.text !== null ? String(page.text) : readableText(page.html);
  const purposes = [];
  const restedOn = [];
  for (const purpose of PURPOSES) {
    let why = null;
    if (PURPOSE_PATHS[purpose].test(pathname)) why = `its address: ${pathname}`;
    if (!why) {
      const m = text.match(PURPOSE_WORDS[purpose]);
      if (m) why = m[0].slice(0, 120);
    }
    if (!why && purpose === 'people') {
      const m = text.match(NAME_BESIDE_A_ROLE);
      if (m) why = m[0].slice(0, 120);
    }
    if (why) {
      purposes.push(purpose);
      restedOn.push({ purpose, url: page.url, text: why });
    }
  }
  if (!purposes.length) return { url: page.url, purposes: COULD_NOT_TELL, restedOn: [] };
  return { url: page.url, purposes, restedOn };
}

// Every page the crawl returned, classified — the count of classified pages
// always equals the count of fetched pages, skipped ones included. Groups
// hold only the pages the model will actually be handed; a page a skip rule
// caught is classified and listed with the NAME of the rule that caught it,
// so a reader can always see why a page went unread.
function classifyPages(pages = []) {
  const groups = { identity: [], services: [], contact: [], people: [], hiring: [], news: [] };
  const classified = [];
  const skipped = [];
  for (const page of pages) {
    const c = classify(page);
    classified.push(c);
    if (page.skipFromReading) {
      skipped.push({ url: page.url, rule: page.skippedBy || 'skipped' });
      continue;
    }
    if (c.purposes === COULD_NOT_TELL) continue;
    for (const purpose of c.purposes) groups[purpose].push(page);
  }
  return { classified, groups, skipped };
}

// Which group answers which field. Every field this reader answers sits in
// exactly ONE of the two lists below. WHOLE_SITE_FIELDS are asked of every
// group — they are the fields whose empty answer across ALL groups fires the
// reconciliation read. Everything else is asked of exactly one group, so an
// empty answer there is simply could_not_tell for that field.
// (tradeSure and cannotTell are annotations on other answers, not fields.)
const WHOLE_SITE_FIELDS = ['theirOwnSite', 'realName', 'trade'];
const FIELDS_BY_GROUP = {
  identity: ['whatTheyDo', 'yearsInBusiness', 'separateOperations', 'whoRunsIt', 'teamSize', 'companyProfile'],
  services: ['canBookOnline', 'toolsInUse', 'formsToPrint', 'stalledBuild'],
  contact: ['sharedEmail', 'mainPhone', 'postalAddress', 'locations', 'waysToReachThem', 'listsAFax'],
  people: ['people'],
  hiring: ['hiringOffice', 'openOfficeRoles'],
  news: ['recentNews'],
};
const SINGLE_GROUP_FIELDS = Object.values(FIELDS_BY_GROUP).flat();

// ---------------------------------------------------------------------------
// Building each group's document.

// Text blocks repeating across three or more pages of one site — the shared
// menu, the footer, the cookie bar. Left in, they consume the allowance on
// every page and say nothing new after the first.
const REPEATS_ON_PAGES = 3;
function repeatedBlocks(pages = []) {
  const counts = new Map();
  for (const p of pages) {
    const text = p.text !== undefined && p.text !== null ? String(p.text) : readableText(p.html);
    const seenHere = new Set();
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t.length < 12) continue;
      if (seenHere.has(t)) continue;
      seenHere.add(t);
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return new Set([...counts].filter(([, n]) => n >= REPEATS_ON_PAGES).map(([t]) => t));
}

// A group's pages as documents the reader can hold: repeated blocks appear
// once instead of on every page, each page is capped, and pages that will not
// fit one allowance go into further BATCHES rather than being dropped. Any
// page whose text had to be shortened is named in `cut` — the full text stays
// in the row keepPage() wrote, so nothing is lost, only deferred.
function groupDocuments(pages = [], { allowance = GROUP_CHARS, repeated = new Set() } = {}) {
  const batches = [];
  const cut = [];
  const shownOnce = new Set();
  let parts = [];
  let inBatch = [];
  let used = 0;
  const closeBatch = () => {
    if (parts.length) batches.push({ document: parts.join('\n\n'), pages: inBatch });
    parts = []; inBatch = []; used = 0;
  };
  for (const page of pages) {
    const raw = page.text !== undefined && page.text !== null ? String(page.text) : readableText(page.html);
    const lines = raw.split('\n').filter((line) => {
      const t = line.trim();
      if (!repeated.has(t)) return true;
      if (shownOnce.has(t)) return false;   // the menu appears once, not on every page
      shownOnce.add(t);
      return true;
    });
    let text = lines.join('\n');
    if (text.length > PER_PAGE_CHARS) { text = text.slice(0, PER_PAGE_CHARS); cut.push(page.url); }
    if (text.trim().length < 40) continue;
    const header = `--- page: ${page.url} ---\n`;
    const block = header + text;
    if (used + block.length > allowance && parts.length) closeBatch();
    if (block.length > allowance) {
      // One page alone bigger than the allowance: shortened, and SAID so.
      parts.push(header + text.slice(0, Math.max(allowance - header.length, 500)));
      if (!cut.includes(page.url)) cut.push(page.url);
      inBatch.push(page.url);
      closeBatch();
      continue;
    }
    parts.push(block);
    inBatch.push(page.url);
    used += block.length;
  }
  closeBatch();
  return { batches, cut };
}

// ---------------------------------------------------------------------------
// The questions — one per purpose, each DISTINCT, each asking only for what
// its pages can answer, plus the three whole-site fields every group carries.

const ASKED_OF_EVERY_GROUP = (businessName) => `  "theirOwnSite": true if these pages are the business's OWN website, false if they are a directory, a licence lookup, a listing, a marketplace, a parked domain, or another company's site,
  "realName": what this business is CALLED — the trading name the owner would say answering the phone — or null if these pages never state it plainly. Never a browser tab title, never a slogan, never a description of the service,
  "trade": one of ${JSON.stringify(TRADES)} or null,
  "tradeSure": true or false,`;

const GROUP_QUESTIONS = {
  identity: {
    label: 'identity pages — who this business is',
    fields: () => `  "whatTheyDo": one short sentence in their own terms, or null,
  "yearsInBusiness": a number if they say how long they have been going, else null,
  "separateOperations": how many genuinely DIFFERENT businesses this one company runs, as a number — 1 for a company doing one trade however many services it lists, higher only where the operations are truly different from each other — or null if these pages do not say,
  "whoRunsIt": "the name of the owner, principal or most senior person, where the pages make that plain — else null. Being listed first is not evidence.",
  "teamSize": a number ONLY where the site states how many people work there ("a team of 12", "our 30 staff"), else null — never counted from how many names happen to be listed,
  "companyProfile": "the BUSINESS's own LinkedIn company page URL, or null — never a person's profile",
  "cannotTell": "one plain sentence naming what these pages never say, or null"`,
    rules: `HOW MANY BUSINESSES ARE REALLY IN HERE. An electrician who does "wiring, additions, panel replacements and service work" is running ONE business — answer 1. A contractor who does "junk removal, snow plowing, excavation, septic services and equipment transport" is running four or five genuinely different operations — answer 5. The test is whether a customer of one would ever be a customer of another. If these pages do not say, answer null — never a guess.

TRADE. Judge what the business IS, not what words appear. A firm of accountants whose benefits page mentions dental insurance is accounting. If it is genuinely between two, set trade to null and say so in cannotTell.`,
  },
  services: {
    label: 'services pages — what this business sells and how it takes work in',
    fields: () => `  "canBookOnline": true if a visitor can book or schedule without phoning, false if not, null if you cannot tell or if this is a business nobody books,
  "toolsInUse": array of software products the site shows they already use or pay for — a named booking widget, a scheduler, a payment provider, a review platform, a client portal — each as the product's own name, or an empty array,
  "formsToPrint": true if they ask people to download, print or fill in a document and bring or send it back, false if not, null if you cannot tell,
  "stalledBuild": "one plain sentence quoting what on the page suggests they already wanted SOFTWARE built and did not get it, or null",
  "cannotTell": "one plain sentence naming what these pages never say, or null"`,
    rules: `BOOKING. "Can a visitor book without phoning" means a real booking or scheduling tool, or a request form that starts an appointment. A phone number, however prominent, is not online booking. If the business is one nobody books — a manufacturer, a wholesaler — answer null, not false.

SOMETHING THEY ALREADY WANTED BUILT. Answer stalledBuild only when the PAGE ITSELF shows it: a piece of SOFTWARE announced and never delivered — a client portal, an online booking system, an app, a member area — or "coming soon" long enough to look abandoned, or a named tool they clearly resent or say they are moving off. Quote the words that made you say it. It must be about SOFTWARE — a coaching programme or a shop opening that is "coming soon" is a business launching something, not a shelved build. This is rare; a guess here sends a stranger an email about a project they never had. Answer null unless the page genuinely shows it.`,
  },
  contact: {
    label: 'contact pages — how a stranger reaches this business and where it sits',
    fields: () => `  "sharedEmail": "the general inbox like info@ or office@, or null",
  "mainPhone": "the main number, or null",
  "postalAddress": "their street address as printed, or null — the place of business, never a page heading and never the words around a 'Get Directions' link",
  "locations": [ { "town": "a town this business operates from", "isHeadOffice": true or false, "seenOn": "the page URL that says so" } ],
  "waysToReachThem": array of any of ["published email","contact form","online booking","live chat","phone only"],
  "listsAFax": true if a fax number appears anywhere, false if not,
  "cannotTell": "one plain sentence naming what these pages never say, or null"`,
    rules: `WHERE THEY ARE. List every town the business operates from in "locations", each with the page that says so, and mark the head office if the pages name one. A firm can have offices in several towns; somebody writing to the wrong one is writing to a stranger.

ADDRESSES. If one address is published for the whole business — info@, office@, contact@, hello@, admin@ — it goes in sharedEmail. Never construct an address from a naming pattern you noticed; if it is not printed, it is null.

NUMBERS. The number in the header or footer is the main number and goes in mainPhone.`,
  },
  people: {
    label: 'people pages — who works at this business',
    fields: () => `  "people": [
    {
      "name": "the person's full name as printed",
      "role": "what they actually do, in two or three words, or null",
      "roleWasPrinted": true if a job title was printed, false if you worked it out from a sentence about them,
      "email": "their own address, or null",
      "phone": "their direct number, or null",
      "linkedIn": "their profile URL, or null",
      "seenOn": "the page URL you read them from",
      "basedAt": "the town or office THIS PERSON works from, if the pages say so — else null"
    }
  ],
  "cannotTell": "one plain sentence naming what these pages never say, or null"`,
    rules: `PEOPLE. Only actual human beings who work there. Not the company, not a page heading, not a menu item, not a testimonial customer, not a partner firm. And not a PROJECT, a BUILDING, a PLACE or a CLIENT — a contractor's portfolio names the jobs it BUILT, and the words beside them belong to the client. Before you keep a name, ask whether a human being with that name draws a wage at this business. If the answer is anything other than clearly yes, leave them out.

ROLES. A role written as a sentence still counts — "Dan keeps the trucks moving" makes Dan operations, roleWasPrinted false. But never guess: if the page names someone and says nothing about what they do, role is null.

ADDRESSES AND NUMBERS. Only the address printed for that specific person. A shared inbox — info@, office@ — belongs to nobody. Never hand the main number to a person. Never construct an address from a naming pattern.

PROFILES. Only a LinkedIn URL that appears on the page. Never guess one from a name.

WHERE EACH PERSON SITS. Answer "basedAt" ONLY where the pages actually place them — their own profile page naming an office, a heading they are listed under. A bare staff directory with no office against a name tells you nothing: answer null. Null is the correct and expected answer for most people on a firm-wide team page.`,
  },
  hiring: {
    label: 'hiring pages — what this business is trying to hire',
    fields: () => `  "hiringOffice": true if they are advertising an office, admin, reception, bookkeeping or scheduling job right now, false if these pages advertise no such job, null if you cannot tell,
  "openOfficeRoles": how many office, admin, reception, bookkeeping or scheduling jobs they are advertising right now, as a number, or null if you cannot tell,
  "cannotTell": "one plain sentence naming what these pages never say, or null"`,
    rules: `Count only jobs that are plainly OPEN NOW on these pages. A careers page with no listings is false and zero. A trades or field job — a technician, an installer, a driver — is not an office role.`,
  },
  news: {
    label: 'news pages — what this business has announced lately',
    fields: () => `  "recentNews": "one or two plain sentences on what these pages announced within the LAST YEAR — a new office, a new hire, a new service, an award — each with its date where one is printed, or null if nothing on these pages is from the last year",
  "cannotTell": "one plain sentence naming what these pages never say, or null"`,
    rules: `Only what the pages themselves date inside the last year, or plainly present as current. An undated post is not recent news unless the page says so. Old posts are history, not news — leave them out.`,
  },
};

// The question for ONE purpose group. Six distinct prompts — each carries the
// three whole-site fields plus only its own group's questions, so a focused
// read never wanders into another group's territory.
function questionFor(purpose, businessName, document) {
  const q = GROUP_QUESTIONS[purpose];
  if (!q) throw new Error(`no question exists for a purpose called ${purpose}`);
  return `You are reading pages from a small business's own website to fill in a customer record for a salesperson. You have been handed only the site's ${q.label}. Other pages are being read separately, so answer ONLY from the pages in front of you. Read for MEANING. Never pattern-match. A null is a true answer; an invented value is a lie in a salesperson's hands.

The record says the business is called: ${businessName}

Email addresses that were inside links appear as [email ...], phone numbers as [tel ...], LinkedIn profiles as [linkedin ...].

${document}

--- end of pages ---

Answer with JSON only, no other words, in this shape:

{
${ASKED_OF_EVERY_GROUP(businessName)}
${q.fields()}
}

Rules that matter more than filling a field in:

WHOSE SITE IS THIS. Answer theirOwnSite first, because everything else depends on it. A page that says "verify a contractor's licence", "find a provider near you", "claim this listing", or that carries many other businesses alongside this one, is somebody else's site. If theirOwnSite is false, return every other field as null or empty and say whose site it is in cannotTell.

WHAT THEY ARE CALLED. realName is the name on the sign — "La Pine Tool Rental", "Bend Family Dentistry". NOT the browser tab title, NOT a slogan, NOT a page name, NOT a location on its own. If these pages genuinely never say it, answer null.

${q.rules}`;
}

// ---------------------------------------------------------------------------
// How many reads fly at once — tuned DURING the run, from what the reader is
// actually doing. Fast answers raise the level, slow answers and failures
// lower it, and the level it settled on is reported so the run log can say
// what the machine could actually sustain tonight (2026-08-28 is why: the
// reader halved its speed over an evening and a fixed level threw away 22
// answers in a row).
const FAST_ANSWER_MS = 20 * 1000;
const SLOW_ANSWER_MS = 90 * 1000;
function makeFlightController({ start = 3, min = 1, max = 6, fastMs = FAST_ANSWER_MS, slowMs = SLOW_ANSWER_MS } = {}) {
  let limit = Math.max(min, Math.min(start, max));
  let inFlight = 0;
  const waiting = [];
  const admit = () => { while (inFlight < limit && waiting.length) { inFlight += 1; (waiting.shift())(); } };
  const lower = () => { if (limit > min) limit -= 1; };
  const raise = () => { if (limit < max) limit += 1; };
  return {
    async run(fn) {
      await new Promise((ready) => { waiting.push(ready); admit(); });
      const began = Date.now();
      try {
        const out = await fn();
        const took = Date.now() - began;
        if (took < fastMs) raise();
        else if (took > slowMs) lower();
        return out;
      } catch (e) {
        lower();
        throw e;
      } finally {
        inFlight -= 1;
        admit();
      }
    },
    lower,
    raise,
    get level() { return limit; },
    get settledAt() { return limit; },
  };
}

// Nothing, in every shape a model answer delivers nothing.
function saidNothing(v) {
  return v === null || v === undefined
    || (typeof v === 'string' && (!v.trim() || v.trim().toLowerCase() === 'null'))
    || (Array.isArray(v) && !v.length);
}

// The batches of one group, folded into ONE answer for that group. Scalars:
// the first batch to answer wins — later batches read different pages and a
// blank from them is not a correction. Arrays: everything, deduplicated.
function mergeBatchAnswers(answers = []) {
  const merged = {};
  for (const a of answers) {
    if (!a || typeof a !== 'object') continue;
    for (const [field, value] of Object.entries(a)) {
      if (Array.isArray(value)) {
        const have = merged[field] && Array.isArray(merged[field]) ? merged[field] : [];
        const seen = new Set(have.map((v) => JSON.stringify(v)));
        for (const v of value) {
          const k = JSON.stringify(v);
          if (!seen.has(k)) { seen.add(k); have.push(v); }
        }
        merged[field] = have;
      } else if (merged[field] === undefined || saidNothing(merged[field])) {
        if (value !== undefined) merged[field] = value;
      }
    }
  }
  return Object.keys(merged).length ? merged : null;
}

// The fields two groups answered DIFFERENTLY — both non-empty. One group
// answering while another returned nothing is not a contradiction: silence
// contradicts nobody. Only the fields every group is asked can collide.
function contradictionsBetween(groupAnswers = {}) {
  const disputed = [];
  for (const field of WHOLE_SITE_FIELDS) {
    const saidBy = {};
    for (const [group, answer] of Object.entries(groupAnswers)) {
      if (!answer || typeof answer !== 'object') continue;
      const v = answer[field];
      if (saidNothing(v)) continue;
      saidBy[group] = v;
    }
    const distinct = new Set(Object.values(saidBy).map((v) => String(v).trim().toLowerCase()));
    if (distinct.size > 1) disputed.push({ field, saidBy });
  }
  return disputed;
}

// The reconciliation question. It is handed the DISPUTED PAGES THEMSELVES —
// their readable text, not just the answers those pages produced — because an
// argument between summaries is settled by going back to the source.
function reconciliationQuestion({ businessName, contradictions = [], emptyFields = [], pages = [] }) {
  const fields = [...new Set([...contradictions.map((c) => c.field), ...emptyFields])];
  const disagreements = contradictions.map((c) => `- "${c.field}": ${Object.entries(c.saidBy).map(([g, v]) => `the ${g} read said ${JSON.stringify(v)}`).join('; ')}`).join('\n');
  const unanswered = emptyFields.map((f) => `- "${f}": every read came back empty`).join('\n');
  const { batches } = groupDocuments(pages, { allowance: GROUP_CHARS });
  const doc = batches.length ? batches[0].document : '';
  return `Several focused reads of one small business's website disagreed, or all came back empty, on the fields below. The business's record says it is called: ${businessName}

${disagreements ? `Where the reads disagreed:\n${disagreements}\n` : ''}${unanswered ? `Where every read came back empty:\n${unanswered}\n` : ''}
Here are the disputed pages themselves. Settle each field FROM THESE PAGES — not by picking one earlier answer over another.

${doc}

--- end of pages ---

Answer with JSON only, no other words: { ${fields.map((f) => `"${f}": your answer or null`).join(', ')} }

If the pages genuinely do not settle a field, answer null. Null is recorded as "could not tell" and it is the correct answer — never break a tie by preferring one earlier read.`;
}

// ---------------------------------------------------------------------------
// The whole visit's model reads: classify, group, read every non-empty group
// in parallel, and reconcile only where the answers genuinely collide.
async function readSiteInGroups({
  businessName, pages = [], askTheReader, controller = makeFlightController(), deadline = null,
}) {
  if (typeof askTheReader !== 'function') throw new Error('readSiteInGroups needs an askTheReader function');
  const overTime = () => Boolean(deadline && Date.now() > deadline);
  const sorted = classifyPages(pages);
  const repeated = repeatedBlocks(pages);
  const answers = {};
  const documents = {};
  const couldNotTell = {};
  const sentUrls = new Set();
  const cut = [];
  let modelCalls = 0;
  let partial = false;

  await Promise.all(PURPOSES.map(async (purpose) => {
    const groupPages = sorted.groups[purpose];
    if (!groupPages.length) {
      // ZERO model calls for an empty group, and the absence recorded as
      // itself — never a default answer in its place.
      answers[purpose] = null;
      couldNotTell[purpose] = `no ${purpose} page was found on the site`;
      return;
    }
    const built = groupDocuments(groupPages, { allowance: GROUP_CHARS, repeated });
    documents[purpose] = built.batches;
    cut.push(...built.cut);
    let unread = 0;
    const replies = await Promise.all(built.batches.map(async (batch) => {
      // The clock is read INSIDE the flight controller's slot: a batch still
      // queued when time runs out is never sent, and the answers that did
      // arrive are kept — a partial group answer, never a discarded one.
      const reply = await controller.run(async () => {
        if (overTime()) return { outOfTime: true };
        modelCalls += 1;
        for (const u of batch.pages) sentUrls.add(u); // handed to the model, answered or not
        return askTheReader(questionFor(purpose, businessName, batch.document));
      });
      if (reply && reply.outOfTime) { unread += 1; return null; }
      if (!reply || !reply.answer) { controller.lower(); unread += 1; return null; }
      return reply.answer;
    }));
    const answered = replies.filter(Boolean);
    if (!answered.length) {
      answers[purpose] = null;
      couldNotTell[purpose] = overTime()
        ? `the visit ran out of time before the ${purpose} pages were read`
        : `the reader gave no answer for the ${purpose} pages`;
      if (unread) partial = true;
      return;
    }
    const merged = mergeBatchAnswers(answered);
    if (unread) {
      // Built from PART of its batches — kept, and SAYS so, never discarded.
      merged.partial = true;
      partial = true;
    }
    answers[purpose] = merged;
  }));

  const groupsRead = PURPOSES.filter((p) => answers[p]);
  const contradictions = contradictionsBetween(answers);
  const emptyFields = groupsRead.length
    ? WHOLE_SITE_FIELDS.filter((f) => groupsRead.every((g) => saidNothing(answers[g][f])))
    : [];

  // The reconciliation read: fired ONLY on genuine contradiction or on a
  // whole-site field empty from every group that was asked. Zero extra model
  // calls otherwise.
  let reconciliation = null;
  if ((contradictions.length || emptyFields.length) && !overTime()) {
    const disputedUrls = new Set();
    for (const c of contradictions) {
      for (const g of Object.keys(c.saidBy)) {
        for (const batch of (documents[g] || [])) for (const u of batch.pages) disputedUrls.add(u);
      }
    }
    if (!disputedUrls.size) {
      // An empty whole-site answer with no argument to point at: hand it the
      // pages most likely to say who this is.
      for (const pg of (sorted.groups.identity.length ? sorted.groups.identity : pages.slice(0, 3))) disputedUrls.add(pg.url);
    }
    const disputedPages = pages.filter((pg) => disputedUrls.has(pg.url));
    const fields = [...new Set([...contradictions.map((c) => c.field), ...emptyFields])];
    const reply = await controller.run(() => askTheReader(
      reconciliationQuestion({ businessName, contradictions, emptyFields, pages: disputedPages }),
    ));
    modelCalls += 1;
    const settled = {};
    for (const f of fields) {
      const v = reply && reply.answer ? reply.answer[f] : null;
      // A field the reconciliation cannot settle is COULD_NOT_TELL — one
      // group's answer is never promoted as a tie-break default.
      settled[f] = saidNothing(v) ? COULD_NOT_TELL : v;
    }
    reconciliation = { fields, settled, gavePages: disputedPages.map((pg) => pg.url) };
  } else if ((contradictions.length || emptyFields.length) && overTime()) {
    partial = true;
  }

  return {
    classified: sorted.classified,
    groups: sorted.groups,
    skipped: sorted.skipped,
    answers,
    documents,
    couldNotTell,
    contradictions,
    emptyFields,
    reconciliation,
    modelCalls,
    partial,
    sentUrls,
    cut,
    concurrencySettledAt: controller.settledAt,
  };
}

// ---------------------------------------------------------------------------
// The groups' cleaned answers, folded into the one shape the record writers
// already understand. Each single-group field comes from the group that owns
// it — one writer per fact. The whole-site fields take the reconciled value
// where a reconciliation spoke, the agreed value where the groups agree, and
// NULL where they disagree unsettled — could not tell, never a coin toss.
function mergedUnderstood(understoodByGroup = {}, reconciliation = null) {
  const out = {
    trade: null, tradeUnsure: false, whatTheyDo: null, realName: null,
    people: [], sharedEmail: null, mainPhone: null, waysToReachThem: [],
    canBookOnline: null, formsToPrint: false, listsAFax: false, hiringOffice: false,
    yearsInBusiness: null, stalledBuild: null, separateOperations: null,
    locations: [], postalAddress: null, companyProfile: null, teamSize: null,
    openOfficeRoles: null, toolsInUse: [], whoRunsIt: null, recentNews: null,
    cannotTell: null, dropped: [], notTheirSite: false,
  };
  const groups = Object.keys(understoodByGroup).filter((g) => understoodByGroup[g]);
  if (!groups.length) return out;

  // NOT THEIRS only when the reads that answered agree it is somebody else's
  // site, or a reconciliation read settled it that way. One group's "no"
  // against another's "yes" is a contradiction, not a verdict.
  const saidNot = groups.filter((g) => understoodByGroup[g].notTheirSite === true);
  const saidTheirs = groups.filter((g) => understoodByGroup[g].notTheirSite !== true);
  const reconciledOwn = reconciliation && reconciliation.settled && 'theirOwnSite' in reconciliation.settled
    ? reconciliation.settled.theirOwnSite : undefined;
  const notTheirs = reconciledOwn !== undefined && reconciledOwn !== COULD_NOT_TELL
    ? [false, 'no', 'false'].includes(typeof reconciledOwn === 'string' ? reconciledOwn.trim().toLowerCase() : reconciledOwn)
    : (saidNot.length > 0 && saidTheirs.length === 0);
  if (notTheirs) {
    return {
      ...out,
      notTheirSite: true,
      cannotTell: (understoodByGroup[saidNot[0]] && understoodByGroup[saidNot[0]].cannotTell)
        || 'these pages belong to a directory or another company, not to this business',
    };
  }

  for (const [group, fields] of Object.entries(FIELDS_BY_GROUP)) {
    const u = understoodByGroup[group];
    if (!u || u.notTheirSite) continue;
    for (const f of fields) if (u[f] !== undefined) out[f] = u[f];
  }

  for (const f of ['realName', 'trade']) {
    if (reconciliation && reconciliation.settled && f in reconciliation.settled) {
      out[f] = reconciliation.settled[f] === COULD_NOT_TELL ? null : reconciliation.settled[f];
    } else {
      const values = groups
        .map((g) => understoodByGroup[g][f])
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
      const distinct = [...new Set(values.map((v) => String(v).trim().toLowerCase()))];
      out[f] = distinct.length === 1 ? values[0] : null;
    }
  }
  if (out.trade && !TRADES.includes(out.trade)) out.trade = null;
  out.tradeUnsure = groups.some((g) => understoodByGroup[g].tradeUnsure === true);

  const gaps = [...new Set(groups.map((g) => understoodByGroup[g].cannotTell).filter(Boolean))];
  out.cannotTell = gaps.length ? gaps.join(' | ').slice(0, 240) : null;
  out.dropped = groups.flatMap((g) => understoodByGroup[g].dropped || []);

  // One row per human even when two batches both saw them; holes filled, never
  // overwritten — the same rule peopleFromSite() applies within one page set.
  const uniquePeople = new Map();
  for (const p of out.people || []) {
    if (!p || !p.name) continue;
    const key = String(p.name).toLowerCase();
    const prior = uniquePeople.get(key);
    if (!prior) { uniquePeople.set(key, p); continue; }
    uniquePeople.set(key, {
      ...prior,
      role: prior.role || p.role,
      email: prior.email || p.email,
      phone: prior.phone || p.phone,
      linkedIn: prior.linkedIn || p.linkedIn,
      basedAt: prior.basedAt || p.basedAt,
    });
  }
  out.people = [...uniquePeople.values()];
  return out;
}

module.exports = {
  TRADES, PER_PAGE_CHARS, GROUP_CHARS, SHARED_MAILBOX,
  readableText, pagesAsDocument, questionAbout, looksLikeAHuman, tidyPhone, nameThatWasPrinted,
  keepOnlyWhatWasRead, isARealAddress, NOT_REALLY_AN_ADDRESS, NEVER_ANSWERS,
  // the whole-site grouped read (2026-09-01)
  PURPOSES, COULD_NOT_TELL, WHOLE_SITE_FIELDS, SINGLE_GROUP_FIELDS, FIELDS_BY_GROUP,
  classify, classifyPages, repeatedBlocks, groupDocuments, questionFor,
  makeFlightController, mergeBatchAnswers, contradictionsBetween, reconciliationQuestion,
  readSiteInGroups, mergedUnderstood, saidNothing,
};
