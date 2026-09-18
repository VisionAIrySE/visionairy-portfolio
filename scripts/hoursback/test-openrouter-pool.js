const assert = require('node:assert/strict');
const { makeOpenRouterPool } = require('../../src/hoursback/openRouterPool.js');

(async () => {
  let calls = 0;
  let requestBody = null;
  const success = makeOpenRouterPool({
    apiKey: 'test-key', ceilingUsd: Infinity,
    systemPrompt: 'research facts only',
    temperature: 0,
    fetchFn: async (_url, options) => {
      calls += 1;
      requestBody = JSON.parse(options.body);
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
  assert.equal(requestBody.messages[0].content, 'research facts only');
  assert.equal(requestBody.temperature, 0);

  const capped = makeOpenRouterPool({ apiKey: 'test-key', ceilingUsd: 0.005, fetchFn: async () => { throw new Error('must not call'); } });
  const blocked = await capped.ask('write it');
  assert.equal(blocked.readerExhausted, true);
  assert.match(blocked.why, /run ceiling was reached/);

  let uncappedCalls = 0;
  const uncapped = makeOpenRouterPool({ apiKey: 'test-key', ceilingUsd: Infinity,
    fetchFn: async () => {
      uncappedCalls += 1;
      return { ok: true, json: async () => ({
        choices: [{ message: { content: '{"body":"clear copy"}' } }],
        usage: { cost: 3 },
      }) };
    } });
  for (let index = 0; index < 3; index += 1) await uncapped.ask('write it');
  assert.equal(uncappedCalls, 3);
  assert.equal(uncapped.spent, 9);

  let refusalLog = null;
  const unauthorized = makeOpenRouterPool({
    apiKey: 'test-key', ceilingUsd: Infinity,
    fetchFn: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'User not found' } }) }),
    onCall: (entry) => { refusalLog = entry; },
  });
  const refused = await unauthorized.ask('write it');
  assert.equal(refused.readerExhausted, true);
  assert.match(refused.why, /User not found/);
  assert.equal(refusalLog.answered, false);
  assert.match(refusalLog.why, /401/);
  console.log('PASS: OpenRouter writing reports cost, honors an approved ceiling when provided, and stops on authorization failure');
})().catch((error) => { console.error(error); process.exit(1); });
