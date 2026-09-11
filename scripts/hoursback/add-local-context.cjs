// Restore Russ's Central Oregon connection to existing unsent campaign mail.
//
// Future messages receive the local line from campaign.js. This one-time,
// idempotent update changes only the identity paragraph in unsent email rows;
// company-specific passages and every sent or in-delivery message stay intact.
//
// Preview only:
//   node scripts/hoursback/add-local-context.cjs
// Apply:
//   node scripts/hoursback/add-local-context.cjs --do-it
const { PrismaClient } = require('@prisma/client');

const LOCAL = /\b(?:based here in|based in|local to|here in) Central Oregon\b/i;
const IDENTITY = /^(I'm Russ Wright(?:, founder of| with) VisionAIry)(?=[.,])/i;

function hasLocalContext(body) {
  return LOCAL.test(String(body || ''));
}

function addLocalContext(body) {
  const text = String(body || '').replace(/\r\n?/g, '\n').trim();
  if (!text || hasLocalContext(text)) return text;
  const blocks = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const identity = blocks.findIndex((part) => IDENTITY.test(part));
  if (identity < 0) return text;
  blocks[identity] = blocks[identity].replace(IDENTITY, '$1, based here in Central Oregon');
  return blocks.join('\n\n');
}

async function run(db, { apply = false } = {}) {
  const rows = await db.outreachMessage.findMany({
    where: {
      lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] }, sentAt: null,
      deliveryState: null,
    },
    select: { id: true, body: true },
    orderBy: { createdAt: 'asc' },
  });
  let changed = 0; let already = 0; let noIdentity = 0;
  for (const message of rows) {
    const body = addLocalContext(message.body);
    const before = String(message.body || '').replace(/\r\n?/g, '\n').trim();
    if (body === before) {
      if (hasLocalContext(before)) already += 1;
      else noIdentity += 1;
      continue;
    }
    changed += 1;
    if (apply) {
      await db.outreachMessage.update({
        where: { id: message.id },
        data: { body },
      });
    }
  }
  return { eligible: rows.length, changed, already, noIdentity, applied: apply ? changed : 0 };
}

if (require.main === module) {
  const db = new PrismaClient();
  run(db, { apply: process.argv.includes('--do-it') })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}

module.exports = { addLocalContext, hasLocalContext, run };
