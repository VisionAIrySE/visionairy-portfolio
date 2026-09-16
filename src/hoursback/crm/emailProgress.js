const L = require('./lanes.js');

const campaignKey = (prospectId, address) =>
  `${prospectId}|${String(address || '').trim().toLowerCase()}`;

function deliveredFirstKeys(prospects) {
  return new Set((prospects || []).flatMap((prospect) =>
    (prospect.messages || []).filter((message) =>
      L.isFirstContactMessage(message) && message.state === 'SENT'
      && message.sentAt && message.providerMessageId
      && message.deliveryState === 'DELIVERED')
      .map((message) => campaignKey(prospect.id, message.sentTo))));
}

function pendingFirsts(prospect, chosenMessages, delivered) {
  return (chosenMessages || []).filter(L.isFirstContactMessage)
    .filter((message) => ['DRAFT', 'QUEUED'].includes(message.state)
      && !delivered.has(campaignKey(prospect.id, message.sentTo)));
}

module.exports = { campaignKey, deliveredFirstKeys, pendingFirsts };
