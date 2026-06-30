#!/usr/bin/env python3
"""
derive-gate — Canonical 60m Nuvem gate state per trade (RULE 01).

For each WIN trade, find the most recent CLOSED 60m candle at/before entry, then
classify BULL / BEAR / INSIDE per BRAVO_I_Nuvem.pas:
  BULL  = open > ema27 AND open > ema55 AND close > ema27 AND close > ema55
  BEAR  = open < ema27 AND open < ema55 AND close < ema27 AND close < ema55
  INSIDE = otherwise; carries sideUltimo (last BULL/BEAR) forward

The gate is the SOLE entry validity criterion. A trade is gate-valid when:
  long  + side == BULL   (or INSIDE carrying BULL)
  short + side == BEAR   (or INSIDE carrying BEAR)

Walks the full 60m series chronologically to maintain sideUltimo (the carry-forward
side), exactly as the indicator does — so INSIDE candles inherit the prior confirmed
side rather than being treated as "no gate".

Output: JSON {tradeId: {entry, dir, gateSide, sideAtEntry, valid, sourceCandleTs}}
"""
from __future__ import annotations
import json, sys
from datetime import datetime
from pathlib import Path

import duckdb

PARQUET_60 = "/Users/ygorbravim/personal/projects/bravo/axion/data/parquet/candles/60/WIN.parquet"


def classify(open_, close_, ema27, ema55):
    """Return 1 (BULL), -1 (BEAR), 0 (INSIDE) per BRAVO_I_Nuvem.pas."""
    if open_ > ema27 and open_ > ema55 and close_ > ema27 and close_ > ema55:
        return 1
    if open_ < ema27 and open_ < ema55 and close_ < ema27 and close_ < ema55:
        return -1
    return 0


def build_gate_series():
    """Return chronologically-ordered list of 60m candles with carry-forward side."""
    conn = duckdb.connect(":memory:")
    rows = conn.execute(
        f"""
        SELECT timestamp, open, close, ema27, ema55
        FROM read_parquet('{PARQUET_60}')
        WHERE ema27 IS NOT NULL AND ema55 IS NOT NULL
        ORDER BY timestamp ASC, candle_index ASC
        """
    ).fetchall()
    series = []
    side_ultimo = 0
    for ts, o, c, e27, e55 in rows:
        side_atual = classify(o, c, e27, e55)
        if side_atual != 0:
            side_ultimo = side_atual
        series.append(
            {
                "ts": ts,
                "open": o,
                "close": c,
                "ema27": e27,
                "ema55": e55,
                "sideAtual": side_atual,  # this candle's own classification
                "sideUltimo": side_ultimo,  # carry-forward gate side
            }
        )
    return series


def gate_at(series, entry_dt):
    """Find the carry-forward gate side as of the most recent candle <= entry."""
    # series is sorted ascending; find last candle whose ts <= entry
    chosen = None
    for cand in series:
        if cand["ts"] <= entry_dt:
            chosen = cand
        else:
            break
    return chosen


def main():
    trades_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/all-trades-current.json"
    data = json.load(open(trades_path))
    trades = data["trades"]
    win = [t for t in trades if (t.get("asset") or "").upper() == "WIN"]

    series = build_gate_series()
    print(f"60m gate series: {len(series)} candles", file=sys.stderr)

    out = {}
    for t in win:
        entry_dt = datetime.fromisoformat(t["entryDate"].replace("Z", "").replace("+00:00", ""))
        direction = t.get("direction")
        cand = gate_at(series, entry_dt)
        if cand is None:
            out[t["id"]] = {
                "entry": t["entryDate"],
                "dir": direction,
                "gateSide": None,
                "valid": False,
                "reason": "no 60m candle at/before entry",
            }
            continue
        side = cand["sideUltimo"]  # carry-forward side is the gate
        side_label = {1: "BULL", -1: "BEAR", 0: "INSIDE-no-prior"}[side]
        if direction == "long":
            valid = side == 1
        elif direction == "short":
            valid = side == -1
        else:
            valid = False
        out[t["id"]] = {
            "entry": t["entryDate"],
            "dir": direction,
            "gateSide": side_label,
            "sideAtualOfSourceCandle": cand["sideAtual"],
            "valid": valid,
            "sourceCandleTs": cand["ts"].isoformat(),
        }

    Path("/tmp/gate-by-trade-all.json").write_text(json.dumps(out, indent=2, default=str))
    valid_n = len([v for v in out.values() if v["valid"]])
    print(f"Derived gate for {len(out)} WIN trades: {valid_n} valid, {len(out)-valid_n} invalid", file=sys.stderr)
    print("Saved → /tmp/gate-by-trade-all.json", file=sys.stderr)


if __name__ == "__main__":
    main()
