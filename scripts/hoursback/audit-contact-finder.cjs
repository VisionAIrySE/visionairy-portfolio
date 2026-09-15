#!/usr/bin/env node
// Read-only inventory of website contact names that cannot be trusted as
// people. A candidate is evidence for review, never permission to delete it.
const fs = require('node:fs');
const path = require('node:path');
for (const line of fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
const { PrismaClient } = require('@prisma/client');
const { plausiblePersonName, obviousWebsiteRecipientLabel } = require('../../src/hoursback/crm/names.js');
const db = new PrismaClient();
const businessId = (process.argv.find((arg) => arg.startsWith('--business-id=')) || '').slice(14);
const readerVersion = (process.argv.find((arg) => arg.startsWith('--reader-version=')) || '').slice(17);
const strict = process.argv.includes('--strict');

(async () => {
  if (businessId && readerVersion) throw new Error('Choose a business or a reading cohort, not both.');
  const report = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const batch = readerVersion ? await tx.reading.groupBy({
      by: ['prospectId'], where: {
        reader: 'understand-businesses', readerVersion,
      },
    }) : [];
    const batchIds = batch.map((row) => row.prospectId);
    const counts = { websiteContacts: 0, suspiciousMultiword: 0,
      noContactEvidence: 0, selectedSuspicious: 0,
      selectedNoContactEvidence: 0, selectedSuspiciousWithEmail: 0,
      selectedClearPageLabelsWithEmail: 0,
      selectedQueuedOrSending: 0, selectedAlreadySent: 0,
      oneWordNeedsVerification: 0 };
    const examples = [];
    const selectedAddresses = new Set();
    const selectedWithEmail = new Map();
    const selectedBusinessIds = new Set();
    let cursor;
    for (;;) {
      const rows = await tx.contact.findMany({
        where: { source: 'WEBSITE', setAsideAt: null, name: { not: null },
          ...(businessId ? { prospectId: businessId } : {}),
          ...(readerVersion ? { prospectId: { in: batchIds } } : {}) },
        select: { id: true, prospectId: true, name: true, role: true, email: true, phone: true,
          linkedIn: true, foundOn: true, isPrimary: true,
          prospect: { select: { name: true } } },
        orderBy: { id: 'asc' }, take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      for (const row of rows) {
        counts.websiteContacts += 1;
        const name = String(row.name || '').trim();
        const hasContactEvidence = Boolean(row.email || row.phone || row.role || row.linkedIn);
        if (name.split(/\s+/).length === 1 && !hasContactEvidence) {
          counts.oneWordNeedsVerification += 1;
          continue;
        }
        if (name.split(/\s+/).length < 2 || plausiblePersonName(name)) continue;
        counts.suspiciousMultiword += 1;
        if (!hasContactEvidence) counts.noContactEvidence += 1;
        if (row.isPrimary) counts.selectedSuspicious += 1;
        if (row.isPrimary && !hasContactEvidence) counts.selectedNoContactEvidence += 1;
        if (row.isPrimary && row.email) {
          counts.selectedSuspiciousWithEmail += 1;
          if (obviousWebsiteRecipientLabel(name)) counts.selectedClearPageLabelsWithEmail += 1;
          selectedBusinessIds.add(row.prospectId);
          const key = `${row.prospectId}|${row.email.trim().toLowerCase()}`;
          selectedAddresses.add(key);
          selectedWithEmail.set(key, { business: row.prospect.name, name });
        }
        if (examples.length < 20) examples.push({ business: row.prospect.name,
          name, selected: row.isPrimary, hasContactEvidence,
          sourcePage: row.foundOn });
      }
      cursor = rows[rows.length - 1].id;
    }
    const businessIds = [...selectedBusinessIds];
    const deliveryExamples = [];
    for (let start = 0; start < businessIds.length; start += 100) {
      const messages = await tx.outreachMessage.findMany({
        where: { prospectId: { in: businessIds.slice(start, start + 100) },
          lane: 'EMAIL', state: { in: ['QUEUED', 'SENDING', 'SENT'] } },
        select: { prospectId: true, sentTo: true, state: true },
      });
      for (const message of messages) {
        const key = `${message.prospectId}|${String(message.sentTo || '').trim().toLowerCase()}`;
        if (!selectedAddresses.has(key)) continue;
        if (message.state === 'SENT') counts.selectedAlreadySent += 1;
        else counts.selectedQueuedOrSending += 1;
        if (deliveryExamples.length < 20) deliveryExamples.push({
          ...selectedWithEmail.get(key), state: message.state,
        });
      }
    }
    return { counts, examples, deliveryExamples,
      selectedWithEmail: [...selectedWithEmail.values()] };
  }, { timeout: 120000, isolationLevel: 'RepeatableRead' });
  console.log(JSON.stringify({ businessId: businessId || null,
    readerVersion: readerVersion || null, ...report }));
  if (strict && (report.counts.selectedNoContactEvidence
      || report.counts.selectedClearPageLabelsWithEmail)) process.exitCode = 2;
})().catch((error) => {
  console.error(`Contact finder audit stopped: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
