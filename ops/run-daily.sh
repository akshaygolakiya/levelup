#!/bin/bash
# LevelUp daily job. Safe to run any number of times a day: exits at once if today's file exists.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/Users/akshaygolakiya/.nvm/versions/node/v22.23.2/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
[ -n "${LEVELUP_STUB_PATH:-}" ] && export PATH="$LEVELUP_STUB_PATH:$PATH" # tests put fake osascript/curl/npx here
cd "$ROOT" || exit 1

TODAY="$(date +%F)"
LOGDIR="$ROOT/pipeline/logs"
mkdir -p "$LOGDIR"
exec >>"$LOGDIR/daily-$TODAY.log" 2>&1
echo "=== $(date) run-daily start"

notify() { osascript -e "display notification \"$1\" with title \"LevelUp\"" >/dev/null 2>&1; }

[ -f "$ROOT/site/data/$TODAY.json" ] && { echo "today's file exists, nothing to do"; exit 0; }

# RunAtLoad and the 06:00 trigger can overlap; only one run at a time.
LOCK="$LOGDIR/.run.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if kill -0 "$(cat "$LOCK/pid" 2>/dev/null)" 2>/dev/null; then echo "another run is active"; exit 0; fi
  rm -rf "$LOCK"; mkdir "$LOCK" || exit 1
fi
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

# Wait for the network (up to ~2 minutes).
online=0
for _ in $(seq 1 "${LEVELUP_NET_TRIES:-24}"); do
  if curl -fsS -m 5 -o /dev/null "${LEVELUP_NET_URL:-https://hacker-news.firebaseio.com/v0/maxitem.json}"; then online=1; break; fi
  sleep "${LEVELUP_NET_SLEEP:-5}"
done
[ "$online" = 1 ] || { echo "no network after 2 minutes"; notify "No network, will retry at next login or 06:00"; exit 1; }

# caffeinate keeps the Mac awake while the pipeline runs.
caffeinate -i node "$ROOT/pipeline/run.mjs"
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "pipeline failed (exit $rc)"
  case "$rc" in
    5) notify "Claude usage limit reached. Retries at next login or 06:00." ;;
    6) notify "Claude is not logged in (personal profile). Log in, then it retries." ;;
    *) notify "Today's content failed (exit $rc). See pipeline/logs. It retries at next login or 06:00." ;;
  esac
  exit 1
fi

# Only deploy once today's file really exists (the weekly sheet may have been added too).
if [ -f "$ROOT/site/data/$TODAY.json" ]; then
  if "$ROOT/ops/deploy.sh"; then notify "Today's LevelUp is ready."
  else echo "deploy failed"; notify "Content generated but deploy failed. Run ops/deploy.sh."; exit 1; fi
fi
echo "=== $(date) run-daily done"
