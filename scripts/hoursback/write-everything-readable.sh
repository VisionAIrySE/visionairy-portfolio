#!/usr/bin/env bash
# Write a letter for every business whose own website is already read and who
# has no letter on the current wording. Nothing here reads a website; nothing
# here can spend money. It works through what is already on file.
#
# Blocks of 100, as Russ asked, run as two passes of 50 because the writer
# itself refuses more than 50 in one go — that ceiling is a safety rail and is
# deliberately left alone.
#
# It waits for whatever model job is already running rather than starting
# alongside it. On 2026-09-05 three copies at once cooked the laptop; the
# writer now refuses a second copy, and this waits politely instead of
# hammering at a locked door.

set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/../.." || exit 1

LOG="${1:-/tmp/hoursback-write-everything.log}"
say() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

stop_now() { say "asked to stop — leaving the current block to finish its business and exiting"; exit 143; }
trap stop_now INT TERM

# WHO IS RUNNING, BY NUMBER. Searching for this script's own name matched any
# passing shell command that merely mentioned it, so a watchdog reading that
# would call a dead job alive — worse than no watchdog at all. Found by killing
# the runner on purpose and watching the check lie about it (2026-09-05).
#
# The marker is emptied on the way out, never removed, so this script deletes
# nothing on disk and an empty marker plainly means nobody is running.
PIDFILE=/tmp/hoursback-write-everything.pid
RUNNING_PID="$(cat "$PIDFILE" 2>/dev/null || true)"
if [ -n "$RUNNING_PID" ] && kill -0 "$RUNNING_PID" 2>/dev/null; then
  say "already running as $RUNNING_PID — leaving it alone"
  exit 0
fi
echo $$ > "$PIDFILE"
# Only ever clears a marker holding OUR OWN number. One left by another run is
# left alone: the marker is how two of them keep out of each other's way.
clear_my_marker() {
  [ "$(cat "$PIDFILE" 2>/dev/null || true)" = "$$" ] && : > "$PIDFILE"
  return 0
}
trap clear_my_marker EXIT

say "=== writing every letter that can be written from a site already on file ==="

# Wait for any model job already going. One at a time, always.
while [ -f /tmp/hoursback-models.lock ]; do
  pid=$(python3 -c "import json;print(json.load(open('/tmp/hoursback-models.lock'))['pid'])" 2>/dev/null || echo "")
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then break; fi
  say "waiting for the job already running (pid $pid)"
  sleep 120
done

BLOCK=0
WAITS=0
while :; do
  # Who is left, recomputed every pass — so a stop and restart resumes, and a
  # business written in the last block is never written twice.
  node scripts/hoursback/who-can-be-written.cjs > /tmp/hb-writable.txt 2>>"$LOG"
  LEFT=$(tr ',' '\n' < /tmp/hb-writable.txt | grep -c . || echo 0)
  if [ "$LEFT" -eq 0 ]; then say "nothing left to write — done"; break; fi

  NEXT=$(tr ',' '\n' < /tmp/hb-writable.txt | head -50 | paste -sd,)
  BLOCK=$((BLOCK + 1))
  say "block $BLOCK — $LEFT still to write, taking the next 50"

  node scripts/hoursback/write-noticings.js --ids="$NEXT" --fresh=0 >>"$LOG" 2>&1
  code=$?
  # 73 = another job is running (should not happen, we waited), 75 = the
  # reader ran out of allowance, 143 = we were told to stop.
  case $code in
    0) say "block $BLOCK finished"; WAITS=0 ;;
    73) say "another model job took the machine — waiting and trying again"; sleep 300 ;;
    75)
      # OUT OF ALLOWANCE IS A WAIT, NOT AN ENDING. These limits reset on their
      # own within the hour. On 2026-09-05 the run quit here at 15:29 and the
      # reader was answering again three minutes later — a night would have
      # been lost to a pause. It waits and asks a real question before going on.
      WAITS=$((WAITS + 1))
      if [ "$WAITS" -gt 24 ]; then say "still no allowance after four hours — stopping"; exit 75; fi
      say "no allowance right now — waiting 10 minutes (wait $WAITS of 24)"
      sleep 600
      if node scripts/hoursback/reader-check.js >/dev/null 2>&1; then
        say "the reader is answering again — carrying on"
      else
        say "still not answering — waiting again"
      fi
      ;;
    143|130) say "stopped"; exit 143 ;;
    *) say "block $BLOCK ended with code $code — carrying on to the next" ;;
  esac
done

say "=== all done ==="
