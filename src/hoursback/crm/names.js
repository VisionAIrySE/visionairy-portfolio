// Getting a first name out of an email address, safely.
//
// "dale@highdesertplumbing.com" is Dale. "info@" is nobody. The cost of
// guessing wrong is high — "Hi Bagadmin," is worse than "Hi there," — so a
// name is only used when it is actually a name, checked against a list.

// Shared inboxes: a real address, but not a person.
const NOT_A_PERSON = new Set([
  'info', 'contact', 'office', 'hello', 'admin', 'sales', 'support', 'frontdesk',
  'reception', 'team', 'service', 'services', 'mail', 'email', 'help', 'inquiries',
  'inquiry', 'accounting', 'accounts', 'billing', 'orders', 'order', 'shop', 'staff',
  'general', 'main', 'customerservice', 'hr', 'jobs', 'careers', 'marketing', 'web',
  'webmaster', 'noreply', 'no', 'your', 'yourname', 'name', 'business', 'company',
  'front', 'desk', 'booking', 'bookings', 'schedule', 'scheduling', 'dispatch',
  'estimates', 'quotes', 'parts', 'shipping', 'returns', 'newpatients', 'patients',
  'clients', 'leasing', 'rentals', 'property', 'manager', 'management', 'owner',
]);

// Common American first names. Only a match here becomes a greeting; anything
// else falls back to "there", which is never wrong.
const FIRST_NAMES = new Set(`
james robert john michael david william richard joseph thomas christopher charles
daniel matthew anthony mark donald steven andrew paul joshua kenneth kevin brian
george timothy ronald jason edward jeffrey ryan jacob gary nicholas eric jonathan
stephen larry justin scott brandon benjamin samuel gregory alexander patrick frank
raymond jack dennis jerry tyler aaron jose adam nathan henry douglas zachary peter
kyle ethan walter noah jeremy christian keith roger terry gerald harold sean austin
carl arthur lawrence dylan jesse jordan bryan billy joe bruce gabriel logan albert
willie alan juan wayne elijah randy roy vincent ralph eugene russell bobby mason
philip louis todd chad marcus travis shane jared cody trevor derek jeff cory brett
casey grant blake garrett colin curtis dale duane wade dean drew glenn neil rick
ross seth spencer stuart victor warren dustin lance lonnie marty mitchell reid
rodney shawn troy wesley clint clay chase brady bret cole devon garrick pete craig kurt lyle nate rob stan vern wes brent
chris jim mike nick rich rod ron tim tom will zach jake josh matt
mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy
betty margaret sandra ashley kimberly emily donna michelle carol amanda dorothy
melissa deborah stephanie rebecca sharon laura cynthia kathleen amy angela shirley
anna brenda pamela emma nicole helen samantha katherine christine debra rachel
carolyn janet catherine maria heather diane ruth julie olivia joyce virginia
victoria kelly christina lauren joan evelyn judith megan andrea cheryl hannah
jacqueline martha gloria teresa ann sara madison frances kathryn janice jean abigail
alice julia judy sophia grace denise amber danielle marilyn beverly charlotte
natalie theresa diana brittany doris kayla alexis lori marie tammy tracy erin
holly jill jodi kara kris leah lindsay melanie monica renee robin sonja stacy
crystal krystal misty tonya darcy shelly staci kerri jodie marcia lynne
becky cindy connie dawn debbie kathy patty penny sherry tami terri traci
tina wendy allison bonnie carrie colleen dana darlene elaine ellen erica gail
gina heidi jenna jenny kate kim krista lana lynn maureen nina paula peggy rhonda
rita sally sandy shannon sheila stacey suzanne tara valerie vicki whitney yvonne
`.trim().split(/\s+/));

// Returns a capitalized first name, or null when we cannot be sure.
function nameFromEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const local = email.split('@')[0].toLowerCase();
  // "dale.hutchins", "dale_h", "dale123" all reduce to the leading word.
  const head = local.replace(/[^a-z].*$/, '');
  if (head.length < 3 || head.length > 14) return null;
  if (NOT_A_PERSON.has(head)) return null;
  // "crystalh" is Crystal with a surname initial stuck on; "davidsmith" is
  // David. Try the whole thing first, then shorter and shorter, and stop at
  // the first real name. Never shorter than four letters — below that the
  // matches are coincidences ("dan" out of "dansmith" is fine, "jo" is not).
  for (let len = head.length; len >= 4; len--) {
    const candidate = head.slice(0, len);
    if (NOT_A_PERSON.has(candidate)) return null;
    if (FIRST_NAMES.has(candidate)) return candidate[0].toUpperCase() + candidate.slice(1);
  }
  return null;
}

