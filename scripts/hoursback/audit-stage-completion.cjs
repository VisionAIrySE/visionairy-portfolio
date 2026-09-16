#!/usr/bin/env node
// Read-only end-of-stage inventory. Compare eligible work with saved full
// website pages, evidence, recipient campaigns, queued choices and delivery.
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const L = require('../../src/hoursback/crm/lanes.js');
const J = require('../../src/hoursback/crm/judgeTheLetter.js');
const C = require('../../src/hoursback/crm/campaign.js');
const D = require('../../src/hoursback/crm/delivery.js');
const I = require('../../src/hoursback/crm/inboxSelection.js');
const { presentationProblem } = require('../../src/hoursback/crm/signature.js');

const option = (name, fallback = '') => {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const stage = option('stage', 'all');
const scope = option('scope', 'selected');
const targetIds = new Set(option('ids').split(',').map((id) => id.trim()).filter(Boolean));
const version = option('reader-version');
const show = Math.max(0, Number(option('show', '10')));
const strict = process.argv.includes('--strict');
const sendCutoff = option('send-cutoff');
const cutAt = sendCutoff ? new Date(sendCutoff) : null;
const normalize = (value) => String(value || '').trim().toLowerCase();
const isFirst = L.isFirstContactMessage;
const stages = new Set(['research', 'evidence', 'drafts', 'lineup', 'send', 'all']);
const scopes = new Set(['selected', 'all', 'batch', 'ids']);
const includesStage = (name) => stage === 'all' || stage === name;

function addIssue(report, name, business, recipient, reason) {
  report.counts[name] = (report.counts[name] || 0) + 1;
  if (report.examples.length < show) report.examples.push({
    kind: name, business: business.name, recipient, reason,
  });
}

function auditBusiness(business, report) {
  const full = business.readings.filter((r) => r.reader === 'understand-businesses'
    && r.source === 'website' && r.outcome === 'read'
    && r.pages.some((page) => String(page.text || '').trim()));
  const attempted = business.readings.filter((r) => r.reader === 'understand-businesses'
    && r.source === 'website' && (!version || r.readerVersion === version));
  const latestAttempt = attempted.reduce((best, row) => !best
    || new Date(row.startedAt) > new Date(best.startedAt) ? row : best, null);
  const jobsReading = business.readings.filter((r) => r.reader === 'noticing'
    && r.source === 'website' && r.outcome === 'read'
    && r.findings.some((finding) => finding.field === 'noticingJob')).sort((a, b) =>
    new Date(b.startedAt) - new Date(a.startedAt))[0];
  const jobs = jobsReading ? jobsReading.findings.filter((finding) =>
    finding.field === 'noticingJob').map((finding) => finding.value).filter(Boolean) : [];
  const contacts = business.contacts.filter((contact) => contact.email
    && !contact.setAsideAt && !contact.bouncedAt);
  const selected = contacts.filter((contact) => contact.isPrimary);
  const isWebsiteEligible = Boolean(business.websiteManualValue || business.website);
  const isActive = !business.doNotContact && !business.repliedAt
    && !['CUSTOMER', 'EXPANDED_CUSTOMER', 'DORMANT'].includes(business.stage);
  const inScope = scope === 'ids' ? targetIds.has(business.id)
    : scope === 'batch' ? attempted.length > 0
    : scope === 'selected' ? selected.length > 0 && isActive
      : isActive && isWebsiteEligible;
  if (!inScope) return;
  report.counts.businesses += 1;
  if (scope === 'batch') report.counts.attemptedSites += 1;
  if (includesStage('research')) {
    if (!isWebsiteEligible) {
      addIssue(report, 'noWebsite', business, '', 'No website is saved; a person must supply or confirm one.');
    } else if (!full.length) {
      const exception = latestAttempt && ['unreachable', 'no_website'].includes(latestAttempt.outcome);
      addIssue(report, exception ? 'researchException' : 'needsFullRead',
        business, '', exception
          ? `Full reader could not use the website (${latestAttempt.outcome}); review or retry it.`
          : 'No full website pages with saved words; research is still owed.');
    } else report.counts.fullyRead += 1;
  }
  if (!full.length) return;
  if (includesStage('evidence')) {
    if (!jobs.length) addIssue(report, 'missingEvidence', business, '',
      'Full pages exist, but no saved company-specific message areas were found.');
    else report.counts.evidenceReady += 1;
  }
  if (!jobs.length) return;

  const inbox = normalize(business.emailManualValue || business.email);
  const alternateUnnamed = contacts.filter((contact) => !contact.name
    && !contact.isPrimary && normalize(contact.email) !== inbox
    && !business.messages.some((message) => isFirst(message)
      && normalize(message.sentTo) === normalize(contact.email)));
  if (includesStage('drafts') && alternateUnnamed.length) {
    for (const contact of alternateUnnamed) addIssue(report,
      'alternateAddressNeedsVerification', business, contact.email,
      'An unnamed, unselected alternate inbox is saved. Confirm who uses it before treating it as another recipient campaign.');
  }
  const expected = scope === 'all' || scope === 'batch' || scope === 'ids'
    ? contacts.filter((contact) => !alternateUnnamed.includes(contact)) : selected;
  if (inbox && !business.emailBouncedAt
    && (business.emailInboxSelected || scope === 'all' || scope === 'batch' || scope === 'ids')
    && !expected.some((contact) => normalize(contact.email) === inbox)
    && (business.emailInboxSelected || !contacts.length)) {
    expected.push({ name: 'shared business inbox', email: inbox, role: null });
  }
  if (!expected.length && includesStage('drafts')) {
    addIssue(report, 'needsRecipient', business, '',
      contacts.length ? 'Contacts have addresses, but none is selected.'
        : 'No usable contact address or business inbox is saved.');
  }
  const firsts = L.canonicalFirstMessages(business.messages);
  const active = L.activeUnsentMessages(business.messages);
  for (const recipient of expected) {
    const address = normalize(recipient.email);
    const label = recipient.name || address;
    const first = firsts.find((message) => normalize(message.sentTo) === address);
    if (first && (first.sentAt || first.deliveryState === 'DELIVERED'
      || first.state === 'REPLIED')) continue;
    if (first && first.state === 'SUPPRESSED' && !recipient.isPrimary) {
      report.counts.pausedCampaigns += 1;
      continue;
    }
    report.counts.expectedCampaigns += 1;
    const chain = [first, ...[2, 3, 4].map((touch) => active.find((message) =>
      message.openedWith === `touch_${touch}` && normalize(message.sentTo) === address))];
    const missing = chain.map((message, index) => !message ? index : -1).filter((index) => index >= 0);
    if (missing.length) {
      if (includesStage('drafts')) addIssue(report, 'missingMessages', business, label,
        `Missing message positions: ${missing.map((index) => index + 1).join(', ')}.`);
      continue;
    }
    if (includesStage('drafts')) {
      const invalid = chain.find((message) => !J.judgeStored(message,
        { jobs, roleTitle: recipient.role || null }).ok);
      if (invalid) {
        addIssue(report, 'badMessage', business, label,
          `Message ${invalid.openedWith || 'first'} failed the shared writing check.`);
        continue;
      }
      report.counts.completeCampaigns += 1;
    }
    if (includesStage('lineup') && (recipient.isPrimary
      || address === I.selectedInboxAddress(business))) {
      if (first.state === 'DRAFT') report.counts.selectedDrafts += 1;
      if (first.state === 'QUEUED') report.counts.selectedQueued += 1;
    }
  }
}

async function auditQueue(tx, report) {
  if (!includesStage('lineup') && !includesStage('send')) return;
  const rows = await tx.outreachMessage.findMany({
    where: { lane: 'EMAIL', state: { in: ['QUEUED', 'SENDING'] } },
    select: {
      id: true, prospectId: true, lane: true, state: true,
      openedWith: true, sentTo: true, deliveryTo: true, deliveryState: true,
      prospect: { select: {
        name: true, website: true, websiteManualValue: true,
        doNotContact: true, repliedAt: true, email: true, emailManualValue: true,
        emailInboxSelected: true, emailBouncedAt: true,
        contacts: { select: {
          email: true, isPrimary: true, bouncedAt: true, setAsideAt: true,
        } },
        readings: { where: {
          source: 'website', reader: 'understand-businesses', outcome: 'read',
          pages: { some: { AND: [
            { text: { not: null } }, { NOT: { text: '' } },
          ] } },
        }, select: { id: true }, take: 1 },
        messages: { where: { lane: 'EMAIL' }, select: {
          id: true, prospectId: true, lane: true, state: true,
          openedWith: true, sentTo: true, deliveryState: true,
        } },
      } },
    },
  });
  report.counts.queuedOrClaimed = rows.length;
  for (const message of rows) {
    const business = message.prospect;
    const target = normalize(message.deliveryTo || message.sentTo);
    const blocked = D.blockedReason({ ...message, prospect: business });
    if (blocked) addIssue(report, 'queuedWrong', business, target, blocked);
    else if (target && !I.selectedPersonAddresses(business).includes(target)
      && I.selectedInboxAddress(business) !== target) addIssue(report,
      'queuedWrong', business, target, 'Email is lined up for an unchecked recipient.');
    else if (isFirst(message) && (business.websiteManualValue || business.website)
      && !business.readings.length) addIssue(report, 'queuedWrong', business, target,
        'First email was lined up without saved full website pages.');
    else if (isFirst(message) && !L.campaignHasCompleteSequence({ ...message,
      prospect: business })) addIssue(report, 'queuedWrong', business, target,
        'First email was lined up without all four saved messages.');
  }
}

async function auditSent(tx, report) {
  if (!includesStage('send')) return;
  const sent = await tx.outreachMessage.findMany({
    where: { lane: 'EMAIL', state: 'SENT' },
    select: {
      id: true, prospectId: true, openedWith: true, sentTo: true, sentAt: true,
      deliveryState: true, providerMessageId: true, deliveryHtml: true,
      deliveryText: true, deliverySubject: true,
      prospect: {
        select: { name: true, repliedAt: true, emailBouncedAt: true,
          contacts: { select: { email: true, bouncedAt: true } } },
      },
    },
  });
  const seen = new Set();
  const allKeys = new Map();
  for (const message of sent) {
    const target = normalize(message.sentTo);
    const slot = isFirst({ ...message, lane: 'EMAIL' }) ? 'first' : message.openedWith;
    const key = `${message.prospectId}|${target}|${slot}`;
    allKeys.set(key, (allKeys.get(key) || 0) + 1);
  }
  report.counts.sent = sent.length;
  for (const message of sent) {
    if (cutAt && (!message.sentAt || new Date(message.sentAt) < cutAt)) continue;
    const business = message.prospect;
    const target = normalize(message.sentTo);
    const slot = isFirst({ ...message, lane: 'EMAIL' }) ? 'first' : message.openedWith;
    const key = `${message.prospectId}|${target}|${slot}`;
    if (seen.has(key) || allKeys.get(key) > 1) addIssue(report, 'sentAnomaly', business, target,
      'More than one message was marked sent for the same recipient and position.');
    seen.add(key);
    if (!message.sentAt || !message.providerMessageId || message.deliveryState !== 'DELIVERED') {
      addIssue(report, 'sentAnomaly', business, target,
        'Sent record is missing its time, provider receipt, or confirmed delivery state.');
    }
    const contact = business.contacts.find((c) => normalize(c.email) === target);
    const stopAt = [business.repliedAt, business.emailBouncedAt,
      contact && contact.bouncedAt].filter(Boolean).map((date) => new Date(date));
    if (message.sentAt && stopAt.some((date) => date <= new Date(message.sentAt))) {
      addIssue(report, 'sentAfterStop', business, target,
        'Message was sent after a reply or bounce was recorded.');
    }
    if (message.deliveryHtml && message.deliveryText) {
      const problem = presentationProblem({ html: message.deliveryHtml,
        text: message.deliveryText });
      if (problem) addIssue(report, 'sentPresentationIssue', business, target, problem);
    }
  }
  const queued = await tx.outreachMessage.findMany({
    where: { lane: 'EMAIL', state: { in: ['QUEUED', 'SENDING'] } },
    select: { state: true, queuedAt: true, deliveryState: true },
  });
  report.counts.queuedStillWaiting = queued.filter((m) => m.state === 'QUEUED').length;
  report.counts.deliveryUncertain = queued.filter((m) =>
    m.deliveryState === 'UNCONFIRMED' || m.deliveryState === 'ATTEMPTING').length;
  if (cutAt) {
    const overdue = queued.filter((m) => m.queuedAt && new Date(m.queuedAt) <= cutAt
      && m.state === 'QUEUED' && !['FAILED', 'UNCONFIRMED'].includes(m.deliveryState));
    report.counts.overdueQueued = overdue.length;
    if (overdue.length) addIssue(report, 'missedSend', { name: 'sending queue' }, '',
      `${overdue.length} messages were already queued at the send cutoff and remain unsent.`);
  }
}

async function main() {
  if (!stages.has(stage) || !scopes.has(scope) || (scope === 'batch' && !version)
    || (scope === 'ids' && !targetIds.size)
    || (cutAt && Number.isNaN(cutAt.getTime())) || !Number.isFinite(show)) {
    throw new Error('Stage, scope, reader version, show count, or send cutoff is invalid.');
  }
  if (!process.env.DATABASE_URL) {
    const line = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8')
      .split(/\r?\n/).find((entry) => entry.startsWith('DATABASE_URL='));
    if (!line) throw new Error('Database address is not configured.');
    process.env.DATABASE_URL = line.slice(13).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  const db = new PrismaClient();
  try {
    const report = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await C.loadHisWordings(tx);
      const report = { stage, scope, version,
        counts: { businesses: 0, attemptedSites: 0, fullyRead: 0,
          evidenceReady: 0, expectedCampaigns: 0, completeCampaigns: 0,
          pausedCampaigns: 0, selectedDrafts: 0, selectedQueued: 0 }, examples: [] };
      let cursor;
      while (stage !== 'send') {
        const rows = await tx.prospect.findMany({
          where: { ...(scope === 'batch' ? { readings: { some: {
            reader: 'understand-businesses', readerVersion: version,
          } } } : {}),
          ...(scope === 'ids' ? { id: { in: [...targetIds] } } : {}),
          ...(scope === 'all' ? {
            doNotContact: false, repliedAt: null,
            stage: { notIn: ['CUSTOMER', 'EXPANDED_CUSTOMER', 'DORMANT'] },
            OR: [{ website: { not: null } },
              { websiteManualValue: { not: null } }],
          } : {}),
          ...(scope === 'selected' ? { OR: [{ contacts: { some: {
            isPrimary: true, email: { not: null }, bouncedAt: null, setAsideAt: null,
          } } }, { emailInboxSelected: true }] } : {}) },
          orderBy: { id: 'asc' }, take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: {
            id: true, name: true, website: true, websiteManualValue: true,
            stage: true, doNotContact: true, repliedAt: true,
            email: true, emailManualValue: true, emailInboxSelected: true,
            emailBouncedAt: true,
            contacts: { select: {
              name: true, role: true, email: true, bouncedAt: true,
              setAsideAt: true, isPrimary: true,
            } },
            readings: { where: { source: 'website', reader: { in: [
              'understand-businesses', 'noticing',
            ] } }, select: {
              source: true, reader: true, readerVersion: true, outcome: true,
              startedAt: true,
              pages: { select: { text: true } },
              findings: { where: { field: 'noticingJob' },
                select: { field: true, value: true } },
            } },
            messages: { where: { lane: 'EMAIL' }, select: {
              id: true, prospectId: true, lane: true, state: true,
              openedWith: true, sentTo: true, subject: true, body: true,
              sentAt: true, deliveryState: true, editedAt: true,
            } },
          },
        });
        if (!rows.length) break;
        for (const business of rows) auditBusiness(business, report);
        cursor = rows[rows.length - 1].id;
      }
      await auditQueue(tx, report);
      await auditSent(tx, report);
      return report;
    }, { timeout: 120000, isolationLevel: 'RepeatableRead' });
    console.log(JSON.stringify(report));
    const actionable = ['needsFullRead', 'missingEvidence', 'missingMessages',
      'badMessage', 'queuedWrong', 'sentAfterStop', 'missedSend',
      'sentAnomaly', 'sentPresentationIssue'];
    if (strict && (actionable.some((name) => report.counts[name])
      || (scope === 'batch' && report.counts.attemptedSites === 0)
      || (scope === 'ids' && report.counts.businesses === 0))) process.exitCode = 2;
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) main().catch((error) => {
  console.error(`Completion audit stopped: ${error.message}`);
  process.exitCode = 1;
});
module.exports = { auditBusiness };
