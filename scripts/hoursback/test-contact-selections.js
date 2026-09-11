const assert = require('node:assert/strict');
const { saveContactSelections } = require('../../src/hoursback/crm/lanes.js');

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

  console.log('PASS: all visible contacts stay selected after save, clearing all works, and other pages are untouched');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
