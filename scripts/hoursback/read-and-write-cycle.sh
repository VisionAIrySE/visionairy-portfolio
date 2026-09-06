#!/usr/bin/env bash
# Read fifty websites, write those fifty letters, repeat.
#
# WHY IT IS ONE JOB AND NOT TWO. Reading and writing were separate scripts that
# never called each other, so a night of reading finished and nothing was
# written from it — 138 sites read, 0 letters (2026-09-04). Putting them in one
# loop is the fix: nothing is read that is not written up in the same cycle.
#
# WHO IT WORKS ON. Only businesses with an EMAIL ADDRESS. Reading a site we
# cannot write to costs the same hour and produces a sentence with no letter to
# live in, and nothing goes back for it later. On 2026-09-05 that mistake spent
# an hour and produced five sendable letters (Russ: "it seems you're burning
# tokens on work that is not going to go anywhere").
#
# RUNNING OUT OF ALLOWANCE IS A PAUSE, NOT AN ENDING. It waits ten minutes,
# asks the reader one real question, and carries on the moment it answers. It
# waits all night if it has to: a waiting job costs nothing, and the allowance
# resets on a longer cycle than any ceiling worth putting here.

set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/../.." || exit 1

LOG="${1:-/tmp/hoursback-cycle.log}"
say() { echo "[$(date '+%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

stop_now() { say "asked to stop"; exit 143; }
trap stop_now INT TERM

# WHO IS RUNNING, BY NUMBER — not by anything whose command line merely says
# the name, which called a dead job alive when it was tested (2026-09-05).
PIDFILE=/tmp/hoursback-cycle.pid
RUNNING="$(cat "$PIDFILE" 2>/dev/null || true)"
if [ -n "$RUNNING" ] && kill -0 "$RUNNING" 2>/dev/null; then
  say "already running as $RUNNING — leaving it alone"; exit 0
fi
echo $$ > "$PIDFILE"
# Empties its own marker on the way out; never removes a file, and never
# touches one holding somebody else's number.
clear_marker() { [ "$(cat "$PIDFILE" 2>/dev/null || true)" = "$$" ] && : > "$PIDFILE"; return 0; }
trap clear_marker EXIT

# Waiting out a pause in the allowance. Returns when the reader answers again.
wait_for_allowance() {
  local waited=0
  while :; do
    waited=$((waited + 10))
    say "no allowance — waiting 10 minutes (waited ${waited}m so far)"
    sleep 600
    if node scripts/hoursback/reader-check.js >/dev/null 2>&1; then
      say "answering again after ${waited}m — carrying on"
      return 0
    fi
  done
}

# Write every letter that can be written right now, fifty at a time, until
# there are none left waiting.
write_what_is_ready() {
  while :; do
    node scripts/hoursback/who-can-be-written.cjs > /tmp/hb-to-write.txt 2>>"$LOG"
    local left
    # `grep -c` PRINTS 0 AND EXITS 1 WHEN IT FINDS NOTHING. Written as
    # `grep -c . || echo 0` that produced the two-line value "0\n0", the
    # is-it-zero test errored instead of matching, and the loop carried on and
    # ran the writer with an EMPTY list — which the writer reads as "choose
    # fifty businesses yourself", including ones with no address. Exactly the
    # fault this whole cycle exists to prevent (2026-09-06, caught in 41s).
    left=$(tr ',' '\n' < /tmp/hb-to-write.txt | grep -c . || true)
    left=${left:-0}
    if [ "$left" -le 0 ]; then say "no letters waiting to be written"; return 0; fi
    say "writing letters — $left waiting, taking up to 50"
    local batch
    batch=$(tr ',' '\n' < /tmp/hb-to-write.txt | head -50 | paste -sd,)
    # BELT AND BRACES. An empty list must never reach the writer, whatever the
    # count above said, because an empty list means "pick your own".
    if [ -z "$batch" ]; then say "the list came back empty — not writing"; return 0; fi
    node scripts/hoursback/write-noticings.js --ids="$batch" --fresh=0 >>"$LOG" 2>&1
    local code=$?
    case $code in
      0) say "  those are written" ;;
      75) wait_for_allowance ;;
      143|130) say "stopped while writing"; exit 143 ;;
      *) say "  writing ended with code $code — going on"; return 0 ;;
    esac
  done
}

say "=== read fifty, write fifty, repeat — businesses with an email address only ==="

# STEP ONE, before any reading: the letters already possible from sites on file.
say "--- first, the letters that can be written from sites already read ---"
write_what_is_ready

ROUND=0
while :; do
  ROUND=$((ROUND + 1))
  say "--- round $ROUND: reading the next 50 websites ---"
  node scripts/hoursback/understand-businesses.js --untried --has-email --limit=50 >>"$LOG" 2>&1
  code=$?
  case $code in
    0) : ;;
    75) wait_for_allowance; continue ;;
    143|130) say "stopped while reading"; exit 143 ;;
    *) say "reading ended with code $code" ;;
  esac

  left_to_read=$(node scripts/hoursback/how-many-left-to-read.cjs 2>>"$LOG" || echo "?")
  say "round $ROUND read; $left_to_read sites still unread among businesses we can email"

  say "--- round $ROUND: writing the letters those reads make possible ---"
  write_what_is_ready

  if [ "$left_to_read" = "0" ]; then
    say "=== every site we can write to has been read, and every letter written ==="
    break
  fi
done
