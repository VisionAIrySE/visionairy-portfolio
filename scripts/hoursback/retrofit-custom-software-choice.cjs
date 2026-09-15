#!/usr/bin/env node
// Add the approved buy/connect/build option to existing day-eight drafts.
// Default is a read-only preview; --do-it updates only untouched, unsent
// drafts whose existing wording already passes the one campaign judge.
const fs = require('fs');
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const { PrismaClient } = require('@prisma/client');
const C = require('../../src/hoursback/crm/campaign.js');
const J = require('../../src/hoursback/crm/judgeTheLetter.js');
const { pick } = require('../../src/hoursback/crm/variants.js');
const db = new PrismaClient();
const DO_IT = process.argv.includes('--do-it');
const SHOW_SKIPPED = process.argv.includes('--show-skipped');

function addSoftwareChoice(body, businessName, slots = C.slotsOfTheMessage()) {
  const blocks = J.tidy(body).split(/\n{2,}/);
  if (blocks.some((block) => slots.customSoftwareChoice.includes(block.trim()))) {
    return { body, reason: 'already included' };
  }
  let offerIndex = blocks.findIndex((block) => slots.ask8.includes(block.trim()));
  let repairedOffer = false;
  if (offerIndex < 0) {
    const signOffIndex = blocks.findIndex((block) => /^Best regards,?$/i.test(block.trim()));
    const knownContext = blocks.some((block) => slots.followContext.includes(block.trim()));
    const alreadyHasDifferentOffer = blocks.some((block) => /fifteen.minutes?|free.{0,30}review|no obligation/i.test(block));
    if (signOffIndex < 0 || !knownContext || alreadyHasDifferentOffer) {
      return { body, reason: 'the day-eight offer wording was not recognized' };
    }
    // Some older machine drafts stopped after the company-specific passage
    // and never included the free offer. Complete them with the same approved
    // day-eight offer rather than leaving an attractive email without a CTA.
    blocks.splice(signOffIndex, 0, pick(slots.ask8, businessName, 'ask8'));
    offerIndex = signOffIndex;
    repairedOffer = true;
  }
  const wording = pick(slots.customSoftwareChoice, businessName, 'customSoftwareChoice');
  blocks.splice(offerIndex, 0, wording);
  return { body: blocks.join('\n\n'), reason: null, wording, repairedOffer };
}

async function run() {
  await C.loadHisWordings(db);
  const slots = C.slotsOfTheMessage();
  const rows = await db.outreachMessage.findMany({
    where: {
      lane: 'EMAIL', openedWith: 'touch_3',
      state: { in: ['DRAFT', 'QUEUED'] },
      sentAt: null, editedAt: null, deliveryState: null,
    },
    select: {
      id: true, body: true, prospectId: true,
      prospect: { select: { name: true, nameManualValue: true, doNotContact: true } },
    },
  });
  let added = 0; let already = 0; let skipped = 0; let raced = 0;
  let repairedOffers = 0;
  const reasons = new Map();
  const examples = [];
  const skippedExamples = [];
  for (const row of rows) {
    if (row.prospect.doNotContact) { skipped += 1; continue; }
    const name = row.prospect.nameManualValue || row.prospect.name;
    const next = addSoftwareChoice(row.body, name, slots);
    if (next.reason === 'already included') { already += 1; continue; }
    if (next.reason) {
      skipped += 1;
      reasons.set(next.reason, (reasons.get(next.reason) || 0) + 1);
      if (SHOW_SKIPPED) skippedExamples.push(`${name}: ${J.tidy(row.body).split(/\n{2,}/).filter(Boolean).map((block) => block.slice(0, 120)).join(' | ')}`);
      continue;
    }
    const before = J.judgeStored({ body: row.body, openedWith: 'touch_3' });
    const after = J.judgeStored({ body: next.body, openedWith: 'touch_3' });
    if (!before.ok || !after.ok) {
      skipped += 1;
      const why = !before.ok ? `existing draft: ${before.why}` : `new draft: ${after.why}`;
      reasons.set(why, (reasons.get(why) || 0) + 1);
      continue;
    }
    if (examples.length < 3) examples.push(`${name}: ${next.wording}`);
    if (DO_IT) {
      const result = await db.outreachMessage.updateMany({
        where: {
          id: row.id, body: row.body,
          state: { in: ['DRAFT', 'QUEUED'] },
          sentAt: null, editedAt: null, deliveryState: null,
        },
        data: { body: next.body },
      });
      if (!result.count) { raced += 1; continue; }
    }
    added += 1;
    if (next.repairedOffer) repairedOffers += 1;
  }
  console.log(`${DO_IT ? 'UPDATED' : 'PREVIEW'} ${added} day-eight drafts`);
  console.log(`Older drafts whose missing free offer was repaired: ${repairedOffers}`);
  console.log(`Already included: ${already}; safely skipped: ${skipped}; changed during run: ${raced}`);
  for (const [reason, count] of reasons) console.log(`Skipped ${count}: ${reason}`);
  for (const example of examples) console.log(`Example ${example}`);
  for (const example of skippedExamples) console.log(`Older exception ${example}`);
}

if (require.main === module) run().catch((error) => {
  console.error(`Custom-software retrofit failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.$disconnect());

module.exports = { addSoftwareChoice };
