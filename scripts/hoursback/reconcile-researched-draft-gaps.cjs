#!/usr/bin/env node
// Inventory complete website reads whose valid contact or shared-inbox
// campaign is missing one or more message slots. Preview is read-only.
// Approved execution fills empty slots only and never lines up or sends mail.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
for (const line of fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
const { PrismaClient } = require('@prisma/client');
const L = require('../../src/hoursback/crm/lanes.js');
const db = new PrismaClient();
const value = (name, fallback = '') => {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const doIt = process.argv.includes('--do-it');
const expected = Number(value('expected-count', '0'));
const ceiling = Number(value('ceiling', '5'));
const model = value('model', 'openai/gpt-5.6-luna');
const normalize = (s) => String(s || '').trim().toLowerCase();

async function inventory() {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const read = await tx.reading.groupBy({
      by: ['prospectId'], where: {
        source: 'website', reader: 'understand-businesses', outcome: 'read',
        pages: { some: { AND: [
          { text: { not: null } }, { NOT: { text: '' } },
        ] } },
      },
    });
    const ids = read.map((row) => row.prospectId);
    const businesses = await tx.prospect.findMany({
      where: { id: { in: ids }, doNotContact: false, repliedAt: null },
      select: {
        id: true, email: true, emailManualValue: true, emailBouncedAt: true,
        contacts: {
          where: { setAsideAt: null, bouncedAt: null },
          select: { name: true, email: true, isPrimary: true },
        },
      },
    });
    const messages = await tx.outreachMessage.findMany({
      where: { prospectId: { in: businesses.map((b) => b.id) }, lane: 'EMAIL' },
      select: {
        id: true, prospectId: true, sentTo: true, openedWith: true,
        lane: true, state: true, sentAt: true, deliveryState: true,
        suppressedReason: true,
      },
    });
    const byBusiness = new Map();
    for (const row of messages) {
      const group = byBusiness.get(row.prospectId) || [];
      group.push(row);
      byBusiness.set(row.prospectId, group);
    }
    const targets = [];
    let missingFirst = 0;
    let heldSuppressed = 0;
    const heldReasons = {};
    let missingFollowUps = 0;
    for (const b of businesses) {
      const valid = b.contacts.filter((contact) => normalize(contact.email));
      const selected = valid.filter((contact) => contact.isPrimary);
      const named = valid.some((contact) => contact.name);
      const addresses = new Set(valid.map((contact) => normalize(contact.email)));
      const inbox = normalize(b.emailManualValue || b.email);
      if (!selected.length && !named && inbox && !b.emailBouncedAt
        && !addresses.has(inbox)) {
        addresses.add(inbox);
      }
      const rows = byBusiness.get(b.id) || [];
      const firsts = L.canonicalFirstMessages(rows);
      for (const address of addresses) {
        if (rows.some((row) => normalize(row.sentTo) === address
          && (row.sentAt || row.deliveryState))) continue;
        const first = firsts.find((row) => normalize(row.sentTo) === address);
        if (first && (first.sentAt || first.deliveryState || first.state === 'REPLIED')) continue;
        if (first && first.state === 'SUPPRESSED') {
          heldSuppressed += 1;
          const reason = first.suppressedReason || 'reason not recorded';
          heldReasons[reason] = (heldReasons[reason] || 0) + 1;
          continue;
        }
        const campaignRows = rows.filter((row) => normalize(row.sentTo) === address
          && ['DRAFT', 'QUEUED', 'SENT', 'REPLIED'].includes(row.state));
        const hasFirst = Boolean(first && campaignRows.includes(first));
        const complete = hasFirst && [2, 3, 4].every((touch) => campaignRows.some(
          (row) => row.openedWith === `touch_${touch}`));
        if (complete) continue;
        if (!hasFirst) missingFirst += 1;
        else missingFollowUps += 1;
        targets.push({ prospectId: b.id, sentTo: address });
      }
    }
    return { fullyResearched: ids.length, targets, missingFirst,
      missingFollowUps, heldSuppressed, heldReasons };
  }, { timeout: 30000 });
}

(async () => {
  if (!Number.isFinite(expected) || !Number.isFinite(ceiling) || ceiling <= 0) {
    throw new Error('The expected count and spending ceiling must be valid numbers.');
  }
  const before = await inventory();
  console.log(`${before.targets.length} incomplete campaigns at fully researched businesses; ${before.missingFirst} lack a first email, ${before.missingFollowUps} lack follow-ups, and ${before.heldSuppressed} intentionally suppressed campaigns are held.`);
  if (before.heldSuppressed) console.log(`Held reasons: ${JSON.stringify(before.heldReasons)}`);
  if (!doIt) {
    console.log('Preview only. No draft was changed or lined up.');
    return;
  }
  if (!expected || expected !== before.targets.length) {
    throw new Error(`Repair scope changed. Expected ${expected}, found ${before.targets.length}. Nothing was changed.`);
  }
  const ids = [...new Set(before.targets.map((target) => target.prospectId))];
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(__dirname, 'write-the-whole-sequence.cjs'),
      `--ids=${ids.join(',')}`, '--all-contacts', '--missing-only',
      '--do-it', '--prepare-only', `--openrouter-model=${model}`,
      `--openrouter-ceiling=${ceiling}`,
    ], {
      cwd: path.resolve(__dirname, '../..'), stdio: 'inherit', shell: false,
      env: { ...process.env, HOURSBACK_TARGET_CAMPAIGNS_JSON: JSON.stringify(before.targets) },
    });
    child.once('error', reject);
    child.once('exit', (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) {
    process.exitCode = code;
    return;
  }
  const after = await inventory();
  const remaining = new Set(after.targets.map((target) => `${target.prospectId}|${target.sentTo}`));
  const unresolved = before.targets.filter((target) => remaining.has(`${target.prospectId}|${target.sentTo}`));
  console.log(`${before.targets.length - unresolved.length} campaigns completed; ${unresolved.length} still incomplete. First emails remain drafts.`);
  if (unresolved.length) process.exitCode = 2;
})().catch((error) => {
  console.error(`Reconciliation stopped: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