// A first name out of a full name, for the same greeting.
// Words that never appear inside a person's name. The website reader saves
// anything on a team page that is shaped like a name, and about four in ten of
// those turn out to be a heading or a menu item — which produced "Hi Why,"
// (from "Why Wood?"), "Hi Vaccination," and "Hi Property," when the greeting
// simply took the first word (2026-08-26). An awkward "Hello," costs nothing;
// "Hi Vaccination," ends the conversation.
const NEVER_IN_A_NAME = new RegExp([
  'products?', 'services?', 'management', 'manager', 'consultant', 'association',
  'insurance', 'schedule', 'scheduling', 'shipping', 'estimate', 'estimates',
  'installation', 'maintenance', 'repair', 'repairs', 'units?', 'storage',
  'dwelling', 'accessory', 'reconstructive', 'surgery', 'landscape', 'landscaping',
  'builders?', 'construction', 'contractors?', 'plant', 'ranch', 'lotus', 'coffee',
  'wood', 'graphic', 'artist', 'design', 'approach', 'accuracy', 'restore',
  'mounts?', 'hobby', 'closed', 'vaccination', 'personalized', 'care', 'clinic',
  'dental', 'medical', 'realty', 'properties', 'company', 'group', 'center',
  'centre', 'oregon', 'bend', 'redmond', 'sisters', 'prineville', 'madras',
  'multiple', 'favorite', 'other', 'general', 'commercial', 'residential',
  'financial', 'agency', 'agent', 'office', 'team', 'staff', 'owner', 'director',
  'president', 'principal', 'partner', 'associate', 'specialist', 'technician',
  'assistant', 'coordinator', 'supervisor', 'engineer', 'hot', 'tub', 'shop',
].join('|'), 'i');

// Structural tells that a string is a heading rather than a person.
const NOT_A_NAME_SHAPE = [
  /[?:;!]/,                   // "Why Wood?"  "Expert Services:"
  /\.$/,                      // "Property Management Consultant."
  /\b[A-Z]{2,}\b/,            // "DESIGN IT"  "TV Mounts"
  /\d/,                       // a number never belongs in one
  /\b(the|and|our|your|we|for|with|about|from|that|this|more|all)\b/i,
];

// Is this string safe to greet somebody by? The bar is deliberately high.
function plausiblePersonName(raw) {
  const n = String(raw || '').trim();
  if (!n) return false;
  const words = n.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;   // "Fri Closed" is 2, caught below
  if (NEVER_IN_A_NAME.test(n)) return false;
  if (NOT_A_NAME_SHAPE.some((re) => re.test(n))) return false;
  // Every word starts with a capital and is otherwise lower case, allowing a
  // middle initial, a hyphenated surname, an apostrophe and a suffix.
  const wordOk = /^[A-Z][a-z'’-]*[a-z'’]?\.?$/;
  const initial = /^[A-Z]\.?$/;
  const suffix = /^(Jr|Sr|II|III|IV)\.?$/i;
  if (!words.every((w) => wordOk.test(w) || initial.test(w) || suffix.test(w))) return false;
  // First and last both have to be real words, not initials or suffixes.
  const first = words[0];
  const last = words[words.length - 1];
  const lastReal = suffix.test(last) ? words[words.length - 2] : last;
  // "As Co" passes every shape test above and greets somebody "Hi As,". A
  // given name under three letters is rare enough that blocking it costs
  // almost nothing and saves a message that reads as broken.
  if (!first || initial.test(first) || first.length < 3) return false;
  if (!lastReal || initial.test(lastReal) || lastReal.length < 2) return false;
  if (/^(co|llc|inc|pc|llp|ltd)\.?$/i.test(lastReal)) return false;
  return true;
}

