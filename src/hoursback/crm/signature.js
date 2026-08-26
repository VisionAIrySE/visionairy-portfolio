// Russ's sign-off, one place, used by every message.
//
// The logo travels inside the message rather than being fetched from the web,
// so it shows even for people whose mail blocks images, and opening the
// message tells us nothing about them. No tagline: the logo already says
// Success Engineering, and naming a category would only narrow him.

const fs = require('fs');
const path = require('path');

const LOGO_WIDTH = 170;   // chosen against the three sizes, 2026-08-25
const LOGO_HEIGHT = 108;  // the logo's own proportions at that width
const GREEN = '#5a8f0f';
const LEAF = '#c3e86b';

const CONTACT = {
  name: 'Russ Wright',
  phone: '503-621-8000',
  email: 'russ@visionairy.biz',
  site: 'https://www.visionairy.biz',
  siteLabel: 'VisionAIry.biz',
  linkedIn: 'https://www.linkedin.com/in/russ-wright-00575030b/',
};

let _logo = null;
function logoDataUri() {
  if (_logo !== null) return _logo;
  try {
    const p = path.join(process.cwd(), 'public/assets/visionairy-logo.png');
    _logo = `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
  } catch { _logo = ''; }   // no logo on disk: the words still send
  return _logo;
}

function signatureHtml() {
  const src = logoDataUri();
  const logo = src
    ? `<tr><td style="padding-bottom:8px"><img src="${src}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="VisionAIry — Success Engineering" style="display:block;border:0"></td></tr>`
    : '';
  return `<table cellpadding="0" cellspacing="0" border="0" style="font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
  ${logo}
  <tr><td style="border-top:2px solid ${LEAF};padding-top:8px">
    <div style="padding-bottom:10px">Best regards,</div>
    <div style="font-weight:700">${CONTACT.name}</div>
    <div>Founder</div>
    <div>VisionAIry</div>
    <div style="padding-top:6px">
      <a href="tel:+1${CONTACT.phone.replace(/\D/g, '')}" style="color:#1a1a1a;text-decoration:none">${CONTACT.phone}</a> &nbsp;·&nbsp;
      <a href="mailto:${CONTACT.email}" style="color:#1a1a1a;text-decoration:none">${CONTACT.email}</a>
    </div>
    <div style="padding-top:2px">
      <a href="${CONTACT.site}" style="color:${GREEN};text-decoration:none">${CONTACT.siteLabel}</a> &nbsp;·&nbsp;
      <a href="${CONTACT.linkedIn}" style="color:${GREEN};text-decoration:none">LinkedIn</a>
    </div>
  </td></tr>
</table>`;
}

// The same sign-off for anywhere that cannot show pictures.
function signatureText() {
  return `Best regards,
${CONTACT.name}
Founder
VisionAIry
${CONTACT.phone} · ${CONTACT.email}
${CONTACT.siteLabel} · ${CONTACT.linkedIn}`;
}

// Turn the written message into the version a mail app draws, sign-off and
// all. The words are never rewritten here — only wrapped.
function toHtmlEmail(plainBody) {
  // Everything from "Best," onward is the sign-off; the drawn version
  // renders it, so the typed one is trimmed first.
  const withoutSignOff = String(plainBody).split(/\n\nBest\b/)[0];
  const paragraphs = withoutSignOff.split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
    .join('\n');
  return `<div style="font:15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:600px">
${paragraphs}
${signatureHtml()}
</div>`;
}

module.exports = {
  CONTACT, LOGO_WIDTH, LOGO_HEIGHT, GREEN, LEAF,
  logoDataUri, signatureHtml, signatureText, toHtmlEmail,
};
