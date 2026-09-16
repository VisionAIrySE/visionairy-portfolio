// READ THE LETTER THE CUSTOMER WILL READ.
//
// Every count before this one asked the records a question — was the sentence
// regenerated, is the version current — and never opened the letter. On
// 2026-09-07 that reported 299 letters "ready in the current wording" while
// 202 of them still carried wording Russ replaced on 4 September, seven named
// a client's own software in a cold email, and the one he pasted back named no
// cost at all. Every one of those is visible in the text in under a second.
//
// So this opens the letters. Nothing else.
//
// AND IT NO LONGER KEEPS ITS OWN RULES (2026-09-08).
//
// It did, and they had drifted from everybody else's. It recognised ONE of the
// four wordings of Russ's standing line, so it reported 202 letters carrying
// his own approved words as carrying words he had rejected — the real number
// was 17. It judged day-eight and day-fourteen messages by the FIRST message's
// rules, so correct sign-offs were counted as naming no cost. And it could not
// see either letter Russ typed by hand.
//
// One judge now, told which message it is reading. See judgeTheLetter.js.
//
//   node scripts/hoursback/check-the-letters.cjs          — the counts
//   node scripts/hoursback/check-the-letters.cjs --show 5 — and five examples
const { PrismaClient } = require('@prisma/client');
const C = require('../../src/hoursback/crm/campaign.js');
const J = require('../../src/hoursback/crm/judgeTheLetter.js');
const L = require('../../src/hoursback/crm/lanes.js');

const db = new PrismaClient();
const SHOW = Number((process.argv.find((a) => a.startsWith('--show=')) || '').split('=')[1]
  || (process.argv.includes('--show') ? 3 : 0));
const READER_VERSION = String((process.argv.find((a) => a.startsWith('--reader-version=')) || '').split('=')[1] || '').trim();
const STRICT = process.argv.includes('--strict');

const DAY_NAME = {
  0: 'day 0  — the first message, two jobs and two costs',
  4: 'day 4  — one of them taken deeper',
  8: 'day 8  — a different job, and one plain question',
  14: 'day 14 — the sign-off',
};

