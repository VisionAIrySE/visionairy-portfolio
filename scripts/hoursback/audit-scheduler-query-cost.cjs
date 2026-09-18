// Offline characterization only: no credentials, database, network, or provider.
// Counts ORM calls; these are not measured SQL executions or production timings.
const assert = require('node:assert/strict');
const L = require('../../src/hoursback/crm/lanes.js');
const FC = require('../../src/hoursback/crm/firstContact.js');

async function measure(n, options = {}) {
  let reads = 0; let writes = 0; let touchReads = 0;
  const contacts = Array.from({ length: n }, (_, i) => ({
    email: `p${i}@example.test`, isPrimary: true,
  }));
  const firsts = contacts.map((c, i) => ({ id: `f${i}`, sentTo: c.email,
    lane: 'EMAIL', state: 'SENT', openedWith: 'tailored_first',
    sentAt: new Date('2026-09-01') }));
  const follows = contacts.map((c, i) => ({ id: `t${i}`, sentTo: c.email,
    lane: 'EMAIL', state: 'DRAFT', openedWith: 'touch_2' }));
  if (options.mutate) options.mutate({ contacts, firsts, follows });
  const prospect = { id: 'fixture', emailInboxSelected: false };
  const db = {
    messageTemplate: { findUnique: async () => {
      reads += 1;
      return { approvedAt: new Date(), body: FC.BODY, approvedWording: L.wordingFingerprint() };
    } },
    prospect: {
      findMany: async () => { reads += 1; return [prospect]; },
      findUniqueOrThrow: async () => { reads += 1; return prospect; },
    },
    contact: {
      findFirst: async () => { reads += 1; return contacts[0]; },
      findMany: async () => { reads += 1; return contacts; },
    },
    outreachMessage: {
      findMany: async (query) => {
        reads += 1;
        if (query.where.openedWith === 'touch_2') { touchReads += 1; return follows; }
        return firsts;
      },
      update: async (query) => {
        writes += 1;
        const message = follows.find((m) => m.id === query.where.id);
        assert.ok(message, 'only an existing follow-up may be updated');
        Object.assign(message, query.data);
        return message;
      },
    },
  };
  const result = await L.queueDueTouches(db, {
    now: options.now || new Date('2026-09-06'), allowFirstContact: false,
  });
  assert.equal(result.first, 0);
  assert.equal(result.second, writes);
  return { recipients: n, reads, touchReads, writes, queued: result.second,
    leftDraft: follows.filter((m) => m.state === 'DRAFT').length };
}

if (require.main === module) (async () => {
  for (const n of [1, 15, 23, 50, 51]) console.log(JSON.stringify(await measure(n)));
})().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { measure };