// The name to greet by, or nothing. Taking the first word of whatever was
// saved is how "Hi Why," happened; the whole string has to look like a person
// before any part of it is used.
function firstNameOf(fullName) {
  if (!plausiblePersonName(fullName)) return null;
  const first = String(fullName).trim().split(/\s+/)[0];
  return first && first.length > 1 ? first : null;
}

// THE NAME OF SOMEBODY RUSS HAS MARKED HIMSELF.
//
// The ordinary rule needs two words, because a single word scraped off a page
// is as likely to be "Closed" as a person. But a contact he has ticked and
// given an address to is a decision, not a guess — and plenty of team pages
// list only "Kevin". Rejecting that name greeted the owner instead, so a note
// meant for Kevin opened "Hi Jack," (2026-08-31).
//
// One word is accepted here only when it is a name anybody would recognise.
function firstNameOfMarked(fullName) {
  const proper = firstNameOf(fullName);
  if (proper) return proper;
  const one = String(fullName || '').trim();
  if (!/^[A-Z][a-z'’-]{2,}$/.test(one)) return null;
  if (NEVER_IN_A_NAME.test(one)) return null;
  return FIRST_NAMES.has(one.toLowerCase()) ? one : null;
}

// --- IS THIS A COMPANY NAME, OR A WEB PAGE'S TITLE? (Russ, 2026-09-03) -------
//
// 229 businesses are on file under something that is not their name: "HOME",
// "Best Vet Hospital In Redmond, OR", "Homes for Sale in Central Oregon",
// "Storage In Oregon: Home", "Bend, OR Rentals & Property Management -
// Effective". They came off the title bar of a web page, which is written for
// a search engine, not to say who somebody is. 35 of them have a letter
// waiting, and the day-four letter is addressed "The part that matters,
// {business}" — so one of them would have gone out as "The part that matters,
// Home".
//
// The test lives HERE, next to every other judgement about a name, because it
// was previously buried in the reading script and the letter could not see it.
//
// Every rule below is a fact about the STRING. It decides only whether to
// TRUST the name, never what the business is actually called. When it says
// "do not trust this", the answer is to ask Russ, not to invent a name.
// A REGISTERED LEGAL NAME IS NEVER A PAGE TITLE. This exemption comes first,
// because the first version of this rule flagged "BEST QUALITY WINDOW CLEANING
// LLC", "WINDOWS NEAR ME LLC" and "TOP 5 TAX RELIEF SERVICES LLC" — all real
// names off the Oregon business register, caught for beginning with a word
// that also begins an advertising headline. Nobody files a web page title with
// the state.
const A_LEGAL_NAME = /(^|[^a-z])(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|limited|lp|llp|pc|p\.c|pllc|association|assoc|fund|trust|foundation|partnership)\.?$/i;

const A_PAGE_TITLE = [
  /\|/,                                        // "Contact Us | Lar-Moon Restoration"
  /&#|&amp;/,                                  // raw web punctuation, never typed by a person
  /^(home|index|welcome|about( us)?|contact( us)?|shop now|menu|our services|services)$/i,
  /:\s*(home|about|contact|services)\s*$/i,     // "Storage In Oregon: Home"
  /^[a-z0-9-]+\.(com|net|org|biz|co|us)$/i,     // "juniper-insurance.com"
  /\b(loading|under construction|coming soon|just a moment|access denied|page not found|site not found)\b/i,
  /^(facebook|instagram|linkedin|twitter|yelp|google)$/i,
  /\?$/,                                       // "Robot or human?"
  /^(serving|now serving|proudly serving)\b/i,  // "Serving Lapine, Prineville, Redmond"
  /\b(homes?|houses?|properties|apartments|condos?|units?)\s+for\s+(sale|rent|lease)\b/i,
  /^(best|top|cheap|affordable)\b[\s\S]*,\s*(or|oregon)\b/i,  // "Best Vet Hospital In Redmond, OR"
  /\b(in|near)\s+[A-Z][a-z]+,\s*(OR|Oregon)\b[\s\S]*\b(insurance|dental|vet|hospital|rentals?|storage|clinic)\b/i,
  /^[A-Z][a-z]+,\s*OR\s+\w/,                    // "Bend, OR Rentals & Property Management"
];

/// True when the name on file reads like a page title rather than a company.
function nameLooksLikeAPageTitle(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  if (A_LEGAL_NAME.test(n)) return false;      // filed with the state: it is their name
  if (n.length > 70) return true;              // no company introduces itself in 70 characters
  return A_PAGE_TITLE.some((re) => re.test(n));
}

/// The name safe to put in front of a customer, or nothing. Nothing means the
/// letter must not use a name at all — never a guess, never the page title.
function nameToSayOutLoud(prospect = {}) {
  const typed = String(prospect.nameManualValue || '').trim();
  if (typed) return typed;                     // what Russ typed is never second-guessed
  const onFile = String(prospect.name || '').trim();
  if (!onFile) return null;
  return nameLooksLikeAPageTitle(onFile) ? null : onFile;
}

// --- GREETING A DOCTOR BY NAME (Russ, 2026-09-03) ----------------------------
//
// Four letters were going out opening "Hi Dr.," with no name at all, and the
// letter otherwise only ever used a first name: Redmond Veterinary's owner is
// on file as John Davis and would have been greeted "Hi John,". A dentist, a
// vet or a chiropractor is addressed as Dr. and their surname.
//
// EVIDENCE ONLY. Nobody becomes a doctor because of the trade their business
// is in: a dental practice has an office manager too, and greeting them
// "Dr. Ramos" is worse than greeting them "Hi Maria,". So the title is used
// only where one of three things actually says so:
//   1. their name, as their own website prints it, carries the title
//   2. their role on that site is a doctor's job or its letters
//   3. their own email address begins dr-something
//
// And there is no such thing as a nameless doctor: without a surname that
// looks like a surname this returns nothing, and the letter falls back to
// "Hello," rather than to "Hi Dr.,".
const A_DOCTOR_TITLE = /^\s*(dr|doctor)\.?\s+/i;
const DOCTOR_LETTERS = /(^|[^a-z])(d\.?d\.?s|d\.?m\.?d|d\.?v\.?m|d\.?c|n\.?d|o\.?d|d\.?o|d\.?p\.?m|m\.?d)([^a-z]|$)/i;
const A_DOCTORS_JOB = /\b(dentist|dental surgeon|orthodontist|endodontist|periodontist|veterinarian|physician|surgeon|chiropractor|optometrist|naturopath|podiatrist|psychiatrist|pediatrician|dermatologist)\b/i;

/// The surname to say "Dr." in front of, or nothing at all.
function doctorSurname(fullName) {
  const raw = String(fullName || '').trim();
  if (!raw) return null;
  // Anything after a comma is a qualification, not part of the name.
  const bare = raw.replace(A_DOCTOR_TITLE, '').split(',')[0].trim();
  if (!bare) return null;
  if (NEVER_IN_A_NAME.test(bare)) return null;
  // A middle initial is not a surname; neither is a suffix.
  const words = bare.split(/\s+/)
    .filter((w) => !/^[A-Z]\.?$/.test(w))
    .filter((w) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w));
  const last = words[words.length - 1];
  if (!last || last.length < 2) return null;
  if (!/^[A-Z][a-zA-Z'\u2019-]+$/.test(last)) return null;
  if (NOT_A_PERSON.has(last.toLowerCase())) return null;
  return last;
}

/// "Dr. Holly" when the record actually says this person is one. Otherwise
/// nothing, and the ordinary first-name greeting stands.
function doctorGreetingFor({ name, role, email } = {}) {
  const named = A_DOCTOR_TITLE.test(String(name || ''));
  const byRole = A_DOCTORS_JOB.test(String(role || '')) || DOCTOR_LETTERS.test(String(role || ''));
  const byAddress = /^dr[._-]?[a-z]/i.test(String(email || '').split('@')[0] || '');
  if (!named && !byRole && !byAddress) return null;
  const surname = doctorSurname(name);
  return surname ? `Dr. ${surname}` : null;
}

module.exports = {
  NOT_A_PERSON, FIRST_NAMES, NEVER_IN_A_NAME, nameFromEmail, firstNameOf,
  firstNameOfMarked, plausiblePersonName, doctorSurname, doctorGreetingFor,
  nameLooksLikeAPageTitle, nameToSayOutLoud,
};
