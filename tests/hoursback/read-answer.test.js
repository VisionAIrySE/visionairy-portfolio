// READING WHAT THE MODEL SENT BACK.
//
// Three businesses in one batch of nineteen kept their generic trade sentence
// because the reader put a sentence in front of its JSON, or wrapped it in a
// code fence, or left a comma where none belonged. Two of the three had
// thirty pages of their own words on file. Every repair below is to the
// punctuation around what the model said — never to what it said.

const test = require('node:test');
const assert = require('node:assert');
const { readAnswer, braceRuns, repair } = require('../../src/hoursback/readAnswer.js');

test('plain JSON reads as itself', () => {
  assert.deepEqual(readAnswer('{"a":1}').answer, { a: 1 });
});

test('a sentence in front of the JSON does not hide it', () => {
  const r = readAnswer('Here is what I found:\n{"areas":[{"job":"booking calls"}]}');
  assert.equal(r.answer.areas[0].job, 'booking calls');
});

test('a sentence after the JSON does not hide it either', () => {
  assert.deepEqual(readAnswer('{"a":1}\n\nI hope that helps.').answer, { a: 1 });
});

test('a code fence is opened', () => {
  assert.deepEqual(readAnswer('```json\n{"a":2}\n```').answer, { a: 2 });
});

test('a trailing comma is a typing habit, not a different answer', () => {
  const r = readAnswer('{"a":1,"b":2,}');
  assert.deepEqual(r.answer, { a: 1, b: 2 });
  assert.equal(r.repaired, true);
});

test("the model's own curly quotes are straightened", () => {
  assert.deepEqual(readAnswer('{“a”:1}').answer, { a: 1 });
});

test('a line break inside a sentence becomes a space, and the sentence survives whole', () => {
  const r = readAnswer('{"sentence":"You take the call\nand book it in."}');
  assert.equal(r.answer.sentence, 'You take the call and book it in.');
});

test('a brace inside their own words never breaks the reading', () => {
  const r = readAnswer('{"quote":"we use {curly} braces on the sign"}');
  assert.equal(r.answer.quote, 'we use {curly} braces on the sign');
});

test('the whole object is preferred over anything nested inside it', () => {
  const r = readAnswer('{"areas":[{"job":"x"}],"note":"y"}');
  assert.deepEqual(Object.keys(r.answer).sort(), ['areas', 'note']);
  assert.ok(braceRuns('{"a":{"b":1}}')[0].length > braceRuns('{"a":{"b":1}}')[1].length);
});

// The two ways it genuinely fails are DIFFERENT problems and are never
// reported as one: nothing that looks like JSON at all, versus something that
// does and could not be read even after repair.
test('prose with no JSON in it says exactly that', () => {
  const r = readAnswer('I am sorry, I cannot tell from this page.');
  assert.equal(r.answer, null);
  assert.match(r.why, /no JSON/);
});

test('something JSON-shaped that cannot be read says so, and shows what it saw', () => {
  const r = readAnswer('{ this is not json at all ::: }');
  assert.equal(r.answer, null);
  assert.match(r.why, /could not be read even after repair/);
  assert.match(r.why, /this is not json/);
});

test('nothing is invented: a repair changes punctuation, never a value', () => {
  const r = readAnswer('{"job":"chasing organizers","type":"document_collection",}');
  assert.equal(r.answer.job, 'chasing organizers');
  assert.equal(r.answer.type, 'document_collection');
  assert.equal(Object.keys(r.answer).length, 2);
  // and the repair itself leaves an apostrophe in their words alone
  assert.match(repair(`{"q":"the owner's own words"}`), /owner's own words/);
});
