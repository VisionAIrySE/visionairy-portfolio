// READING WHAT THE MODEL ACTUALLY SENT BACK.
//
// The reader is asked for JSON and mostly sends JSON. When it does not, what
// comes back is almost never nonsense — it is JSON with a sentence in front of
// it, or wrapped in a code fence, or carrying a trailing comma, or with the
// model's own curly quotes in it. Every one of those is readable.
//
// Until 2026-09-02 all of them were one outcome: "the reader answered with
// broken JSON", and the business kept its generic trade sentence. Three
// businesses lost their opening line to it in a single batch of nineteen —
// The Reserve at Metolius, Escape Adventures, Team Wieche — and two of the
// three had thirty pages of their own words sitting on file.
//
// So the answer is read properly, and only genuinely unreadable text fails.
// Nothing here invents a value: every repair is to the PUNCTUATION around
// what the model said, never to what it said.

/// Strip a code fence, if the model wrapped its answer in one.
function unfence(text) {
  const fenced = String(text || '').match(/```(?:json|javascript|js)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1] : String(text || '');
}

/// Every balanced {...} in the text, longest first — so the whole object is
/// tried before any object nested inside it. Quotes and escapes are tracked,
/// so a brace inside a string never opens or closes a candidate.
function braceRuns(text) {
  const runs = [];
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) { runs.push(s.slice(i, j + 1)); break; }
      }
    }
  }
  return runs.sort((a, b) => b.length - a.length);
}

/// Punctuation repairs only. Each one is a habit of writing, not a change of
/// meaning: a comma before a closing brace, the model's own curly quotes, a
/// literal newline sitting inside a quoted string.
function repair(candidate) {
  let t = String(candidate);
  // Curly quotes where straight ones belong — but only the double quotes that
  // do structural work; an apostrophe inside a sentence is left exactly as the
  // model wrote it.
  t = t.replace(/[“”]/g, '"');
  // A trailing comma before a closing brace or bracket.
  t = t.replace(/,(\s*[}\]])/g, '$1');
  // A real line break inside a quoted string. JSON forbids it; models write it
  // constantly. Becomes a space, so the sentence still reads as one sentence.
  let out = '';
  let inString = false;
  let escaped = false;
  for (const c of t) {
    if (escaped) { out += c; escaped = false; continue; }
    if (c === '\\') { out += c; escaped = true; continue; }
    if (c === '"') { inString = !inString; out += c; continue; }
    if (inString && (c === '\n' || c === '\r' || c === '\t')) { out += ' '; continue; }
    out += c;
  }
  return out;
}

/// The answer the reader meant, or null with a reason saying which of the two
/// things went wrong — nothing that looks like JSON at all, or something that
/// does and could not be read even after repair. The two are different
/// problems and they are never reported as one.
function readAnswer(text) {
  const body = unfence(text);
  const candidates = braceRuns(body);
  if (!candidates.length) return { answer: null, why: 'the reader answered with no JSON' };
  for (const c of candidates) {
    try { return { answer: JSON.parse(c), why: null }; } catch { /* try the next */ }
  }
  for (const c of candidates) {
    try { return { answer: JSON.parse(repair(c)), why: null, repaired: true }; } catch { /* try the next */ }
  }
  return {
    answer: null,
    why: `the reader answered with JSON that could not be read even after repair (${candidates[0].slice(0, 120)})`,
  };
}

module.exports = { readAnswer, unfence, braceRuns, repair };
