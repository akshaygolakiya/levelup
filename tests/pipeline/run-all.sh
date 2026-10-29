#!/bin/bash
# One command for the whole offline suite: tests/pipeline/run-all.sh
cd "$(dirname "$0")/../.." || exit 1
export PATH="/Users/akshaygolakiya/.nvm/versions/node/v22.23.2/bin:$PATH"
node --test tests/pipeline/*.test.mjs
