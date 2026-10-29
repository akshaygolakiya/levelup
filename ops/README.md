# LevelUp ops

Files here are written but NOT installed. Nothing runs until you do the steps below.

- `run-daily.sh` waits for the network (about 2 minutes), exits if today's file exists, runs `pipeline/run.mjs` under `caffeinate`, deploys, sends a notification. Logs to `pipeline/logs/daily-YYYY-MM-DD.log`.
- `deploy.sh` commits `site/data` and `pipeline/state` and pushes to `main` on GitHub (`git@github-personal`, as golakikyaakshay17@gmail.com). Cloudflare builds the `levelup` Worker from GitHub (`npx wrangler deploy`, config in `wrangler.jsonc`).
- `com.levelup.daily.plist` is the LaunchAgent: runs at login and at 06:00 (launchd runs a missed 06:00 job when the Mac wakes).

## One-time Cloudflare setup

Already done in the dashboard: Workers & Pages -> levelup, Builds connected to akshaygolakiya/levelup, branch `main`, deploy command `npx wrangler deploy`. If Settings -> Builds says the project is disconnected from Git, reconnect GitHub there. Live site: https://levelup.golakiyaakshay17.workers.dev

## Install

```
cp /Users/akshaygolakiya/levelup-app/ops/com.levelup.daily.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.levelup.daily.plist
```

Note: `RunAtLoad` makes it start immediately on bootstrap. To avoid that right now, install later in the day or accept one run. Run it on demand any time with:

```
launchctl kickstart gui/$(id -u)/com.levelup.daily
```

## Uninstall

```
launchctl bootout gui/$(id -u)/com.levelup.daily
rm ~/Library/LaunchAgents/com.levelup.daily.plist
```

## Notes

- Concurrency is capped at 3 `claude` processes (`LEVELUP_CONCURRENCY`, hard maximum 4). Lower it to 2 in the plist if the Mac struggles.
- A failed run does not mark the day done and changes no state; the next login or 06:00 retries.
- On Sundays (or Monday, if Sunday's was missed) the run also writes the weekly revision sheet to `site/data/weekly/`. Run it by hand with `node pipeline/run.mjs --weekly-only`.
- Test without touching state: `node pipeline/run.mjs --date 2026-12-01 --no-state` writes only `site/data/2026-12-01.json` (delete it afterwards).
- Node is pinned to `/Users/akshaygolakiya/.nvm/versions/node/v22.23.2/bin`. Update the path in `run-daily.sh` and `deploy.sh` if you change Node versions.
