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
  let cursor; let totals = countCompanies([]);
  for (;;) {
    const rows = await db.prospect.findMany({
      where: { doNotContact: false }, orderBy: { id: 'asc' }, take: 250,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, stage: true, repliedAt: true, doNotContact: true,
        website: true, websiteManualValue: true, email: true, emailManualValue: true,
        emailBouncedAt: true, emailInboxSelected: true,
        contacts: { where: { setAsideAt: null },
          select: { email: true, isPrimary: true, bouncedAt: true, setAsideAt: true } },
        readings: { where: { source: 'website', reader: 'understand-businesses', outcome: 'read',
          pages: { some: { AND: [{ text: { not: null } }, { NOT: { text: '' } }] } } },
          select: { id: true }, take: 1 },
        messages: { where: { lane: 'EMAIL' }, select: {
          id: true, prospectId: true, lane: true, state: true, openedWith: true,
          sentTo: true, deliveryTo: true, editedAt: true, sentAt: true,
          deliveryState: true, providerMessageId: true,
        } },
      },
    });
    totals = countCompanies(rows, totals);
    if (rows.length < 250) return totals;
    cursor = rows[rows.length - 1].id;
  }
}

module.exports = { countCompanies, loadWorkflowProgress };
