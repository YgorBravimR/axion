#!/bin/bash
# WorktreeCreate hook: replaces default git worktree creation.
# Creates the worktree, copies .env files, runs pnpm install.
#
# IMPORTANT: This hook REPLACES default git worktree behavior.
# It must: 1) create the worktree, 2) print its absolute path to stdout.
# All other output MUST go to stderr so it doesn't interfere with the path.
#
# Stdin JSON: {"cwd":"/path/to/repo","name":"worktree-slug",...}

HOOK_INPUT="$(cat)"
MAIN_REPO="$(echo "$HOOK_INPUT" | jq -r '.cwd')"
WORKTREE_NAME="$(echo "$HOOK_INPUT" | jq -r '.name')"
WORKTREE_DIR="$MAIN_REPO/.claude/worktrees/$WORKTREE_NAME"
BRANCH_NAME="worktree-$WORKTREE_NAME"

if [ -z "$MAIN_REPO" ] || [ -z "$WORKTREE_NAME" ]; then
  echo "Missing cwd or name in hook input" >&2
  exit 1
fi

# If worktree already exists and is valid, reuse it
if [ -d "$WORKTREE_DIR/.git" ] || [ -f "$WORKTREE_DIR/.git" ]; then
  echo "Worktree already exists, reusing: $WORKTREE_DIR" >&2
else
  # Clean up stale state if directory exists but isn't a valid worktree
  if [ -d "$WORKTREE_DIR" ]; then
    echo "Removing stale worktree dir: $WORKTREE_DIR" >&2
    rm -rf "$WORKTREE_DIR"
  fi

  # Prune any stale worktree references
  git -C "$MAIN_REPO" worktree prune >&2 2>&1

  # Delete the branch if it exists (so we get a fresh one from HEAD)
  git -C "$MAIN_REPO" branch -D "$BRANCH_NAME" >&2 2>&1 || true

  mkdir -p "$(dirname "$WORKTREE_DIR")"

  echo "Creating worktree at $WORKTREE_DIR..." >&2
  if ! git -C "$MAIN_REPO" worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" HEAD >&2 2>&1; then
    if ! git -C "$MAIN_REPO" worktree add "$WORKTREE_DIR" HEAD >&2 2>&1; then
      echo "Failed to create git worktree" >&2
      exit 1
    fi
  fi
fi

# Print the path IMMEDIATELY so Claude Code doesn't time out waiting for it
echo "$WORKTREE_DIR"

# Copy settings.local.json so worktree inherits permissions and MCP configs
if [ -f "$MAIN_REPO/.claude/settings.local.json" ]; then
  mkdir -p "$WORKTREE_DIR/.claude"
  cp "$MAIN_REPO/.claude/settings.local.json" "$WORKTREE_DIR/.claude/settings.local.json"
  echo "  Copied settings.local.json" >&2
fi

# Copy all .env files to worktree
cd "$MAIN_REPO" || { echo "Failed to cd to main repo" >&2; exit 1; }
find . -name '.env*' \
  -not -path '*/node_modules/*' \
  -not -path '*/.claude/*' \
  -not -path '*/.next/*' \
  -type f | while read -r envfile; do
  dest="$WORKTREE_DIR/$envfile"
  mkdir -p "$(dirname "$dest")"
  cp "$envfile" "$dest"
  echo "  Copied $envfile" >&2
done

# Install dependencies
cd "$WORKTREE_DIR" || { echo "Failed to cd to worktree" >&2; exit 1; }
echo "Running pnpm install..." >&2
pnpm install --frozen-lockfile >&2 2>&1 || echo "Warning: pnpm install failed" >&2

# Provision an isolated Postgres db for this worktree, rewrite DATABASE_URL,
# then migrate + seed. Non-fatal so a missing/unreachable local Postgres
# doesn't block the worktree from being usable for non-db work.
if [ -x "$WORKTREE_DIR/scripts/worktree-db.sh" ]; then
  echo "Provisioning worktree database..." >&2
  bash "$WORKTREE_DIR/scripts/worktree-db.sh" setup "$WORKTREE_DIR" >&2 2>&1 \
    || echo "Warning: worktree db setup failed (continuing)" >&2
else
  echo "Skipping db provisioning (scripts/worktree-db.sh not found)" >&2
fi

echo "Worktree setup complete." >&2
