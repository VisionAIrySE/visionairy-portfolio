#!/usr/bin/env node
// Preview and repair only unsent customer email drafts. The default is a
// read-only transaction. --do-it requires Russ's specific production-data
// approval and never changes a sent message, recipient choice, or queue state.
const fs = require('node:fs');
const path = require('node:path');
for (const line of fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^DATABASE_URL=(.*)$/);
  if (match && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
const { PrismaClient, Prisma } = require('@prisma/client');
const { emailFields } = require('../../src/hoursback/crm/emailText.js');
const L = require('../../src/hoursback/crm/lanes.js');
const db = new PrismaClient();
const normalize = (value) => String(value || '').trim().toLowerCase();
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function greetingName(body) {
  const match = String(body || '').match(/^Hi\s+([^,\n]+),/i);
  return match ? match[1].trim() : null;
}

function removeGreetingNameFromSubject(subject, body) {
  const name = greetingName(body);
  if (!name) return subject;
  return String(subject || '').replace(
    new RegExp(`^${escapeRegex(name)}\\s*(?:[\u2014\u2013]|:)\\s*`, 'i'), '');
}

function planChange(message) {
  const direct = (message.prospect.contacts || []).find((contact) =>
    normalize(contact.email) === normalize(message.sentTo));
  const companyAddresses = [message.prospect.emailManualValue, message.prospect.email]
    .map(normalize).filter(Boolean);
  const definiteCompanyInbox = !direct && (companyAddresses.includes(normalize(message.sentTo))
    || (!normalize(message.sentTo) && message.prospect.emailInboxSelected
      && !(message.prospect.contacts || []).length));
  const originalBody = String(message.body || '');
  const subjectWithoutName = removeGreetingNameFromSubject(message.subject, originalBody);
  let body = originalBody;
  if (definiteCompanyInbox) body = body.replace(/^Hi\s+[^,\n]+,/i, 'Hello,');
  const clean = emailFields({ subject: subjectWithoutName, body });
  return {
    subject: clean.subject,
    body: clean.body,
    removedSubjectName: clean.subject !== emailFields({ subject: message.subject, body: '' }).subject,
    neutralizedCompanyGreeting: body !== String(message.body || ''),
    removedLongDash: /[\u2014\u2013]/.test(`${message.subject || ''}\n${message.body || ''}`),
  };
}

async function run() {
  const doIt = process.argv.includes('--do-it');
  const result = await db.$transaction(async (tx) => {
    if (!doIt) await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const messages = await tx.outreachMessage.findMany({
      where: {
        lane: 'EMAIL', sentAt: null, deliveryState: null,
        state: { in: ['DRAFT', 'QUEUED', 'SUPPRESSED'] },
      },
      select: {
        id: true, state: true, subject: true, body: true, sentTo: true,
        prospect: { select: {
          name: true, email: true, emailManualValue: true, emailInboxSelected: true,
          contacts: { where: {
            isPrimary: true, email: { not: null }, bouncedAt: null, setAsideAt: null,
          }, select: { name: true, email: true } },
        } },
      },
    });
    const held = await tx.outreachMessage.findMany({
      where: { lane: 'EMAIL', sentAt: null, deliveryState: { not: null } },
      select: { subject: true, body: true, deliverySubject: true, deliveryHtml: true, deliveryText: true },
    });
    const template = await tx.messageTemplate.findUnique({ where: { name: L.FIRST_CONTACT } });
    const changes = messages.map((message) => ({ message, next: planChange(message) }))
      .filter(({ message, next }) => next.subject !== message.subject || next.body !== message.body);
    const counts = {
      inspected: messages.length,
      changed: changes.length,
      longDashes: changes.filter(({ next }) => next.removedLongDash).length,
      subjectNames: changes.filter(({ next }) => next.removedSubjectName).length,
      companyGreetings: changes.filter(({ next }) => next.neutralizedCompanyGreeting).length,
      heldByDeliverySafety: held.length,
      heldWithLongDashes: held.filter((message) => /[\u2014\u2013]/.test(
        `${message.subject || ''}\n${message.body || ''}\n${message.deliverySubject || ''}\n${message.deliveryHtml || ''}\n${message.deliveryText || ''}`)).length,
    };
    if (doIt) {
      for (let start = 0; start < changes.length; start += 300) {
        const group = changes.slice(start, start + 300);
        const values = Prisma.join(group.map(({ message, next }) => Prisma.sql`(
          ${message.id}, ${next.subject}, ${next.body}, ${message.subject}, ${message.body}
        )`));
        const updated = await tx.$executeRaw(Prisma.sql`
          UPDATE "OutreachMessage" AS message
          SET "subject" = correction."newSubject",
              "body" = correction."newBody"
          FROM (VALUES ${values}) AS correction(
            "id", "newSubject", "newBody", "oldSubject", "oldBody"
          )
          WHERE message."id" = correction."id"
            AND message."lane" = 'EMAIL'
            AND message."state" IN ('DRAFT', 'QUEUED', 'SUPPRESSED')
            AND message."sentAt" IS NULL
            AND message."deliveryState" IS NULL
            AND message."subject" IS NOT DISTINCT FROM correction."oldSubject"
            AND message."body" = correction."oldBody"
        `);
        if (updated !== group.length) {
          throw new Error('A draft changed during the repair. Every update was rolled back.');
        }
      }
      if (!template) throw new Error('The approved campaign template is missing. Every update was rolled back.');
      if (!template.approvedAt || template.approvedWording !== L.wordingFingerprint()) {
        await L.approveTemplate(tx, L.FIRST_CONTACT, 'Russ');
      }
    }
    return { counts, campaignApproval: {
      currentlyMatchesCorrectedWording: Boolean(template && template.approvedAt
        && template.approvedWording === L.wordingFingerprint()),
      willRefreshOnUpdate: doIt,
    }, examples: changes.slice(0, 5).map(({ message, next }) => ({
      business: message.prospect.name,
      beforeSubject: message.subject,
      afterSubject: next.subject,
      beforeGreeting: String(message.body || '').split('\n')[0],
      afterGreeting: String(next.body || '').split('\n')[0],
    })) };
  }, { timeout: 120000, isolationLevel: doIt ? 'Serializable' : 'RepeatableRead' });
  console.log(JSON.stringify({ mode: doIt ? 'updated' : 'preview', ...result }, null, 2));
}

if (require.main === module) run().catch((error) => {
  console.error(`Email draft repair stopped: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.$disconnect());

module.exports = { greetingName, removeGreetingNameFromSubject, planChange };
