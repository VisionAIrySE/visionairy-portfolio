// One bounded email run for a scheduler. The lane module owns every safety
// rule: approval, suppression, recipient choice, delivery claims and limits.
// This wrapper only puts "queue what is due" and "send what is queued" into
// the order a scheduled job needs.

const L = require('./lanes.js');

async function dailySendRun(db, options = {}) {
  const lanes = options.lanes || L;
  const now = options.now || new Date();
  // Deployment and wording approval are deliberately separate from permission
  // to start customer outreach. Until Russ explicitly enables this switch in
  // Render, the scheduled job does not even queue a production record.
  const customerEmailEnabled = options.customerEmailEnabled === undefined
    ? process.env.HOURSBACK_CUSTOMER_EMAIL_ENABLED === 'true'
    : options.customerEmailEnabled === true;
  if (!customerEmailEnabled) {
    const reason = 'customer email automation is disabled';
    return {
      queued: { first: 0, second: 0, third: 0 },
      delivery: {
        attempted: 0, sent: 0, failed: 0, blocked: 0,
        unconfirmed: 0, recovered: 0, stoppedBecause: reason,
      },
      report: { sent: false, reason },
    };
  }
  const limit = Math.min(Number(options.limit || lanes.MAX_PER_RUN || 200), lanes.MAX_PER_RUN || 200);
  const messageIds = Array.isArray(options.messageIds)
    ? [...new Set(options.messageIds.map((id) => String(id).trim()).filter(Boolean))]
    : null;
  // A named recovery run must touch only the messages it was given. It does
  // not add newly due customer messages to the queue while recovering them.
  const queued = messageIds
    ? { first: 0, second: 0, third: 0 }
    : await lanes.queueDueTouches(db, { now, limit });
  const apiKey = options.apiKey || process.env.RESEND_API_KEY;
  const from = options.from || process.env.HOURSBACK_EMAIL_FROM || 'Russ Wright <russ@visionairy.biz>';
  const delivery = await lanes.sendQueuedEmails(db, {
    now,
    limit,
    apiKey,
    from,
    send: options.send,
    messageIds,
  });
  const reportTo = options.reportTo || process.env.HOURSBACK_REPORT_TO;
  const report = { sent: false, reason: null };
  if (!reportTo) report.reason = 'no report address is set';
  else if (!apiKey) report.reason = 'no sending key is set';
  else {
    const sendReport = options.reportSend || lanes.defaultSender(apiKey);
    const queuedTotal = ['first', 'second', 'third'].reduce((n, key) => n + Number(queued[key] || 0), 0);
    const lines = [
      `Sent: ${delivery.sent || 0}`,
      `Newly due: ${queuedTotal}`,
      `Failed: ${delivery.failed || 0}`,
      `Blocked before delivery: ${delivery.blocked || 0}`,
      `Needs checking: ${delivery.unconfirmed || 0}`,
      `Run ended because: ${delivery.stoppedBecause || 'complete'}`,
    ];
    try {
      await sendReport({
        from,
        to: reportTo,
        subject: `Hours Back email run: ${delivery.sent || 0} sent`,
        html: lines.map((line) => `<p>${line}</p>`).join(''),
        text: lines.join('\n'),
        idempotencyKey: `hoursback-run-${now.toISOString().slice(0, 10)}`,
      });
      report.sent = true;
    } catch (error) {
      report.reason = String(error && error.message || error).slice(0, 500);
    }
  }
  return { queued, delivery, report };
}

module.exports = { dailySendRun };
