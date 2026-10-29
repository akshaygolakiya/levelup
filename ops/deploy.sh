#!/bin/bash
# Publishes site/ to Cloudflare Pages (no git). First-time setup is in ops/README.md.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/Users/akshaygolakiya/.nvm/versions/node/v22.23.2/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
[ -n "${LEVELUP_STUB_PATH:-}" ] && export PATH="$LEVELUP_STUB_PATH:$PATH" # tests put a fake npx here
cd "$ROOT" || exit 1
if ! npx wrangler pages deploy site --project-name levelup; then
  echo "Deploy failed. Your data in site/ is untouched. If this is the first time or the login expired, run: npx wrangler login" >&2
  exit 1
fi
