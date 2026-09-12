#!/usr/bin/env node
// Read-only proof that every sendable recipient has a complete campaign.
// This deliberately checks the daily workflow as one unit: research,
// recipient selection, four saved messages, queue state, and stop signals.

const { PrismaClient } = require('@prisma/client');
const L = require('../../src/hoursback/crm/lanes.js');

const SHOW = Math.max(0, Number((process.argv.find((a) => a.startsWith('--show=')) || '').split('=')[1] || 20));
const DETAILS = process.argv.includes('--details');
const ONLY = String((process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '').trim();
const onlyCompany = ONLY ? { name: { contains: ONLY, mode: 'insensitive' } } : {};
const usableState = new Set(['DRAFT', 'QUEUED', 'SENT', 'REPLIED']);
const emailKey = (value) => String(value || '').trim().toLowerCase();
const isUsable = (message) => usableState.has(message.state) && message.deliveryState !== 'BLOCKED';
const isFirst = (message) => L.isFirstContactMessage(message);

(async () => {
  const db = new PrismaClient();
  if (ONLY && DETAILS) {
    const matches = await db.prospect.findMany({
      where: onlyCompany,
      select: {
        id: true, name: true, doNotContact: true, repliedAt: true, email: true, emailManualValue: true,
        messages: { select: { state: true, openedWith: true, sentTo: true, sentAt: true, deliveryState: true } },
        _count: { select: { contacts: true, messages: true, readings: true, findings: true } },
      },
      orderBy: { name: 'asc' },
    });
    for (const match of matches) console.log(`MATCH ${JSON.stringify(match)}`);
  }
  const activeReachable = {
    doNotContact: false,
    repliedAt: null,
    AND: [
      L.emailReachableWhere(),
      { OR: [{ website: { not: null } }, { websiteManualValue: { not: null } }] },
    ],
  };
  const hasDeepRead = {
    readings: {
      some: {
        source: 'website', outcome: 'read',
        pages: { some: { AND: [{ text: { not: null } }, { NOT: { text: '' } }] } },
      },
    },
  };
  const hasCompanyResearch = {
    findings: { some: { field: 'noticing', retiredAt: null, value: { not: null } } },
  };
  const hasUnsentFirst = {
    messages: {
      some: {
        lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] }, sentAt: null,
        openedWith: { not: 'after_the_call' },
        NOT: { openedWith: { startsWith: 'touch_' } },
      },
    },
  };

  const [reachableWithWebsite, deeplyRead, companyResearched, withFirst] = await Promise.all([
    db.prospect.count({ where: activeReachable }),
    db.prospect.count({ where: { ...activeReachable, ...hasDeepRead } }),
    db.prospect.count({ where: { ...activeReachable, ...hasDeepRead, ...hasCompanyResearch } }),
    db.prospect.count({ where: { ...activeReachable, ...hasDeepRead, ...hasCompanyResearch, ...hasUnsentFirst } }),
  ]);
  const researchedWithoutAnyFirst = await db.prospect.findMany({
    where: {
      ...activeReachable,
      ...hasDeepRead,
      ...hasCompanyResearch,
      ...onlyCompany,
      messages: {
        none: {
          lane: 'EMAIL', openedWith: { not: 'after_the_call' },
          NOT: { openedWith: { startsWith: 'touch_' } },
        },
      },
    },
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  const companies = await db.prospect.findMany({
    where: {
      ...activeReachable,
      ...hasDeepRead,
      ...hasCompanyResearch,
      ...hasUnsentFirst,
      ...onlyCompany,
    },
    select: {
      id: true, name: true, email: true, emailManualValue: true,
      contacts: {
        where: { setAsideAt: null },
        select: { name: true, role: true, email: true, bouncedAt: true, isPrimary: true },
        orderBy: { createdAt: 'asc' },
      },
      messages: {
        where: { lane: 'EMAIL' },
        select: {
          id: true, lane: true, state: true, subject: true, body: true, openedWith: true,
          sentTo: true, sentAt: true, deliveryState: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const problems = [];
  const add = (company, recipient, issue) => problems.push({ company: company.name, recipient, issue });
  for (const company of researchedWithoutAnyFirst) {
    add(company, 'no recipient campaign', 'company-specific research exists but no first email was created');
  }
  let recipients = 0;
  let completeRecipients = 0;

  for (const company of companies) {
    const usable = company.messages.filter(isUsable);
    const usableContacts = company.contacts.filter((contact) => contact.email && !contact.bouncedAt);
    const markedContacts = usableContacts.filter((contact) => contact.isPrimary);
    const addressedContacts = markedContacts.length
      ? markedContacts
      : usableContacts.filter((contact) => contact.name).slice(0, 1);
    const selected = addressedContacts.map((contact) => ({
      email: emailKey(contact.email),
      label: `${contact.name || contact.email}${contact.role ? ` (${contact.role})` : ''}`,
    }));
    const currentFirsts = usable.filter(isFirst);
    const fallback = emailKey(company.emailManualValue || company.email || (currentFirsts[0] && currentFirsts[0].sentTo));
    const namedForInbox = company.contacts.find((contact) => contact.name);
    const expected = selected.length ? selected : fallback ? [{
      email: fallback,
      label: namedForInbox
        ? `${namedForInbox.name}${namedForInbox.role ? ` (${namedForInbox.role})` : ''} at ${fallback}`
        : fallback,
    }] : [];

    if (!expected.length) {
      add(company, 'no recipient', 'no usable recipient could be resolved');
      if (DETAILS) console.log(`DETAIL ${company.id} ${company.name} has no recipient: ${JSON.stringify({
        email: company.email, manual: company.emailManualValue,
        contacts: company.contacts.map((contact) => ({ email: contact.email, bounced: Boolean(contact.bouncedAt) })),
      })}`);
      continue;
    }

    for (const recipient of expected) {
      recipients += 1;
      // Older untouched drafts did not store the resolved address. They are
      // unambiguous only when the business has exactly one intended recipient;
      // the sender resolves that same address immediately before delivery.
      const theirs = usable.filter((message) => emailKey(message.sentTo) === recipient.email
        || (expected.length === 1 && !emailKey(message.sentTo)));
      const firsts = theirs.filter(isFirst);
      const missing = [];
      if (!firsts.length) missing.push('first email');
      for (const touch of [2, 3, 4]) {
        if (!theirs.some((message) => message.openedWith === `touch_${touch}`)) missing.push(`Day ${touch === 2 ? 4 : touch === 3 ? 8 : 14}`);
      }
      if (missing.length) {
        add(company, recipient.label, `missing ${missing.join(', ')}`);
        if (DETAILS) {
          const rows = company.messages.map((message) => ({
            slot: isFirst(message) ? 'first' : message.openedWith,
            to: emailKey(message.sentTo) || '(blank)',
            state: message.state,
            delivery: message.deliveryState || '(none)',
          }));
          console.log(`DETAIL ${company.id} ${company.name} expected ${recipient.email}: ${JSON.stringify(rows)}`);
        }
        continue;
      }
      const empty = theirs.filter((message) => !String(message.subject || '').trim() || !String(message.body || '').trim());
      if (empty.length) {
        add(company, recipient.label, `${empty.length} message${empty.length === 1 ? ' is' : 's are'} blank`);
        continue;
      }
      completeRecipients += 1;
      if (DETAILS) console.log(`COMPLETE ${company.id} ${company.name} — ${recipient.email}: first, Day 4, Day 8, Day 14`);
    }

    const queuedFirsts = currentFirsts.filter((message) => message.state === 'QUEUED');
    for (const first of queuedFirsts) {
      const address = emailKey(first.sentTo) || (expected.length === 1 ? expected[0].email : '');
      const hasAll = [2, 3, 4].every((touch) => usable.some((message) =>
        message.openedWith === `touch_${touch}`
        && (emailKey(message.sentTo) === address || (expected.length === 1 && !emailKey(message.sentTo)))));
      if (!address) add(company, 'queued email', 'marked ready without a recipient');
      else if (!hasAll) add(company, first.sentTo, 'marked ready while its campaign is incomplete');
    }
  }

  console.log('Preparation path for active companies that have a website and an email address:');
  console.log(`  ${reachableWithWebsite} can be researched`);
  console.log(`  ${deeplyRead} have their website pages saved`);
  console.log(`  ${companyResearched} have company-specific work selected`);
  console.log(`  ${withFirst} have an unsent first email`);
  console.log(`${companies.length} researched, reachable companies have an unsent first email.`);
  console.log(`${completeRecipients} of ${recipients} selected recipients have all four saved messages.`);
  console.log(`${problems.length} readiness problems found.`);
  if (SHOW && problems.length) {
    for (const problem of problems.slice(0, SHOW)) {
      console.log(`  - ${problem.company} — ${problem.recipient}: ${problem.issue}`);
    }
    if (problems.length > SHOW) console.log(`  ...and ${problems.length - SHOW} more`);
  }
  await db.$disconnect();
  if (problems.length) process.exitCode = 2;
})().catch((error) => {
  console.error(`audit failed: ${error.message}`);
  process.exitCode = 1;
});
