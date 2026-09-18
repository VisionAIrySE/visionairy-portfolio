const L = require('./lanes.js');
const I = require('./inboxSelection.js');
const EP = require('./emailProgress.js');

function countCompanies(prospects, totals = {
  companies: 0, websites: 0, researched: 0, withEmail: 0, researchedWithEmail: 0,
  researchWithEmailWaiting: 0, researchWithoutEmailWaiting: 0,
  researchedWithoutEmail: 0, recipients: 0, fourWritten: 0,
  messagesMissing: 0, selectedQueued: 0, started: 0, held: 0,
}) {
  for (const p of prospects) {
    totals.companies += 1;
    const hasSite = Boolean(p.websiteManualValue || p.website);
    const read = Boolean(p.readings && p.readings.length);
    const contacts = (p.contacts || []).filter((c) => c.email && !c.bouncedAt && !c.setAsideAt);
    const addresses = new Set(contacts.map((c) => I.normalize(c.email)));
    const inbox = I.businessInboxAddress(p);
    if (inbox && !p.emailBouncedAt) addresses.add(inbox);
    if (hasSite) totals.websites += 1;
    if (read) totals.researched += 1;
    if (addresses.size) totals.withEmail += 1;
    if (read && addresses.size) totals.researchedWithEmail += 1;
    if (read && !addresses.size) totals.researchedWithoutEmail += 1;
    if (!read && hasSite) {
      if (addresses.size) totals.researchWithEmailWaiting += 1;
      else totals.researchWithoutEmailWaiting += 1;
    }
    const firsts = L.canonicalFirstMessages(p.messages || []);
    const started = EP.startedFirstKeys(p.messages || []);
    const selected = new Set(I.selectedPersonAddresses(p));
    const chosenInbox = I.selectedInboxAddress(p);
    if (chosenInbox) selected.add(chosenInbox);
    for (const address of addresses) {
      totals.recipients += 1;
      if (started.has(EP.campaignKey(p.id, address))) { totals.started += 1; continue; }
      const first = firsts.find((m) => I.normalize(m.sentTo) === address)
        || (addresses.size === 1 ? firsts.find((m) => !I.normalize(m.sentTo)) : null);
      if (p.repliedAt || p.doNotContact
        || (first && (first.state === 'SUPPRESSED' || first.deliveryState))) {
        totals.held += 1; continue;
      }
      const complete = first && ['DRAFT', 'QUEUED'].includes(first.state)
        && L.campaignHasCompleteSequence({ ...first, sentTo: address, prospect: p });
      if (read && complete) {
        totals.fourWritten += 1;
        if (selected.has(address) && first.state === 'QUEUED') totals.selectedQueued += 1;
      } else if (read) totals.messagesMissing += 1;
    }
  }
  return totals;
}

async function loadWorkflowProgress(db) {
  // Four metadata-only reads, rather than several round trips per 250 companies.
  // Never fetch message bodies, delivery payloads or saved webpage text here.
  const [prospects, contacts, readings, messages] = await Promise.all([
    db.prospect.findMany({ where: { doNotContact: false }, select: {
      id: true, repliedAt: true, doNotContact: true, website: true, websiteManualValue: true,
      email: true, emailManualValue: true, emailBouncedAt: true, emailInboxSelected: true,
    } }),
    db.contact.findMany({ where: { setAsideAt: null, email: { not: null },
      prospect: { doNotContact: false } }, select: {
      prospectId: true, email: true, isPrimary: true, bouncedAt: true, setAsideAt: true,
    } }),
    db.reading.groupBy({ by: ['prospectId'], where: {
      prospect: { doNotContact: false }, source: 'website',
      reader: 'understand-businesses', outcome: 'read',
      pages: { some: { AND: [{ text: { not: null } }, { NOT: { text: '' } }] } },
    } }),
    db.outreachMessage.findMany({ where: { lane: 'EMAIL', prospect: { doNotContact: false } },
      select: { id: true, prospectId: true, lane: true, state: true, openedWith: true,
        sentTo: true, deliveryTo: true, editedAt: true, sentAt: true,
        deliveryState: true, providerMessageId: true } }),
  ]);
  const byId = new Map(prospects.map((p) => [p.id, { ...p, contacts: [], readings: [], messages: [] }]));
  for (const c of contacts) byId.get(c.prospectId)?.contacts.push(c);
  for (const r of readings) byId.get(r.prospectId)?.readings.push(r);
  for (const m of messages) byId.get(m.prospectId)?.messages.push(m);
  return countCompanies(byId.values());
}

module.exports = { countCompanies, loadWorkflowProgress };
