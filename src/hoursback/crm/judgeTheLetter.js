// ONE JUDGE. THERE USED TO BE FIVE.
//
// On 2026-09-08 Russ opened Bryant, Lovlien & Jarvis and was told his day-eight
// message "would not pass: an exclamation or a question". Asking one plain
// question is the whole reason that message exists. Nothing was wrong with the
// letter; the screen was reading it against the first message's rulebook.
//
// Five separate pieces of code decided whether a letter was good, and no two
// agreed:
//
//   the writer          knew day eight asks a question, and all four approved
//                       wordings of the standing line
//   the send queue      survived his hand-typed letters, judged first messages
//                       only, knew none of the day rules
//   the nightly check   had its own hand-written rules, recognised ONE of the
//                       four standing lines, and judged follow-ups by the first
//                       message's rules — reporting 202 good letters as stale
//                       and 86 correct sign-offs as costless
//   the page preview    judged every message by the first message's rules and
//                       could not see a letter Russ typed himself at all
//   the sequence writer the only one that was right, and nothing else read it
//
// Every fix for a week patched one of the five and the fault reappeared in
// another. So they are gone. This is the only thing that judges a letter, it is
// told which message it is looking at, and everything calls it.
//
//   const J = require('./judgeTheLetter.js');
//   J.judgeLetter(body, { day: 8, jobs });   // -> { ok, why, passage }

const N = require('./noticing.js');
const C = require('./campaign.js');

