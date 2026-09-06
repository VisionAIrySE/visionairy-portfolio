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
RUN_LOG=/tmp/hoursback-cycle.log
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
  PIDFILE=/tmp/hoursback-cycle.pid
  runner="$(cat "$PIDFILE" 2>/dev/null || true)"
  alive=0
  if [ -n "$runner" ] && kill -0 "$runner" 2>/dev/null; then alive=1; fi

  if [ "$alive" -eq 0 ]; then
    if grep -q "has been read, and every letter written" "$RUN_LOG" 2>/dev/null; then
      say "the run finished on its own — nothing left to watch"; exit 0
    fi
    say "the cycle has gone and the work is not finished — starting it again"
    : > "$PIDFILE"
    setsid nohup bash scripts/hoursback/read-and-write-cycle.sh "$RUN_LOG" > /dev/null 2>&1 < /dev/null &
    sleep 20
    back="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "$back" ] && kill -0 "$back" 2>/dev/null; then
      say "back up as $back"
    else
      say "IT DID NOT COME BACK — trying again next round"
    fi
  fi

  # IS IT ACTUALLY DOING ANYTHING? Being alive is not the same as working.
  #
  # On the night of 5–6 September the job finished writing at midnight, printed
  # its summary, and then sat for TEN AND A HALF HOURS waiting on one model
  # process that never shut down. This watcher said "fine" every half hour the
  # whole time, because the job was alive. Russ woke up to nothing.
  #
  # So: if the log has not grown in forty minutes, the job is stuck. The cause
  # both times was a model process hanging, and killing it releases the job —
  # so kill those first and give it five minutes. If the log still has not
  # moved, restart the job outright.
  if [ "$alive" -eq 1 ] && [ -f "$RUN_LOG" ]; then
    quiet_for=$(( ( $(date +%s) - $(stat -c %Y "$RUN_LOG") ) / 60 ))
    if [ "$quiet_for" -ge 40 ]; then
      say "STUCK — alive but nothing written for ${quiet_for} minutes; freeing it"
      for m in $(pgrep -f 'claude --model'); do kill -KILL "$m" 2>/dev/null; done
      sleep 300
      still=$(( ( $(date +%s) - $(stat -c %Y "$RUN_LOG") ) / 60 ))
      if [ "$still" -ge 40 ]; then
        say "still stuck after freeing it — restarting the job"
        kill -KILL "$runner" $(pgrep -P "$runner") 2>/dev/null
        sleep 5
        : > "$PIDFILE"
      else
        say "freed — it is moving again"
      fi
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
