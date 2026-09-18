const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorkflowProgress } = require('../../src/hoursback/crm/workflowProgress.js');

test('large progress reports use four metadata reads regardless of company count', async () => {
  let reads = 0;
  const db = {
    prospect: { findMany: async ({ select }) => {
      reads += 1;
      assert.equal(select.messages, undefined);
      return Array.from({ length: 35000 }, (_, index) => ({ id: `p${index}` }));
    } },
    contact: { findMany: async () => { reads += 1; return []; } },
    reading: { groupBy: async () => { reads += 1; return []; } },
    outreachMessage: { findMany: async ({ select }) => {
      reads += 1;
      assert.equal(select.body, undefined);
      assert.equal(select.deliveryHtml, undefined);
      return [];
    } },
  };
  const totals = await loadWorkflowProgress(db);
  assert.equal(reads, 4);
  assert.equal(totals.companies, 35000);
  assert.equal(totals.recipients, 0);
});
