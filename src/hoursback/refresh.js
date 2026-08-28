// What happens to a record after something on it changes.
//
// A hand edit used to change one field and nothing else. Russ typed a phone,
// a website, an email, a team size and a trade onto VERNAM CRANE and the
// record stayed unscored, stayed flagged "needs a look", and never got a
// message written — because the score was only ever written by the website
// sweep and the message only ever by a bulk run (Russ, 2026-08-27: "Once I add
// a website and save it, it should read the website and score and write the
// message right? You have to think through these processes.").
//
// So the chain lives here, in one place, and every path that changes a record
// runs the same five steps:
//
//   1. read their website, if one is on file and it has never been read
//   2. score from EVERYTHING on the record, not just what was on their site
//   3. settle the trade from their own words, if nobody has settled it
//   4. clear "needs a look" once the reason for it is gone
//   5. write the message, if nothing stops it
//
// What it will NEVER do:
//   - touch a message Russ has edited by hand, or one already sent
//   - move a quote that has been locked in
//   - write to a business that replied, bounced, or is marked leave-alone
//   - overwrite a trade Russ corrected by hand
//   - read websites during a bulk import — thousands of reads nobody asked
//     for. Bulk paths pass { readSite: false } and the sweep does that work
//     on its own schedule, with its own budget.

const { scoreAutomationFit } = require('./scoring.js');
const { resolveField } = require('./overrides.js');

// ---------------------------------------------------------------------------
// 2. the score, as a function of the record
//
// The tells a record carries: the ones read off their website, plus everything
// that can be read straight off the record itself. This used to live inside a
// run-everything script, which is why a record could sit unscored forever
// unless somebody remembered to run it.

const DERIVED = ['category_tilt', 'no_website', 'no_email_published', 'runs_several_businesses',
  'hiring_several_office_roles', 'long_established', 'team_size_known', 'disconnected_tools',
  'named_decision_maker'];

