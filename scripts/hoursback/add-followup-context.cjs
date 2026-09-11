// Add the one-sentence VisionAIry reminder to existing unsent follow-ups.
//
// The sequence writer now adds this sentence to every new follow-up. This
// one-time backfill brings drafts already in the database into the same shape
// without asking a model to rewrite their company-specific passages.
//
// Preview only:
//   node scripts/hoursback/add-followup-context.cjs
// Apply:
//   node scripts/hoursback/add-followup-context.cjs --do-it
const { PrismaClient } = require('@prisma/client');
const C = require('../../src/hoursback/crm/campaign.js');
const { pick } = require('../../src/hoursback/crm/variants.js');

function hasContext(body) {
  return /\bI'm Russ Wright\b[^\n]{0,180}\bVisionAIry\b/i.test(String(body || ''));
}

function addContext(body, businessName) {
  const text = String(body || '').replace(/\r\n?/g, '\n').trim();
  if (!text || hasContext(text)) return text;
  const blocks = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const context = pick(C.FOLLOWUP_CONTEXT, businessName || '', 'followContext');
  const greeting = blocks.length && /^(hi|hello|dear)\b/i.test(blocks[0]);
  blocks.splice(greeting ? 1 : 0, 0, context);
  return blocks.join('\n\n');
}

async function run(db, { apply = false } = {}) {
  const rows = await db.outreachMessage.findMany({
    where: {
      lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] }, sentAt: null,
      deliveryState: null, openedWith: { startsWith: 'touch_' },
    },
    include: { prospect: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  let changed = 0; let already = 0;
  for (const message of rows) {
    const body = addContext(message.body, message.prospect.name);
    if (body === String(message.body || '').replace(/\r\n?/g, '\n').trim()) {
      already += 1;
      continue;
    }
    changed += 1;
    if (apply) {
      await db.outreachMessage.update({
        where: { id: message.id },
        data: { body, editedAt: null },
      });
    }
  }
  return { eligible: rows.length, changed, already, applied: apply ? changed : 0 };
}

if (require.main === module) {
  const db = new PrismaClient();
  run(db, { apply: process.argv.includes('--do-it') })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}

module.exports = { addContext, hasContext, run };
