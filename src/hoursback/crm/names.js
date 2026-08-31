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

module.exports = { NOT_A_PERSON, FIRST_NAMES, NEVER_IN_A_NAME, nameFromEmail, firstNameOf, firstNameOfMarked, plausiblePersonName };
