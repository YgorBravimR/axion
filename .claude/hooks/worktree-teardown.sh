#!/usr/bin/env bash
# WorktreeRemove hook: drop the worktree's isolated Postgres db, then rm the dir.
#
# Stdin JSON: {"worktree_path":"/absolute/path/to/worktree", ...}
#
# We intentionally swallow db-drop failures — if the db is already gone, or
# Postgres isn't reachable, we still want the directory to be cleaned up.

set -u

HOOK_INPUT="$(cat)"
WT="$(echo "$HOOK_INPUT" | jq -r '.worktree_path')"

if [ -z "$WT" ] || [ "$WT" = "null" ]; then
  echo "[worktree-teardown] no worktree_path in hook input" >&2
  exit 0
fi

REPO_ROOT="$(git -C "$WT" rev-parse --show-toplevel 2>/dev/null || true)"
HELPER=""
if [ -n "$REPO_ROOT" ] && [ -x "$REPO_ROOT/scripts/worktree-db.sh" ]; then
  HELPER="$REPO_ROOT/scripts/worktree-db.sh"
elif [ -x "$WT/scripts/worktree-db.sh" ]; then
  HELPER="$WT/scripts/worktree-db.sh"
fi

if [ -n "$HELPER" ] && [ -f "$WT/.env" ]; then
  bash "$HELPER" teardown "$WT" >&2 2>&1 || echo "[worktree-teardown] db cleanup failed (continuing)" >&2
else
  echo "[worktree-teardown] skipping db cleanup (no helper or no .env)" >&2
fi

rm -rf "$WT"
echo "[worktree-teardown] removed $WT" >&2
