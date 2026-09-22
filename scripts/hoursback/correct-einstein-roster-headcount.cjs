#!/usr/bin/env node
// Specific production correction. Russ must approve this staff-count update
// separately from setting aside the website's service/location labels.
const fs = require('node:fs');
const path = require('node:path');
for (const line of fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
const { PrismaClient } = require('@prisma/client');
const { scoreFor, ownerCountsFor } = require('../../src/hoursback/refresh.js');
const db = require('../../src/hoursback/crm/productLegacyScope.js').legacyClient(new PrismaClient(),{enabled:process.env.CRM_PRODUCT_PREVIEW==='1'});
const BUSINESS_ID = 'cmt956rje02yet7s79q86at0c';

(async () => {
  if (!process.argv.includes('--do-it')) {
    throw new Error('This production headcount correction requires separate, specific approval and --do-it. Nothing changed.');
  }
  const report = await db.$transaction(async (tx) => {
    const before = await tx.prospect.findUnique({ where: { id: BUSINESS_ID } });
    if (!before || before.name !== 'Einstein Heating and Cooling'
        || before.employeeCount !== 21 || before.employeeCountManualValue !== null
        || before.headcountStatus !== 'RESOLVED'
        || before.headcountPublishedAs !== '21 people named on their own site'
        || before.headcountSourceUrl !== 'https://einsteinheatingandcooling.com/contact/') {
      throw new Error('Einstein staff-count evidence differs from the audited record; nothing changed.');
    }
    const active = await tx.contact.findMany({ where: { prospectId: BUSINESS_ID,
      setAsideAt: null }, select: { name: true } });
    const archived = await tx.contact.count({ where: { prospectId: BUSINESS_ID,
      setAsideAt: { not: null } } });
    if (active.length !== 1 || active[0].name !== 'Alvin' || archived !== 29) {
      throw new Error('Einstein contact correction is no longer in its verified state; nothing changed.');
    }
    const after = await tx.prospect.update({ where: { id: BUSINESS_ID }, data: {
      employeeCount: null,
      headcountStatus: 'UNRESOLVED_NOT_PUBLISHED',
      headcountPublishedAs: null,
      headcountSourceUrl: null,
      segment: null,
    } });
    const scored = scoreFor(after, await ownerCountsFor(tx, after));
    await tx.prospect.update({ where: { id: BUSINESS_ID }, data: {
      automationScore: scored.score,
      scoreEvidence: JSON.stringify(scored.evidence),
    } });
    const settled = await tx.prospect.findUnique({ where: { id: BUSINESS_ID },
      select: { employeeCount: true, headcountStatus: true, headcountPublishedAs: true,
        headcountSourceUrl: true, automationScore: true, auditFee: true,
        guaranteedHours: true } });
    if (settled.employeeCount !== null || settled.headcountPublishedAs !== null
        || settled.headcountSourceUrl !== null || settled.automationScore !== scored.score) {
      throw new Error('Einstein correction did not settle exactly; transaction rolled back.');
    }
    return { staffCount: 'unknown', score: settled.automationScore,
      standardOfferFee: settled.auditFee, standardOfferHours: settled.guaranteedHours,
      activeContacts: active.length, archivedLabels: archived };
  }, { timeout: 30000 });
  console.log(JSON.stringify(report));
})().catch((error) => {
  console.error(`Einstein staff-count correction stopped: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
