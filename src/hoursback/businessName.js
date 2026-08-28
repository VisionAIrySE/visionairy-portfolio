// What a business is actually called.
//
// A website's title bar is written for search engines, not for people: "Bend,
// OR Dentist Near Me", "Cosmetic & General Dentist Bend, OR & Bend, OR",
// "Home". Reading 1,322 sites and saving those as names left 43% of the
// emailable list addressed by its own search heading, and the raw web code
// inside them ("Jones &amp; Roth") reaching subject lines (Russ, 2026-08-27:
// "would you open these emails? Would you think they're credible?" — no).
//
// This turns a heading back into a name where it can, and says so plainly
// where it cannot. A business with no honest name is better left unnamed than
// greeted as "Home".

// Web code that means a character. Anything left after this is not a name.
const ENTITIES = {
  '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ',
  '&#39;': "'", '&#039;': "'", '&#8217;': '’', '&#8216;': '‘', '&#8211;': '–',
  '&#8212;': '—', '&#8226;': '·', '&#038;': '&', '&#38;': '&', '&hellip;': '…',
  '&rsquo;': '’', '&lsquo;': '‘', '&ndash;': '–', '&mdash;': '—', '&trade;': '',
  '&reg;': '', '&copy;': '', '&#8482;': '', '&#174;': '', '&#169;': '',
};

function decode(s) {
  let out = String(s || '');
  for (const [k, v] of Object.entries(ENTITIES)) out = out.split(k).join(v);
  // Anything numeric left over.
  out = out.replace(/&#(\d+);/g, (_, n) => {
    const c = Number(n);
    return c > 31 && c < 65536 ? String.fromCharCode(c) : '';
  });
  return out.replace(/\s+/g, ' ').trim();
}

// Words that mean somebody pasted a page heading, not a name.
const NOT_A_NAME = /^(home|homepage|welcome|index|contact|contact us|about|about us|services|our services|blank page|untitled|new page|site under construction|coming soon)$/i;

// The tail a search heading carries: " - Bend, OR", " | Dentist Near Me".
const TRAILING_LOCATION = /\s*[-|–—·]\s*(bend|redmond|sisters|prineville|madras|la pine|sunriver|terrebonne|culver|tumalo|central oregon|oregon|or)\b.*$/i;
const SEARCH_TAIL = /\s*[-|–—·]\s*(?:.*\b(near me|best|top rated|official site|home page|welcome)\b.*)$/i;

// Marketing words a heading uses and a name never does.
const HEADING_WORDS = /\b(near me|best|top ?rated|affordable|trusted|expert|professional|official site|serving|specialist[s]?|welcome to)\b/i;

// Turn a stored name into something you could say out loud to somebody.
// Returns null where nothing honest can be recovered.
function properName(raw) {
  let s = decode(raw);
  if (!s) return null;

  // "Home - Mission" and "▷ Animal Eye Specialists" — strip leading junk.
  s = s.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9.)]+$/, '').trim();
  if (!s) return null;

  // A heading is usually "Name | tagline | town". The first part is the name,
  // as long as it is not itself a heading word.
  const first = s.split(/\s*[|·]\s*/)[0].trim();
  if (first && first.length >= 2) s = first;

  s = s.replace(SEARCH_TAIL, '').replace(TRAILING_LOCATION, '').trim();
  // A heading that opened with the town AND THE STATE: "Bend, OR Dentist Near
  // Me". The state marker is what makes it a heading rather than a name.
  //
  // Without it this ate the first word of every business actually called after
  // its own town: Bend Accounting PC went out as "Accounting PC", Central
  // Oregon Irrigation District as "Irrigation District", La Pine Realty as
  // "Realty". 70-odd of 696 emailable businesses, addressed by a fragment
  // (2026-08-27). The stored names were right the whole time; this line broke
  // them on the way out.
  s = s.replace(/^(bend|redmond|sisters|prineville|madras|la pine|sunriver|central oregon)\s*,\s*(or|oregon)\b[\s,]*/i, '').trim();

  if (!s || s.length < 2) return null;
  if (NOT_A_NAME.test(s)) return null;
  // ALL CAPS headings like "HOME" are already caught; a shouted real name is
  // left alone because plenty of small businesses register that way.
  if (HEADING_WORDS.test(s)) return null;
  // Anything still this long is a sentence, not a name.
  if (s.split(/\s+/).length > 8) return null;
  return s;
}

// Is what we hold usable in front of a client at all?
function isUsable(raw) {
  return properName(raw) !== null;
}

// Why not, in words Russ can act on.
function whyUnusable(raw) {
  const s = decode(raw);
  if (!s) return 'nothing on file';
  if (NOT_A_NAME.test(s.trim())) return `their site's title bar just says "${s.trim()}"`;
  if (HEADING_WORDS.test(s)) return 'this is a search heading, not a name';
  if (s.split(/\s+/).length > 8) return 'this is a sentence, not a name';
  return null;
}

module.exports = { decode, properName, isUsable, whyUnusable, ENTITIES, NOT_A_NAME };
