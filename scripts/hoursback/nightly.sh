#!/bin/bash
# THE NIGHTLY RUN (Russ, 2026-09-03, 5pm Friday).
#
# A hundred websites read, their sentences found, and their letters and
# LinkedIn notes written — every night while nobody is watching, ready to read
# in the morning.
#
#   scripts/hoursback/nightly.sh              one night's work
#   scripts/hoursback/nightly.sh --sites=25   a smaller one, for a test
#
# NOTHING PAID, EVER. Every model call goes through the local reader. The
# standing order of 2026-08-29 stands and this is exactly where it could break
# quietly, so the run checks its own record afterwards and says so.
#
# IT STOPS ITSELF. Every long run this week needed a guard: one spent fifteen
# minutes and twenty questions on a business that was a page farm, another
# ground through 32,739 records to write 418 messages. So there are three
# limits, and hitting any one of them ends the night cleanly with everything
# already learned kept:
#
#   - past the wall-clock limit
#   - past the ceiling on reader questions
#   - nothing at all happening for half an hour
#
# WHAT IT DOES, IN ORDER. Reading first, because writing needs something to
# write from. Then the sentence off each site, then the letters.

set -uo pipefail
cd "$(dirname "$0")/../.."

SITES=100
for a in "$@"; do case $a in --sites=*) SITES="${a#*=}";; esac; done

NIGHT=$(date +%Y-%m-%d)
OUT="docs/hoursback/nights/${NIGHT}.md"
mkdir -p docs/hoursback/nights
LOG=$(mktemp -d)/night.log

MAX_HOURS=7           # done well before morning
MAX_QUESTIONS=4000    # a hundred sites cost roughly 1,200; this is the runaway line
QUIET_MINUTES=30

say () { echo "$1" | tee -a "$OUT"; }

: > "$OUT"
say "# The night of ${NIGHT}"
say ""
say "Started $(date '+%H:%M'). Reading ${SITES} websites, then writing to whoever they turn out to be."
say ""

started=$(date +%s)
stopped_because=""

guard () {   # $1 = pid to watch
  local pid=$1
  while kill -0 "$pid" 2>/dev/null; do
    local now elapsed calls age
    now=$(date +%s); elapsed=$(( (now - started) / 3600 ))
    if [ "$elapsed" -ge "$MAX_HOURS" ]; then
      stopped_because="ran past ${MAX_HOURS} hours"; kill "$pid" 2>/dev/null; sleep 5
      kill -9 "$pid" 2>/dev/null; return
    fi
    calls=$(grep -o "[0-9]\+ calls" "$LOG" 2>/dev/null | awk '{s+=$1} END {print s+0}')
    if [ "${calls:-0}" -gt "$MAX_QUESTIONS" ]; then
      stopped_because="asked the reader ${calls} questions, past the ${MAX_QUESTIONS} ceiling"
      kill "$pid" 2>/dev/null; sleep 5; kill -9 "$pid" 2>/dev/null; return
    fi
    if [ -f "$LOG" ]; then
      age=$(( (now - $(stat -c %Y "$LOG")) / 60 ))
      if [ "$age" -ge "$QUIET_MINUTES" ]; then
        stopped_because="nothing happened for ${age} minutes"
        kill "$pid" 2>/dev/null; sleep 5; kill -9 "$pid" 2>/dev/null; return
      fi
    fi
    sleep 60
  done
}

run () {   # $1 = what it is, rest = the command
  local what=$1; shift
  say "## ${what}"
  say ""
  say '```'
  "$@" >> "$LOG" 2>&1 &
  local pid=$!
  guard "$pid" &
  local watchdog=$!
  wait "$pid" 2>/dev/null
  kill "$watchdog" 2>/dev/null
  tail -30 "$LOG" | tee -a "$OUT"
  say '```'
  say ""
  : > "$LOG"
  [ -n "$stopped_because" ] && return 1
  return 0
}

run "Reading ${SITES} websites" \
  node scripts/hoursback/understand-businesses.js --untried --fresh=12 --limit="$SITES" --lanes=3 \
  || say "**Stopped: ${stopped_because}.** Everything read up to that point is kept."

if [ -z "$stopped_because" ]; then
  run "Finding what each of them actually does" \
    node scripts/hoursback/write-noticings.js --fresh=12 --limit=50 \
    || say "**Stopped: ${stopped_because}.**"
fi

if [ -z "$stopped_because" ]; then
  run "Writing their letters" node scripts/hoursback/rewrite-drafts.js \
    || say "**Stopped: ${stopped_because}.**"
fi

if [ -z "$stopped_because" ]; then
  run "Writing their LinkedIn notes" node scripts/hoursback/write-linkedin.js \
    || say "**Stopped: ${stopped_because}.**"
fi

# --- what the night actually produced, counted from the database ------------
say "## Where things stand"
say ""
say '```'
node -e '
const {PrismaClient}=require("@prisma/client"); const db=new PrismaClient();
(async()=>{
 const dayAgo=new Date(Date.now()-24*3600*1000);
 const readTonight=await db.reading.count({where:{source:"website",reader:"understand-businesses",
   outcome:"read",startedAt:{gte:dayAgo}}});
 const paid=await db.reading.count({where:{startedAt:{gte:dayAgo},NOT:{model:"haiku"},model:{not:null}}});
 const withWords=await db.prospect.count({where:{readings:{some:{source:"website",outcome:"read",
   pages:{some:{AND:[{text:{not:null}},{NOT:{text:""}}]}}}}}});
 const stillToRead=await db.prospect.count({where:{doNotContact:false,NOT:{stage:"NEEDS_REVIEW"},
   OR:[{website:{not:null}},{websiteManualValue:{not:null}}],
   readings:{none:{source:"website",outcome:"read",
     pages:{some:{AND:[{text:{not:null}},{NOT:{text:""}}]}}}}}});
 const email=await db.outreachMessage.count({where:{lane:"EMAIL",state:{in:["DRAFT","QUEUED"]}}});
 const li=await db.outreachMessage.count({where:{lane:"LINKEDIN",state:{in:["DRAFT","QUEUED"]}}});
 console.log(`read tonight:                 ${readTonight}`);
 console.log(`websites read in all:         ${withWords}`);
 console.log(`still to read on your list:   ${stillToRead}`);
 console.log(`letters waiting:              ${email}`);
 console.log(`LinkedIn notes waiting:       ${li}`);
 console.log(paid ? `PAID READER USED: ${paid} — this should be zero` : `no paid reader used, as ordered`);
 await db.$disconnect();
})();
' 2>&1 | tee -a "$OUT"
say '```'
say ""
say "Finished $(date '+%H:%M')."
[ -n "$stopped_because" ] && say "" && say "**The guard stopped it: ${stopped_because}.**"
echo "report: $OUT"
