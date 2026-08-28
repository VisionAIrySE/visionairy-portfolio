// When a call has learned enough.
//
// Not a question count and not a clock. The call is finished when Russ can
// name a tool and say why it is the right one — no sooner, and there is no
// reason to keep going once he can (Russ, 2026-08-27: "The first benchmark
// should be getting a sufficient amount of knowledge, with all known factors
// in play, to be able to make appropriate recommendations").
//
// Four things have to be answerable. Each names what is still missing in words
// Russ can act on mid-call, because a recommendation made without them is what
// costs a client.
//
//   1. WHAT the problem is       — which kind of work, in their words
//   2. HOW BIG it is             — hours a week, and who carries them
//   3. WHICH TOOLS could fix it  — the type has to have platforms behind it
//   4. WHICH ONE fits THEM       — what it has to connect to, what failed before
//
// Time never decides whether to finish a line of questions. It only decides
// whether to open a second problem: "to have 2 of 3 lines of questions
// completed with a third undeveloped would be unacceptable" (Russ).

const { TYPES, platformsFor, buildFor } = require('../toolLibrary.js');

// A minute count for a call in progress, so the form knows roughly where it is.
const CALL_MINUTES = 15;
const HARD_STOP_MINUTES = 20;

// What has to be known before a tool can be named, and what is missing.
//
// answers: { type, hoursPerWeek, whoDoesIt, arrivesAs, connectsTo, triedBefore, ... }
function whatIsStillNeeded(answers = {}) {
  const a = answers || {};
  const gaps = [];

  // 1. What the problem is.
  if (!a.type || !TYPES[a.type]) {
    gaps.push({
      part: 'what',
      missing: 'which kind of work is actually the problem',
      ask: 'Nothing has been pinned down yet. Get them to name the thing before anything else.',
    });
  }

  // 2. How big it is. Both halves — a figure with nobody behind it cannot be
  // priced, and a person with no figure cannot be quoted.
  const hours = Number(a.hoursPerWeek);
  if (!Number.isFinite(hours) || hours <= 0) {
    gaps.push({ part: 'size', missing: 'how many hours a week it eats', ask: 'This is the number the whole offer rests on.' });
  }
  if (!a.whoDoesIt) {
    gaps.push({ part: 'size', missing: 'who is doing it', ask: 'Hours belong to a person. Two people at three hours is six.' });
  }

  // 3. Whether anything exists that fixes it. A type with nothing behind it is
  // a problem Russ cannot answer today, and he needs to know that ON the call.
  if (a.type && TYPES[a.type]) {
    const tools = platformsFor(a.type);
    const build = buildFor(a.type);
    if (!tools.length && !build) {
      gaps.push({
        part: 'tools',
        missing: `nothing on file fixes ${TYPES[a.type].label.toLowerCase()}`,
        ask: 'Say you will go and look rather than promising something that may not exist.',
      });
    }
  }

  // 4. What decides between them. Without these the recommendation is a guess
  // dressed as advice: a tool that will not talk to what they already run is
  // dead on arrival, and one they tried and abandoned is worse than useless.
  if (!a.arrivesAs) {
    gaps.push({ part: 'fit', missing: 'what form the work arrives in', ask: 'Email, paper, a phone call, a form — it decides which tools can touch it.' });
  }
  if (!a.connectsTo) {
    gaps.push({ part: 'fit', missing: 'what it has to work with', ask: 'A tool that will not talk to what they already run is dead on arrival.' });
  }
  if (a.triedBefore === undefined || a.triedBefore === null || a.triedBefore === '') {
    gaps.push({ part: 'fit', missing: 'what they have already tried', ask: 'What failed before tells you what NOT to recommend, and why their guard is up.' });
  } else {
    // "We bought something and nobody used it" cannot keep anything off the
    // list. The NAME is the whole value of the answer.
    const { stillNeedsTheName } = require('./liveForm.js');
    if (stillNeedsTheName(a.triedBefore, a.triedWhat)) {
      gaps.push({
        part: 'fit',
        missing: 'the name of what they tried',
        ask: 'Without it you could recommend back the very thing they already binned.',
      });
    }
  }

  return gaps;
}

// Can a tool be named yet?
function canRecommend(answers = {}) {
  return whatIsStillNeeded(answers).length === 0;
}

// What to tell Russ, mid-call, in one line.
function whereWeAre(answers = {}, minutesElapsed = 0) {
  const gaps = whatIsStillNeeded(answers);
  if (!gaps.length) {
    return {
      done: true,
      say: 'You have enough to name a tool. Close the call rather than keep asking.',
      gaps: [],
    };
  }
  // Time never cuts a line of questions short — it only says whether there is
  // room to open a second problem after this one is finished.
  const late = minutesElapsed >= CALL_MINUTES;
  const veryLate = minutesElapsed >= HARD_STOP_MINUTES;
  return {
    done: false,
    say: veryLate
      ? `Still missing ${gaps.length === 1 ? 'one thing' : `${gaps.length} things`}. You are over time — get ${gaps[0].missing} and close.`
      : `Still missing: ${gaps.map((g) => g.missing).join('; ')}.`,
    // Whether there is room to open a SECOND problem once this one is done.
    roomForAnother: !late,
    gaps,
  };
}

// Once it can recommend: what to look at, strongest first, with what they
// already pay for at the top because that is the cheapest answer there is.
function shortlist(answers = {}, alreadyUsing = []) {
  if (!answers.type || !TYPES[answers.type]) return [];
  const have = new Set((alreadyUsing || []).map((t) => String(t).toLowerCase()));
  const connects = String(answers.connectsTo || '').toLowerCase();
  // Both the button and the name they typed, so a tool is dropped whichever
  // way it was recorded.
  const failed = `${answers.triedBefore || ''} ${answers.triedWhat || ''}`.toLowerCase();
  return platformsFor(answers.type)
    .map((p) => ({
      ...p,
      alreadyPayingFor: have.has(p.name.toLowerCase()),
      // Does it work with what they run? Their own words, matched against what
      // the tool says it runs on.
      fitsWhatTheyRun: (p.runsOn || []).some((r) => connects.includes(String(r).toLowerCase()) || r === 'anything'),
      theyTriedThis: failed.includes(p.name.toLowerCase()),
    }))
    .filter((p) => !p.theyTriedThis)
    .sort((a, b) => (b.alreadyPayingFor - a.alreadyPayingFor)
      || (b.fitsWhatTheyRun - a.fitsWhatTheyRun)
      || (a.costFrom - b.costFrom));
}

module.exports = {
  CALL_MINUTES, HARD_STOP_MINUTES,
  whatIsStillNeeded, canRecommend, whereWeAre, shortlist,
};
