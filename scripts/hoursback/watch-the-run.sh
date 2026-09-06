#!/usr/bin/env bash
# Watch the letter run and put it back on its feet if it falls over.
#
# The standing rule in this repo is that Russ must never be the alarm clock.
# Three times he found the machine hot before anything in the code noticed, and
# twice he found a night's job dead in the morning. This checks every five
# minutes, restarts the runner if it has gone, and writes down how hot the
# machine is so there is a record rather than a memory.
#
# It never starts a second copy: the runner and the writer both refuse one, and
# this checks before asking anyway.

set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/../.." || exit 1

LOG=/tmp/hoursback-watchdog.log
RUN_LOG=/tmp/hoursback-write-everything.log
say() { echo "[$(date '+%m-%d %H:%M:%S')] $*" >> "$LOG"; }

trap 'say "watchdog told to stop"; exit 143' INT TERM
say "=== watching the letter run ==="

QUIET=0
while :; do
  load=$(uptime | sed 's/.*load average: //' | cut -d, -f1 | tr -d ' ')
  copies=$(ps -eo cmd --no-headers | grep -c '[w]rite-noticings.js')
  models=$(pgrep -fc 'claude --model' || echo 0)

  # More than one copy of the writer should now be impossible. If it ever
  # happens the refusal has failed, and that is the thing that cooks the
  # laptop — so it is stopped here rather than reported.
  if [ "$copies" -gt 1 ]; then
    say "TWO COPIES OF THE WRITER — killing the newest, this is what overheats the machine"
    ps -eo pid,etime,cmd --no-headers | grep '[w]rite-noticings.js' | sort -k2 \
      | tail -n +2 | awk '{print $1}' | while read -r p; do
        kids=$(pgrep -P "$p"); kill -TERM "$p" $kids 2>/dev/null; sleep 3
        kill -KILL "$p" $kids 2>/dev/null
        say "killed $p and its readers"
      done
  fi

  # IS IT ALIVE? Asked of the runner's own recorded number, not of anything
  # whose command line merely says its name — that check called a dead job
  # alive when it was tested (2026-09-05).
  PIDFILE=/tmp/hoursback-write-everything.pid
  runner="$(cat "$PIDFILE" 2>/dev/null || true)"
  alive=0
  if [ -n "$runner" ] && kill -0 "$runner" 2>/dev/null; then alive=1; fi

  if [ "$alive" -eq 0 ]; then
    if grep -q "=== all done ===" "$RUN_LOG" 2>/dev/null; then
      say "the run finished on its own — nothing left to watch"; exit 0
    fi
    say "the runner has gone and the work is not finished — starting it again"
    : > "$PIDFILE"
    setsid nohup bash scripts/hoursback/write-everything-readable.sh "$RUN_LOG" > /dev/null 2>&1 < /dev/null &
    sleep 15
    back="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "$back" ] && kill -0 "$back" 2>/dev/null; then
      say "back up as $back"
    else
      say "IT DID NOT COME BACK — trying again next round"
    fi
  fi

  # A quiet note every half hour, and a loud one whenever the machine is hot.
  hot=$(awk -v l="$load" 'BEGIN{print (l > 8) ? 1 : 0}')
  QUIET=$((QUIET + 1))
  if [ "$hot" = "1" ]; then
    say "HOT — load $load, $models readers, $copies writer(s)"
  elif [ "$QUIET" -ge 6 ]; then
    written=$(grep -c '  ✓ ' "$RUN_LOG" 2>/dev/null || echo 0)
    say "fine — load $load, $models readers, $written letters written so far"
    QUIET=0
  fi
  sleep 300
done
