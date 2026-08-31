// Can you actually get to them?
//
// Russ, 2026-08-28: "you also need to rescore appropriately. No way to contact
// except phone is not a 100."
//
// He was looking at Kernutt Stokes: score 100, no website, no address, nothing
// but a phone number. The 100 was not a bug in the arithmetic — it was the
// arithmetic working exactly as written. Having no website is worth 25 points
// on the opportunity score, because a business with nothing online really is
// doing everything by hand. That is a true statement about the business and a
// useless one for deciding who to work today.
//
// The fault is that ONE number was carrying TWO questions:
//
//   how much time could we save them?    <- opportunity. no website scores high.
//   can we get to them at all?           <- reachability. no website scores low.
//
// Those pull in opposite directions, so mashing them together produces a
// number that means nothing. They are separate here, and the ranking is the
// opportunity held under whatever ceiling reachability allows. A business can
// now read "great fit, but the only way in is the phone", which is the truth
// and is something a person can act on.

// What each route in is worth, and the ceiling it puts on the ranking.
// The ceiling is the point: an unreachable business is not a today business,
// however good a fit it is.
const ROUTES = [
  {
    key: 'named_person_email',
    label: 'A named person you can write to',
    score: 100,
    ceiling: 100,
  },
  {
    key: 'shared_inbox',
    label: 'A general inbox, nobody named',
    score: 70,
    ceiling: 80,
  },
  {
    key: 'contact_form',
    label: 'A form on their site, no address published',
    score: 45,
    ceiling: 60,
  },
  {
    key: 'website_only',
    label: 'A website, but no way to write to them',
    score: 30,
    ceiling: 50,
  },
  {
    key: 'phone_only',
    label: 'The phone and nothing else',
    score: 15,
    ceiling: 35,
  },
  {
    key: 'nothing',
    label: 'No way in at all',
    score: 0,
    ceiling: 10,
  },
];

const BY_KEY = Object.fromEntries(ROUTES.map((r) => [r.key, r]));

// A person you can name AND write to is the thing that makes a business
// workable today, so it is worth more than the same address with no name on it.
//
// found: {
//   peopleWithEmail, peopleNamed, sharedEmail, contactForm, website, phone,
//   peopleWithPhone, peopleWithProfile
// }
function howToReachThem(found = {}) {
  let route;
  if (found.peopleWithEmail > 0) route = BY_KEY.named_person_email;
  else if (found.sharedEmail) route = BY_KEY.shared_inbox;
  else if (found.contactForm) route = BY_KEY.contact_form;
  else if (found.website) route = BY_KEY.website_only;
  else if (found.phone) route = BY_KEY.phone_only;
  else route = BY_KEY.nothing;

  // Small additions for the things that make a call easier, never enough to
  // change which route you are on.
  let score = route.score;
  const why = [route.label];
  if (found.peopleWithEmail > 1) { score += 5; why.push(`${found.peopleWithEmail} people you can write to`); }
  if (found.peopleWithPhone > 0) { score += 5; why.push('a direct line for someone'); }
  if (found.peopleWithProfile > 0) { score += 3; why.push('someone on LinkedIn'); }
  if (found.peopleNamed > 0 && !found.peopleWithEmail) { score += 4; why.push(`${found.peopleNamed} named, no address for them`); }

  return {
    route: route.key,
    score: Math.max(0, Math.min(100, score)),
    ceiling: route.ceiling,
    why,
    inWords: why.join('; '),
  };
}

// The number the list is sorted by: how good a fit they are, held under what
// it actually takes to reach them.
function callOrderScore(opportunity, reach) {
  const fit = Math.max(0, Math.min(100, Number(opportunity) || 0));
  const cap = reach && Number.isFinite(reach.ceiling) ? reach.ceiling : 100;
  return Math.min(fit, cap);
}

// Said in one line for the screen, so the number is never a black box.
function explain(opportunity, reach) {
  const fit = Math.max(0, Math.min(100, Number(opportunity) || 0));
  const ranked = callOrderScore(fit, reach);
  if (ranked < fit) {
    return `Good fit (${fit}) but held at ${ranked} — ${reach.inWords.toLowerCase()}`;
  }
  return `${ranked} — ${reach.inWords.toLowerCase()}`;
}

module.exports = { ROUTES, BY_KEY, howToReachThem, callOrderScore, explain };
