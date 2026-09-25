const test = require('node:test');
const assert = require('node:assert/strict');
const { syncSelectedEmailCampaigns, selectedDraftGap, reconcileSelectedEmailCampaigns,
  canonicalFirstMessages, markReplied } = require('../../src/hoursback/crm/lanes.js');

function fixture(selected) {
  const address = 'person@example.test';
  const messages = ['tailored_first', 'touch_2', 'touch_3'].map((openedWith, i) => ({
    id: `message-${i}`, prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith, sentTo: address, sentAt: null,
    queuedAt: null, deliveryState: null,
  }));
  const prospect = {
    id: 'business-1',
    doNotContact: false, repliedAt: null,
    contacts: selected ? [{ email: address }] : [],
    readings: [{ id: 'reading-1' }], messages,
  };
  const db = {
    prospect: { findUnique: async (query) => {
      assert.equal(query.select.readings.where.reader, 'understand-businesses');
      return prospect;
    }, findMany: async (query) => {
      if (query.select && query.select.readings) {
        assert.equal(query.select.readings.where.reader, 'understand-businesses');
      }
      return [prospect];
    } },
    reading: {
      findFirst: async () => ({ findings: [{ value: 'one verified job' }] }),
      findMany: async () => [{
        prospectId: 'business-1', findings: [{ value: 'one verified job' }],
      }],
    },
    outreachMessage: {
      update: async ({ where, data }) => {
        const message = messages.find((row) => row.id === where.id);
        Object.assign(message, data);
        return message;
      },
    },
  };
  return { db, prospect, messages, address };
}

test('a contact selected before campaign writing is lined up only after all four messages exist', async () => {
  const { db, messages, address } = fixture(true);
  const options = { judgeStored: () => ({ ok: true }) };
  let result = await syncSelectedEmailCampaigns(db, 'business-1', options);
  assert.deepEqual(result, { ready: 0, incomplete: 1, contentBlocked: 0, contentProblems: [] });
  assert.equal(messages[0].state, 'DRAFT');

  messages.push({
    id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null,
  });
  result = await syncSelectedEmailCampaigns(db, 'business-1', options);
  assert.deepEqual(result, { ready: 1, incomplete: 0, contentBlocked: 0, contentProblems: [] });
  assert.equal(messages[0].state, 'QUEUED');
  assert.ok(messages[0].queuedAt instanceof Date);
});

test('writing all four messages does not line up an unselected contact', async () => {
  const { db, messages, address } = fixture(false);
  messages.push({
    id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null,
  });
  const result = await syncSelectedEmailCampaigns(db, 'business-1',
    { judgeStored: () => ({ ok: true }) });
  assert.deepEqual(result, { ready: 0, incomplete: 0, contentBlocked: 0, contentProblems: [] });
  assert.equal(messages[0].state, 'DRAFT');
});

test('an explicitly chosen company inbox lines up, and unchecking it holds, its first email', async () => {
  const { db, prospect, messages, address } = fixture(false);
  prospect.email = address;
  prospect.emailInboxSelected = true;
  messages.push({ id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null });
  let result = await syncSelectedEmailCampaigns(db, 'business-1',
    { judgeStored: () => ({ ok: true }) });
  assert.equal(result.ready, 1);
  assert.equal(messages[0].state, 'QUEUED');

  prospect.emailInboxSelected = false;
  result = await syncSelectedEmailCampaigns(db, 'business-1',
    { judgeStored: () => ({ ok: true }) });
  assert.equal(result.ready, 0);
  assert.equal(messages[0].state, 'DRAFT');
});

test('a delivered first email wins over an old unsent copy and cannot be lined up again', async () => {
  const { db, messages, address } = fixture(true);
  messages.push({ id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null });
  messages.push({ id: 'delivered-first', prospectId: 'business-1', lane: 'EMAIL',
    state: 'SENT', openedWith: 'tailored_first', sentTo: address,
    sentAt: new Date('2026-09-15T17:00:00Z'), deliveryState: 'DELIVERED' });
  assert.equal(canonicalFirstMessages(messages).find((m) => m.sentTo === address).id,
    'delivered-first');
  const result = await syncSelectedEmailCampaigns(db, 'business-1',
    { judgeStored: () => ({ ok: true }) });
  assert.deepEqual(result, { ready: 0, incomplete: 0,
    contentBlocked: 0, contentProblems: [] });
  assert.equal(messages[0].state, 'DRAFT');
  messages[0].state = 'QUEUED';
  await syncSelectedEmailCampaigns(db, 'business-1',
    { judgeStored: () => ({ ok: true }) });
  assert.equal(messages[0].state, 'DRAFT', 'an older queued copy must be held');
});

