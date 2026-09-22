'use strict';

const fs = require('node:fs');
const path = require('node:path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync(process.env.CRM_ENV_FILE || '.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}

const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const PEOPLE = [
  {
    prospectId: 'cmuby2ptp0005t7iwkupdz66a', membershipId: 'cmuby2pxv0007t7iwgg3i40xk',
    company: "Denver's Best Vending", email: 'stephen@denversbestvending.com', name: 'Stephen',
    foundOn: 'https://denversbestvending.com/', evidence: 'The company website publishes the address as its contact, and identifies Stephen by name.'
  },
  {
    prospectId: 'cmuby2vpg002it7iwismyygxo', membershipId: 'cmuby2vtj002kt7iw79jxsv5s',
    company: 'Tassi Vending', email: 'badr@tassivending.com', name: 'Badr Tassi',
    foundOn: 'https://tassivending.com/', evidence: 'The company website publishes the address and identifies Badr Tassi by name.'
  },
  {
    prospectId: 'cmuby2ys7003rt7iwidbcrblt', membershipId: 'cmuby2ywg003tt7iwlvxjm54j',
    company: 'TGL Vending', email: 'jeremy@tglvending.com', name: 'Jeremy Thompson',
    foundOn: 'https://tglvending.com/', evidence: 'The company website publishes the address and identifies Jeremy Thompson by name.'
  }
];
const INBOXES = [
  {
    prospectId: 'cmuby3cu9009gt7iwk3s39mlv', membershipId: 'cmuby3cyf009it7iwybjnfihr',
    company: 'Vendco Vending', email: 'vendco@vendcovending.com',
    foundOn: 'https://vendcovending.com/services/coffee-machines/', evidence: 'Published in the company website Contact Us section.'
  },
  {
    prospectId: 'cmuby2xre003ct7iw0uw01psp', membershipId: 'cmuby2xvh003et7iwo87d9fpi',
    company: 'Vending Source', email: 'vendingsource.net@gmail.com',
    foundOn: 'https://vendingsource.net/', evidence: 'Published with the company address and phone in the website footer.'
  }
];
const ALL = [...PEOPLE, ...INBOXES];
const counters = async tx => ({
  selectedRecipients: await tx.productRecipient.count({ where: { productId: 'stockerai', selected: true } }),
  productRecipients: await tx.productRecipient.count({ where: { productId: 'stockerai' } }),
  campaigns: await tx.productEnrollment.count({ where: { productId: 'stockerai' } }),
  productMessages: await tx.productMessage.count({ where: { productId: 'stockerai' } }),
  legacyMessages: await tx.outreachMessage.count(),
  legacySelectedInboxes: await tx.prospect.count({ where: { emailInboxSelected: true } }),
  legacySelectedContacts: await tx.contact.count({ where: { isPrimary: true } })
});

async function work(tx) {
  if (!APPLY) {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const mode = await tx.$queryRawUnsafe('SHOW transaction_read_only');
    if (mode[0]?.transaction_read_only !== 'on') throw new Error('Read-only preview was not confirmed');
  }
  const memberships = await tx.productProspect.findMany({
    where: { productId: 'stockerai', prospectId: { in: ALL.map(x => x.prospectId) } },
    select: { id: true, prospectId: true, prospect: { select: { name: true, email: true, emailManualValue: true, contacts: { where: { email: { in: PEOPLE.map(x => x.email) } }, select: { id: true, name: true, email: true, setAsideAt: true } } } } }
  });
  if (memberships.length !== ALL.length) throw new Error('The exact five-company repair cohort is no longer present');
  const byProspect = new Map(memberships.map(row => [row.prospectId, row]));
  for (const item of ALL) {
    const row = byProspect.get(item.prospectId);
    if (row.id !== item.membershipId || row.prospect.name !== item.company || row.prospect.emailManualValue !== null) throw new Error(`Production identity changed for ${item.company}; nothing was written`);
  }
  for (const item of PEOPLE) {
    const p = byProspect.get(item.prospectId).prospect;
    const existing = p.contacts.find(contact => contact.email?.toLowerCase() === item.email);
    if (p.email !== item.email || (existing && (existing.name !== item.name || existing.setAsideAt))) throw new Error(`Recipient evidence changed for ${item.company}; nothing was written`);
  }
  for (const item of INBOXES) if (byProspect.get(item.prospectId).prospect.email !== null) throw new Error(`An inbox is already present for ${item.company}; nothing was written`);

  const before = await counters(tx);
  if (APPLY) {
    for (const item of PEOPLE) {
      await tx.contact.upsert({
        where: { prospectId_email: { prospectId: item.prospectId, email: item.email } },
        create: { prospectId: item.prospectId, name: item.name, email: item.email, source: 'WEBSITE', foundOn: item.foundOn },
        update: { name: item.name, source: 'WEBSITE', foundOn: item.foundOn }
      });
      const changed = await tx.prospect.updateMany({
        where: { id: item.prospectId, email: item.email, emailManualValue: null },
        data: { email: null, emailStatus: null, emailConfidence: null }
      });
      if (changed.count !== 1) throw new Error(`Could not safely move ${item.company}'s named address`);
    }
    for (const item of INBOXES) {
      const changed = await tx.prospect.updateMany({
        where: { id: item.prospectId, email: null, emailManualValue: null },
        data: { email: item.email, emailStatus: 'READ_FROM_THEIR_SITE', emailConfidence: 1 }
      });
      if (changed.count !== 1) throw new Error(`Could not safely add ${item.company}'s inbox`);
    }
    await tx.productActivity.createMany({
      data: ALL.map(item => ({
        productId: 'stockerai', membershipId: item.membershipId,
        eventKey: `recipient-evidence-2026-09-21:${item.prospectId}`, kind: 'NOTE', occurredAt: new Date(),
        notes: `${item.evidence} Saved from ${item.foundOn} No recipient was selected.`
      })),
      skipDuplicates: true
    });
  }
  const after = await counters(tx);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Recipient selection, campaign, message, or legacy counts changed; transaction rolled back');
  return {
    mode: APPLY ? 'APPLIED' : 'READ_ONLY_PREVIEW',
    namedContacts: PEOPLE.map(({ company, name, email, foundOn }) => ({ company, name, email, foundOn })),
    companyInboxes: INBOXES.map(({ company, email, foundOn }) => ({ company, email, foundOn })),
    intentionallyNotAdded: [
      'filler@godaddy.com is template junk, not a company address',
      'info@mcliff.com appears only in the privacy policy; careers@mcliff.com is not a sales contact',
      'alternate and third-party addresses remain review evidence rather than being turned into people'
    ],
    protectedCounts: after
  };
}

(async () => {
  try {
    const result = APPLY
      ? await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 120000 })
      : await db.$transaction(work);
    console.log(JSON.stringify(result, null, 2));
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
