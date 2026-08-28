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
//
// No time promised means no reminder. Without this it wrote one dated 1st
// January 1970 — a real reminder, for a real business, at a date that would
// sit at the very top of the calendar forever. Found by a check, 2026-08-25.
function writeCallback(prospect, when) {
  if (when === null || when === undefined || when === '') return null;
  const at = new Date(when);
  if (Number.isNaN(at.getTime())) return null;
  fs.mkdirSync(CALLBACK_DIR, { recursive: true });
  const { uid, body } = icsFor(prospect, at);
  const file = path.join(CALLBACK_DIR, `${uid}.ics`);
  fs.writeFileSync(file, body);
  return file;
}

// The appointment itself, so the CRM can hand one straight to a browser
// rather than only writing it to disk.
exports.icsFor = icsFor;
exports.CALLBACK_DIR = CALLBACK_DIR;
exports.writeCallback = writeCallback;
