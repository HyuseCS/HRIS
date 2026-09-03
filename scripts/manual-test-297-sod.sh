#!/usr/bin/env bash
# #297 live verification harness. Runs the SAME script on both sides of the change.
# PASS=before  -> the holes must be OPEN   (every guarded action SUCCEEDS)
# PASS=after   -> the holes must be CLOSED (every guarded action is refused 403)
#
# Deliberately NOT `set -e`: this harness must run EVERY case and print the whole table, including
# the ones that fail. Aborting on the first non-zero curl would hide the rest of the result, which
# is the opposite of what a before/after comparison is for. `assert_live` below is the hard stop
# that matters — an unauthenticated actor makes every refusal a lie.
set -uo pipefail

APP=http://localhost:5173
PASS="${1:?usage: sod297-live.sh before|after}"
JAR=$(mktemp -d) || { echo "FATAL: cannot create a cookie jar directory"; exit 1; }
trap 'rm -rf "$JAR"' EXIT
REPO=$(git rev-parse --show-toplevel)
PSQL() { docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -t -A -F'|' -c "$1"; }

A_MAIL=hr@veent.ph          # actor A — HR_ADMIN
B_MAIL=system@veent.ph      # actor B — HR_ADMIN, the "second person"
HR_EMP=cms5ps3q7001h5spkrdllarb0   # A's OWN employee row, for the D4 self test

case "$PASS" in
  before) E_D3=cmsmssc2c001z13nv7wis8lro; E_D8=cmsmss6vk001e13nve54s5bln ;;
  after)  E_D3=cmsmsrwbd000p13nvp163o2fk; E_D8=cmsmsruhy000813nvqeea5des ;;
esac

login() { curl -s -c "$JAR/$2.jar" -X POST "$APP/api/v1/_dev/login-as" \
            -H 'content-type: application/json' -d "{\"email\":\"$1\"}" >/dev/null; }

# SvelteKit form action. Echoes the HTTP status only.
act() { # act <jar> <url> <formdata...>
  local jar=$1 url=$2; shift 2
  local args=(); for f in "$@"; do args+=(--data-urlencode "$f"); done
  local body
  body=$(curl -s -b "$JAR/$jar.jar" -X POST "$url" \
       -H "origin: $APP" -H 'x-sveltekit-action: true' -H 'content-type: application/x-www-form-urlencoded' --data '' "${args[@]}")
  # A logged-out actor gets a redirect to /login and NO guard ever runs. That must never be
  # mistaken for a refusal — it is the exact false green this harness exists to prevent.
  case "$body" in
    *account_disabled*|*'"location":"/login'*) echo "NOT-LOGGED-IN (redirect to /login)"; return ;;
  esac
  case "$body" in
    *'"type":"failure"'*) echo "REFUSED  $(echo "$body" | grep -o '\"status\":[0-9]*' | head -1)" ;;
    *'"type":"success"'*|*'"type":"redirect"'*) echo "ALLOWED" ;;
    *) echo "UNKNOWN: ${body:0:90}" ;;
  esac
}

# Every actor must be provably authenticated before any result is believed.
assert_live() { # assert_live <jar> <label>
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/$1.jar" "$APP/separations")
  if [ "$code" != "200" ]; then
    echo "FATAL: actor $2 is NOT authenticated (/separations -> $code). Every refusal below would be a lie."
    exit 1
  fi
  echo "   actor $2 authenticated (/separations -> 200)"
}

mkcase() { # mkcase <jar> <employeeId> <marker> -> prints separation id
  act "$1" "$APP/separations?/create" \
      "employeeId=$2" "type=RESIGNATION" "effectiveDate=2026-09-30" "reason=$3" >/dev/null
  PSQL "select id from separation_records where reason='$3' limit 1;"
}

echo "═══════════ #297 LIVE — $PASS PASS — $(git -C "$REPO" rev-parse --short HEAD) ═══════════"
login "$A_MAIL" A; login "$B_MAIL" B
echo "actors: A=$A_MAIL  B=$B_MAIL"
assert_live A "A"; assert_live B "B"

# ── D3: whoever cleared any item may not finalize ────────────────────────────
M="SOD297-$PASS-D3"
S=$(mkcase A "$E_D3" "$M"); echo; echo "── D3  case=$S ($M)"
ITEMS=$(PSQL "select id from clearance_items where \"separationId\"='$S' order by id;")
for i in $ITEMS; do act A "$APP/separations/$S?/toggleClearance" "itemId=$i" "cleared=true" >/dev/null; done
echo "   A cleared: $(PSQL "select count(*) from clearance_items where \"separationId\"='$S' and status='CLEARED';")/$(echo "$ITEMS" | wc -w) items"
echo "   A finalize -> HTTP $(act A "$APP/separations/$S?/finalize")"
echo "   RESULT status=$(PSQL "select status from separation_records where id='$S';") finalizedById=$(PSQL "select coalesce(\"finalizedById\",'NULL') from separation_records where id='$S';")"

# ── D8: a second person may not touch an already-cleared item ────────────────
M="SOD297-$PASS-D8"
S8=$(mkcase A "$E_D8" "$M"); echo; echo "── D8  case=$S8 ($M)"
I1=$(PSQL "select id from clearance_items where \"separationId\"='$S8' order by id limit 1;")
act A "$APP/separations/$S8?/toggleClearance" "itemId=$I1" "cleared=true" >/dev/null
echo "   A cleared item $I1 -> clearedById=$(PSQL "select coalesce(\"clearedById\",'NULL') from clearance_items where id='$I1';")"
echo "   B un-clear  -> HTTP $(act B "$APP/separations/$S8?/toggleClearance" "itemId=$I1" "cleared=false")"
echo "   RESULT after B un-clear: status=$(PSQL "select status from clearance_items where id='$I1';") clearedById=$(PSQL "select coalesce(\"clearedById\",'NULL') from clearance_items where id='$I1';")"
act A "$APP/separations/$S8?/toggleClearance" "itemId=$I1" "cleared=true" >/dev/null
echo "   B re-clear  -> HTTP $(act B "$APP/separations/$S8?/toggleClearance" "itemId=$I1" "cleared=true")"
echo "   RESULT after B re-clear: clearedById=$(PSQL "select coalesce(\"clearedById\",'NULL') from clearance_items where id='$I1';")"

# ── D4: nobody finalizes their own separation ────────────────────────────────
M="SOD297-$PASS-D4"
S4=$(mkcase A "$HR_EMP" "$M"); echo; echo "── D4  case=$S4 ($M) — the subject IS actor A"
for i in $(PSQL "select id from clearance_items where \"separationId\"='$S4';"); do
  act A "$APP/separations/$S4?/toggleClearance" "itemId=$i" "cleared=true" >/dev/null; done
echo "   A finalize OWN -> HTTP $(act A "$APP/separations/$S4?/finalize")"
echo "   RESULT status=$(PSQL "select status from separation_records where id='$S4';") | Hannah employmentStatus=$(PSQL "select \"employmentStatus\" from employees where id='$HR_EMP';") | hr login active=$(PSQL "select \"isActive\" from users where email='$A_MAIL';")"
echo
echo "═══════════ END $PASS ═══════════"
