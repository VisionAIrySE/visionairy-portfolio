// Customer-facing email uses ordinary punctuation. Long dashes can look like
// generated copy and are easy to reintroduce through old drafts or manual
// edits, so normalize them both while writing and immediately before sending.
function withoutLongDashes(value, { subject = false } = {}) {
  if (value == null) return value;
  const replacement = subject ? ': ' : ', ';
  return String(value)
    .replace(/\s*[\u2014\u2013]\s*/g, replacement)
    .replace(subject ? /:\s*:/g : /,\s*,/g, subject ? ':' : ',')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function emailFields({ subject, body }) {
  return {
    subject: withoutLongDashes(subject, { subject: true }),
    body: withoutLongDashes(body),
  };
}

module.exports = { withoutLongDashes, emailFields };
