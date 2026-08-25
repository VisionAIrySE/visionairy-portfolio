// One-way callback calendar. Zero credentials, zero network: each promised
// callback becomes one .ics file in data/callbacks/ — double-click imports it
// into Outlook (or any calendar). Write-only by construction: this module has
// no read or list operation against any calendar. When a direct Outlook
// connection is wanted later, this is the single wiring point.
const fs = require('fs');
const path = require('path');

const CALLBACK_DIR = path.resolve(__dirname, '../../../data/callbacks');

function icsFor(prospect, when) {
  const dt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const uid = `hoursback-${prospect.id}-${dt(when)}`;
  return { uid, body: [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HoursBack//callbacks//EN', 'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${dt(new Date(when))}`, `DTSTART:${dt(new Date(when))}`,
    `SUMMARY:Call ${prospect.name}`,
    `DESCRIPTION:Promised callback — ${prospect.name}\\nPhone: ${prospect.phone || 'none on file'}`,
    'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n') };
}

// Exactly one entry per promised callback; replaying the same promise
// overwrites the same file rather than duplicating it.
function writeCallback(prospect, when) {
  fs.mkdirSync(CALLBACK_DIR, { recursive: true });
  const { uid, body } = icsFor(prospect, new Date(when));
  const file = path.join(CALLBACK_DIR, `${uid}.ics`);
  fs.writeFileSync(file, body);
  return file;
}

exports.CALLBACK_DIR = CALLBACK_DIR;
exports.writeCallback = writeCallback;
