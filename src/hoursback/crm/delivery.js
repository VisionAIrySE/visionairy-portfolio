// A durable boundary around the one external side effect in the CRM: handing
// an email to the provider. The row is claimed and its exact payload is frozen
// before the network call. Concurrent workers therefore cannot both send it,
// and an ambiguous provider result is held for review instead of retried.

const CLAIM_LEASE_MS = 5 * 60 * 1000;
const SAFE_RETRY_MS = 23 * 60 * 60 * 1000;

function deliveryKey(messageId) {
  return `outreach:${messageId}`;
}

function blockedReason(message) {
  if (!message || !message.prospect) return 'the business could not be loaded';
  if (message.prospect.doNotContact) return 'the business is marked do not contact';
  if (message.prospect.repliedAt) return 'the business has replied';
  const target = String(message.deliveryTo || message.sentTo || '').toLowerCase();
  const contacts = message.prospect.contacts || [];
  const contact = target && contacts.find((c) => String(c.email || '').toLowerCase() === target);
  if (contact && contact.bouncedAt) return 'that contact address has bounced';
  if (contact && contact.setAsideAt) return 'that contact has been set aside';
  const businessAddress = String(message.prospect.email || '').toLowerCase();
  const anotherContactWorks = contacts.some((c) => c.email && !c.bouncedAt && !c.setAsideAt);
  if (message.prospect.emailBouncedAt
      && ((!target && !anotherContactWorks) || (target && target === businessAddress))) {
    return 'the business email has bounced';
  }
  return null;
}

function savedPayload(message) {
  if (!message.deliveryTo || !message.deliveryFrom || !message.deliverySubject
      || !message.deliveryHtml || !message.deliveryText) return null;
  return {
    from: message.deliveryFrom,
    to: message.deliveryTo,
    subject: message.deliverySubject,
    html: message.deliveryHtml,
    text: message.deliveryText,
    idempotencyKey: message.deliveryKey,
  };
}

async function claim(db, messageId, makePayload, now = new Date()) {
  return db.$transaction(async (tx) => {
    const message = await tx.outreachMessage.findUnique({
      where: { id: messageId }, include: { prospect: { include: { contacts: true } } },
    });
    if (!message) return null;

    const reason = blockedReason(message);
    if (reason) {
      if (message.state === 'SENDING' && message.deliveryState === 'ATTEMPTING') {
        await tx.outreachMessage.updateMany({
          where: { id: message.id, state: 'SENDING', deliveryState: 'ATTEMPTING' },
          data: { deliveryState: 'UNCONFIRMED', deliveryLeaseExpiresAt: null,
            deliveryError: `${reason}; the earlier provider outcome is unknown` },
        });
        return { unconfirmed: true };
      }
      await tx.outreachMessage.updateMany({
        where: { id: message.id, state: { in: ['QUEUED', 'SENDING'] } },
        data: { state: 'SUPPRESSED', deliveryState: 'BLOCKED', deliveryLeaseExpiresAt: null,
          suppressedReason: reason, deliveryError: reason },
      });
      return { blocked: reason };
    }

    if (message.state === 'SENDING'
        && ['CLAIMED', 'ATTEMPTING'].includes(message.deliveryState)
        && message.deliveryLeaseExpiresAt
        && message.deliveryLeaseExpiresAt <= now) {
      if (message.deliveryState === 'ATTEMPTING'
          && (!message.deliveryLastAttemptAt
            || now.getTime() - message.deliveryLastAttemptAt.getTime() >= SAFE_RETRY_MS)) {
        await tx.outreachMessage.updateMany({
          where: { id: message.id, state: 'SENDING', deliveryState: 'ATTEMPTING' },
          data: { deliveryState: 'UNCONFIRMED', deliveryLeaseExpiresAt: null,
            deliveryError: 'provider result remained unknown beyond the safe retry window' },
        });
        return { unconfirmed: true };
      }
      const recovered = await tx.outreachMessage.updateMany({
        where: { id: message.id, state: 'SENDING', deliveryState: message.deliveryState,
          deliveryLeaseExpiresAt: { lte: now } },
        data: { deliveryState: 'CLAIMED', deliveryClaimedAt: now,
          deliveryLeaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS), deliveryError: null },
      });
      const payload = savedPayload(message);
      if (recovered.count !== 1) return null;
      if (!payload) {
        await tx.outreachMessage.updateMany({
          where: { id: message.id, state: 'SENDING', deliveryState: 'CLAIMED' },
          data: { deliveryState: 'UNCONFIRMED', deliveryLeaseExpiresAt: null,
            deliveryError: 'the frozen delivery payload is incomplete' },
        });
        return { unconfirmed: true };
      }
      return { message, payload, recovered: true };
    }

    if (message.state !== 'QUEUED' || ![null, 'FAILED'].includes(message.deliveryState)) return null;
    const payload = message.deliveryState === 'FAILED' ? savedPayload(message) : await makePayload(tx, message);
    if (!payload) {
      const reason = 'no deliverable email address is available';
      await tx.outreachMessage.updateMany({
        where: { id: message.id, state: 'QUEUED' },
        data: { state: 'SUPPRESSED', deliveryState: 'BLOCKED',
          suppressedReason: reason, deliveryError: reason },
      });
      return { blocked: reason };
    }
    const key = message.deliveryKey || deliveryKey(message.id);
    const updated = await tx.outreachMessage.updateMany({
      where: { id: message.id, state: 'QUEUED',
        OR: [{ deliveryState: null }, { deliveryState: 'FAILED' }],
        prospect: { doNotContact: false, repliedAt: null } },
      data: {
        state: 'SENDING', deliveryState: 'CLAIMED', deliveryKey: key,
        deliveryClaimedAt: now,
        deliveryLeaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
        sentTo: payload.to, deliveryTo: payload.to, deliveryFrom: payload.from,
        deliverySubject: payload.subject, deliveryHtml: payload.html, deliveryText: payload.text,
        deliveryError: null,
      },
    });
    return updated.count === 1
      ? { message, payload: { ...payload, idempotencyKey: key }, recovered: false }
      : null;
  });
}

