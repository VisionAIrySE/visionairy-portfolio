// Receive customer replies through Resend and pass them on to Russ.
//
// Customer replies go to a dedicated subdomain such as reply.visionairy.biz.
// Resend tells the CRM immediately, the CRM stops every queued follow-up, and
// then the original message and attachments are forwarded to Russ's normal
// business inbox. The existing visionairy.biz mailbox routing is untouched.

function configuration(env = process.env) {
  const apiKey = String(env.RESEND_INBOUND_API_KEY || '').trim();
  const forwardTo = String(env.HOURSBACK_REPLY_FORWARD_TO || '').trim();
  const forwardFrom = String(env.HOURSBACK_EMAIL_FROM || '').trim();
  const missing = [
    !apiKey && 'RESEND_INBOUND_API_KEY',
    !forwardTo && 'HOURSBACK_REPLY_FORWARD_TO',
    !forwardFrom && 'HOURSBACK_EMAIL_FROM',
  ].filter(Boolean);
  return { configured: missing.length === 0, missing, apiKey, forwardTo, forwardFrom };
}

function assertOutboundProtected(env = process.env) {
  const replyTo = String(env.HOURSBACK_EMAIL_REPLY_TO || '').trim();
  const enabled = env.HOURSBACK_REPLY_MONITOR_ENABLED === 'true';
  if (!replyTo || !enabled) {
    const error = new Error('automatic email is blocked until the tested reply route is enabled');
    error.code = 'REPLY_MONITOR_NOT_ENABLED';
    throw error;
  }
  return { configured: true, replyTo };
}

function assertConfigured(env = process.env) {
  const config = configuration(env);
  if (!config.configured) {
    const error = new Error(`reply monitoring is not configured (${config.missing.join(', ')})`);
    error.code = 'REPLY_MONITOR_NOT_CONFIGURED';
    throw error;
  }
  return config;
}

async function resendJson(url, apiKey, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    ...options,
    headers: { authorization: `Bearer ${apiKey}`, ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`reply forwarding service refused the request (${response.status})`);
  return response.json();
}

async function attachmentContent(emailId, attachment, apiKey, fetchImpl) {
  const detail = await resendJson(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachment.id)}`,
    apiKey, {}, fetchImpl,
  );
  if (!detail.download_url) throw new Error('a reply attachment had no download address');
  const response = await fetchImpl(detail.download_url);
  if (!response.ok) throw new Error(`a reply attachment could not be retrieved (${response.status})`);
  return {
    filename: attachment.filename || 'attachment',
    content: Buffer.from(await response.arrayBuffer()).toString('base64'),
  };
}

async function forwardReceived(event, options = {}) {
  const config = options.config || assertConfigured(options.env);
  const fetchImpl = options.fetch || fetch;
  const emailId = event && event.data && event.data.email_id;
  if (!emailId) throw new Error('received reply had no email identifier');
  const email = await resendJson(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    config.apiKey, {}, fetchImpl,
  );
  const attachments = [];
  for (const attachment of email.attachments || []) {
    attachments.push(await attachmentContent(emailId, attachment, config.apiKey, fetchImpl));
  }
  const originalFrom = email.from || event.data.from;
  const subject = email.subject || event.data.subject || 'Customer reply';
  const payload = {
    from: config.forwardFrom,
    to: [config.forwardTo],
    subject: `Customer reply: ${subject}`,
    text: `Reply from ${originalFrom}\n\n${email.text || 'This reply contains HTML or attachments.'}`,
    html: `<p><strong>Reply from ${String(originalFrom || '').replace(/[<>&"]/g, '')}</strong></p>${email.html || ''}`,
    reply_to: originalFrom,
    attachments,
  };
  return resendJson('https://api.resend.com/emails', config.apiKey, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': `reply-forward-${emailId}` },
    body: JSON.stringify(payload),
  }, fetchImpl);
}

module.exports = {
  configuration, assertConfigured, assertOutboundProtected,
  resendJson, attachmentContent, forwardReceived,
};
