// THE READING STORE — the only way this system records what it learns about a
// business. See docs/hoursback/evidence-store.md for the rule and the reason.
//
//   A reading is an event. It is written once and kept forever.
//   Nothing overwrites a reading. Nothing deletes a reading.
//   Erasure requires a deliberate, named act by a person.
//
// Written 2026-09-01, after 979 of 1,081 website readings were destroyed by two
// scripts writing to the same slot in different shapes. No error was raised.
// Nothing announced it. The work had been paid for once and was gone.
//
// NOT evidence.js — that is the research library, what has been published about
// where the hours go by trade. This is what we know about one business, and how.
//
// ROLLBACK. Nothing here deletes, so nothing here needs undoing. Rows are only
// ever added. The two updates it makes are finishReading(), which stamps how a
// visit ended, and retire(), which marks a fact set-aside while keeping it —
// undone completely by unretire(). The database is also set to refuse deleting
// any business that has readings, so the rule survives a hand-written query.

const OBSERVED = 'observed';             // it says so on their own page
const INFERRED = 'inferred';             // we worked it out; we could be wrong
const CONFIRMED = 'confirmed';           // a person verified it
const COULD_NOT_TELL = 'could_not_tell'; // we looked and could not say

const EVERY_STATUS = [OBSERVED, INFERRED, CONFIRMED, COULD_NOT_TELL];

// Where a reading came from. `hand` is Russ typing something — a reading like
// any other, from the most authoritative source there is.
const WEBSITE = 'website';
const HAND = 'hand';
const CALL = 'call';
const IMPORT = 'import';

// How a reading ended. A failure is RECORDED, not discarded — otherwise a site
// that could not be fetched looks identical to one nobody has tried.
const READ = 'read';
const NO_WEBSITE = 'no_website';
const UNREACHABLE = 'unreachable';
const FAILED = 'failed';

/// Open a reading. Everything learned on this occasion hangs off it. It starts
/// as FAILED on purpose: a run that dies halfway leaves a reading that says so,
/// rather than one that looks complete.
async function startReading(db, {
  prospectId, source, sourceUrl = null, reader, readerVersion, model = null,
}) {
  if (!prospectId) throw new Error('a reading must belong to a business');
  if (!source) throw new Error('a reading must say where it came from');
  // So a bad batch can later be found and retired by the reader that made it,
  // rather than by guessing at dates.
  if (!reader || !readerVersion) throw new Error('a reading must name its reader and version');
  return db.reading.create({
    data: { prospectId, source, sourceUrl, reader, readerVersion, model, outcome: FAILED },
  });
}

/// Keep the readable text of one page. This is what makes every future re-read
/// free: when we later want something we never thought to ask, we ask this text
/// and not the business's website.
async function keepPage(db, readingId, { url, title = null, text }) {
  if (!readingId) throw new Error('a page must belong to a reading');
  if (!url) throw new Error('a page must say which page it is');
  const kept = String(text || '');
  if (!kept.trim()) return null; // an empty page is not a page
  return db.readingPage.create({
    data: { readingId, url, title, text: kept, bytes: Buffer.byteLength(kept, 'utf8') },
  });
}

