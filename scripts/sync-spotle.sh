#!/usr/bin/env bash
# Builds the game for spotlegame.co.uk/houseguests and copies it into the spotle repo next to this one
# (../spotle/public/houseguests). Commit and push spotle afterwards to put it live.
#   bash scripts/sync-spotle.sh
set -euo pipefail

SUBPAGE="houseguests"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/../spotle/public/$SUBPAGE"

[ -d "$ROOT/../spotle/public" ] || { echo "No spotle repo at $ROOT/../spotle"; exit 1; }

cd "$ROOT"
# absolute asset paths, so /houseguests (no trailing slash) works too; no source maps in the spotle repo
# (the MSYS settings stop Git Bash on Windows turning "/houseguests" into a Windows path)
MSYS_NO_PATHCONV=1 MSYS2_ENV_CONV_EXCL="PUBLIC_URL" CI=true PUBLIC_URL="/$SUBPAGE" GENERATE_SOURCEMAP=false npx react-scripts build

rm -rf "$DEST"
cp -r "$ROOT/build" "$DEST"
echo "Copied to $DEST ($(du -sh "$DEST" | cut -f1)). Commit and push spotle to publish."
