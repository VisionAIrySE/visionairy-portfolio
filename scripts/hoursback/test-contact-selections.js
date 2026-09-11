const assert = require('node:assert/strict');
const { saveContactSelections, canonicalFirstMessages } = require('../../src/hoursback/crm/lanes.js');

async function main() {
  const rows = new Map([
    ['first', { isPrimary: false }],
    ['second', { isPrimary: false }],
    ['not-on-this-page', { isPrimary: true }],
  ]);
  const db = {
    contact: {
      updateMany({ where, data }) {
        for (const id of where.id.in) {
          if (rows.has(id)) rows.get(id).isPrimary = data.isPrimary;
        }
        return Promise.resolve({ count: where.id.in.length });
      },
    },
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

  console.log('PASS: selections persist and each recipient has one authoritative first email');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
