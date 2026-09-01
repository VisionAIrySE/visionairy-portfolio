// Write one website reading into the reading store, alongside wherever else it
// is being written. See docs/hoursback/evidence-store.md.
//
// This exists so the readers only gain a line, not a rewrite: they hand over
// what they fetched and what the reader answered, and everything to do with
// keeping it lands here.
//
// TWO ANSWERS COME IN, ON PURPOSE.
//
//   `said`      what the reader actually replied, untouched
//   `understood` the same answer after cleaning, defaults and clamps
//
// The cleaned version is what the record has always used and it is fine for
// most things. But it substitutes values — most importantly it turns an
// unanswered "how many separate operations" into 1 — and a substituted value
// must never be stored as if it had been answered. So where the two disagree
// about whether anything was said at all, the raw answer decides.
//
// ROLLBACK. Adds rows only; removes and overwrites nothing. A reading recorded
// in error is set aside with retireReading(), which keeps it and can be undone.

const R = require('./readings.js');
// A fetched page arrives as raw markup. The same stripper the reader itself
// uses turns it into what a person would actually read — so the words we keep
// are the words the reader was answering about, not a second version of them.
const { readableText } = require('./understand.js');

const READER = 'understand-businesses';

// Something the reader actually answered, as opposed to a blank, an empty
// string, or the word null arriving as text.
function wasAnswered(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s !== '' && s !== 'null' && s !== 'undefined';
}

/// One fact, or an explicit "we looked and could not tell".
///
/// Never call this with a default in `value`. If the reader did not answer,
/// pass nothing and let it record could_not_tell — that is the whole point.
async function say(db, base, field, value, { number = null, status = R.OBSERVED, quote = null, confidence = null }) {
  const answered = wasAnswered(value) || (number !== null && number !== undefined);
  return R.record(db, {
    ...base,
    field,
    value: answered ? value : null,
    number: answered ? number : null,
    status: answered ? status : R.COULD_NOT_TELL,
    quote: answered ? quote : null,
    confidence: answered ? confidence : null,
    // An observed fact has to say where it was seen; the page the reading came
    // from is that answer for everything read off a website.
    url: answered && status === R.OBSERVED ? base.sourceUrl : null,
  });
}

