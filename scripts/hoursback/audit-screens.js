#!/usr/bin/env node
// Do the numbers on each screen match the lists under them?
//
//   node scripts/hoursback/audit-screens.js
//
// Read-only against the real list. A count computed separately from the list
// it labels drifts quietly, and one wrong number makes every number beside it
// suspect (2026-08-27).

const { PrismaClient } = require('@prisma/client');
const L = require('../../src/hoursback/crm/lanes.js');
const Q = require('../../src/hoursback/crm/queues.js');
(async () => {
  const db = new PrismaClient();
  const problems = [];
  const say = (label, n) => console.log(`  ${String(n).padStart(6)}  ${label}`);

  console.log('Today (the call list)');
  const calls = await Q.callQueue(db);
  say('businesses to call', calls.length);
  const noPhone = calls.filter((c) => !c.phone && !c.phoneManualValue).length;
  if (noPhone) problems.push(`call list holds ${noPhone} businesses with no phone number`);

  console.log('\nEmail');
  const ready = await db.outreachMessage.findMany({
    where: { lane: 'EMAIL', state: { in: ['DRAFT','QUEUED'] }, prospect: { doNotContact: false, repliedAt: null } },
  });
  say('messages waiting', ready.length);
  const approved = await L.templateIsApproved(db);
  say(`sending allowed right now: ${approved ? 'yes' : 'NO — needs approving'}`, '');
  const bounced = await db.outreachMessage.count({
    where: { lane: 'EMAIL', state: { in: ['DRAFT','QUEUED'] }, prospect: { emailBouncedAt: { not: null } } } });
  if (bounced) problems.push(`${bounced} messages still queued to addresses that bounced`);
  const replied = await db.outreachMessage.count({
    where: { lane: 'EMAIL', state: { in: ['DRAFT','QUEUED'] }, prospect: { repliedAt: { not: null } } } });
  if (replied) problems.push(`${replied} messages still queued to businesses that already replied`);

  console.log('\nLinkedIn');
  const q = await L.linkedInQueue(db, 25);
  say('in the queue right now', q.length);
  const noInvite = q.filter((m) => !m.inviteBody).length;
  if (noInvite) problems.push(`${noInvite} of the first 25 notes have no invitation`);

  console.log('\nAll businesses');
  const total = await db.prospect.count();
  const dnc = await db.prospect.count({ where: { doNotContact: true } });
  say('businesses', total);
  say('marked never contact', dnc);

  console.log('\nNeeds email');
  const needEmail = await db.prospect.count({
    where: { doNotContact: false, email: null, emailManualValue: null, siteStatus: { not: null } } });
  say('read but no address found', needEmail);

  console.log('\nMoney');
  const paid = await db.prospect.count({ where: { paidAt: { not: null } } });
  say('paid', paid);

  console.log(problems.length ? `\n${problems.length} PROBLEMS:` : '\nno mismatches found');
  problems.forEach((p) => console.log(`  ✗ ${p}`));
  await db.$disconnect();
})().catch((e)=>{console.error(e.message);process.exit(1);});
