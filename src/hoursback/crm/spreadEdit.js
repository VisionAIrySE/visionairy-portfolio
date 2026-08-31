// WHEN RUSS REWRITES A SENTENCE, WHICH SENTENCE DID HE REWRITE?
//
// Editing a message on screen changed that one message and nothing else. He
// asked twice for his edits to become the pattern rather than a one-off: "I
// want my edits to spread as examples of how the rest should be written so I
// don't have to do it every fucking time" (2026-08-31).
//
// Spreading it silently is not safe. A line he wrote for one business ("saw you
// at the game") would go to 869 strangers. So this works out WHAT he changed
// and offers it back to him; nothing moves until he says yes.
//
// How it tells: the message is assembled from a known set of sentences. Take
// what the engine would have written, take what he saved, and the paragraph
// that disappeared names the sentence he replaced. Whatever stands in its place
// is his new wording for it.

const CAMPAIGN = require('./campaign.js');

const paragraphsOf = (body) => String(body || '')
  .split(/\n\n+/)
  .map((p) => p.trim())
  .filter(Boolean);

// Which of the message's sentences does this paragraph belong to?
function slotOf(paragraph) {
  const slots = CAMPAIGN.slotsOfTheMessage();
  for (const [slot, list] of Object.entries(slots)) {
    for (const written of list) {
      if (paragraph === written) return slot;
      // Two sentences carry a blank filled in per business — what to call a
      // business of this kind, and the name of the task. Matching on the whole
      // string fails on those, so the test is the longest run of fixed words
      // between the blanks, which is more than distinctive enough.
      const longest = written.split(/\{[a-z]+\}/i).sort((a, b) => b.length - a.length)[0].trim();
      if (longest.length > 40 && paragraph.includes(longest)) return slot;
    }
  }
  return null;
}

// What changed between the message as written and the message as he saved it.
// Returns null when nothing maps onto a known sentence — a one-off edit about
// that business alone, which must never spread.
function whatHeChanged(generatedBody, editedBody) {
  const was = paragraphsOf(generatedBody);
  const now = paragraphsOf(editedBody);
  const gone = was.filter((p) => !now.includes(p));
  const fresh = now.filter((p) => !was.includes(p));

  // More than one paragraph moved, or none did: too uncertain to offer.
  if (gone.length !== 1 || fresh.length !== 1) return null;

  const slot = slotOf(gone[0]);
  if (!slot) return null;

  // A paragraph naming this business by name is about them, not about the
  // wording. Offering to send it to 869 strangers is exactly the harm this
  // whole check exists to prevent — so it is never offered.
  return { slot, was: gone[0], now: fresh[0] };
}

// A wording that mentions a specific business, a person's name, or a place is
// his note to one reader and must not become everybody's sentence.
function looksPersonal(wording, businessName, personName) {
  const text = String(wording || '');
  for (const own of [businessName, personName]) {
    if (own && String(own).length > 3 && text.includes(String(own))) return true;
  }
  return false;
}

module.exports = { paragraphsOf, slotOf, whatHeChanged, looksPersonal };
