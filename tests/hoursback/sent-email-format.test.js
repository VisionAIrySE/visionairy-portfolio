const test = require('node:test');
const assert = require('node:assert/strict');
const { bodyWithoutSignOff, presentationProblem, toHtmlEmail } = require('../../src/hoursback/crm/signature.js');

const letter = `Hi Kristi,\n\nI'm Russ, based in Central Oregon.\n\nAt no cost, I'll send one recommendation.\n\nBest regards,\n\nRuss Wright\nFounder\nVisionAIry`;

for (const newline of ['\n', '\r\n']) {
  test(`sent email renders paragraphs and one signature with ${JSON.stringify(newline)} line endings`, () => {
    const body = letter.replace(/\n/g, newline);
    const html = toHtmlEmail(body);
    assert.equal((html.match(/<p style=/g) || []).length, 3);
    assert.equal((html.match(/Best regards,/g) || []).length, 1);
    assert.equal((html.match(/Russ Wright/g) || []).length, 1);
    assert.doesNotMatch(html, /&lt;br\s*\/?&gt;|&lt;br>/i);
    assert.match(html, /<strong>At no cost<\/strong>/);
    assert.equal(bodyWithoutSignOff(body), letter.split('\n\nBest regards,')[0]);
    const founder = html.indexOf('<div>Founder</div>');
    const company = html.indexOf('<div>VisionAIry</div>');
    const logo = html.indexOf('<img src=');
    assert.ok(founder < company && company < logo, 'logo follows Founder and VisionAIry');
  });
}

test('typed angle brackets remain text and actual line breaks remain markup', () => {
  const html = toHtmlEmail('A < B\nC > D');
  assert.match(html, /A &lt; B<br>C &gt; D/);
});

test('the final send check rejects repeated signatures', () => {
  assert.match(presentationProblem({ html: '<p>Best regards,</p><p>Best regards,</p>', text: 'Hello' }),
    /sign-off appears twice/);
});
