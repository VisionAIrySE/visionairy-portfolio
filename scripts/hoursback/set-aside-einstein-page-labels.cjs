#!/usr/bin/env node
// Specific, reversible production correction. Execute only after Russ
// approves setting aside Einstein's 29 known service/location contact rows.
const fs = require('node:fs');
const path = require('node:path');
for (const line of fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
const { PrismaClient } = require('@prisma/client');
const { plausiblePersonName } = require('../../src/hoursback/crm/names.js');
const db = new PrismaClient();
const EINSTEIN_ID = 'cmt956rje02yet7s79q86at0c';
const CREATED_FROM = new Date('2026-08-31T22:23:42.000Z');
const CREATED_TO = new Date('2026-08-31T22:24:03.000Z');
const EXPECTED = 29;

(async () => {
  if (!process.argv.includes('--do-it')) {
    throw new Error('This production correction requires a separate, specific approval and --do-it. Nothing changed.');
  }
  const result = await db.$transaction(async (tx) => {
    const business = await tx.prospect.findUnique({
      where: { id: EINSTEIN_ID }, select: { name: true },
    });
    if (!business || business.name !== 'Einstein Heating and Cooling') {
      throw new Error('The intended business record changed. Nothing was set aside.');
    }
    const rows = await tx.contact.findMany({ where: {
      prospectId: EINSTEIN_ID, source: 'WEBSITE', setAsideAt: null,
      createdAt: { gte: CREATED_FROM, lte: CREATED_TO },
    }, select: {
      id: true, name: true, email: true, phone: true, role: true,
      linkedIn: true, foundOn: true,
    } });
    const isPageLabel = (row) => !row.email && !row.phone && !row.role
      && !row.linkedIn && !plausiblePersonName(row.name)
      && /^https:\/\/einsteinheatingandcooling\.com\//i.test(row.foundOn || '');
    if (rows.length !== EXPECTED || !rows.every(isPageLabel)) {
      throw new Error(`Expected exactly ${EXPECTED} unchanged service/location labels, found ${rows.length}. Nothing was set aside.`);
    }
    const updated = await tx.contact.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, setAsideAt: null },
      data: {
        setAsideAt: new Date(),
        setAsideReason: 'Website reader mistook a service or location label for a person; verified on Einstein site 2026-09-15',
        isPrimary: false,
      },
    });
    if (updated.count !== EXPECTED) {
      throw new Error(`Only ${updated.count} of ${EXPECTED} rows changed; transaction rolled back.`);
    }
    const remaining = await tx.contact.findMany({ where: {
      prospectId: EINSTEIN_ID, setAsideAt: null,
    }, select: { name: true, email: true, isPrimary: true } });
    if (remaining.length !== 1 || remaining[0].name !== 'Alvin') {
      throw new Error('The remaining active contact was not exactly Alvin; transaction rolled back.');
    }
    return { setAside: updated.count, activeContact: remaining[0].name,
      activeContactHasEmail: Boolean(remaining[0].email) };
  }, { timeout: 30000 });
  console.log(JSON.stringify(result));
})().catch((error) => {
  console.error(`Einstein contact correction stopped: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
