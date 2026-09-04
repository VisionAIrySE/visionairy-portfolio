// CAN THE READER ACTUALLY ANSWER? Asked once, before a night begins.
//
// On the night of 2026-09-03 the reader could not start at all under the
// scheduler, and the run found that out 62 businesses later — by which time it
// had written 62 records saying "failed" and dropped every one of them from
// the list of sites nobody had opened.
//
// So the night now asks one real question first, through exactly the same path
// every later question takes, and prints the answer it got back. No answer,
// no night.
//
//   node scripts/hoursback/reader-check.js

const { makeReaderPool } = require('../../src/hoursback/readerPool.js');

const QUESTION = `Here is a sentence from a business website:

"Hutchinson Plumbing has served Bend since 1998. Call the office to book a visit."

Answer with JSON only, exactly this shape:
{"trade": "<what trade this is>", "booking": "phone" | "online" | "cannot tell"}`;

(async () => {
  const pool = makeReaderPool({ size: 1, hardKillMs: 90000 });
  const began = Date.now();
  const got = await pool.ask(QUESTION);
  const took = Math.round((Date.now() - began) / 1000);
  pool.close();

  if (!got || !got.answer) {
    console.log(`THE READER DID NOT ANSWER after ${took}s — ${got && got.why ? got.why : 'no reason given'}`);
    process.exit(1);
  }
  console.log(`the reader answered in ${took}s: ${JSON.stringify(got.answer)}`);
  process.exit(0);
})();
