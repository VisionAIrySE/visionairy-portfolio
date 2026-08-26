// Learning Russ's voice from what he actually sends.
//
// The method he already uses by hand: draft, let him rewrite it, and keep his
// rewrite as the proof. This does it automatically. The moment he edits a
// message and saves, both versions go into his voice folder with what changed,
// and every message written afterwards is written against them.
//
// It writes only. It never reads back and rewrites anything on its own —
// sharpening the profile is a judgement call, and that stays his.

const fs = require('fs');
const path = require('path');
const os = require('os');

const VOICE_DIR = process.env.HOURSBACK_VOICE_DIR
  || path.join(os.homedir(), '.claude', 'voice', 'samples');

// Only real rewrites are worth keeping. A typo fix teaches nothing, and a
// message he barely touched would water down the samples that matter.
const MIN_WORDS_CHANGED = 8;

function wordsOf(t) { return String(t || '').toLowerCase().match(/[a-z']+/g) || []; }

// Roughly how much of the message he actually rewrote.
function howMuchChanged(before, after) {
  const a = wordsOf(before); const b = wordsOf(after);
  const counts = new Map();
  for (const w of a) counts.set(w, (counts.get(w) || 0) + 1);
  let shared = 0;
  for (const w of b) { const n = counts.get(w) || 0; if (n > 0) { shared += 1; counts.set(w, n - 1); } }
  const changed = Math.max(a.length, b.length) - shared;
  return { changed, share: Math.max(a.length, b.length) ? changed / Math.max(a.length, b.length) : 0 };
}

function slug(t) { return String(t || 'message').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }

// Keep one rewrite. Returns the path written, or null when the edit was too
// small to teach anything.
function captureRewrite({ before, after, business, lane = 'EMAIL', subject = null, at = new Date() }) {
  if (!before || !after || before.trim() === after.trim()) return null;
  const { changed, share } = howMuchChanged(before, after);
  if (changed < MIN_WORDS_CHANGED) return null;

  const date = at.toISOString().slice(0, 10);
  const file = path.join(VOICE_DIR, `${date}-hoursback-${slug(business)}-${slug(subject || lane)}.md`);
  const body = `---
context: Russ rewrote an Hours Back ${lane.toLowerCase()} message before sending it${business ? ` to ${business}` : ''}.
date: ${date}
register: cold outreach, his own hand
changed: ${changed} words, roughly ${Math.round(share * 100)}% of the message
---

# Russ's version — the one that went out

${after.trim()}

---

# What was drafted for him

${before.trim()}
`;
  try {
    fs.mkdirSync(VOICE_DIR, { recursive: true });
    fs.writeFileSync(file, body);
    return file;
  } catch { return null; }   // never let saving a message fail over this
}

module.exports = { VOICE_DIR, MIN_WORDS_CHANGED, howMuchChanged, captureRewrite };
