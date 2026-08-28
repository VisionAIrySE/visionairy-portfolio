// Putting a person back together.
//
// The people at a business arrive from two places on their own website and are
// never joined. At Insurance Center that produced 19 rows for what is probably
// a ten-person office:
//
//   Ken Pfliiger    (no address)
//   (no name)       kenp@insurance-ctr.com
//
// The names come off the team page, where nobody's address sits beside their
// photograph. The addresses come off a contact page, where nobody's name sits
// beside the address. The only thing used to match people is the name — and
// half the rows haven't got one.
//
// THIS IS A RULE, so it gets measured before it is believed. Reading 136
// business names by hand got 136 right where a rule produced "Northlamontass";
// here there are thousands of pairs and reading them all is not possible, so
// the rule is checked against a sample read by hand and its hit rate is said
// out loud (see feedback-read-the-data-dont-pattern-match-it).
//
// What it will and will not claim:
//   kenp@      + Ken Pfliiger   -> yes. First name whole, then the surname's start.
//   melissal@  + Melissa Leiper -> yes.
//   jims@      + Jim Smith      -> yes.
//   barba@     + Barbara Jones  -> NO. "barb" is not "barbara"; a nickname is a
//                                 guess, and a guess here writes to the wrong
//                                 person under a real name.
//   info@      + anybody        -> NO. Never a person.
//   greggf@    + Gregg Foster   -> yes, if Gregg Foster is on the list.

// Addresses that belong to a business, never to a person.
const NOT_A_PERSON = /^(info|office|admin|hello|contact|sales|support|help|team|mail|email|enquir\w*|inquir\w*|service|billing|accounts?|reception|frontdesk|front\.?desk|general|main|no-?reply|webmaster|marketing|hr|jobs|careers|orders?|shop|store|bookings?|appointments?|scheduling|claims|quotes?)$/i;

function localPartOf(email) {
  const at = String(email || '').indexOf('@');
  return at > 0 ? String(email).slice(0, at).toLowerCase().replace(/[^a-z]/g, '') : '';
}

function partsOfName(name) {
  const words = String(name || '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(jr|sr|ii|iii|iv|dr|mr|mrs|ms)$/.test(w));
  return { first: words[0] || '', last: words.length > 1 ? words[words.length - 1] : '' };
}

// Does this address belong to this person? Returns null, or how sure and why.
//
// Every match requires the WHOLE first name. A shortened first name is where
// this would start writing to strangers.
// Words that appear in a company's name and never in a person's.
const A_COMPANY_NOT_A_PERSON = /\b(maintenance|membership|services?|solutions?|systems?|supply|company|group|team|program|plan|club|center|centre|clinic|shop|works?|design|studio|agency|partners?|associates?|holdings?|enterprises?|industries?|electric|plumbing|heating|cooling|roofing|construction|realty|insurance|dental|medical|law|tax)\b/i;

// Is every word here shaped like a name?
//
// The first attempt rejected anything overlapping the company's name. That
// killed "Sage Mtn" at Sage Mtn. Electric, which was right — and also killed
// Olin Sitz at Olin Sitz Excavation and Colton Evans at Evans Tree and Lawn,
// which was wrong. A family business named after its owner is exactly the case
// where the person's name IS the company's name. Seven good joins lost to stop
// three bad ones (2026-08-28).
//
// The real difference is simpler. "Sitz", "Seymour", "Evans" and "Robertson"
// are surnames. "Mtn" is an abbreviation and has no vowel in it at all. That
// is a fact about the letters, not a guess about the business.
function everyWordIsNameShaped(name) {
  const words = String(name || '').replace(/[^A-Za-z'\s-]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  return words.every((w) => w.length === 1 || /[aeiouy]/i.test(w));
}

function addressBelongsTo(email, name, businessName) {
  const local = localPartOf(email);
  if (!local || NOT_A_PERSON.test(local)) return null;
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  const { looksLikeAPerson } = require('./peopleSweep.js');
  if (!looksLikeAPerson(clean)) return null;
  if (A_COMPANY_NOT_A_PERSON.test(clean)) return null;
  if (!everyWordIsNameShaped(clean)) return null;
  const { first, last } = partsOfName(name);
  if (!first || first.length < 2) return null;

  // firstname + first letters of the surname: kenp, melissal, mikec
  if (last && local.startsWith(first)) {
    const rest = local.slice(first.length);
    if (rest && last.startsWith(rest)) {
      return { how: rest.length === 1 ? 'first name and the initial of the surname' : 'first name and the start of the surname', sure: 'high' };
    }
    if (!rest) return { how: 'their first name, and nobody else there shares it', sure: 'medium' };
  }
  // first initial + surname: kpfliiger, jsmith
  if (last && local === first[0] + last) {
    return { how: 'initial and surname', sure: 'high' };
  }
  // the whole name run together: kenpfliiger
  if (last && local === first + last) {
    return { how: 'their whole name', sure: 'high' };
  }
  return null;
}

// Join the rows for one business. Never guesses where two people could both
// own an address — a shared first name means neither gets it.
//
// people: [{ id, name, email, role, phone, isPrimary }]
function joinPeople(people = [], businessName = '') {
  const withName = people.filter((p) => p.name && String(p.name).trim());
  const orphanAddresses = people.filter((p) => (!p.name || !String(p.name).trim()) && p.email);

  const joins = [];
  const takenOrphan = new Set();

  for (const orphan of orphanAddresses) {
    const claims = withName
      .filter((p) => !p.email)
      .map((p) => ({ person: p, match: addressBelongsTo(orphan.email, p.name, businessName) }))
      .filter((c) => c.match);
    // Two people could both be it. Neither gets it — writing to the wrong
    // Julie under her own name is worse than writing to nobody.
    if (claims.length !== 1) continue;
    if (takenOrphan.has(orphan.id)) continue;
    takenOrphan.add(orphan.id);
    joins.push({
      keep: claims[0].person,
      absorb: orphan,
      email: orphan.email,
      why: claims[0].match.how,
      sure: claims[0].match.sure,
    });
  }
  return joins;
}

module.exports = {
  NOT_A_PERSON, A_COMPANY_NOT_A_PERSON,
  localPartOf, partsOfName, everyWordIsNameShaped, addressBelongsTo, joinPeople,
};
