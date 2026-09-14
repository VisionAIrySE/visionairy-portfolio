const assert = require('node:assert/strict');
const { makeOpenRouterPool } = require('../../src/hoursback/openRouterPool.js');

(async () => {
  let calls = 0;
  const success = makeOpenRouterPool({
    apiKey: 'test-key',
    fetchFn: async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"body":"clear copy"}' } }],
          usage: { cost: 0.001 },
        }),
      };
    },
  });
  const answer = await success.ask('write it');
  assert.equal(answer.answer.body, 'clear copy');
  assert.equal(success.spent, 0.001);
  assert.equal(calls, 1);

  const capped = makeOpenRouterPool({ apiKey: 'test-key', ceilingUsd: 0.005, fetchFn: async () => { throw new Error('must not call'); } });
  const blocked = await capped.ask('write it');
  assert.equal(blocked.readerExhausted, true);
  assert.match(blocked.why, /run ceiling was reached/);

  const unauthorized = makeOpenRouterPool({
    apiKey: 'test-key',
    fetchFn: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'User not found' } }) }),
  });
  const refused = await unauthorized.ask('write it');
  assert.equal(refused.readerExhausted, true);
  assert.match(refused.why, /User not found/);
  console.log('PASS: OpenRouter writing is bounded, measurable, and stops on authorization failure');
})().catch((error) => { console.error(error); process.exit(1); });
