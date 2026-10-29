#!/bin/bash
# Publishes by committing the new content and pushing to main; Cloudflare builds and deploys the Worker from GitHub.
# Only site/data and pipeline/state are staged, never anything else. Setup is in ops/README.md.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
[ -n "${LEVELUP_STUB_PATH:-}" ] && export PATH="$LEVELUP_STUB_PATH:$PATH" # tests put a fake git here
cd "$ROOT" || exit 1
fail() { echo "Deploy failed. Your data in site/ is untouched. $1" >&2; exit 1; }

G=(git -c user.name="Akshay Golakiya" -c user.email="golakikyaakshay17@gmail.com")
"${G[@]}" add site/data pipeline/state || fail "git add failed."
if "${G[@]}" diff --cached --quiet; then
  echo "nothing new to commit"
else
  "${G[@]}" commit -q -m "Daily content $(date +%F)" || fail "git commit failed."
fi
if ! "${G[@]}" push -q origin main; then
  # main moved on GitHub (for example a code push from elsewhere): rebase once and retry.
  "${G[@]}" pull -q --rebase origin main && "${G[@]}" push -q origin main \
    || fail "git push failed. Check the network and that 'ssh -T git@github-personal' works, then run ops/deploy.sh."
fi
echo "pushed; Cloudflare will deploy from GitHub"