async function beginAttempt(db, messageId, now = new Date()) {
  return db.$transaction(async (tx) => {
    const message = await tx.outreachMessage.findUnique({
      where: { id: messageId }, include: { prospect: { include: { contacts: true } } },
    });
    if (!message) return null;
    const reason = blockedReason(message);
    if (reason) {
      await tx.outreachMessage.updateMany({
        where: { id: messageId, state: 'SENDING', deliveryState: 'CLAIMED' },
        data: { state: 'SUPPRESSED', deliveryState: 'BLOCKED', deliveryLeaseExpiresAt: null,
          suppressedReason: reason, deliveryError: reason },
      });
      return { blocked: reason };
    }
    const updated = await tx.outreachMessage.updateMany({
      where: { id: messageId, state: 'SENDING', deliveryState: 'CLAIMED',
        deliveryLeaseExpiresAt: { gt: now },
        prospect: { doNotContact: false, repliedAt: null } },
      data: { deliveryState: 'ATTEMPTING', deliveryLastAttemptAt: now,
        deliveryLeaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
    });
    return updated.count === 1 ? { payload: savedPayload(message) } : null;
  });
}

async function markDelivered(db, messageId, providerMessageId, now = new Date()) {
  return db.outreachMessage.updateMany({
    where: { id: messageId, state: 'SENDING', deliveryState: 'ATTEMPTING' },
    data: { state: 'SENT', deliveryState: 'DELIVERED', sentAt: now, sentBy: 'engine',
      providerMessageId: providerMessageId || null,
      deliveryLeaseExpiresAt: null, deliveryError: null },
  });
}

async function markKnownFailure(db, messageId, error) {
  return db.outreachMessage.updateMany({
    where: { id: messageId, state: 'SENDING', deliveryState: 'ATTEMPTING' },
    data: { state: 'QUEUED', deliveryState: 'FAILED', deliveryLeaseExpiresAt: null,
      deliveryError: String(error && error.message || error).slice(0, 1000) },
  });
}

async function markUnconfirmed(db, messageId, error) {
  return db.outreachMessage.updateMany({
    where: { id: messageId, state: 'SENDING', deliveryState: 'ATTEMPTING' },
    data: { deliveryState: 'UNCONFIRMED', deliveryLeaseExpiresAt: null,
      deliveryError: String(error && error.message || error).slice(0, 1000) },
  });
}

module.exports = {
  CLAIM_LEASE_MS, SAFE_RETRY_MS, deliveryKey, blockedReason, savedPayload,
  claim, beginAttempt, markDelivered, markKnownFailure, markUnconfirmed,
};
