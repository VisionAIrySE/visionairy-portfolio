const test = require('node:test');
const assert = require('node:assert/strict');
const { queuedEmailPages } = require('../../src/hoursback/crm/queuedEmailPages.js');
const { countCompanies } = require('../../src/hoursback/crm/workflowProgress.js');

test('sender pages all queued messages and shares company history within a page', async () => {
  const source = Array.from({ length: 205 }, (_, i) => ({ id: `m${String(i).padStart(3, '0')}`, prospectId: 'b1', prospect: { automationScore: null } }));
  let companyLoads = 0;
  const db = {
    outreachMessage: { findMany: async ({ take, where }) => {
      assert.equal(take, 100);
      const cursorId = where.AND && where.AND[1].id.gt;
      const start = cursorId ? source.findIndex((m) => m.id === cursorId) + 1 : 0;
      return source.slice(start, start + take);
    } },
    prospect: { findMany: async ({ where }) => {
      companyLoads += 1; assert.deepEqual(where.id.in, ['b1']);
      return [{ id: 'b1', messages: source }];
    } },
  };
  const ids = [];
  for await (const page of queuedEmailPages(db, {})) {
    assert.ok(page.length <= 100);
    assert.equal(page[0].prospect, page[page.length - 1].prospect);
    ids.push(...page.map((m) => m.id));
  }
  assert.equal(companyLoads, 3);
  assert.equal(new Set(ids).size, 205);
});

test('progress counts contact-only addresses and separates written from selected', () => {
  const p = { id: 'b1', website: 'https://example.test', readings: [{ id: 'r1' }],
    contacts: [{ email: 'person@example.test', isPrimary: false }],
    messages: ['tailored_first', 'touch_2', 'touch_3', 'touch_4'].map((openedWith, i) => ({
      id: `m${i}`, prospectId: 'b1', lane: 'EMAIL', state: 'DRAFT',
      openedWith, sentTo: 'person@example.test',
    })) };
  let totals = countCompanies([p]);
  assert.equal(totals.researchedWithEmail, 1);
  assert.equal(totals.fourWritten, 1);
  assert.equal(totals.selectedQueued, 0);
  p.contacts[0].isPrimary = true;
  p.messages[0].state = 'QUEUED';
  totals = countCompanies([p]);
  assert.equal(totals.selectedQueued, 1);
  p.messages.pop();
  totals = countCompanies([p]);
  assert.equal(totals.selectedQueued, 0);
  assert.equal(totals.messagesMissing, 1);
});
