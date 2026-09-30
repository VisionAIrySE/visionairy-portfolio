const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../src/hoursback/crm/lanes.js');

test('saving existing recipient choices does not rebuild every first email', async () => {
  const contacts = Array.from({ length: 15 }, (_, index) => ({
    id: `contact-${index}`,
    email: `person${index}@example.test`,
    isPrimary: true,
    bouncedAt: null,
    setAsideAt: null,
  }));
  const messages = contacts.map((contact, index) => ({
    id: `message-${index}`,
    prospectId: 'business-1',
    lane: 'EMAIL',
    state: index ? 'DRAFT' : 'SENT',
    openedWith: 'tailored_first',
    sentTo: contact.email,
  }));
  const calls = { prospect: 0, contacts: 0, messages: 0, creates: 0 };
  const db = {
    prospect: {
      findUnique: async () => {
        calls.prospect += 1;
        return { id: 'business-1', emailInboxSelected: false,
          readings: [{ id: 'full-reading' }] };
      },
      findUniqueOrThrow: async () => { throw new Error('an existing campaign was rebuilt'); },
    },
    contact: {
      findMany: async () => { calls.contacts += 1; return contacts; },
    },
    outreachMessage: {
      findMany: async () => { calls.messages += 1; return messages; },
      create: async () => { calls.creates += 1; },
    },
  };

  const made = await L.ensureSelectedFirstDrafts(db, 'business-1');
  assert.deepEqual(made, []);
  assert.deepEqual(calls, { prospect: 1, contacts: 1, messages: 1, creates: 0 });
});

test('selecting a recipient before full research does not create a misleading first-only campaign', async () => {
  let created = 0;
  const db = {
    prospect: { findUnique: async (query) => {
      assert.equal(query.select.readings.where.reader, 'understand-businesses');
      return { id: 'business-1', emailInboxSelected: false, readings: [] };
    } },
    contact: { findMany: async () => [{
      id: 'contact-1', name: 'Alvin', email: 'alvin@example.test', isPrimary: true,
      bouncedAt: null, setAsideAt: null,
    }] },
    outreachMessage: {
      findMany: async () => [],
      create: async () => { created += 1; },
    },
  };

  assert.deepEqual(await L.ensureSelectedFirstDrafts(db, 'business-1'), []);
  assert.equal(created, 0);
});
