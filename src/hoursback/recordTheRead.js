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
const { readableText, PURPOSES, FIELDS_BY_GROUP, WHOLE_SITE_FIELDS } = require('./understand.js');

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


// ---------------------------------------------------------------------------
// THE GROUPED READ (2026-09-01). One visit, one reading, six focused reads —
// and every answered field written through record() NAMING the purpose group
// that produced it. Two groups answering one field leave TWO findings, never
// one contested value: one writer per fact, and the argument stays readable
// through everyAnswer() forever.

// A few model-answer fields land on the record under an older name.
const FIELD_ON_RECORD = { whatTheyDo: 'theirWork' };
const recordName = (f) => FIELD_ON_RECORD[f] || f;

// Fields written by their own dedicated writer below, not by the per-group
// field loop — tools have a fingerprint path that works even when no services
// page exists, so their absence is judged there, not here.
const RECORDED_ELSEWHERE = new Set(['toolsInUse']);

/// Write everything a grouped visit learned, one finding at a time.
///
///   readingId          the ONE reading this whole visit hangs off
///   saidByGroup        each group's raw answer, untouched
///   understoodByGroup  each group's answer after keepOnlyWhatWasRead()
///   couldNotTell       per purpose, why a group has no answer at all
///   reconciliation     { fields, settled } from the reconciliation read, or null
///   tools              [{ name, method }] — every system detected, with how
async function recordGroupedRead(db, {
  readingId, prospectId, url,
  saidByGroup = {}, understoodByGroup = {}, couldNotTell = {},
  reconciliation = null, tools = [],
}) {
  if (!readingId || !prospectId) throw new Error('a grouped read must name its reading and its business');
  const base = { readingId, prospectId, sourceUrl: url };
  const answeredSomewhere = new Set();

  // One fact, tagged with the group whose read produced it. The tag rides in
  // the quote — the words behind the finding — so a reader of everyAnswer()
  // can always see WHICH focused read said it.
  const sayFor = (group, field, value, opts = {}) => {
    const answered = wasAnswered(value) || (opts.number !== null && opts.number !== undefined);
    if (answered) answeredSomewhere.add(field);
    return say(db, base, recordName(field), value, {
      ...opts,
      quote: answered ? `[${group} read] ${opts.quote || ''}`.trim() : null,
    });
  };
  const yesNo = (v) => (v === true ? 'yes' : v === false ? 'no' : null);

  for (const group of PURPOSES) {
    const said = saidByGroup[group];
    const u = understoodByGroup[group];
    if (!said || !u) {
      // This group was never read — no page of its purpose, no time, or the
      // reader gave nothing. Each of its fields is recorded as could_not_tell
      // WITH THE REASON, so "never asked" can always be told from "asked and
      // it was empty". Never a default in its place: absence is data.
      const why = couldNotTell[group] || `the ${group} pages were not read on this visit`;
      for (const field of FIELDS_BY_GROUP[group]) {
        if (RECORDED_ELSEWHERE.has(field)) continue;
        await R.record(db, { ...base, field: recordName(field), value: null, status: R.COULD_NOT_TELL, quote: why });
      }
      continue;
    }

    // The whole-site trio, as THIS group answered it. Only answers are written
    // per group — a field no group answered gets its one could_not_tell row
    // after the loop, not six.
    if (said.theirOwnSite === true || said.theirOwnSite === false) {
      await sayFor(group, 'theirOwnSite', said.theirOwnSite ? 'yes' : 'no', { status: R.INFERRED });
    }
    if (wasAnswered(u.realName)) await sayFor(group, 'realName', u.realName, { quote: u.realName });
    if (wasAnswered(u.trade)) {
      await sayFor(group, 'trade', u.trade, { status: said.tradeSure === false ? R.INFERRED : R.OBSERVED });
    }
    if (wasAnswered(u.cannotTell)) await sayFor(group, 'cannotTell', u.cannotTell, { status: R.INFERRED });

    // Somebody else's pages teach nothing about THIS business.
    if (u.notTheirSite) continue;

    if (group === 'identity') {
      await sayFor(group, 'whatTheyDo', u.whatTheyDo, { quote: u.whatTheyDo || null });
      await sayFor(group, 'yearsInBusiness', u.yearsInBusiness, {
        number: wasAnswered(u.yearsInBusiness) ? Number(u.yearsInBusiness) : null,
      });
      // The RAW answer decides, exactly as in keepTheRead(): the cleaned copy
      // substitutes values, and a substitute must never be stored as though it
      // had been answered.
      const rawOps = Number.isFinite(said.separateOperations) ? Number(said.separateOperations) : null;
      await sayFor(group, 'separateOperations', rawOps === null ? null : String(rawOps), {
        number: rawOps, status: R.INFERRED,
      });
      await sayFor(group, 'whoRunsIt', u.whoRunsIt, { quote: u.whoRunsIt || null });
      await sayFor(group, 'teamSize', u.teamSize, {
        number: wasAnswered(u.teamSize) ? Number(u.teamSize) : null,
      });
      await sayFor(group, 'companyProfile', u.companyProfile, { quote: u.companyProfile || null });
    }

    if (group === 'services') {
      await sayFor(group, 'canBookOnline', yesNo(said.canBookOnline), {});
      await sayFor(group, 'formsToPrint', yesNo(said.formsToPrint), {});
      await sayFor(group, 'stalledBuild', u.stalledBuild, { status: R.INFERRED, quote: u.stalledBuild || null });
    }

    if (group === 'contact') {
      await sayFor(group, 'sharedEmail', u.sharedEmail, { quote: u.sharedEmail || null });
      await sayFor(group, 'mainPhone', u.mainPhone, { quote: u.mainPhone || null });
      await sayFor(group, 'postalAddress', u.postalAddress, { quote: u.postalAddress || null });
      await sayFor(group, 'listsAFax', yesNo(said.listsAFax), {});
      const ways = Array.isArray(said.waysToReachThem) ? said.waysToReachThem.filter(Boolean) : [];
      await sayFor(group, 'waysToReachThem', ways.length ? ways.join(', ') : null, {});
      const towns = Array.isArray(u.locations) ? u.locations : [];
      if (!towns.length) {
        await sayFor(group, 'locations', null, {});
      } else {
        for (const t of towns) {
          await R.record(db, {
            ...base,
            field: 'location',
            value: t.isHeadOffice ? `${t.town} (head office)` : t.town,
            status: R.OBSERVED,
            url: t.seenOn || url,
            quote: `[contact read] ${t.town}`,
          });
        }
      }
    }

    if (group === 'people') {
      const people = Array.isArray(u.people) ? u.people : [];
      if (!people.length) {
        await sayFor(group, 'people', null, {});
      } else {
        for (const person of people) {
          if (!person || !person.name) continue;
          const kept = await R.record(db, {
            ...base,
            field: 'person',
            value: [person.name, person.role, person.email, person.phone, person.linkedIn].filter(Boolean).join(' | '),
            status: person.roleWasPrinted === false ? R.INFERRED : R.OBSERVED,
            url: person.seenOn || url,
            quote: `[people read] ${person.name}`,
          });
          await R.record(db, {
            ...base,
            field: 'personBasedAt',
            value: person.basedAt ? `${person.name} — ${person.basedAt}` : null,
            status: person.basedAt ? R.OBSERVED : R.COULD_NOT_TELL,
            url: person.basedAt ? (person.seenOn || url) : null,
            quote: person.basedAt ? `[people read] ${person.name}` : null,
          }).catch(() => kept); // one person's missing office never loses the person
        }
      }
    }

    if (group === 'hiring') {
      await sayFor(group, 'hiringOffice', yesNo(said.hiringOffice), {});
      const roles = Number.isFinite(Number(said.openOfficeRoles)) ? Math.round(Number(said.openOfficeRoles)) : null;
      await sayFor(group, 'openOfficeRoles', roles === null ? null : String(roles), { number: roles });
    }

    if (group === 'news') {
      await sayFor(group, 'recentNews', u.recentNews, { status: R.INFERRED, quote: u.recentNews || null });
    }
  }

  // A whole-site field NO group answered: one could_not_tell row — unless the
  // reconciliation read owns the last word on it below.
  for (const field of WHOLE_SITE_FIELDS) {
    if (answeredSomewhere.has(field)) continue;
    if (reconciliation && Array.isArray(reconciliation.fields) && reconciliation.fields.includes(field)) continue;
    await R.record(db, {
      ...base, field: recordName(field), value: null, status: R.COULD_NOT_TELL,
      quote: 'no group read could answer this',
    });
  }

  // The reconciliation's verdicts, each ITS OWN finding — the group findings
  // it weighed are already written above and stay readable forever.
  if (reconciliation && Array.isArray(reconciliation.fields)) {
    for (const field of reconciliation.fields) {
      const v = reconciliation.settled ? reconciliation.settled[field] : null;
      if (v === R.COULD_NOT_TELL || v === null || v === undefined) {
        await R.record(db, {
          ...base, field: recordName(field), value: null, status: R.COULD_NOT_TELL,
          quote: 'a reconciliation read over the disputed pages could not settle this',
        });
      } else {
        await R.record(db, {
          ...base, field: recordName(field), value: String(v), status: R.INFERRED, url,
          quote: '[reconciliation read] settled from the disputed pages themselves',
        });
      }
    }
  }

  // Every system detected, each entry carrying the NAME and the METHOD that
  // found it. The fingerprint and the model naming different systems leave
  // both entries — two findings, never one contested value.
  for (const t of tools) {
    if (!t || !t.name) continue;
    await R.record(db, {
      ...base, field: 'toolInUse', value: t.name,
      status: String(t.method || '').includes('fingerprint') ? R.OBSERVED : R.INFERRED,
      url, quote: `detected by ${t.method}`,
    });
  }
  if (!tools.length) {
    await R.record(db, {
      ...base, field: 'toolInUse', value: null, status: R.COULD_NOT_TELL,
      quote: 'no known system showed on any page of this visit',
    });
  }

  // A system recorded on an EARLIER visit that showed on no page of this one.
  // Going away is recorded as loudly as arriving — the earlier finding is
  // never touched; this is a new fact beside it.
  const earlier = await db.finding.findMany({
    where: { prospectId, field: { in: ['toolInUse', 'toolsInUse'] }, retiredAt: null, NOT: { readingId } },
    select: { value: true },
  });
  const nowHave = new Set(tools.map((t) => String(t.name).toLowerCase()));
  const before = new Map();
  for (const f of earlier) {
    for (const name of String(f.value || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!before.has(name.toLowerCase())) before.set(name.toLowerCase(), name);
    }
  }
  for (const [key, name] of before) {
    if (nowHave.has(key)) continue;
    await R.record(db, {
      ...base, field: 'toolGone', value: name, status: R.INFERRED,
      quote: 'recorded on an earlier visit; on no page of this visit',
    });
  }
}

module.exports = { keepTheRead, recordGroupedRead, READER, wasAnswered };
