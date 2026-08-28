// Reading a call transcript so nobody has to type while talking.
//
// The free fifteen minutes happens on Google Meet, which writes a transcript
// into Russ's Drive. He should not be filling in a form during a conversation
// with a business owner — the recording already has everything (Russ,
// 2026-08-27: "There needs to be a way to capture and feed into the CRM").
//
// The CRM cannot reach Drive on its own: it runs on a server with no Google
// sign-in. So the transcript is pasted in. That works with any recorder — Meet,
// Fathom, Otter, or somebody's own notes typed up afterwards — and needs no
// permissions from anybody.
//
// What this does NOT do: decide anything. It pulls out what was said and leaves
// every judgement to Russ. A wrong guess quietly filled into the record is worse
// than a blank one, because a blank asks to be filled and a wrong one does not.

const WORD_NUMBERS = {
  half: 0.5, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40,
};

// How much of a week goes into this. A range becomes its middle; a figure given
// per day becomes per week, because "two hours a day" is ten hours a week and
// recording it as two would understate the whole offer.
function hoursFrom(text) {
  const t = String(text || '');
  const range = t.match(/(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:a|per|each)?\s*week/i);
  if (range) {
    const a = Number(range[1]); const b = Number(range[2]);
    return { hours: Math.round(((a + b) / 2) * 10) / 10, said: range[0], howRead: 'the middle of the range they gave' };
  }
  // People say ranges in words as often as in figures: "four to six hours a
  // week" was falling through to the single-number pattern and being recorded
  // as six, the top of the range rather than the middle (2026-08-27).
  const wordRange = t.match(/\b(half|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty)\s*(?:to|-|–|or)\s*(half|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty)\s*(?:hours?|hrs?)\s*(?:a|per|each)?\s*week/i);
  if (wordRange) {
    const a = WORD_NUMBERS[wordRange[1].toLowerCase()];
    const b = WORD_NUMBERS[wordRange[2].toLowerCase()];
    return { hours: Math.round(((a + b) / 2) * 10) / 10, said: wordRange[0], howRead: 'the middle of the range they gave' };
  }
  const perDay = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:a|per|each)\s*day/i);
  if (perDay) {
    return { hours: Number(perDay[1]) * 5, said: perDay[0], howRead: 'said per day, counted across a five-day week' };
  }
  const perWeek = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:a|per|each)\s*week/i);
  if (perWeek) return { hours: Number(perWeek[1]), said: perWeek[0], howRead: 'said straight' };

  // "half a day a week", "a couple of hours"
  const words = t.match(/\b(half|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty)\s+(?:a\s+)?(hours?|hrs?|days?)\s*(?:a|per|each)?\s*(week|day)?/i);
  if (words) {
    const n = WORD_NUMBERS[words[1].toLowerCase()];
    const isDay = /day/i.test(words[2]);
    const perDayToo = /day/i.test(words[3] || '');
    let hours = isDay ? n * 8 : n;
    if (perDayToo) hours *= 5;
    return { hours: Math.round(hours * 10) / 10, said: words[0], howRead: isDay ? 'given in days, counted as eight-hour days' : 'said in words' };
  }
  return { hours: null, said: null, howRead: null };
}