test('an uncertain provider outcome does not masquerade as confirmed delivery', () => {
  const { messages, address } = fixture(true);
  messages.push({ id: 'uncertain-first', prospectId: 'business-1', lane: 'EMAIL',
    state: 'SENT', openedWith: 'tailored_first', sentTo: address,
    sentAt: new Date('2026-09-15T17:00:00Z'), deliveryState: 'UNCONFIRMED' });
  assert.equal(canonicalFirstMessages(messages).find((m) => m.sentTo === address).id,
    'message-0');
});

test('four present messages stay out of the send lineup when one fails the writing check', async () => {
  const { db, messages, address } = fixture(true);
  messages.push({
    id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null,
  });
  const result = await syncSelectedEmailCampaigns(db, 'business-1', {
    judgeStored: (message) => ({
      ok: message.openedWith !== 'touch_4',
      why: message.openedWith === 'touch_4' ? 'too long for this follow-up' : null,
    }),
  });
  assert.deepEqual(result, {
    ready: 0, incomplete: 0, contentBlocked: 1,
    contentProblems: [{
      recipient: address,
      message: 'Day 14 follow-up',
      why: 'too long for this follow-up',
    }],
  });
  assert.equal(messages[0].state, 'DRAFT');
});

test('the read-only gap check finds selected drafts missed by the morning run', async () => {
  const { db, messages, address } = fixture(true);
  const options = { judgeStored: () => ({ ok: true }) };
  assert.deepEqual(await selectedDraftGap(db, options),
    { complete: 0, incomplete: 1, businesses: 0, contentReady: 0, contentFailed: 0 });
  messages.push({
    id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null,
  });
  assert.deepEqual(await selectedDraftGap(db, options),
    { complete: 1, incomplete: 0, businesses: 1, contentReady: 1, contentFailed: 0 });
  assert.equal(messages[0].state, 'DRAFT', 'the check must not change the send lineup');
});

test('reconciliation lines up eligible selected campaigns and holds campaigns that fail a writing check', async () => {
  const { db, messages, address } = fixture(true);
  messages.push({ id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null });
  const result = await reconcileSelectedEmailCampaigns(db,
    { judgeStored: () => ({ ok: true }) });
  assert.equal(result.ready, 1);
  assert.equal(messages[0].state, 'QUEUED');
  const held = await reconcileSelectedEmailCampaigns(db,
    { judgeStored: () => ({ ok: false, why: 'revision needed' }) });
  assert.equal(held.contentBlocked, 1);
  assert.equal(messages[0].state, 'DRAFT');
});

test('legacy shared follow-up drafts are copied into separate complete campaigns for each selected recipient', async () => {
  const { db, prospect, messages } = fixture(true);
  const second = 'second@example.test';
  prospect.contacts.push({ email: second });
  messages[0].sentTo = 'person@example.test';
  messages.push({ id: 'second-first', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'tailored_first', sentTo: second, sentAt: null,
    queuedAt: null, deliveryState: null, subject: 'First', body: 'First' });
  for (const touch of [2, 3, 4]) messages.push({
    id: `legacy-${touch}`, prospectId: 'business-1', lane: 'EMAIL', state: 'DRAFT',
    openedWith: `touch_${touch}`, sentTo: null, sentAt: null, queuedAt: null,
    deliveryState: null, subject: `Follow ${touch}`, body: `Follow ${touch}`,
  });
  let created = 0;
  db.outreachMessage.create = async ({ data }) => ({ id: `copy-${++created}`, ...data,
    sentAt: null, queuedAt: null, deliveryState: null });

  const result = await syncSelectedEmailCampaigns(db, 'business-1',
    { judgeStored: () => ({ ok: true }) });
  assert.equal(result.ready, 2);
  for (const address of ['person@example.test', second]) {
    for (const touch of [2, 3, 4]) {
      assert.ok(messages.some((message) => message.openedWith === `touch_${touch}`
        && message.sentTo === address), `${address} receives touch ${touch}`);
    }
  }
  assert.equal(messages.filter((message) => !message.sentTo && /^touch_/.test(message.openedWith)).length, 3,
    'legacy source drafts remain as history and are never retargeted');
});

test('a reply suppresses only the replying recipient and never sets a company-wide reply stop', async () => {
  const calls = [];
  const db = {
    prospect: {
      update: async () => { throw new Error('a recipient reply must not stop the business'); },
      findUniqueOrThrow: async () => ({ id: 'business-1' }),
    },
    outreachMessage: {
      findFirst: async () => ({ id: 'sent-a' }),
      updateMany: async (query) => { calls.push(query); return { count: 1 }; },
    },
  };
  await markReplied(db, 'business-1', 'EMAIL', new Date('2026-09-25T00:00:00Z'), 'a@example.test');
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.where.sentTo.equals, 'a@example.test');
    assert.equal(call.where.prospectId, 'business-1');
  }
});
