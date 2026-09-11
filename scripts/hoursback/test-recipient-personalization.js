const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const L = require('../../src/hoursback/crm/lanes.js');
const { BODY } = require('../../src/hoursback/crm/firstContact.js');

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!/\/hoursback_test(?:\?|$)/.test(url || '')) {
    throw new Error('TEST_DATABASE_URL must name the disposable hoursback_test database');
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  const marker = `recipient-personalization-${Date.now()}`;
  let prospect;
  try {
    prospect = await db.prospect.create({
      data: {
        placeId: marker,
        name: 'Cascade Realty Test',
        trade: 'real estate',
        email: 'office@cascade.test',
        scoreEvidence: JSON.stringify([{ signal: 'fax_listed' }]),
      },
    });
    const reading = await db.reading.create({
      data: {
        prospectId: prospect.id,
        source: 'website',
        reader: 'recipient-personalization-test',
        readerVersion: '1',
        outcome: 'read',
      },
    });
    await db.finding.createMany({ data: [
      { prospectId: prospect.id, readingId: reading.id, field: 'noticing', value: 'Stored default.', status: 'inferred' },
      { prospectId: prospect.id, readingId: reading.id, field: 'noticingArea', value: JSON.stringify({ job: 'following up on property inquiries', type: 'lead_follow_up', department: 'sales', plainly: 0.9, recurs: 'yes' }), status: 'inferred' },
      { prospectId: prospect.id, readingId: reading.id, field: 'noticingArea', value: JSON.stringify({ job: 'asking for missing invoice details', type: 'billing_and_collections', department: 'finance', plainly: 0.9, recurs: 'yes' }), status: 'inferred' },
    ] });

    const alice = await db.contact.create({ data: {
      prospectId: prospect.id, name: 'Alice Ledger', role: 'Controller',
      email: 'alice@cascade.test', source: 'RUSS', isPrimary: true,
    } });
    const bob = await db.contact.create({ data: {
      prospectId: prospect.id, name: 'Bob Broker', role: 'VP Brokerage',
      email: 'bob@cascade.test', source: 'RUSS', isPrimary: false,
    } });
    const carol = await db.contact.create({ data: {
      prospectId: prospect.id, name: 'Carol Cash', role: 'Chief Financial Officer',
      email: 'carol@cascade.test', source: 'RUSS', isPrimary: false,
    } });

    let first = await L.draftFor(db, prospect.id, 'EMAIL');
    await db.outreachMessage.update({
      where: { id: first.id },
      data: { body: `Hi Alice,\n\n${first.body}`, editedAt: new Date() },
    });

    await L.saveContactSelections(db, [alice.id, bob.id, carol.id], [bob.id, carol.id]);
    first = await L.draftFor(db, prospect.id, 'EMAIL');
    assert.equal(first.sentTo, 'bob@cascade.test');
    assert.match(first.body, /^Hi Bob,/);
    assert.match(first.body, /opportunity can go cold/i);
    assert.match(first.subject, /opportunities/i);
    assert.equal(first.editedAt, null);

    await db.outreachMessage.update({
      where: { id: first.id },
      data: { state: 'SENT', sentAt: new Date(), sentBy: 'test' },
    });
    await L.upsertTemplate(db, { subject: '', body: BODY });
    await L.approveTemplate(db);
    const secondPerson = await L.queueNextTouch(db, prospect.id, new Date(), { allowFirstContact: true });
    assert.equal(secondPerson.sentTo, 'carol@cascade.test');
    assert.match(secondPerson.body, /^Hi Carol,/);
    assert.match(secondPerson.body, /cash sits uncollected/i);
    assert.match(secondPerson.subject, /done and paid/i);

    console.log('PASS: every selected recipient gets their own name, role, company and industry message');
  } finally {
    if (prospect) {
      await db.outreachMessage.deleteMany({ where: { prospectId: prospect.id } });
      await db.contact.deleteMany({ where: { prospectId: prospect.id } });
      await db.finding.deleteMany({ where: { prospectId: prospect.id } });
      await db.reading.deleteMany({ where: { prospectId: prospect.id } });
      await db.prospect.delete({ where: { id: prospect.id } });
    }
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
