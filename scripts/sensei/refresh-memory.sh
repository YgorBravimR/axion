#!/usr/bin/env bash
# sensei-refresh-memory — pulls live Axion analytics + command-center state
# into ~/.sensei/memory/*.json. Run before every weekly TradeSensei session.
#
# Usage:
#   bash scripts/sensei/refresh-memory.sh           # default: localhost:3011
#   AXION_BASE=https://... bash scripts/sensei/refresh-memory.sh
set -euo pipefail

AXION_BASE="${AXION_BASE:-http://localhost:3011}"
AXION_TOKEN="${AXION_TOKEN:-axion-arch-bravo}"
ARCH_USER="${ARCH_USER:-ygor@axion.com}"
MEM_DIR="${SENSEI_MEM_DIR:-$HOME/.sensei/memory}"

mkdir -p "$MEM_DIR"

fetch() {
  local name="$1" ep="$2"
  local code
  code=$(curl -s -o "$MEM_DIR/$name.json" -w "%{http_code}" \
    "$AXION_BASE/api/arch/$ep" \
    -H "Authorization: Bearer $AXION_TOKEN" \
    -H "X-Arch-User: $ARCH_USER")
  if [[ "$code" != "200" ]]; then
    echo "  ⚠ $name → HTTP $code (kept previous snapshot if any)"
    return 1
  fi
  # Pretty-print in place
  python3 -m json.tool "$MEM_DIR/$name.json" > "$MEM_DIR/$name.json.tmp" \
    && mv "$MEM_DIR/$name.json.tmp" "$MEM_DIR/$name.json"
  echo "  ✓ $name ($(wc -c <"$MEM_DIR/$name.json")B)"
}

ts=$(date +%Y-%m)
echo "Refreshing sensei memory from $AXION_BASE ..."
fetch stats                "analytics/stats" || true
fetch discipline           "analytics/discipline" || true
fetch streaks              "analytics/streaks" || true
fetch r-distribution       "analytics/r-distribution" || true
fetch expected-value       "analytics/expected-value" || true
fetch equity-curve         "analytics/equity-curve" || true
fetch perf-strategy        "analytics/performance?groupBy=strategy" || true
fetch perf-hour            "analytics/performance?groupBy=hour" || true
fetch perf-dayofweek       "analytics/performance?groupBy=dayOfWeek" || true
fetch "daily-pnl-$ts"      "analytics/daily-pnl?year=$(date +%Y)&month=$(date +%-m)" || true
fetch circuit-breaker      "command-center/circuit-breaker" || true
fetch daily-summary        "command-center/daily-summary" || true
fetch checklists           "command-center/checklists" || true
fetch strategies           "reference/strategies" || true
fetch tags                 "reference/tags" || true

# Stamp meta file with refresh timestamp + account
MEM_DIR="$MEM_DIR" AXION_BASE="$AXION_BASE" ARCH_USER="$ARCH_USER" python3 - <<'PY'
import json, os, datetime
mem = os.environ['MEM_DIR']
meta_path = os.path.join(mem, '_refreshed-at.json')
with open(meta_path, 'w') as f:
    json.dump({
        'refreshedAt': datetime.datetime.now().isoformat() + '+02:00',
        'axionBase': os.environ['AXION_BASE'],
        'archUser': os.environ['ARCH_USER'],
    }, f, indent=2)
print(f"  ✓ _refreshed-at.json")
PY

echo "Done. $(ls "$MEM_DIR"/*.json | wc -l | xargs) snapshot files in $MEM_DIR"