/// Record ONE fact.
///
/// The guard below is the whole point. The old reader wrote "1 separate
/// operation" whenever the model did not answer, so on 105 records "asked, and
/// it is one" and "never asked" are indistinguishable forever.
///
/// ABSENCE IS DATA. If nothing was learned, say COULD_NOT_TELL. Never pass a
/// default in place of an answer that was not given.
async function record(db, {
  readingId, prospectId, field, value = null, number = null,
  status, confidence = null, url = null, quote = null,
}) {
  if (!readingId || !prospectId) throw new Error('a finding must belong to a reading and a business');
  if (!field) throw new Error('a finding must say what it is about');
  if (!EVERY_STATUS.includes(status)) {
    throw new Error(`status must be one of ${EVERY_STATUS.join(', ')} — got ${status}`);
  }

  const nothingSaid = (value === null || value === undefined || String(value).trim() === '')
    && (number === null || number === undefined);

  if (nothingSaid && status !== COULD_NOT_TELL) {
    throw new Error(
      `${field}: no value was given, but the status says ${status}. `
      + 'If nothing was learned, record it as could_not_tell. Never let a blank '
      + 'pass as an answer, and never substitute a default for one.',
    );
  }
  if (!nothingSaid && status === COULD_NOT_TELL) {
    throw new Error(`${field}: a value was given but the status says could_not_tell`);
  }
  // A fact we claim to have observed has to say where it was observed.
  if (status === OBSERVED && !url && !quote) {
    throw new Error(`${field}: an observed fact must carry the page or the sentence behind it`);
  }

  return db.finding.create({
    data: {
      readingId,
      prospectId,
      field,
      value: nothingSaid || value === null || value === undefined ? null : String(value),
      number: number === null || number === undefined ? null : Number(number),
      status,
      confidence,
      url,
      quote,
    },
  });
}

/// Close a reading, saying how it ended. Completes the event; changes nothing
/// that was learned during it.
async function finishReading(db, readingId, outcome, note = null) {
  return db.reading.update({
    where: { id: readingId },
    data: { outcome, note, finishedAt: new Date() },
  });
}

/// The current best answer for one field on one business. Something a person
/// typed always wins over anything machine-read, however recent. Otherwise the
/// newest un-retired finding wins. Nothing is overwritten to make this true —
/// the choice happens here, on the way out.
async function currentAnswer(db, prospectId, field) {
  const found = await db.finding.findMany({
    where: { prospectId, field, retiredAt: null },
    include: { reading: { select: { source: true, startedAt: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!found.length) return null;
  return found.find((f) => f.reading.source === HAND) || found[0];
}

/// Every answer ever given, newest first, retired ones included. This is what
/// lets a number on a card show its work.
async function everyAnswer(db, prospectId, field = null) {
  return db.finding.findMany({
    where: { prospectId, ...(field ? { field } : {}) },
    include: { reading: { select: { source: true, reader: true, startedAt: true, sourceUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

/// The words this business's own site was found to contain. Ask THIS when a new
/// question comes up — never their website again.
async function keptWords(db, prospectId, { limit = 40 } = {}) {
  return db.readingPage.findMany({
    where: { reading: { prospectId, outcome: READ } },
    select: { url: true, title: true, text: true, fetchedAt: true },
    orderBy: { fetchedAt: 'desc' },
    take: limit,
  });
}

/// Set a fact aside — the website turned out not to be theirs, or the reader was
/// wrong. The fact itself is KEPT. This is the deliberate, named act the rule
/// calls for: written down, says who and why, and unretire() undoes it.
async function retire(db, findingId, { reason, by }) {
  if (!reason || !by) throw new Error('retiring a fact must say who did it and why');
  return db.finding.update({
    where: { id: findingId },
    data: { retiredAt: new Date(), retiredReason: reason, retiredBy: by },
  });
}

/// Put a retired fact back.
async function unretire(db, findingId) {
  return db.finding.update({
    where: { id: findingId },
    data: { retiredAt: null, retiredReason: null, retiredBy: null },
  });
}

/// Retire every fact from one reading — for when a whole batch turns out to have
/// been read off the wrong website. Reversible one at a time.
async function retireReading(db, readingId, { reason, by }) {
  if (!reason || !by) throw new Error('retiring a reading must say who did it and why');
  const { count } = await db.finding.updateMany({
    where: { readingId, retiredAt: null },
    data: { retiredAt: new Date(), retiredReason: reason, retiredBy: by },
  });
  return count;
}

module.exports = {
  OBSERVED, INFERRED, CONFIRMED, COULD_NOT_TELL, EVERY_STATUS,
  WEBSITE, HAND, CALL, IMPORT,
  READ, NO_WEBSITE, UNREACHABLE, FAILED,
  startReading, keepPage, record, finishReading,
  currentAnswer, everyAnswer, keptWords, retire, unretire, retireReading,
};
