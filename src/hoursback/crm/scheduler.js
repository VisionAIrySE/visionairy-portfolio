// One bounded email run for a scheduler. The lane module owns every safety
// rule: approval, suppression, recipient choice, delivery claims and limits.
// This wrapper only puts "queue what is due" and "send what is queued" into
// the order a scheduled job needs.

const L = require('./lanes.js');

async function dailySendRun(db, options = {}) {
  const lanes = options.lanes || L;
  const now = options.now || new Date();
  const limit = Math.min(Number(options.limit || lanes.MAX_PER_RUN || 200), lanes.MAX_PER_RUN || 200);
  const queued = await lanes.queueDueTouches(db, { now, limit });
  const apiKey = options.apiKey || process.env.RESEND_API_KEY;
  const from = options.from || process.env.HOURSBACK_EMAIL_FROM || 'Russ Wright <russ@visionairy.biz>';
  const delivery = await lanes.sendQueuedEmails(db, {
    now,
    limit,
    apiKey,
    from,
    send: options.send,
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
    await sendReport({
      from,
      to: reportTo,
      subject: `Hours Back email run: ${delivery.sent || 0} sent`,
      html: lines.map((line) => `<p>${line}</p>`).join(''),
      text: lines.join('\n'),
      idempotencyKey: `hoursback-run-${now.toISOString().slice(0, 10)}`,
    });
    report.sent = true;
  }
  return { queued, delivery, report };
}

module.exports = { dailySendRun };
