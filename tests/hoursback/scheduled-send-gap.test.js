const test = require('node:test');
const assert = require('node:assert/strict');
const { dailySendRun } = require('../../src/hoursback/crm/scheduler.js');

test('the morning report exposes selected, complete drafts without lining them up', async () => {
  const calls = [];
  let reportText = '';
  const lanes = {
    MAX_PER_RUN: 200,
    selectedDraftGap: async () => {
      calls.push('read-only-gap-check');
      return {
        complete: 38, incomplete: 2, businesses: 2,
        contentReady: 37, contentFailed: 1,
      };
    },
    queueDueTouches: async (_db, options) => {
      calls.push(`queue-due-${options.allowFirstContact}`);
      return { first: 0, second: 0, third: 0, fourth: 0 };
    },
    sendQueuedEmails: async () => {
      calls.push('send-existing-queue');
      return { sent: 0 };
    },
  };
  const result = await dailySendRun({}, {
    lanes, customerEmailEnabled: true, apiKey: 'dummy-key',
    replyMonitor: { assertOutboundProtected: () => ({ configured: true }) },
    reportTo: 'report@example.test',
    reportSend: async (payload) => { reportText = payload.text; return { id: 'report-1' }; },
  });
  assert.deepEqual(calls, [
    'read-only-gap-check', 'queue-due-false', 'send-existing-queue',
  ]);
  assert.match(reportText, /38 with four messages across 2 businesses; 37 pass writing checks, 1 need revision/);
  assert.deepEqual(result.selectedDrafts,
    { complete: 38, incomplete: 2, businesses: 2, contentReady: 37, contentFailed: 1 });
});

test('the morning sender reconciles selected drafts only when the separate lineup switch is enabled', async () => {
  const calls = [];
  const lanes = {
    MAX_PER_RUN: 200,
    selectedDraftGap: async () => ({ complete: 1, incomplete: 0, businesses: 1,
      contentReady: 1, contentFailed: 0 }),
    reconcileSelectedEmailCampaigns: async () => {
      calls.push('reconcile');
      return { businesses: 1, ready: 1, incomplete: 0, contentBlocked: 0,
        contentProblems: [] };
    },
    queueDueTouches: async () => { calls.push('queue-followups'); return {}; },
    sendQueuedEmails: async () => { calls.push('send'); return { sent: 1 }; },
  };
  const options = { lanes, customerEmailEnabled: true, apiKey: 'dummy-key',
    replyMonitor: { assertOutboundProtected: () => ({ configured: true }) } };
  await dailySendRun({}, options);
  assert.deepEqual(calls, ['queue-followups', 'send']);
  calls.length = 0;
  const enabled = await dailySendRun({}, { ...options, automaticLineupEnabled: true });
  assert.deepEqual(calls, ['reconcile', 'queue-followups', 'send']);
  assert.equal(enabled.lineup.ready, 1);
});
