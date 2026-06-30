#!/usr/bin/env python3
"""
backfill-mfe-mae — Compute MFE/MAE (in R units) for Hawk T2 Live WIN trades.

Reads trade list from Axion API, replays 30m time-based candles between entry and
exit timestamps, computes max favorable / adverse excursion in points, divides
by R-size = abs(entryPrice - stopLoss), and writes results back via
POST /trades/update {mfeR, maeR}.

Why 5m Renko (timeframe=5): the "5/15/60" parquets store Renko bars timestamped
at brick close. While multiple bricks can share a wallclock (gap fills), each
brick's high/low/close is an actual price extreme during that brick's life.
For MFE/MAE we just need the bricks whose timestamp falls within the trade's
active window — the union of their highs/lows gives the price excursion. The
"5" parquet has the finest grain + the most complete coverage (through 06-26).

Usage:
    python backfill-mfe-mae.py --dry-run        # compute + print, no write
    python backfill-mfe-mae.py --commit         # write back to Axion
    python backfill-mfe-mae.py --commit --only <tradeId>  # single trade
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

AXION_BASE = "http://localhost:3011"
AXION_TOKEN = "axion-arch-bravo"
AXION_USER = "ygor@axion.com"
HAWK_T2_LIVE = "42aab2ef-eabf-4069-a1b7-524820ce2937"
CANDLE_QUERY = "/Users/ygorbravim/personal/projects/bravo/axion/scripts/sensei/candle-query.py"


def fnum(v):
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def axion_get(path: str) -> dict:
    req = urllib.request.Request(
        f"{AXION_BASE}{path}",
        headers={
            "Authorization": f"Bearer {AXION_TOKEN}",
            "X-Arch-User": AXION_USER,
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def axion_post(path: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{AXION_BASE}{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {AXION_TOKEN}",
            "X-Arch-User": AXION_USER,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def fetch_all_trades() -> list:
    axion_post("/api/arch/accounts/switch", {"accountId": HAWK_T2_LIVE})
    out = []
    offset = 0
    while True:
        d = axion_get(
            f"/api/arch/trades/list?dateFrom=2025-01-01&dateTo=2026-12-31&limit=100&offset={offset}"
        )
        items = d["data"]["items"]
        out.extend(items)
        if not d["data"]["pagination"]["hasMore"]:
            break
        offset += 100
    return out


def query_candles_5(date_from: str, date_to: str) -> list:
    """Return rows = [[timestamp, open, high, low, close], ...] from 5-Renko WIN parquet."""
    cmd = [
        "python3",
        CANDLE_QUERY,
        "WIN",
        "5",
        date_from,
        date_to,
        "--columns",
        "timestamp,open,high,low,close",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, env={**os.environ})
    if res.returncode != 0:
        print(f"  candle-query error: {res.stderr[:200]}", file=sys.stderr)
        return []
    try:
        d = json.loads(res.stdout)
        return d.get("rows", [])
    except json.JSONDecodeError:
        print(f"  candle-query bad output: {res.stdout[:200]}", file=sys.stderr)
        return []


def parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "").replace("+00:00", ""))


def compute_mfe_mae_r(trade: dict, candles: list) -> tuple[float | None, float | None, dict]:
    """Return (mfeR, maeR, debug)."""
    direction = trade.get("direction")  # 'long' | 'short'
    entry = fnum(trade.get("entryPrice"))
    stop = fnum(trade.get("stopLoss"))
    entry_dt = parse_ts(trade["entryDate"])
    exit_dt = parse_ts(trade["exitDate"]) if trade.get("exitDate") else None

    if not (direction and entry and stop and exit_dt):
        return None, None, {"reason": "missing entry/stop/exit fields"}

    r_size = abs(entry - stop)
    if r_size <= 0:
        return None, None, {"reason": "invalid R-size", "rSize": r_size}

    # Renko bricks close on price movement, not time — a 1-minute trade may
    # have ZERO bricks closing inside its window. To capture the trade's actual
    # price excursion, we widen the search to [entry-5min, exit+5min] and then
    # include: (1) the LAST brick whose close ≤ entry (sets the pre-trade
    # boundary so we know the price at entry), (2) all bricks with close
    # between entry and exit, (3) the FIRST brick whose close ≥ exit (envelops
    # the post-trade boundary, in case the actual high/low happened within
    # that final brick before its close).
    pad = timedelta(minutes=5)
    candidates = sorted(
        [
            {"ts": parse_ts(row[0]), "open": row[1], "high": row[2], "low": row[3], "close": row[4]}
            for row in candles
            if entry_dt - pad <= parse_ts(row[0]) <= exit_dt + pad
        ],
        key=lambda b: b["ts"],
    )

    if not candidates:
        return None, None, {"reason": "no Renko bricks in trade window (±5min)"}

    # The trade's true price-excursion bricks are those that include the entry
    # price level OR have ts between entry and exit. Concretely:
    # - in-window bricks (ts in [entry, exit]) — always include
    # - the brick immediately straddling entry (the first brick whose ts >= entry,
    #   or the last brick whose ts < entry if no equal/after exists by exit)
    in_window = [b for b in candidates if entry_dt <= b["ts"] <= exit_dt]
    before = [b for b in candidates if b["ts"] < entry_dt]
    after = [b for b in candidates if b["ts"] > exit_dt]

    relevant = list(in_window)
    if before:
        relevant.insert(0, before[-1])  # last brick before entry
    if after and not in_window:
        # Trade was so short no brick closed inside it; the next brick's range
        # bounds the excursion.
        relevant.append(after[0])

    if not relevant:
        return None, None, {"reason": "no straddling bricks found"}

    # Track high-water excursion across the trade lifetime
    # For LONG: MFE = max(high) - entry, MAE = entry - min(low)
    # For SHORT: MFE = entry - min(low), MAE = max(high) - entry
    highs = [b["high"] for b in relevant]
    lows = [b["low"] for b in relevant]
    max_h = max(highs)
    min_l = min(lows)

    if direction == "long":
        mfe_pts = max_h - entry
        mae_pts = entry - min_l
    else:  # short
        mfe_pts = entry - min_l
        mae_pts = max_h - entry

    mfe_r = round(mfe_pts / r_size, 3)
    mae_r = round(mae_pts / r_size, 3)

    return (
        mfe_r,
        mae_r,
        {
            "rSize": r_size,
            "barsScanned": len(relevant),
            "firstBar": relevant[0]["ts"].isoformat(),
            "lastBar": relevant[-1]["ts"].isoformat(),
            "maxH": max_h,
            "minL": min_l,
            "mfePts": mfe_pts,
            "maePts": mae_pts,
        },
    )


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--commit", action="store_true", help="POST updates to Axion (otherwise dry-run)")
    p.add_argument("--only", help="single tradeId to process")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args()

    print("Fetching trades from Axion (Hawk T2 Live)...")
    trades = fetch_all_trades()
    win = [
        t
        for t in trades
        if (t.get("asset") or "").upper() == "WIN" and t.get("exitDate")
    ]
    if args.only:
        win = [t for t in win if t["id"].startswith(args.only)]
    print(f"WIN trades with exitDate: {len(win)}")

    # Group by date to minimize candle queries
    by_date: dict[str, list] = {}
    for t in win:
        d = t["entryDate"][:10]
        by_date.setdefault(d, []).append(t)

    results = []
    skipped = []

    for date_str, day_trades in sorted(by_date.items()):
        if args.verbose:
            print(f"\n{date_str}: {len(day_trades)} trades")
        candles = query_candles_5(date_str, date_str)
        if not candles and args.verbose:
            print(f"  no 5-Renko bricks found for {date_str}")
        for t in day_trades:
            mfe_r, mae_r, dbg = compute_mfe_mae_r(t, candles)
            if mfe_r is None:
                skipped.append({"id": t["id"][:8], "reason": dbg.get("reason")})
                if args.verbose:
                    print(f"  {t['id'][:8]} SKIP: {dbg.get('reason')}")
                continue
            actual_r = fnum(t.get("realizedRMultiple"))
            sanity = mfe_r >= actual_r if actual_r is not None else True
            results.append(
                {
                    "id": t["id"],
                    "id_short": t["id"][:8],
                    "date": date_str,
                    "dir": t["direction"],
                    "entry": fnum(t.get("entryPrice")),
                    "exit": fnum(t.get("exitPrice")),
                    "stop": fnum(t.get("stopLoss")),
                    "rActual": actual_r,
                    "mfeR": mfe_r,
                    "maeR": mae_r,
                    "rSize": dbg.get("rSize"),
                    "bars": dbg.get("barsScanned"),
                    "sanityMfeGeActual": sanity,
                }
            )
            if args.verbose:
                print(
                    f"  {t['id'][:8]} {t['direction'][:5]:5s}  R={actual_r:+.2f}  mfeR={mfe_r:+.2f}  maeR={mae_r:+.2f}  bars={dbg.get('barsScanned')}  sanity={'OK' if sanity else 'WARN'}"
                )

    print(f"\n=== Summary ===")
    print(f"Computed: {len(results)}")
    print(f"Skipped:  {len(skipped)}")

    # Sanity check
    sanity_fails = [r for r in results if not r["sanityMfeGeActual"]]
    print(f"Sanity (mfeR >= realized R): {len(results) - len(sanity_fails)}/{len(results)} OK")
    if sanity_fails:
        print("  FAILURES (first 10):")
        for r in sanity_fails[:10]:
            print(
                f"    {r['id_short']} {r['date']} {r['dir'][:5]:5s}  actual={r['rActual']:+.3f}  mfeR={r['mfeR']:+.3f}"
            )

    # Persist results regardless of commit
    out_path = Path("/tmp/mfe-mae-backfill.json")
    out_path.write_text(json.dumps({"results": results, "skipped": skipped}, indent=2))
    print(f"Results → {out_path}")

    if args.commit:
        print("\nCommitting to Axion (POST /trades/update per trade)...")
        ok = 0
        fail = 0
        for r in results:
            try:
                axion_post(
                    "/api/arch/trades/update",
                    {"id": r["id"], "mfeR": r["mfeR"], "maeR": r["maeR"]},
                )
                ok += 1
            except Exception as e:
                print(f"  {r['id_short']} FAIL: {e}")
                fail += 1
        print(f"  committed: {ok}, failed: {fail}")
    else:
        print("\n(dry-run — pass --commit to write back)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
