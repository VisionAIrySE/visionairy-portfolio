const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../src/hoursback/crm/campaign.js');
const J = require('../../src/hoursback/crm/judgeTheLetter.js');
const W = require('../../scripts/hoursback/write-the-whole-sequence.cjs');
const { addSoftwareChoice } = require('../../scripts/hoursback/retrofit-custom-software-choice.cjs');

const passage = 'If coverage checks wait until a claim is submitted, money can arrive late. Is eligibility the part you would look at first?';
const greeting = 'Hi Pat,';
const seed = 'Wellness Billing LLC';

test('new day-eight letters include the build option and still pass the campaign judge', () => {
  const body = W.buildLetter(3, { greeting, passage, seed });
  assert.match(body, /focused software platform/);
  assert.match(body, /fifteen.minute review|fifteen minutes/);
  assert.equal(J.judgeLetter(body, { day: 8 }).ok, true);
  assert.equal(body.match(/\?/g).length, 1, 'the tailored diagnostic remains the only question');
});

test('every approved platform wording is recognized as context, not a new unsupported company claim', () => {
  const slots = C.slotsOfTheMessage();
  for (const wording of slots.customSoftwareChoice) {
    const body = [greeting, slots.followContext[0], passage, wording, slots.ask8[0], W.buildLetter(4, {
      greeting, passage: 'I would start with the eligibility check and where the next step waits.', seed,
    }).split('\n\n').slice(-1)[0]].join('\n\n');
    const verdict = J.judgeLetter(body, { day: 8 });
    assert.equal(verdict.ok, true, `${wording}: ${verdict.why}`);
  }
});

test('an existing day-eight letter gains the same option once, before the free offer', () => {
  const slots = C.slotsOfTheMessage();
  const choice = slots.customSoftwareChoice[0];
  const oldBody = [greeting, slots.followContext[0], passage, slots.ask8[0], 'Best regards, Russ Wright']
    .join('\n\n');
  const result = addSoftwareChoice(oldBody, seed, slots);
  assert.equal(result.reason, null);
  assert.ok(result.body.indexOf(result.wording) > result.body.indexOf(passage));
  assert.ok(result.body.indexOf(result.wording) < result.body.indexOf(slots.ask8[0]));
  assert.equal(J.judgeLetter(result.body, { day: 8 }).ok, true);
  const again = addSoftwareChoice(result.body, seed, slots);
  assert.equal(again.reason, 'already included');
  assert.equal(again.body, result.body);
  assert.ok(choice.includes('price both paths'));
});

test('an older machine draft missing its offer gains both the platform choice and approved free offer', () => {
  const slots = C.slotsOfTheMessage();
  const body = [greeting, slots.followContext[0], passage, 'Best regards,', 'Russ Wright'].join('\n\n');
  const result = addSoftwareChoice(body, seed, slots);
  assert.equal(result.reason, null);
  assert.equal(result.repairedOffer, true);
  assert.ok(result.body.indexOf(result.wording) < result.body.indexOf('Best regards,'));
  assert.ok(slots.ask8.some((offer) => result.body.includes(offer)));
  assert.equal(J.judgeLetter(result.body, { day: 8 }).ok, true);
});

test('a hand-written offer that is not approved is left unchanged', () => {
  const result = addSoftwareChoice(`${greeting}\n\n${passage}\n\nA hand-written offer.`, seed);
  assert.equal(result.reason, 'the day-eight offer wording was not recognized');
});
