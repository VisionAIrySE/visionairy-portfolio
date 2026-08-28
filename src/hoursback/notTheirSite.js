// Is this actually THEIR website, or a page about them on somebody else's?
//
// Russ opened Animal Eye Specialists: scored 100, team size 8, no email, one
// name — and the "website" was allvetnearme.com/animal-eye-specialists-llc/.
// A directory. Their own words, their team size and their name had all been
// read off a listing somebody else wrote about them (2026-08-28).
//
// The website hunt checked that a page NAMES the business. A directory always
// names the business — that is the whole point of a directory. So the check
// could never catch this.
//
// The real tell is structural and needs no list to maintain: on their own site
// the business's name is in the DOMAIN. On a listing it is in the PATH, after
// the slash, because the domain belongs to whoever runs the directory.
//
//   animaleyespecialists.com/          -> theirs
//   allvetnearme.com/animal-eye-...    -> a listing about them

// The ones worth naming outright, because they are common and certain.
// sites.google.com and linktr.ee are NOT directories — a small business
// hosting its own page there is still its own page.
const KNOWN_DIRECTORIES = /^(www\.)?([a-z0-9-]+\.)?(yelp|yellowpages|superpages|manta|mapquest|bbb|chamberofcommerce|angi|angieslist|thumbtack|houzz|porch|healthgrades|zocdoc|vitals|webmd|findlaw|avvo|justia|lawyers|martindale|zillow|realtor|trulia|redfin|homeadvisor|nextdoor|foursquare|citysearch|local|hotfrog|cylex|brownbook|tupalo|merchantcircle|dexknows|whitepages|allvetnearme|vetmatch|ratemds|indeed|glassdoor|ziprecruiter|linkedin|facebook|instagram|twitter|x|tiktok|pinterest|youtube|google|apple|amazon|ebay|etsy|squareup|carrd|about)\.(com|net|org|us|co|me|ee)$/i;

function domainOf(url) {
  try {
    return new URL(String(url).startsWith('http') ? String(url) : `https://${url}`).hostname.toLowerCase();
  } catch { return ''; }
}

function pathOf(url) {
  try {
    return new URL(String(url).startsWith('http') ? String(url) : `https://${url}`).pathname.toLowerCase();
  } catch { return ''; }
}

const IGNORE = /\b(llc|l\.l\.c\.?|inc|incorporated|corp|corporation|co|company|ltd|limited|lp|llp|pc|p\.c\.?|the|and|of|a|an|in|oregon|or|bend|redmond|sisters|prineville|madras)\b/gi;

function wordsOf(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(IGNORE, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

// Returns null when it looks like their own site, or a reason in plain words.
function whyNotTheirs(url, businessName) {
  const host = domainOf(url);
  if (!host) return null;
  // A small business hosting its own page on Google Sites or Linktree still
  // owns that page. It is not a directory listing about them.
  if (/^(sites\.google\.com|linktr\.ee|.*\.godaddysites\.com|.*\.wixsite\.com|.*\.squarespace\.com|.*\.my\.canva\.site)$/i.test(host)) return null;
  if (KNOWN_DIRECTORIES.test(host)) return `${host} is a directory, not their own site`;

  const words = wordsOf(businessName);
  if (!words.length) return null;
  const bare = host.replace(/^www\./, '').replace(/\.[a-z.]+$/, '').replace(/[^a-z0-9]/g, '');
  const inDomain = words.some((w) => bare.includes(w));
  if (inDomain) return null;

  // Their name is not in the domain. If it IS in the path, this is a page
  // about them on somebody else's site.
  const path = pathOf(url).replace(/[^a-z0-9]/g, '');
  const inPath = words.filter((w) => path.includes(w)).length;
  if (inPath >= Math.max(1, Math.ceil(words.length * 0.6))) {
    return `their name is in the address after the slash, not in the domain — ${host} belongs to somebody else`;
  }
  return null;
}

module.exports = { KNOWN_DIRECTORIES, domainOf, pathOf, wordsOf, whyNotTheirs };
