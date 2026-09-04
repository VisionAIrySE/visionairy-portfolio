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

// A LETTER SAVED FROM THE BROWSER ARRIVES WITH WINDOWS LINE ENDINGS.
//
// This split on \n\n only. A textarea posts \r\n\r\n between paragraphs, so
// every letter Russ edited on screen came back as ONE paragraph, the comparison
// below had nothing to compare, and the offer to spread his wording was never
// made once in twenty-three edits. He believed it was working the whole time.
//
// So the split accepts either ending, and any blank line between paragraphs.
const GREETING = /^(hi|hello|dear|good (morning|afternoon))\b/i;
const SIGN_OFF_LINE = /^(best regards|kind regards|regards|thanks|thank you|cheers|russ wright|founder|visionairy)\b/i;

const paragraphsOf = (body) => String(body || '')
  .replace(/\r\n/g, '\n')
  .split(/\n[ \t]*\n+/)
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

/// The order of the message's known sentences, as a list of slot names. An
/// unrecognised paragraph (the greeting, the sign-off, a line he wrote from
/// scratch) is not part of the order and is left out.
function orderOf(body) {
  return paragraphsOf(body).map(slotOf).filter(Boolean);
}

// WHAT HE CHANGED, AND SAYING SO WHEN IT CANNOT BE TOLD.
//
// Three answers, never a silent nothing:
//
//   wording      one known sentence swapped for different words. His wording
//                can become everybody's.
//   order        the same sentences, in a different sequence. That is an
//                instruction about how the letter is built, and it is the edit
//                he actually made twenty-three times while this file noticed
//                none of them.
//   cannot_tell  something else. Said out loud, with what it saw, because
//                silence is what let him believe it was working.
//
// Nothing moves until he says yes. That has not changed.
function whatHeChanged(generatedBody, editedBody) {
  const was = paragraphsOf(generatedBody);
  const now = paragraphsOf(editedBody);
  const gone = was.filter((p) => !now.includes(p));
  const fresh = now.filter((p) => !was.includes(p));

  // ONE SENTENCE REWRITTEN.
  if (gone.length === 1 && fresh.length === 1) {
    const slot = slotOf(gone[0]);
    if (slot) return { kind: 'wording', slot, was: gone[0], now: fresh[0] };
  }

  // ONE PARAGRAPH REWRITTEN, WHEN OTHERS HAPPENED TO DIFFER TOO (2026-09-04).
  //
  // Russ: "none of my edits are fucking spreading." Tested it and he was
  // right. The rule above only fires when exactly ONE paragraph differs from
  // the letter as it would be written now. But the letter is written fresh
  // each time and each fixed line has four wordings picked by the business's
  // own name, so a letter saved yesterday can differ in three places before
  // he touches it. Then gone.length is 3, the rule above never fires, and
  // what he actually did — reword one paragraph — fell through to the reorder
  // rules and came back as "you put the paragraphs in a different order".
  //
  // Worse, rewording a paragraph enough stops it being recognised at all, so
  // it read as a paragraph DELETED. He was being shown an offer about an order
  // he never changed, so of course he ignored it, and his wording never spread.
  //
  // So: when the letters have the same number of paragraphs, compare them
  // position by position. If exactly one position differs, that is a rewrite
  // of that paragraph, whatever else the engine would have picked elsewhere.
  //
  // THE GREETING AND THE SIGN-OFF ARE NOT WORDINGS. They belong to one reader,
  // they change on their own as the person on the record changes, and they are
  // never spread to anybody. Left in the comparison they masquerade as a second
  // edit and hide the real one: the test that found this bug changed exactly one
  // paragraph, and the greeting had moved from Katie to Jessica underneath it.
  const spreadable = (para) => !GREETING.test(para) && !SIGN_OFF_LINE.test(para);
  if (was.length === now.length) {
    const moved = [];
    for (let i = 0; i < was.length; i += 1) {
      if (was[i] !== now[i] && spreadable(was[i]) && spreadable(now[i])) moved.push(i);
    }
    if (moved.length === 1) {
      const i = moved[0];
      const slot = slotOf(was[i]) || slotOf(now[i]);
      if (slot) return { kind: 'wording', slot, was: was[i], now: now[i] };
    }
  }

  // THE SAME SENTENCES, MOVED. Judged on the slots, not the words, so a
  // reorder is still recognised when he also reworded a line inside it.
  const wasOrder = orderOf(generatedBody);
  const nowOrder = orderOf(editedBody);
  const sameSet = wasOrder.length === nowOrder.length
    && [...wasOrder].sort().join() === [...nowOrder].sort().join();
  if (sameSet && wasOrder.join() !== nowOrder.join()) {
    return { kind: 'order', was: wasOrder, now: nowOrder };
  }

  // A SENTENCE DROPPED, OR ONE ADDED, alongside a move. Still an order change
  // worth offering, but it is named for what it is.
  if (wasOrder.length && nowOrder.length && wasOrder.join() !== nowOrder.join()) {
    const dropped = wasOrder.filter((x) => !nowOrder.includes(x));
    const added = nowOrder.filter((x) => !wasOrder.includes(x));
    return {
      kind: 'order', was: wasOrder, now: nowOrder, dropped, added,
    };
  }

  return {
    kind: 'cannot_tell',
    why: gone.length === 0 && fresh.length === 0
      ? 'nothing in this letter differs from what would be written now'
      : `${gone.length} paragraph${gone.length === 1 ? '' : 's'} changed and `
        + `${fresh.length} took their place, which does not map onto one sentence`,
  };
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

module.exports = { paragraphsOf, slotOf, orderOf, whatHeChanged, looksPersonal };
