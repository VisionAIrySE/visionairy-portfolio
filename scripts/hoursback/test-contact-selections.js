const assert = require('node:assert/strict');
const L = require('../../src/hoursback/crm/lanes.js');
const { BODY } = require('../../src/hoursback/crm/firstContact.js');
const { saveContactSelections, canonicalFirstMessages, activeUnsentMessages, addressFor, personFor } = L;

async function main() {
  const rows = new Map([
    ['first', { isPrimary: false }],
    ['second', { isPrimary: false }],
    ['not-on-this-page', { isPrimary: true }],
  ]);
  const db = {
    contact: {
      findMany: async ({ where }) => where.id.in.map(() => ({ prospectId: 'business-1' })),
      updateMany({ where, data }) {
        for (const id of where.id.in) {
          if (rows.has(id)) rows.get(id).isPrimary = data.isPrimary;
        }
        return Promise.resolve({ count: where.id.in.length });
      },
    },
    outreachMessage: { updateMany: async () => ({ count: 0 }) },
    $transaction(work) { return Promise.all(work); },
  };

  await saveContactSelections(db, ['first', 'second'], ['first', 'second']);
  assert.equal(rows.get('first').isPrimary, true);
  assert.equal(rows.get('second').isPrimary, true);
  assert.equal(rows.get('not-on-this-page').isPrimary, true);

  await saveContactSelections(db, ['first', 'second'], []);
  assert.equal(rows.get('first').isPrimary, false);
  assert.equal(rows.get('second').isPrimary, false);
  assert.equal(rows.get('not-on-this-page').isPrimary, true);

  const messages = [
    { id: 'old', prospectId: 'business-1', lane: 'EMAIL', state: 'QUEUED', openedWith: 'trade_week', sentTo: 'sara@example.test', editedAt: new Date() },
    { id: 'tailored', prospectId: 'business-1', lane: 'EMAIL', state: 'DRAFT', openedWith: 'tailored_first', sentTo: 'sara@example.test' },
    { id: 'sam', prospectId: 'business-1', lane: 'EMAIL', state: 'DRAFT', openedWith: 'tailored_first', sentTo: 'sam@example.test' },
    { id: 'follow-up', prospectId: 'business-1', lane: 'EMAIL', state: 'DRAFT', openedWith: 'touch_2', sentTo: 'sara@example.test' },
  ];
  assert.deepEqual(canonicalFirstMessages(messages).map((m) => m.id), ['old', 'sam']);
  assert.deepEqual(activeUnsentMessages(messages).map((m) => m.id), ['old', 'sam', 'follow-up']);

  const duplicateFollowUps = activeUnsentMessages([
    { id: 'kept', prospectId: 'business-1', lane: 'EMAIL', state: 'DRAFT', openedWith: 'touch_2', sentTo: 'sara@example.test' },
    { id: 'duplicate', prospectId: 'business-1', lane: 'EMAIL', state: 'DRAFT', openedWith: 'touch_2', sentTo: 'sara@example.test' },
  ]);
  assert.deepEqual(duplicateFollowUps.map((m) => m.id), ['kept']);

  const manualAddress = await addressFor({ contact: { findFirst: async () => null } }, 'business-1', {
    email: 'old@example.test', emailManualValue: 'corrected@example.test', emailBouncedAt: null,
  });
  assert.equal(manualAddress, 'corrected@example.test');

  const blankAddress = await addressFor({ contact: { findFirst: async () => null } }, 'business-1', {
    email: '', emailManualValue: '   ', emailBouncedAt: null,
  });
  assert.equal(blankAddress, null);

  let personLookup = 0;
  const selectedAtInbox = { name: 'Robin Owner', role: 'Owner', email: null, isPrimary: true };
  const inboxPerson = await personFor({ contact: { findFirst: async () => {
    personLookup += 1;
    return personLookup === 3 ? selectedAtInbox : null;
  } } }, 'business-1');
  assert.equal(inboxPerson, selectedAtInbox);

  const sentAt = new Date('2026-09-01T12:00:00Z');
  const sentFirsts = [
    { id: 'alice-first', prospectId: 'business-1', lane: 'EMAIL', state: 'SENT', openedWith: 'tailored_first', sentTo: 'alice@example.test', sentAt },
    { id: 'bob-first', prospectId: 'business-1', lane: 'EMAIL', state: 'SENT', openedWith: 'tailored_first', sentTo: 'bob@example.test', sentAt },
  ];
  const dueDrafts = [
    { id: 'alice-day4', prospectId: 'business-1', lane: 'EMAIL', state: 'DRAFT', openedWith: 'touch_2', sentTo: 'alice@example.test', sentAt: null, deliveryState: null },
    { id: 'bob-day4', prospectId: 'business-1', lane: 'EMAIL', state: 'DRAFT', openedWith: 'touch_2', sentTo: 'bob@example.test', sentAt: null, deliveryState: null },
  ];
  const campaignContacts = [
    { email: 'alice@example.test', isPrimary: true, bouncedAt: null, setAsideAt: null },
    { email: 'bob@example.test', isPrimary: true, bouncedAt: null, setAsideAt: null },
  ];
  const scheduleDb = {
    messageTemplate: { findUnique: async () => ({ approvedAt: new Date(), body: BODY, approvedWording: L.wordingFingerprint() }) },
    prospect: { findUniqueOrThrow: async () => ({ id: 'business-1', email: 'office@example.test', doNotContact: false, repliedAt: null }) },
    contact: { findFirst: async () => null, findMany: async () => campaignContacts },
    outreachMessage: {
      findMany: async ({ where }) => where.state ? sentFirsts : dueDrafts.filter((m) => m.openedWith === where.openedWith),
      update: async ({ where, data }) => {
        const row = dueDrafts.find((m) => m.id === where.id);
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
  const now = new Date('2026-09-06T12:00:00Z');
  assert.equal((await L.queueNextTouch(scheduleDb, 'business-1', now, { allowFirstContact: false })).id, 'alice-day4');
  assert.equal((await L.queueNextTouch(scheduleDb, 'business-1', now, { allowFirstContact: false })).id, 'bob-day4');
  assert.equal(await L.queueNextTouch(scheduleDb, 'business-1', now, { allowFirstContact: false }), null);
  dueDrafts[1].state = 'DRAFT';
  campaignContacts[1].isPrimary = false;
  assert.equal(await L.queueNextTouch(scheduleDb, 'business-1', now, { allowFirstContact: false }), null);
  assert.equal(dueDrafts[1].state, 'DRAFT');

  console.log('PASS: selections persist and every recipient keeps one authoritative first email');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