/// Keep everything one visit to a business's website found.
///
/// pages:      [{ url, title, text }] as fetched, markup already stripped
/// said:       the reader's raw answer
/// understood: the cleaned answer the record uses
async function keepTheRead(db, {
  prospectId, url, pages = [], said = {}, understood = {}, model = null, readerVersion,
  outcome = R.READ, note = null,
}) {
  if (!readerVersion) throw new Error('a reading must name its reader version');

  const reading = await R.startReading(db, {
    prospectId, source: R.WEBSITE, sourceUrl: url, reader: READER, readerVersion, model,
  });
  const base = { readingId: reading.id, prospectId, sourceUrl: url };

  // The words themselves. This is what makes every later question free.
  //
  // A page arrives as markup, so it is stripped here. `text` is accepted too,
  // for callers that have already done it — but NEVER silently: a page that
  // yields nothing readable is counted and handed back, because a store that
  // quietly keeps no words is the exact failure this whole thing exists to end.
  let wordsKept = 0;
  let pagesEmpty = 0;
  for (const p of pages) {
    const words = p.text ? String(p.text) : readableText(p.html);
    if (!words || !words.trim()) { pagesEmpty += 1; continue; }
    await R.keepPage(db, reading.id, { url: p.url || url, title: p.title || null, text: words });
    wordsKept += words.length;
  }
  // Say so on the reading itself when the words did not survive. NOT a throw:
  // the facts below are still worth keeping, and losing them because the text
  // stripper came back empty would trade a small loss for a bigger one. The
  // note travels with the reading, so a later sweep can find every visit whose
  // words are missing and fetch them again.
  const lostTheWords = Boolean(pages.length) && !wordsKept;
  const howItWent = [
    note,
    lostTheWords ? `no readable words kept from ${pages.length} pages` : null,
    pagesEmpty && !lostTheWords ? `${pagesEmpty} of ${pages.length} pages had nothing readable` : null,
  ].filter(Boolean).join('; ') || null;

  if (outcome !== R.READ) {
    await R.finishReading(db, reading.id, outcome, howItWent);
    return reading;
  }

  // Whose site it is. Asked first by the reader, because everything else
  // depends on it, so it is recorded first too.
  await say(db, base, 'theirOwnSite', said.theirOwnSite === false ? 'no' : (said.theirOwnSite === true ? 'yes' : null), {
    status: R.INFERRED, quote: understood.cannotTell || null,
  });

  // What they are and what they do.
  await say(db, base, 'trade', understood.trade, {
    // The reader says whether it was sure. An unsure trade is a judgement, not
    // something printed on the page.
    status: said.tradeSure === false ? R.INFERRED : R.OBSERVED,
  });
  await say(db, base, 'theirWork', understood.whatTheyDo, { quote: understood.whatTheyDo || null });
  await say(db, base, 'realName', understood.realName, { quote: understood.realName || null });
  await say(db, base, 'yearsInBusiness', understood.yearsInBusiness, {
    number: wasAnswered(understood.yearsInBusiness) ? Number(understood.yearsInBusiness) : null,
  });

  // HOW MANY SEPARATE OPERATIONS.
  //
  // The cleaned answer says 1 whether the reader said 1 or said nothing at all.
  // That collapse is the bug this store exists to end, so the raw answer is the
  // only one consulted here.
  const rawOps = Number.isFinite(said.separateOperations) ? Number(said.separateOperations) : null;
  await say(db, base, 'separateOperations', rawOps === null ? null : String(rawOps), {
    number: rawOps, status: R.INFERRED,
  });

  // Something they wanted built and did not get. Rare, and a guess here sends a
  // stranger an email about a project they never had — so it carries its quote.
  await say(db, base, 'stalledBuild', understood.stalledBuild, {
    status: R.INFERRED, quote: understood.stalledBuild || null,
  });

  // How the business runs, as the site shows it. `false` is an answer; only
  // null means nobody could tell.
  const yesNo = (v) => (v === true ? 'yes' : v === false ? 'no' : null);
  await say(db, base, 'canBookOnline', yesNo(said.canBookOnline), {});
  await say(db, base, 'formsToPrint', yesNo(said.formsToPrint), {});
  await say(db, base, 'listsAFax', yesNo(said.listsAFax), {});
  await say(db, base, 'hiringOffice', yesNo(said.hiringOffice), {});

  // How to reach them.
  await say(db, base, 'sharedEmail', understood.sharedEmail, { quote: understood.sharedEmail || null });
  await say(db, base, 'mainPhone', understood.mainPhone, { quote: understood.mainPhone || null });
  const ways = Array.isArray(said.waysToReachThem) ? said.waysToReachThem.filter(Boolean) : [];
  await say(db, base, 'waysToReachThem', ways.length ? ways.join(', ') : null, {});

  // What they already pay for — which is what says where the gaps are.
  const tools = Array.isArray(understood.toolsInUse) ? understood.toolsInUse : [];
  await say(db, base, 'toolsInUse', tools.length ? tools.join(', ') : null, {});

  // EVERY TOWN THIS BUSINESS WORKS FROM. Recorded one per town, each with the
  // page that said so, because a firm with four offices is not four records —
  // it is one record that has to know which office we mean.
  const towns = Array.isArray(understood.locations) ? understood.locations : [];
  if (!towns.length) {
    await say(db, base, 'locations', null, {});
  } else {
    for (const t of towns) {
      await R.record(db, {
        ...base,
        field: 'location',
        value: t.isHeadOffice ? `${t.town} (head office)` : t.town,
        status: R.OBSERVED,
        url: t.seenOn || url,
        quote: t.town,
      });
    }
  }

  // The people named on their own pages, each carrying the page they were read
  // from. A role worked out from a sentence is an inference and says so.
  //
  // `basedAt` is kept as its own fact rather than buried in the person's line,
  // so "we know where this person sits" and "we never found out" can be told
  // apart at a glance — which is the whole reason this exists.
  for (const p of (understood.people || [])) {
    if (!p || !p.name) continue;
    const person = await R.record(db, {
      ...base,
      field: 'person',
      value: [p.name, p.role, p.email, p.phone, p.linkedIn].filter(Boolean).join(' | '),
      status: p.roleWasPrinted === false ? R.INFERRED : R.OBSERVED,
      url: p.seenOn || url,
      quote: p.name,
    });
    await R.record(db, {
      ...base,
      field: 'personBasedAt',
      value: p.basedAt ? `${p.name} — ${p.basedAt}` : null,
      status: p.basedAt ? R.OBSERVED : R.COULD_NOT_TELL,
      url: p.basedAt ? (p.seenOn || url) : null,
      quote: p.basedAt ? p.name : null,
    }).catch(() => person); // one person's missing office never loses the person
  }

  // What the site never said. A real finding, and the reason a later question
  // does not have to be asked twice.
  await say(db, base, 'cannotTell', understood.cannotTell, { status: R.INFERRED });

  await R.finishReading(db, reading.id, R.READ, howItWent);
  return { ...reading, wordsKept, lostTheWords };
}

module.exports = { keepTheRead, READER, wasAnswered };
