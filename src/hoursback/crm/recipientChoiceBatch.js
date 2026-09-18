'use strict';

function choicesFromForm(form, maximum = 100) {
  const companyIds = [...new Set([].concat(form.company || []).filter(Boolean))]
    .slice(0, maximum);
  return companyIds.map((prospectId) => ({
    prospectId,
    contactIds: [...new Set([].concat(form[`recipient.${prospectId}`] || []).filter(Boolean))],
    chooseInbox: form[`inbox.${prospectId}`] === '1',
  }));
}

async function mapWithConcurrency(items, maximum, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(maximum, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index], index);
    }
  }));
  return results;
}

async function saveChoices(db, prospectId, submittedContactIds, chooseInbox, lanes) {
  const L = lanes || require('./lanes.js');
  const I = require('./inboxSelection.js');
  const empty = { ready: 0, incomplete: 0, contentBlocked: 0, contentProblems: [] };
  const saved = await db.$transaction(async (tx) => {
    const [contacts, prospect] = await Promise.all([
      tx.contact.findMany({ where: { prospectId, setAsideAt: null },
        select: { id: true, email: true, bouncedAt: true } }),
      tx.prospect.findUnique({ where: { id: prospectId },
        select: { id: true, email: true, emailManualValue: true } }),
    ]);
    if (!prospect) throw new Error('The company no longer exists. Reload and try again.');
    const inbox = I.businessInboxAddress(prospect);
    const inboxCandidate = inbox && !contacts.some((person) => person.email
      && !person.bouncedAt && I.normalize(person.email) === inbox);
    const allowed = new Set(contacts.filter((person) => person.email && !person.bouncedAt)
      .map((person) => person.id));
    const selected = [...new Set([].concat(submittedContactIds || []).filter(Boolean))];
    if (selected.some((id) => !allowed.has(id)) || (chooseInbox && !inboxCandidate)) {
      throw new Error('The available recipients changed. Reload and review this company.');
    }
    const inboxChosen = Boolean(chooseInbox && inboxCandidate);
    await L.saveContactSelections(tx, contacts.map((person) => person.id), selected);
    await tx.prospect.update({ where: { id: prospectId },
      data: { emailInboxSelected: inboxChosen } });
    if (inboxChosen) await tx.outreachMessage.updateMany({ where: {
      prospectId, lane: 'EMAIL', sentAt: null,
      state: 'SUPPRESSED', suppressedReason: 'no recipients selected',
    }, data: { state: 'DRAFT', suppressedReason: null, queuedAt: null } });
    const chosenCount = selected.length + (inboxChosen ? 1 : 0);
    if (!chosenCount) await L.excludeEmailCampaigns(tx, prospectId);
    return { saved: true, prospectId, chosenCount, readiness: { ...empty } };
  }, { timeout: 15000 });
  if (!saved.chosenCount) return saved;
  try {
    await L.ensureSelectedFirstDrafts(db, prospectId);
    saved.readiness = await L.syncSelectedEmailCampaigns(db, prospectId);
  } catch (_) {
    // Choice persistence succeeded. Do not misreport this as a rejected save.
    saved.preparationError = 'Choices saved, but campaign preparation did not finish. Save this company again to retry.';
  }
  return saved;
}

module.exports = { choicesFromForm, mapWithConcurrency, saveChoices };
