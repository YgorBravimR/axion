#!/usr/bin/env bash
# Per-worktree Postgres isolation.
#
# Each worktree (Superset workspace or Claude Code worktree) gets its own
# database so parallel work doesn't trample shared state. The helper is
# stateless: setup writes the db name into the worktree .env, teardown reads
# it back. Same script works for both flows.
#
# Usage:
#   worktree-db.sh setup    [workspace-dir]   # default: $PWD
#   worktree-db.sh teardown [workspace-dir]   # default: $PWD
#
# Requirements:
#   - psql on PATH
#   - The workspace .env already exists (copied from root) with a valid
#     DATABASE_URL — we only rewrite the db path component, never the host.

set -euo pipefail

cmd="${1:-}"
ws="${2:-$PWD}"

if [ -z "$cmd" ]; then
  echo "usage: $0 <setup|teardown> [workspace-dir]" >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[worktree-db] psql not found on PATH" >&2
  exit 1
fi

env_file="$ws/.env"
if [ ! -f "$env_file" ]; then
  echo "[worktree-db] no .env at $env_file (did setup copy it yet?)" >&2
  exit 1
fi

# Derive a stable per-worktree db name from the workspace directory name.
# Postgres identifiers cap at 63 bytes; prefix + slug ≤ 63.
# Use parameter expansion (not `basename | tr`) so a trailing newline from
# basename isn't converted into a trailing underscore.
ws_base="${ws%/}"; ws_base="${ws_base##*/}"
slug="$(printf '%s' "$ws_base" | tr -c '[:alnum:]_' '_' | cut -c1-50)"
db="axion_wt_${slug}"

# Pull the current DATABASE_URL from .env (uncommented, last wins — matches
# the way dotenv loaders behave).
base_url="$(grep -E '^[[:space:]]*DATABASE_URL=' "$env_file" \
  | tail -n1 \
  | sed -E 's/^[[:space:]]*DATABASE_URL=//; s/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/')"

if [ -z "$base_url" ]; then
  echo "[worktree-db] no DATABASE_URL line in $env_file" >&2
  exit 1
fi

# Admin URL: same host/creds, but point at the built-in `postgres` db so we
# can issue CREATE/DROP DATABASE (can't do that while connected to the target).
admin_url="$(echo "$base_url" | sed -E 's#(postgresql://[^/]+)/[^?]*.*#\1/postgres#')"

# Per-worktree URL: same host/creds, swap db path, drop any query string.
new_url="$(echo "$base_url" | sed -E "s#(postgresql://[^/]+)/[^?]*(\\?.*)?\$#\\1/$db#")"

case "$cmd" in
  setup)
    echo "[worktree-db] target db: $db" >&2

    if psql "$admin_url" -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>/dev/null | grep -q 1; then
      echo "[worktree-db] db already exists, reusing" >&2
    else
      echo "[worktree-db] creating db..." >&2
      psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$db\";" >&2
    fi

    # Rewrite DATABASE_URL in the worktree .env. Replaces the first uncommented
    # DATABASE_URL= line; removes any duplicate uncommented ones; appends if
    # somehow missing. Commented lines and DATABASE_URL_STAGING are left alone.
    tmp="$(mktemp)"
    awk -v new="DATABASE_URL=\"$new_url\"" '
      BEGIN { replaced=0 }
      /^[[:space:]]*DATABASE_URL=/ {
        if (!replaced) { print new; replaced=1; next }
        else { next }
      }
      { print }
      END { if (!replaced) print new }
    ' "$env_file" > "$tmp"
    mv "$tmp" "$env_file"
    echo "[worktree-db] DATABASE_URL -> .../$db" >&2

    # Migrate + seed against the freshly created db.
    (
      cd "$ws"
      echo "[worktree-db] running pnpm db:migrate..." >&2
      pnpm db:migrate >&2
      echo "[worktree-db] running pnpm db:seed..." >&2
      pnpm db:seed >&2
    )
    echo "[worktree-db] setup complete" >&2
    ;;

  teardown)
    echo "[worktree-db] dropping db: $db" >&2
    # FORCE disconnects lingering sessions (PG 13+). Non-fatal — we never
    # want a stuck db to block the surrounding worktree cleanup.
    if ! psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE);" >&2 2>&1; then
      echo "[worktree-db] drop failed (continuing)" >&2
    fi
    ;;

  *)
    echo "[worktree-db] unknown command: $cmd" >&2
    exit 2
    ;;
esac
