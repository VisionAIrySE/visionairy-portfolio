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

# TWENTY-FIVE AT A TIME, UP TO TWO HUNDRED (Russ, 2026-09-03).
#
# Not one run of two hundred. Small batches so a run that goes wrong loses
# twenty-five sites' worth of work rather than the night's, and so the guard
# gets a fresh look between each one. It stops early if a batch reads nothing,
# which is what a broken night looks like from the outside.
SITES=200
BATCH=25
for a in "$@"; do case $a in --sites=*) SITES="${a#*=}";; --batch=*) BATCH="${a#*=}";; esac; done

# The mail key lives in the settings file, never in the repository.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env 2>/dev/null || true
  set +a
fi

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
say "Started $(date '+%H:%M'). Up to ${SITES} websites, ${BATCH} at a time, then writing to whoever they turn out to be."
say ""

# ONE NIGHT AT A TIME. Two runs writing to the same records is the kind of
# thing that is invisible until the numbers stop making sense.
LOCK=/tmp/hoursback-nightly.lock
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "another night is already running (started $(cat "$LOCK/when" 2>/dev/null || echo 'at some point')). Doing nothing."
  exit 0
fi
date +%H:%M > "$LOCK/when"
# The browser is launched once and stays alive. A night that ends badly used to
# leave it holding memory until somebody noticed.
cleanup () {
  pkill -f "chromium.*--headless" 2>/dev/null
  rm -rf "$LOCK"
}
trap cleanup EXIT INT TERM

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
  # THE WHOLE THING, NOT THE LAST THIRTY LINES. This kept a tail, so a night of
  # six sites reported one of them and a night of a hundred would report none:
  # the closing tallies pushed every business off the top. The lines naming
  # which businesses were read are the only part worth reading in the morning.
  cat "$LOG" >> "$OUT"
  say '```'
  say ""
  : > "$LOG"
  [ -n "$stopped_because" ] && return 1
  return 0
}

# WRITING COMES FIRST (Russ, 2026-09-03: "we pick up the writing before the
# next reading starts").
#
# Reading then writing means a night that stops early leaves businesses read
# and silent — which looks like success until you look. Writing first clears
# whatever last night read before anything new is taken on, so the worst case
# is a night with no new reading rather than a night with new reading and no
# letters.
if [ -z "$stopped_because" ]; then
  run "Catching up on anything read but not yet written to" \
    node scripts/hoursback/write-noticings.js --fresh=12 --limit=50 \
    || say "**Stopped: ${stopped_because}.**"
fi

if [ -z "$stopped_because" ]; then
  run "Writing the letters owed from last night" node scripts/hoursback/rewrite-drafts.js \
    || say "**Stopped: ${stopped_because}.**"
fi

if [ -z "$stopped_because" ]; then
  run "Writing the LinkedIn notes owed from last night" node scripts/hoursback/write-linkedin.js \
    || say "**Stopped: ${stopped_because}.**"
fi

