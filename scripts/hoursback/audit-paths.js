#!/usr/bin/env node
// Does each button do what it says?
//
//   node scripts/hoursback/audit-paths.js
//
// Every check tests an action Russ can take on a screen and confirms the
// effect the screen claims. Runs against the throwaway local database and
// never touches the real list. Written 2026-08-27 after Russ found a card
// promising "gets a message" to somebody with no address — the stored data
// was right and the screen was lying, which no check on the data can catch.

const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
const fs = require('fs');
for (const line of fs.readFileSync('.env','utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const L = require('../../src/hoursback/crm/lanes.js');
const out = [];
const check = (name, ok, detail) => { out.push({ name, ok, detail }); };

(async () => {
  const tag = `path-${Date.now()}`;
  const stale = await db.prospect.findMany({ where: { placeId: { startsWith: 'path-' } }, select: { id: true } });
  const ids = stale.map((x) => x.id);
  if (ids.length) {
    await db.outreachMessage.deleteMany({ where: { prospectId: { in: ids } } });
    await db.contact.deleteMany({ where: { prospectId: { in: ids } } });
    await db.prospect.deleteMany({ where: { id: { in: ids } } });
  }
  const p = await db.prospect.create({ data: {
    placeId: tag, name: 'Cascade Test Plumbing', trade: 'trades',
    email: 'office@cascadetest.example', phone: '541-555-0000',
    website: 'https://cascadetest.example', siteStatus: 'READ',
  }});
  const owner = await db.contact.create({ data: {
    prospectId: p.id, name: 'Dale Hutchins', email: 'dale@cascadetest.example', role: 'Owner' } });

  // 1. Marking a person — does the message actually go to them?
  await db.contact.update({ where: { id: owner.id }, data: { isPrimary: true } });
  const m1 = await L.draftFor(db, p.id, 'EMAIL');
  check('marking a person puts their name in the greeting', /Hi Dale,/.test(m1.body), m1.body.split('\n')[0]);
  const addr = await L.addressFor(db, p.id, p);
  check('marking a person sends to their own address', addr === 'dale@cascadetest.example', addr);

  // 2. Unmarking — does it fall back to the business inbox?
  await db.contact.update({ where: { id: owner.id }, data: { isPrimary: false } });
  const addr2 = await L.addressFor(db, p.id, p);
  check('unmarking falls back to a named person with an address', addr2 === 'dale@cascadetest.example', addr2);

  // 3. Marking sent — does it leave the waiting list?
  await L.markEmailSent(db, m1.id);
  const after = await db.outreachMessage.findUnique({ where: { id: m1.id } });
  check('marking sent takes it off the waiting list', after.state === 'SENT' && after.sentAt, after.state);

  // 4. A reply — does everything stop, on every channel?
  const li = await L.draftFor(db, p.id, 'LINKEDIN');
  await L.markReplied(db, p.id, 'EMAIL');
  const stillQueued = await db.outreachMessage.count({
    where: { prospectId: p.id, state: { in: ['DRAFT','QUEUED'] } } });
  check('a reply stops every message on every channel', stillQueued === 0, `${stillQueued} still waiting`);

  // 5. Never contact — does it disappear from every list?
  const p2 = await db.prospect.create({ data: {
    placeId: `${tag}-b`, name: 'Sisters Test Dental', trade: 'dental',
    email: 'front@sisterstest.example', phone: '541-555-0001', siteStatus: 'READ' } });
  await L.draftFor(db, p2.id, 'EMAIL');
  await db.prospect.update({ where: { id: p2.id }, data: { doNotContact: true } });
  const reach = await L.reachableOn(db, 'EMAIL', 50);
  check('never contact removes them from every list', !reach.some((r) => r.id === p2.id), `${reach.length} reachable`);

  // 6. Approval — does it actually gate sending?
  await L.upsertTemplate(db, { subject: 'x', body: 'y' });
  const before = await L.templateIsApproved(db);
  await L.approveTemplate(db);
  const afterApprove = await L.templateIsApproved(db);
  check('nothing can send until the message is approved', before === false, `before=${before}`);
  check('approving a message that does not match the code still refuses', afterApprove === false, `after=${afterApprove}`);

  await db.outreachMessage.deleteMany({ where: { prospectId: { in: [p.id, p2.id] } } });
  await db.contact.deleteMany({ where: { prospectId: p.id } });
  await db.prospect.deleteMany({ where: { placeId: { startsWith: 'path-' } } });

  out.forEach((r) => console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `  — ${r.detail}`}`));
  console.log(`\n${out.filter(r=>r.ok).length}/${out.length} paths behave as the screen claims`);
  await db.$disconnect();
})().catch((e)=>{console.error(e); process.exit(1);});