function signalsFor(p, ownerCounts) {
  let stored = [];
  try { stored = JSON.parse(p.scoreEvidence || '[]'); } catch { stored = []; }
  const signals = stored
    .filter((e) => e.signal && !DERIVED.includes(e.signal))
    .map((e) => ({ signal: e.signal, url: e.url || null, quote: e.quote || null }));

  if (p.siteStatus === 'NO_WEBSITE') {
    return [{ signal: 'no_website', url: null, quote: 'no website anywhere, so every enquiry they get has to be a phone call' }];
  }
  // Their SITE not publishing an address is the tell. An address Russ typed in
  // by hand does not undo it — the site still made every enquiry a phone call
  // — so this reads the fetched column deliberately, not the resolved one.
  if (p.siteStatus === 'READ' && !p.email) {
    signals.push({ signal: 'no_email_published', url: resolveField(p, 'website') || null, quote: 'no email address published anywhere on the site' });
  }

  // The same person registered behind more than one business on the list.
  const owners = ownerCounts instanceof Map ? ownerCounts : new Map();
  if (p.ownerName && (owners.get(p.ownerName) || 0) > 1) {
    signals.push({
      signal: 'runs_several_businesses', url: null,
      quote: `${p.ownerName} is registered behind ${owners.get(p.ownerName)} businesses on this list`,
    });
  }
  if (p.openRoles && p.openRoles > 1) {
    signals.push({ signal: 'hiring_several_office_roles', url: resolveField(p, 'website') || null, quote: `${p.openRoles} office roles open at once` });
  }
  if (p.yearsInBusiness && p.yearsInBusiness >= 20) {
    signals.push({ signal: 'long_established', url: null, quote: `${p.yearsInBusiness} years in business` });
  }
  const count = resolveField(p, 'employeeCount');
  if (count) {
    signals.push({ signal: 'team_size_known', url: p.headcountSourceUrl || null, quote: `${count} people, so the price is settled before you dial` });
  }
  const tools = String(p.toolsInUse || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (tools.length >= 2) {
    signals.push({ signal: 'disconnected_tools', url: resolveField(p, 'website') || null, quote: `already paying for ${tools.slice(0, 3).join(', ')}` });
  }
  if (p.ownerName || p.contactName) {
    signals.push({ signal: 'named_decision_maker', url: null, quote: `you can ask for ${p.contactName || p.ownerName}` });
  }
  return signals;
}

// How many businesses on the list share this owner. A targeted count, so
// scoring one record never loads thirty thousand of them.
async function ownerCountsFor(db, prospect) {
  const m = new Map();
  if (!prospect.ownerName) return m;
  m.set(prospect.ownerName, await db.prospect.count({ where: { ownerName: prospect.ownerName } }));
  return m;
}

// Score one record from everything now on it. Returns the new score, or null
// if nothing moved.
//
// Two halves, and the first one is the bigger. HOW MUCH IS SITTING HERE comes
// from the industry and the size of the team, and is worth up to 60. HOW READY
// THEY LOOK comes from what was observed about them, and is worth up to 40. It
// used to be entirely the second half, which is why a modern dental practice
// with a clean website scored below a one-person shop with a fax number.
// Raised from 60/40 on 2026-08-27. Even a correct reading of a website tells
// you how a business PRESENTS itself, not how it works inside: an insurance
// agency with a beautiful site can still have somebody re-keying certificates
// all day. The industry knows that; the website never will (Russ: "shouldn't
// it be industry type as the biggest indicator, and not counting on the
// website and what we can or can't read as the prime indicators?").
// The score answers one question: how many hours a week of repetitive office
// work are probably sitting in this business. That is what the offer promises
// to find and it is the only thing worth ranking on.
//
// What a website looks like is not evidence of it. A dentist booked to
// capacity has no use for online booking and every reason not to want it; a
// business with a beautiful site can still have somebody re-keying invoices
// all day. Every attempt to score a site here has ended up measuring how
// modern a business LOOKS, which is a different business entirely and not the
// one Russ is in (2026-08-27, after three rounds of invented weightings).
//
// Website findings stay on the card as something to read before a call. They
// carry no points.
const OPPORTUNITY_MAX = 100;
const READINESS_MAX = 0;
// Twenty-five hours a week of repetitive office work is a full score. Above
// that the difference stops mattering: both are excellent prospects and the
// order between them should be decided by how ready they look.
const HOURS_AT_FULL_MARKS = 25;

function opportunityPart(prospect) {
  const { hoursSittingHere } = require('./opportunity.js');
  const people = resolveField(prospect, 'employeeCount');
  const o = hoursSittingHere({ trade: prospect.trade, people });
  // Where this business sits against every other one on the list, measured.
  const { scoreFromHours } = require('./opportunity.js');
  const points = scoreFromHours(o.hours);
  return {
    points,
    evidence: {
      signal: 'hours_sitting_here',
      label: `About ${o.hours} hours a week of repetitive office work`,
      weight: points,
      url: null,
      quote: prospect.trade
        ? `${o.because}${o.teamKnown ? '' : ' (nobody has told us the team size yet)'}`
        : `industry unknown, so this is the general figure: ${o.because}`,
    },
  };
}

// The whole score for one record, from the two halves. ONE copy, used by a
// hand edit and by a bulk run alike — the bulk path had its own copy for about
// an hour and scored 1,984 businesses on the old rules while this one had the
// new ones. Scores above 100 were the tell.
function scoreFor(prospect, ownerCounts) {
  const opp = opportunityPart(prospect);
  const scored = scoreAutomationFit({
    signals: signalsFor(prospect, ownerCounts),
    category: prospect.trade || null,
  });
  // The observed signals are squeezed into their share so no pile of small
  // website tells can outweigh an industry that is genuinely full of hours.
  // The squeeze has to reach the evidence as well as the total: a card that
  // lists points adding to 117 beside a score of 100 is a number with a false
  // meaning, which is a mistake already made once here.
  const rawReadiness = scored.score;
  const readiness = Math.min(READINESS_MAX, rawReadiness);
  const shrink = rawReadiness > 0 ? readiness / rawReadiness : 0;
  const readinessEvidence = scored.evidence.map((e) => ({ ...e, weight: Math.round(e.weight * shrink) }));
  // Rounding each line can leave the parts a point or two off the whole. The
  // largest line absorbs the difference so the column always adds up.
  const listed = readinessEvidence.reduce((a, e) => a + e.weight, 0);
  if (listed !== readiness && readinessEvidence.length) {
    const biggest = readinessEvidence.reduce((a, b) => (b.weight > a.weight ? b : a));
    biggest.weight += readiness - listed;
  }
  scored.score = opp.points + readiness;
  scored.evidence = [opp.evidence, ...readinessEvidence.filter((e) => e.weight > 0)];
  return scored;
}

async function rescoreOne(db, prospect) {
  const scored = scoreFor(prospect, await ownerCountsFor(db, prospect));
  if (scored.score === prospect.automationScore) return null;
  await db.prospect.update({
    where: { id: prospect.id },
    data: { automationScore: scored.score, scoreEvidence: JSON.stringify(scored.evidence) },
  });
  return scored.score;
}

// ---------------------------------------------------------------------------
// 3. the trade
//
// Settled from their own published words, but only where nobody has settled it
// already. A trade Russ corrected by hand is his answer, and no later reading
// of their marketing copy gets to overrule it.

async function russCorrectedTrade(db, prospectId) {
  const edit = await db.prospectFieldEdit.findFirst({
    where: { prospectId, fieldName: 'trade', correctedBy: 'russ' },
  });
  return Boolean(edit);
}

async function settleTrade(db, prospect) {
  if (prospect.trade && prospect.trade !== 'other') return null;
  if (await russCorrectedTrade(db, prospect.id)) return null;
  const { tradeOf } = require('./crm/queues.js');
  // Their own words first — a crane company writing "crane and rigging" says
  // more than its registered name ever will — then the name.
  const fromWords = prospect.theirWork ? tradeOf(prospect.theirWork) : 'other';
  const settled = fromWords !== 'other' ? fromWords : tradeOf(resolveField(prospect, 'name') || '');
  if (settled === 'other' || settled === prospect.trade) return null;
  await db.prospect.update({ where: { id: prospect.id }, data: { trade: settled } });
  return settled;
}

// ---------------------------------------------------------------------------
// 4. the review flag
//
// "Needs a look" means one thing: there was no way to reach them. The moment
// there is a phone or a website on the record, the reason is gone and it goes
// back to the bottom of the ladder where the queues can see it. It used to sit
// there until Russ cleared it by hand, which is a chore the record can do for
// itself.

async function clearReviewFlag(db, prospect) {
  if (prospect.stage !== 'NEEDS_REVIEW') return null;
  const reachable = Boolean(resolveField(prospect, 'phone') || resolveField(prospect, 'website'));
  if (!reachable) return null;
  const { advanceStage } = require('./crm/stages.js');
  await advanceStage(db, prospect.id, 'NO_CONTACT');
  return 'NO_CONTACT';
}

// ---------------------------------------------------------------------------
// 5. the message
//
// Written the moment there is something honest to say and somewhere to send
// it. Everything that must never be overwritten — a sent message, one Russ
// edited by hand — is already refused inside the writer itself; these are the
// reasons not to write one at all.

function cannotBeWrittenTo(p) {
  if (p.doNotContact) return 'marked leave-alone';
  if (p.repliedAt) return 'they already replied';
  if (p.emailBouncedAt) return 'the address bounced';
  if (!p.siteStatus) return 'nobody has read their site yet';
  if (!resolveField(p, 'email')) return 'no email address';
  return null;
}

async function writeMessages(db, prospect) {
  const stop = cannotBeWrittenTo(prospect);
  if (stop) return { written: [], stop };
  const L = require('./crm/lanes.js');
  const written = [];
  for (const lane of ['EMAIL', 'LINKEDIN']) {
    try {
      const m = await L.draftFor(db, prospect.id, lane);
      if (m) written.push(lane);
    } catch { /* one lane failing never costs the other */ }
  }
  return { written, stop: null };
}

// ---------------------------------------------------------------------------
// the chain
//
// readSite defaults to true because the hand paths are what this exists for.
// Bulk paths pass false: a register import must never fire thirty thousand
// website reads nobody asked for.

async function refreshProspect(db, prospectId, options = {}) {
  const readSite = options.readSite !== false;
  const done = { readSite: null, score: null, trade: null, stage: null, messages: [], stop: null };

  let p = await db.prospect.findUnique({ where: { id: prospectId } });
  if (!p) return done;
  if (p.doNotContact) { done.stop = 'marked leave-alone'; return done; }

  // 1. their website, once, and only if one is on file and it was never read.
  if (readSite && !p.siteStatus) {
    const { runSiteEnrichment, resolveSiteAddress } = require('./enrich.js');
    if (resolveSiteAddress(p)) {
      try {
        const r = await runSiteEnrichment(db, { where: { id: prospectId }, budget: 1, ...(options.enrich || {}) });
        done.readSite = r.read ? 'read' : (r.unreachable ? 'could not be reached' : 'nothing to read');
        p = await db.prospect.findUnique({ where: { id: prospectId } });
      } catch (e) { done.readSite = `could not be read: ${e.message}`; }
    }
  }

  // 2, 3, 4 — the trade is settled before the score, because the score leans
  // on the trade.
  done.trade = await settleTrade(db, p);
  if (done.trade) p = await db.prospect.findUnique({ where: { id: prospectId } });
  done.score = await rescoreOne(db, p);
  if (done.score !== null) p = await db.prospect.findUnique({ where: { id: prospectId } });
  done.stage = await clearReviewFlag(db, p);
  if (done.stage) p = await db.prospect.findUnique({ where: { id: prospectId } });

  // 5.
  const msg = await writeMessages(db, p);
  done.messages = msg.written;
  done.stop = msg.stop;
  return done;
}

// ---------------------------------------------------------------------------
// the bulk path
//
// A sweep that writes owner names onto four thousand records has changed the
// score of all four thousand — one of the scored tells is "the same person is
// behind several businesses on this list". Re-scoring the whole table for that
// takes a quarter of an hour, so this scores only what was touched, and never
// reads a website.

async function rescoreMany(db, prospectIds) {
  const ids = [...new Set((prospectIds || []).filter(Boolean))];
  if (!ids.length) return { scored: 0, moved: 0 };
  let moved = 0;
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = await db.prospect.findMany({ where: { id: { in: ids.slice(i, i + CHUNK) } } });
    // One count query for the whole batch instead of one per record.
    const owners = [...new Set(batch.map((p) => p.ownerName).filter(Boolean))];
    const counts = new Map();
    for (const o of owners) counts.set(o, await db.prospect.count({ where: { ownerName: o } }));
    for (const p of batch) {
      const scored = scoreFor(p, counts);
      if (scored.score === p.automationScore) continue;
      await db.prospect.update({
        where: { id: p.id },
        data: { automationScore: scored.score, scoreEvidence: JSON.stringify(scored.evidence) },
      });
      moved += 1;
    }
  }
  return { scored: ids.length, moved };
}

module.exports = {
  OPPORTUNITY_MAX, READINESS_MAX, HOURS_AT_FULL_MARKS, opportunityPart, scoreFor,
  DERIVED, signalsFor, ownerCountsFor, rescoreOne, rescoreMany,
  settleTrade, clearReviewFlag, cannotBeWrittenTo, writeMessages, refreshProspect,
};