// ---------------------------------------------------------------------------
// WHAT A BROWSER DOES TO A LETTER RUSS TYPES.
//
// Editing a letter in the browser saves carriage returns between the
// paragraphs, which no eye can see and which every check split on the wrong
// character. His Bryant letter came back as one unbroken block, so three of the
// five judges found no passage in it and said nothing at all — a hand-written
// letter, silently unjudged.
//
// One of the five was patched to also split on single line breaks. That treated
// the symptom. The characters are removed here instead, once, at the door.
function tidy(text) {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function normalise(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// WHICH PARAGRAPHS ARE THE LETTER'S FURNITURE.
//
// A letter is the written passage about THAT business plus fixed paragraphs
// that are the same for everyone: who Russ is, why him, the offer, the ask, the
// sign-off. Only the written passage is judged — handing the judge the offer
// paragraph as well failed 139 good letters on length alone.
//
// Every check so far kept its own hand-written list of opening words to
// recognise the furniture by, and all four lists had drifted apart. The
// wordings themselves are in campaign.js, so this asks THEM. Change an approved
// wording and this keeps working; it cannot go stale, because there is nothing
// separate left to go stale.
function fixedWordings() {
  const slots = C.slotsOfTheMessage();
  const all = [];
  for (const [name, list] of Object.entries(slots)) {
    // "handled" is the standing line, which is stuck on the END of the written
    // passage rather than being a paragraph of its own. It is handled below.
    if (name === 'handled') continue;
    for (const w of list) all.push(normalise(w));
  }
  return all.filter((w) => w.length > 40);
}

// The last net, for a letter Russ typed himself where no wording matches
// anything on file. These are the openings his own letters actually use.
const FURNITURE_BY_EYE = /^(hi |hello,|dear )|sat in the offices|local to Central Oregon|based here in Central Oregon|I've run businesses of my own|I've done the work I'm offering|Give me fifteen minutes|Fifteen minutes on the phone|No charge|There's no charge|Free, nothing to sign|Best regards|Russ Wright/i;

function isFurniture(paragraph, known) {
  const p = normalise(paragraph);
  if (!p) return true;
  if (FURNITURE_BY_EYE.test(String(paragraph).trim())) return true;
  // A known wording, allowing for a light edit at either end.
  return known.some((w) => p === w || p.includes(w.slice(0, 60)) || w.includes(p.slice(0, 60)));
}

// ---------------------------------------------------------------------------
// RUSS'S OWN LINE, AND ITS FOUR APPROVED WORDINGS.
//
// The line about three or four more repetitive jobs is his, from his own
// rewrite. It sits at the end of the written passage, so it is cut off before
// the passage is measured — but it is judged separately, because on 2026-09-07
// 297 letters carried the "Most have three or four" wording he had replaced
// three days earlier and every check said they were fine.
//
// The wordings are read from campaign.js rather than described by a pattern
// here. A pattern is how the nightly check came to recognise only the first of
// the four and report the other 202 letters as carrying rejected words.
const STANDING_LINE_TAIL = /\b(?:Some\s+\S+[\s\S]{0,40}?|You may well )(?:may have|will have|have|do have|had)\b[\s\S]*$|\b(?:Some|Most|Plenty)[\s\S]{0,60}?three or four[\s\S]*$/i;

function splitOffStandingLine(passage) {
  const text = String(passage || '').trim();
  const m = text.match(STANDING_LINE_TAIL);
  if (!m) return { written: text, standing: '' };
  return { written: text.slice(0, m.index).trim(), standing: m[0].trim() };
}

function judgeStandingLine(standing) {
  if (!standing) return null;                       // not every message carries it
  const s = normalise(standing);
  const approved = C.waysToSay(C.ALREADY_HANDLED, 'handled')
    .map((w) => normalise(w.replace('{they}', '')));
  // An approved wording has the trade word dropped into it, so compare on the
  // distinctive tail rather than the whole line.
  const known = approved.some((w) => {
    const tail = w.slice(-60);
    return tail.length > 20 && s.includes(tail);
  });
  if (known) return null;
  const presumes = standing.match(/\b(most|mostly|usually|typically|plenty of)\b/i);
  if (presumes) {
    return `carries the wording Russ replaced on 4 September ("${presumes[0]}...") — all four approved versions say "some"`;
  }
  return 'the line about three or four more jobs is not one of the four wordings Russ approved';
}

// ---------------------------------------------------------------------------
// WHICH RULES BELONG TO WHICH DAY.
//
// This is the whole point of the file. The rules themselves live in one place
// (noticing.js passable); what changes per message is which of them apply.
const BY_DAY = {
  // The first message. Every rule, in full.
  0: { allowQuestion: true, needsCost: true, mustAskQuestion: true },
  // Four days later, one job taken a level deeper. Judged like the first.
  4: { allowQuestion: false, needsCost: true, mustAskQuestion: false },
  // Eight days later. Its whole job is one plain question, so a question is
  // required rather than banned. It still has to say what the work costs.
  8: { allowQuestion: true, needsCost: true, mustAskQuestion: true },
  // Two weeks. A sign-off. It names in one clause what he would have looked at
  // and stops, so there is no cost to name and nothing to ask.
  14: { allowQuestion: false, needsCost: false, mustAskQuestion: false },
};

function dayOf(openedWith) {
  const m = String(openedWith || '').match(/^touch_([234])$/);
  if (!m) return 0;
  return { 2: 4, 3: 8, 4: 14 }[m[1]];
}

// ---------------------------------------------------------------------------
// THE JUDGE.
//
// Give it the letter as the customer will read it and which message it is.
// It answers ok / why, and hands back the passage it actually judged so a
// screen can show what it looked at.
function judgeLetter(body, { day = 0, jobs = [], roleTitle = null, avoid = [] } = {}) {
  const rules = BY_DAY[day] || BY_DAY[0];
  const text = tidy(body);
  if (!text.trim()) return { ok: false, why: 'the letter is empty', passage: '' };

  // Paragraphs, however they were typed. A letter written by the app has blank
  // lines between paragraphs; one Russ typed may not.
  let blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length <= 1) blocks = text.split('\n').map((b) => b.trim()).filter(Boolean);

  const known = fixedWordings();
  const theirs = blocks.filter((b) => b.length > 60 && !isFurniture(b, known));
  if (!theirs.length) {
    return { ok: false, why: 'no passage in it says anything about this business', passage: '' };
  }
  const passage = theirs.join(' ');
  const { written, standing } = splitOffStandingLine(passage);
  if (!written) {
    return { ok: false, why: 'nothing left once the standing line is taken off — the letter says nothing about them', passage };
  }

  // A question is punctuation the sentence rules read, so ask about it before
  // handing the passage over.
  // The reply question is deliberately short and may live in its own block.
  // Passage extraction ignores short furniture-sized blocks, so looking only
  // at `written` made a valid 20-to-60 character question invisible.
  const asks = /\?/.test(text);
  if (rules.mustAskQuestion && !asks) {
    return { ok: false, why: 'does not ask a question, which is the whole reason this message exists', passage };
  }

  const verdict = N.passable(written, {
    roleTitle,
    avoid,
    jobs,
    allowQuestion: rules.allowQuestion,
    needsCost: rules.needsCost,
  });
  if (!verdict.ok) return { ok: false, why: verdict.why, passage };

  const standingFault = judgeStandingLine(standing);
  if (standingFault) return { ok: false, why: standingFault, passage };

  return { ok: true, why: null, passage };
}

// The same judgement, taken straight from a stored message, so nothing has to
// work out for itself which day a message belongs to.
function judgeStored(message, { jobs = [], roleTitle = null, avoid = [] } = {}) {
  return judgeLetter(message.body, {
    day: dayOf(message.openedWith), jobs, roleTitle, avoid,
  });
}

module.exports = {
  judgeLetter, judgeStored, dayOf, tidy, BY_DAY,
  splitOffStandingLine, judgeStandingLine, fixedWordings, isFurniture,
};
