'use strict';

function choicesFromForm(form, maximum = 100) {
  const companyIds = [...new Set([].concat(form.company || []).filter(Boolean))]
    .slice(0, maximum);
  return companyIds.map((prospectId) => ({
    prospectId,
    contactIds: [...new Set([].concat(form[`recipient.${prospectId}`] || []).filter(Boolean))],
    chooseInbox: form[`inbox.${prospectId}`] === '1',
  }));
}

async function mapWithConcurrency(items, maximum, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(maximum, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index], index);
    }
  }));
  return results;
}

module.exports = { choicesFromForm, mapWithConcurrency };