read_so_far=0
while [ -z "$stopped_because" ] && [ "$read_so_far" -lt "$SITES" ]; do
  before=$(node -e '
    const {PrismaClient}=require("@prisma/client"); const db=new PrismaClient();
    (async()=>{ console.log(await db.reading.count({where:{source:"website",reader:"understand-businesses"}})); await db.$disconnect(); })();
  ' 2>/dev/null | tail -1)
  run "Reading ${BATCH} new websites (${read_so_far} of ${SITES} so far)" \
    node scripts/hoursback/understand-businesses.js --untried --fresh=12 --limit="$BATCH" --lanes=3 \
    || { say "**Stopped: ${stopped_because}.** Everything read up to that point is kept, and tomorrow writes to them first."; break; }
  after=$(node -e '
    const {PrismaClient}=require("@prisma/client"); const db=new PrismaClient();
    (async()=>{ console.log(await db.reading.count({where:{source:"website",reader:"understand-businesses"}})); await db.$disconnect(); })();
  ' 2>/dev/null | tail -1)
  gained=$(( ${after:-0} - ${before:-0} ))
  read_so_far=$(( read_so_far + gained ))
  # A BATCH THAT READS NOTHING MEANS THERE IS NOTHING LEFT TO READ, or something
  # is wrong. Either way, grinding through seven more batches proves nothing.
  if [ "$gained" -le 0 ]; then
    say "_That batch read nothing, so there is either nothing left untouched or something is wrong. Stopping here rather than repeating it._"
    say ""
    break
  fi
done

# And what tonight read gets its sentence tonight, so only a hard stop leaves
# anything owed.
if [ -z "$stopped_because" ]; then
  run "Finding what tonight's businesses actually do" \
    node scripts/hoursback/write-noticings.js --fresh=12 --limit=50 \
    || say "**Stopped: ${stopped_because}.**"
fi

if [ -z "$stopped_because" ]; then
  run "Writing tonight's letters" node scripts/hoursback/rewrite-drafts.js \
    || say "**Stopped: ${stopped_because}.**"
fi

# --- what the night actually produced, counted from the database ------------
# WHAT WENT WRONG COMES FIRST (Russ, 2026-09-03: "what did you learn from
# this?"). Every real finding this week came out of a failure — words being
# erased, a page farm eating fifteen minutes, eleven blocked sites, a Turkish
# gambling site sitting in the list. "Read 62 of 100" is the least useful
# sentence in the report and it used to be the headline.
say "## What did not read, and why"
say ""
say '```'
node -e '
const {PrismaClient}=require("@prisma/client"); const db=new PrismaClient();
(async()=>{
 const since=new Date(Date.now()-9*3600*1000);
 const rs=await db.reading.findMany({where:{source:"website",reader:"understand-businesses",
   startedAt:{gte:since},NOT:{outcome:"read"}},
   select:{outcome:true,note:true,prospect:{select:{name:true,website:true,websiteManualValue:true,phone:true}},
     findings:{where:{field:"whyNothingOnTheirSite"},select:{value:true,quote:true}}}});
 if(!rs.length){ console.log("nothing failed tonight."); }
 for(const r of rs){
   const p=r.prospect;
   const why=r.findings.length?`${r.findings[0].value}: "${String(r.findings[0].quote||"").slice(0,60)}"`
     :String(r.note||r.outcome).slice(0,80);
   console.log(`${String(p.name).slice(0,34).padEnd(36)} ${why}`);
   console.log(`${"".padEnd(36)} ${String(p.websiteManualValue||p.website||"NO WEB ADDRESS ON FILE").slice(0,52)}   phone ${p.phone||"none"}`);
 }
 await db.$disconnect();
})();
' 2>&1 | tee -a "$OUT"
say '```'
say ""
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
say ""

if [ -n "$stopped_because" ]; then
  say "## It stopped early"
  say ""
  say "**${stopped_because}.**"
  say ""
  say "Everything read up to that point is kept, and nothing is lost. Tomorrow"
  say "night picks up from where this one stopped rather than starting over:"
  say "the queue is worked out from what is actually on file, not from a list"
  say "written in advance."
  say ""
  case "$stopped_because" in
    *questions*)
      say "That ceiling exists because one business once cost 226 pages and 49"
      say "questions before anything noticed it was the wrong company's website."
      say "If this keeps happening, the number to look at is questions per"
      say "business, not the total.";;
    *hours*)
      say "Reading a hundred sites takes roughly two and a half hours. Seven"
      say "means something took far longer than it should have — the sites read"
      say "just before it stopped are where to look.";;
    *nothing*)
      say "Nothing was being written at all, which usually means the reader"
      say "stopped answering. Nothing is lost; the same businesses come up"
      say "again tomorrow.";;
  esac
  say ""
fi

# THE REPORT COMES TO RUSS, rather than waiting in a folder he has to remember
# to open. It goes out only when a mail key is on this machine; without one the
# report still exists and this says so plainly rather than failing silently.
if [ -n "${RESEND_API_KEY:-}" ]; then
  node -e '
   const fs=require("fs");
   const body=fs.readFileSync(process.argv[1],"utf8");
   const night=process.argv[2];
   (async()=>{
     const res=await fetch("https://api.resend.com/emails",{
       method:"POST",
       headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`,"content-type":"application/json"},
       body:JSON.stringify({
         from:"Hours Back <russ@visionairy.biz>",
         to:"russ@visionairy.biz",
         subject:`The night of ${night}`,
         text:body,
       }),
       signal:AbortSignal.timeout(20000),
     });
     console.log(res.ok?"report emailed to russ@visionairy.biz":`could not email the report: ${res.status}`);
   })();
  ' "$OUT" "$NIGHT" 2>&1 | tee -a "$OUT"
else
  say "_No mail key on this machine, so this was not emailed. The report is at ${OUT}._"
fi

echo "report: $OUT"