// Which of the three things they said they wanted. Only counted where they say
// it plainly — a passing mention of "customers" is not an answer.
const LEVER_SAID = {
  money: /\b(more (?:money|revenue|work|jobs|business)|bring(?:ing)? in more|win more|grow(?:ing)? the business|more leads|not enough work|phone (?:is|isn't) ringing)\b/i,
  hours: /\b(hours? back|time back|free up (?:my|our) time|get my (?:time|life) back|too much (?:admin|paperwork)|drowning in|buried in|stop doing it (?:by hand|manually))\b/i,
  customers: /\b(happier customers|better (?:experience|service)|customers? complain|response time|look after (?:our|my) (?:customers|clients) better)\b/i,
};

function leverFrom(text) {
  const t = String(text || '');
  const hits = Object.entries(LEVER_SAID)
    .map(([k, re]) => [k, (t.match(new RegExp(re.source, 'gi')) || []).length])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!hits.length) return { lever: null, why: 'nobody said plainly which of the three they wanted' };
  if (hits.length > 1 && hits[0][1] === hits[1][1]) {
    return { lever: null, why: `they talked about ${hits.map((h) => h[0]).join(' and ')} equally — you decide` };
  }
  return { lever: hits[0][0], why: `they came back to it ${hits[0][1]} time${hits[0][1] === 1 ? '' : 's'}` };
}

// Who does the work, where a name or a role is given.
function whoFrom(text) {
  const t = String(text || '');
  // Case-insensitive on the lead-in, because a sentence usually starts with it:
  // "That's Marilyn, our office manager" was missed entirely while the pattern
  // only matched a lower-case "that's" (2026-08-27).
  // Two shapes only, and each has to LOOK like a person.
  //
  // A capitalised name: "That's Marilyn". Case matters here — making the whole
  // pattern case-insensitive turned "it's the hours back" into a person called
  // "the hours", which is worse than finding nobody at all (2026-08-27).
  const name = t.match(/(?:[Tt]hat(?:'s|’s| is)|[Ii]t(?:'s|’s| is)|[Mm]ostly|[Uu]sually|[Nn]ormally)\s+(?:down to\s+|on\s+|handled by\s+)?([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)/);
  // Or a role, said in any case: "that's usually my office manager".
  const role = t.match(/\b(?:my|our)\s+(wife|husband|office manager|assistant|bookkeeper|admin|receptionist|daughter|son|front desk|operations manager|practice manager)\b/i);
  if (name) return name[1].trim();
  if (role) return role[0].trim();
  return null;
}

// Sentences worth keeping, in their own words. Everything Russ would quote back
// to them, and nothing he would not.
function momentsFrom(text, mySide = /russ|wright|visionairy/i) {
  // Only what the OTHER person said. Russ's own questions were coming back as
  // things worth quoting to them, which is worse than useless (2026-08-27).
  const sentences = String(text || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .flatMap((line) => {
      const speaker = line.match(/^\s*([\w .'-]{1,30}):\s*(.*)$/);
      if (speaker) {
        if (mySide.test(speaker[1])) return [];
        return speaker[2].split(/(?<=[.?!])\s+/);
      }
      return line.split(/(?<=[.?!])\s+/);
    })
    .map((s) => s.trim())
    // A question mark means somebody was asking, and on this call that is Russ.
    .filter((s) => s.length > 25 && s.length < 320 && !s.trim().endsWith('?'));
  const WORTH_KEEPING = /\b(hours?|every (?:day|week)|all the time|takes (?:me|us|forever)|by hand|manually|spreadsheet|nobody|no ?one|falls? through|chas(?:e|ing)|re-?typ|twice|again and again|drives? me (?:mad|crazy)|pain|nightmare|used to|wish|if only|can't|cannot|struggle)\b/i;
  return sentences.filter((s) => WORTH_KEEPING.test(s)).slice(0, 12);
}

// Everything a transcript gives up, with nothing decided.
//
// Every field carries HOW it was read, so Russ can see the sentence behind a
// number rather than trusting it. A figure with no sentence behind it is the
// thing that gets quoted to a client and cannot be defended.
function readTranscript(text) {
  const t = String(text || '');
  if (t.trim().length < 100) {
    return { usable: false, why: 'too short to be a call' };
  }
  const hours = hoursFrom(t);
  const lever = leverFrom(t);
  const who = whoFrom(t);
  return {
    usable: true,
    words: t.split(/\s+/).length,
    hours: hours.hours,
    hoursSaid: hours.said,
    hoursHowRead: hours.howRead,
    lever: lever.lever,
    leverWhy: lever.why,
    who,
    moments: momentsFrom(t),
    // What it could NOT find, so the gaps are visible rather than silent.
    couldNotFind: [
      hours.hours === null && 'how many hours a week',
      !lever.lever && 'which of the three they wanted',
      !who && 'who does the work',
    ].filter(Boolean),
  };
}

module.exports = { readTranscript, hoursFrom, leverFrom, whoFrom, momentsFrom, LEVER_SAID };