(async () => {
  // RUSS'S OWN WORDINGS COUNT AS APPROVED. They live in the database, not in
  // the file, so a check that never loads them judges his own words as
  // strangers' words.
  await C.loadHisWordings(db);

  // ONLY THE ONES CALLED READY. A letter is ready when the business has an
  // email address, their own site has been read, and the sentence was written
  // under the current wording. That is the pile Russ would actually send, and
  // the only one worth judging.
  const readyIds = (await db.reading.groupBy({
    by: ['prospectId'],
    where: {
      source: 'website', reader: 'understand-businesses', outcome: 'read',
      ...(READER_VERSION ? { readerVersion: READER_VERSION } : {}),
      pages: { some: { AND: [{ text: { not: null } }, { NOT: { text: '' } }] } },
    },
  })).map((r) => r.prospectId);
  const expectedBusinesses = await db.prospect.findMany({
    where: {
      id: { in: readyIds }, doNotContact: false, ...L.emailReachableWhere(),
      messages: {
        some: {
          lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] }, sentAt: null, openedWith: { not: 'after_the_call' },
          NOT: { openedWith: { startsWith: 'touch_' } },
        },
      },
    },
    select: {
      id: true, name: true, email: true, emailManualValue: true, contactName: true, contactRole: true,
      contacts: {
        where: { setAsideAt: null },
        select: { name: true, role: true, email: true, bouncedAt: true, isPrimary: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  const expectedIds = expectedBusinesses.map((p) => p.id);
  const storedLetters = await db.outreachMessage.findMany({
    where: {
      lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] }, sentAt: null, openedWith: { not: 'after_the_call' },
      prospectId: { in: expectedIds },
    },
    include: { prospect: true },
  });
  // A provider-confirmed first email is already in place. An older unsent
  // duplicate must not make its recipient look incomplete or be judged as the
  // next customer-facing letter.
  const deliveredLetters = await db.outreachMessage.findMany({
    where: {
      lane: 'EMAIL', state: 'SENT', deliveryState: 'DELIVERED',
      sentAt: { not: null }, providerMessageId: { not: null },
      openedWith: { not: 'after_the_call' }, prospectId: { in: expectedIds },
    },
    select: { prospectId: true, sentTo: true, openedWith: true },
  });

  // A few older imports left more than one unsent row for the same campaign
  // slot. The runtime keeps the first row for that prospect and touch, so the
  // audit must judge that same active row while reporting the dormant extras.
  const normalized = (value) => String(value || '').trim().toLowerCase();
  const expectedCampaigns = expectedBusinesses.flatMap((p) => {
    const usable = p.contacts.filter((c) => c.email && !c.bouncedAt);
    const marked = usable.filter((c) => c.isPrimary);
    const recipients = marked.length ? marked : usable.filter((c) => c.name).slice(0, 1);
    const selected = recipients
      .map((c) => ({ prospect: p, sentTo: normalized(c.email), roleTitle: c.role || null, label: c.name || c.email }));
    const fallback = normalized(p.emailManualValue || p.email);
    return selected.length ? selected : fallback ? [{
      prospect: p, sentTo: fallback, roleTitle: p.contactRole || null,
      label: p.contactName ? `${p.contactName} at ${fallback}` : fallback,
    }] : [];
  });
  const recipientsByBusiness = new Map();
  for (const campaign of expectedCampaigns) {
    const list = recipientsByBusiness.get(campaign.prospect.id) || [];
    list.push(campaign.sentTo);
    recipientsByBusiness.set(campaign.prospect.id, list);
  }
  const recipientOf = (message) => normalized(message.sentTo)
    || ((recipientsByBusiness.get(message.prospectId) || []).length === 1
      ? recipientsByBusiness.get(message.prospectId)[0] : '');
  const campaignKey = (prospectId, sentTo) => `${prospectId}:${sentTo}`;
  const expectedCampaignKeys = new Set(expectedCampaigns.map((campaign) =>
    campaignKey(campaign.prospect.id, campaign.sentTo)));
  const slots = new Map();
  let unselectedDrafts = 0;
  let selectedDrafts = 0;
  const byBusiness = new Map();
  for (const m of storedLetters) {
    const activeCampaign = campaignKey(m.prospectId, recipientOf(m));
    if (!expectedCampaignKeys.has(activeCampaign)) { unselectedDrafts += 1; continue; }
    selectedDrafts += 1;
    const rows = byBusiness.get(m.prospectId) || [];
    rows.push(m);
    byBusiness.set(m.prospectId, rows);
  }
  // Judge the same active row the Email screen chooses. It first resolves
  // older copies for each address, then prefers hand edits, an addressed
  // draft, and a queued draft when two still describe the same slot.
  const rank = (m) => (m.editedAt ? 4 : 0) + (m.sentTo ? 2 : 0) + (m.state === 'QUEUED' ? 1 : 0);
  for (const rows of byBusiness.values()) {
    for (const m of L.activeUnsentMessages(rows)) {
      const activeCampaign = campaignKey(m.prospectId, recipientOf(m));
      const key = `${activeCampaign}:${J.dayOf(m.openedWith)}`;
      const previous = slots.get(key);
      if (!previous || rank(m) > rank(previous)) slots.set(key, m);
    }
  }
  const deliveredKeys = new Set(deliveredLetters.map((m) =>
    `${campaignKey(m.prospectId, recipientOf(m))}:${J.dayOf(m.openedWith)}`));
  const letters = [...slots.values()].filter((m) => !deliveredKeys.has(
    `${campaignKey(m.prospectId, recipientOf(m))}:${J.dayOf(m.openedWith)}`));
  const duplicateSelectedDrafts = selectedDrafts - slots.size;
  const alreadyDeliveredDrafts = slots.size - letters.length;
  const daysByCampaign = new Map();
  for (const m of deliveredLetters) {
    const key = campaignKey(m.prospectId, recipientOf(m));
    const days = daysByCampaign.get(key) || new Set();
    days.add(J.dayOf(m.openedWith));
    daysByCampaign.set(key, days);
  }
  for (const m of letters) {
    const key = campaignKey(m.prospectId, recipientOf(m));
    const days = daysByCampaign.get(key) || new Set();
    days.add(J.dayOf(m.openedWith));
    daysByCampaign.set(key, days);
  }
  const incomplete = expectedCampaigns.map((campaign) => {
    const days = daysByCampaign.get(campaignKey(campaign.prospect.id, campaign.sentTo)) || new Set();
    return { ...campaign, missing: [0, 4, 8, 14].filter((day) => !days.has(day)) };
  }).filter((p) => p.missing.length);

  const evidence = new Map();
  const prospects = new Map(letters.map((m) => [m.prospectId, m.prospect]));
  for (let i = 0; i < readyIds.length; i += 20) {
    const rows = await Promise.all(readyIds.slice(i, i + 20).map(async (id) => {
      const reading = await db.reading.findFirst({
        where: { prospectId: id, findings: { some: { field: 'noticingJob' } } },
        orderBy: { startedAt: 'desc' }, include: { findings: true },
      });
      const prospect = prospects.get(id);
      if (!reading || !prospect) return null;
      const jobs = reading.findings.filter((f) => f.field === 'noticingJob').map((f) => f.value).filter(Boolean);
      return [id, jobs];
    }));
    for (const row of rows) if (row) {
      for (const campaign of expectedCampaigns.filter((x) => x.prospect.id === row[0])) {
        evidence.set(campaignKey(row[0], campaign.sentTo), { jobs: row[1], roleTitle: campaign.roleTitle });
      }
    }
  }

  // COUNTED PER MESSAGE, BECAUSE THE FOUR ARE NOT THE SAME THING. One total
  // mixed 382 first messages with 158 follow-ups and judged them all alike,
  // which is how correct sign-offs came to be reported as faults.
  const byDay = {
    0: [], 4: [], 8: [], 14: [],
  };
  for (const m of letters) byDay[J.dayOf(m.openedWith)].push(m);

  let cleanAll = 0;
  console.log(`\n${unselectedDrafts} drafts for unselected contacts, ${duplicateSelectedDrafts} duplicate selected-recipient drafts, and ${alreadyDeliveredDrafts} unsent copies of provider-delivered messages excluded from active-message counts.`);
  console.log(`${incomplete.length} selected recipients at researched, reachable businesses are missing part of their four-message sequence.`);
  if (SHOW && incomplete.length) {
    for (const p of incomplete.slice(0, SHOW)) console.log(`   ${p.prospect.name} — ${p.label}: missing day ${p.missing.join(', ')}`);
  }
  for (const day of [0, 4, 8, 14]) {
    const pile = byDay[day];
    const faults = {};
    let clean = 0;
    for (const m of pile) {
      const actual = evidence.get(campaignKey(m.prospectId, recipientOf(m))) || { jobs: [], roleTitle: null };
      const v = J.judgeStored(m, actual);
      if (v.ok) { clean += 1; continue; }
      const key = String(v.why).slice(0, 72);
      (faults[key] = faults[key] || []).push({ m, p: v.passage });
    }
    cleanAll += clean;
    console.log(`\n${DAY_NAME[day]}`);
    console.log(`   ${pile.length} written, ${clean} pass every rule that belongs to them`);
    for (const [why, rows] of Object.entries(faults).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`   ${String(rows.length).padStart(4)}  ${why}`);
      if (SHOW) {
        for (const r of rows.slice(0, SHOW)) {
          console.log(`         ${r.m.prospect.name} [${r.m.prospectId}] <${recipientOf(r.m)}>: ${String(r.p).replace(/\s+/g, ' ').slice(0, 220)}`);
        }
      }
    }
  }

  console.log(`\n${cleanAll} of ${letters.length} letters, read in full, pass the rules that belong to them.`);
  if (incomplete.length || (STRICT && cleanAll !== letters.length)) process.exitCode = 2;
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
