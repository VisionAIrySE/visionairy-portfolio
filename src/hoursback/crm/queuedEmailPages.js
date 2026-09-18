// Bound memory independently of the number of messages the user wants sent.
async function* queuedEmailPages(db, where, pageSize = 100) {
  let cursor;
  for (;;) {
    const messages = await db.outreachMessage.findMany({
      where: cursor ? { AND: [where, cursor.score == null
        ? { prospect: { automationScore: null }, id: { gt: cursor.id } }
        : { OR: [
          { prospect: { automationScore: { lt: cursor.score } } },
          { prospect: { automationScore: null } },
          { prospect: { automationScore: cursor.score }, id: { gt: cursor.id } },
        ] }] } : where,
      orderBy: [{ prospect: { automationScore: { sort: 'desc', nulls: 'last' } } }, { id: 'asc' }],
      include: { prospect: { select: { automationScore: true } } },
      take: pageSize,
    });
    if (!messages.length) return;
    const prospects = await db.prospect.findMany({
      where: { id: { in: [...new Set(messages.map((m) => m.prospectId))] } },
      include: {
        readings: { where: {
          source: 'website', reader: 'understand-businesses', outcome: 'read',
          pages: { some: { AND: [{ text: { not: null } }, { NOT: { text: '' } }] } },
        }, select: { id: true }, take: 1 },
        contacts: { where: { isPrimary: true, email: { not: null },
          bouncedAt: null, setAsideAt: null }, select: { email: true, isPrimary: true } },
        messages: { where: { lane: 'EMAIL', openedWith: { not: 'after_the_call' } },
          select: { id: true, prospectId: true, lane: true, state: true, openedWith: true,
            sentTo: true, editedAt: true, deliveryState: true, sentAt: true, providerMessageId: true } },
      },
    });
    const byId = new Map(prospects.map((p) => [p.id, p]));
    yield messages.filter((m) => byId.has(m.prospectId))
      .map((m) => ({ ...m, prospect: byId.get(m.prospectId) }));
    if (messages.length < pageSize) return;
    const last = messages[messages.length - 1];
    cursor = { id: last.id, score: last.prospect.automationScore };
  }
}
module.exports = { queuedEmailPages };
