// Meeting a business where they write, without ever leaving Russ's voice.
//
// The rule: HIS tone and approach stay fixed. What moves is the register —
// how formal, how long the sentences, how much ceremony. A hundred-year law
// firm and a mobile mechanic both deserve to be spoken to like a peer, and
// "peer" reads differently to each of them.
//
// Everything here is judged from what the business actually wrote about
// itself. No guessing from the trade alone: a polished website does not mean
// a polished person, but the words they chose are evidence.
//
// Never obsequious. Never below Russ's own floor. If we cannot tell, we use
// his normal voice, which is already warm and plain.

const FORMAL_MARKERS = /\b(established|founded in|our firm|the firm|attorneys|counsel|clients we serve|committed to excellence|proudly serving|since 1[89]\d{2}|since 20[01]\d|professional (?:services|team)|dedicated to providing|comprehensive|tailored solutions|our practice|associates)\b/gi;
const PLAIN_MARKERS = /\b(we're|you're|don't|can't|we'll|folks|give us a (?:call|shout)|no (?:job|problem) too|get it done|straight up|honest|family[- ]owned|family[- ]run|born and raised|locally owned|down[- ]to[- ]earth|friendly|we love|come see us|stop by)\b/gi;

// FORMAL   — write in fuller sentences, no contractions, more ceremony.
// PLAIN    — short, direct, contractions, no ceremony at all.
// NEUTRAL  — Russ's normal voice, which is where he sits anyway.
const REGISTERS = ['FORMAL', 'NEUTRAL', 'PLAIN'];

// The clearest signal of all is contractions. A firm that writes "we have
// served" rather than "we've served" is telling you how it expects to be
// spoken to, and it does so more reliably than any single word.
const CONTRACTIONS = /\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi;

function registerFor(selfDescription) {
  const text = String(selfDescription || '');
  if (text.length < 40) return 'NEUTRAL';         // too little to read anything into
  const formal = (text.match(FORMAL_MARKERS) || []).length;
  const plain = (text.match(PLAIN_MARKERS) || []).length;
  const contractions = (text.match(CONTRACTIONS) || []).length;
  const words = text.split(/\s+/).length;
  const longSentences = text.split(/[.!?]+/).filter((x) => x.split(/\s+/).length > 18).length;

  const formalScore = formal + (contractions === 0 && words >= 15 ? 1 : 0) + longSentences;
  const plainScore = plain + (contractions >= 2 ? 1 : 0);

  if (formalScore >= 2 && formalScore > plainScore) return 'FORMAL';
  if (plainScore >= 2 && plainScore > formalScore) return 'PLAIN';
  return 'NEUTRAL';
}

// The same sentence, at three registers. Russ's warmth and his refusal to
// pitch are constant; only the ceremony moves.
const OPENING_BY_REGISTER = {
  FORMAL: "I'm local to Central Oregon, and I build software that takes repetitive office work off people's plates. Rather than describe it, I would rather speak to what look like some specific needs for your team.",
  NEUTRAL: "I'm local to Central Oregon and I build software that takes repetitive office work off people's plates, and rather than describe it I'd rather talk to what seem to be some specific needs for your team.",
  PLAIN: "I'm local to Central Oregon and I build software that takes the repetitive office work off people's plates. Rather than describe it, I'd rather talk to what look like some specific needs for your team.",
};

const CLOSING_BY_REGISTER = {
  FORMAL: "No need for a meeting, and no obligation either way. If it is useful, I would welcome the chance to share more.",
  NEUTRAL: "No meeting needed and no obligation, I'd just welcome the chance to share more if it's useful!",
  PLAIN: "No meeting, no obligation. If it's useful, happy to share more!",
};

// A word Russ would use anyway, chosen to sit naturally beside theirs.
const HEDGE_BY_REGISTER = { FORMAL: 'typically', NEUTRAL: 'usually', PLAIN: 'usually' };

module.exports = { REGISTERS, FORMAL_MARKERS, PLAIN_MARKERS, CONTRACTIONS, registerFor, OPENING_BY_REGISTER, CLOSING_BY_REGISTER, HEDGE_BY_REGISTER };
