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
rodney shawn troy wesley clint clay chase brady bret cole devon garrick pete
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
  if (head.length < 3 || head.length > 12) return null;
  if (NOT_A_PERSON.has(head)) return null;
  if (!FIRST_NAMES.has(head)) return null;
  return head[0].toUpperCase() + head.slice(1);
}

// A first name out of a full name, for the same greeting.
function firstNameOf(fullName) {
  if (!fullName) return null;
  const first = String(fullName).trim().split(/\s+/)[0];
  return first && first.length > 1 ? first : null;
}

module.exports = { NOT_A_PERSON, FIRST_NAMES, nameFromEmail, firstNameOf };
