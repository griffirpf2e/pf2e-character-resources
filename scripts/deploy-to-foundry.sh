#!/usr/bin/env bash
# Deploy this module to the local Foundry VTT instance, then restart Foundry.
# Paths are for the project's known setup (see .cursor/skills/deploy-foundry-module/SKILL.md).

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DATA="${FOUNDRY_DATA:-$HOME/.local/share/FoundryVTT}"
MODULE_ID="pf2e-character-resources"
MODULE_DIR="$FOUNDRY_DATA/Data/modules/$MODULE_ID"

mkdir -p "$MODULE_DIR"
rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.cursor' \
  --exclude='scripts' \
  --exclude='README.md' \
  "$REPO_ROOT/module.json" \
  "$REPO_ROOT/src" \
  "$REPO_ROOT/styles" \
  "$REPO_ROOT/languages" \
  "$MODULE_DIR/"

# Normalize: ensure module.json and dirs live inside MODULE_DIR (rsync with trailing slash puts contents in MODULE_DIR)
# Above rsync puts module.json and dirs into MODULE_DIR; structure is correct.

echo "Deployed to $MODULE_DIR"

# Kill any running Foundry VTT
if pkill -x foundryvtt 2>/dev/null; then
  echo "Stopped existing Foundry VTT process."
  sleep 1
fi

# Start Foundry in background (user's foundryvtt command; --no-sandbox for typical Linux install)
echo "Starting Foundry VTT in background..."
foundryvtt --no-sandbox "$@" &
echo "Done. Open Foundry in your browser to test."
