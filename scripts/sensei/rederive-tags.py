#!/usr/bin/env python3
"""
rederive-tags — Authoritative tag re-derivation for Hawk T2 Live WIN trades.

Rebuilds the setup + error tag set on every trade from canonical rules, so the
stored data is internally consistent. Replaces ad-hoc historical tagging.

TAXONOMY (locked with Ygor 2026-06-28):

SETUP tags (descriptive — assigned to gate-VALID trades, from indicatorReadout
favorable flags; a trade can have several):
  MME60m  <- gate60m favorable (canonical gate side matches direction)
  MME15m  <- gate15m favorable (15m EMA aligned with direction)
  VWAP    <- vwapD favorable
  Ajuste  <- ajuste favorable

ERROR tags (rule breaches):
  Fora Operacional  <- asset != WIN (RULE 02) OR contra-gate per canonical 60m
                       (long into BEAR / short into BULL / INSIDE-no-prior) (RULE 01)
  Overtrading       <- trade taken after a discipline-limit breach (win OR loss
                       ending both count):
                         (a) after 3 REAL losses booked that day (R < -0.3; scratches
                             R in [-0.3, +] don't count)
                         (b) after a HUGE WIN (>= 2R) that day, the 2nd+ real loss /
                             any trade past the first post-bigwin real loss
                         (c) entry after 15:00 UTC (= noon BRT; "tarde e morto")

OPERATOR-ONLY (erased here; not derivable from price — Ygor re-applies by hand):
  FOMO         — emotional chase. A re-entry with conditions present is NOT FOMO
                 (RULE 03). Intent can't be read from candles, so we never auto-tag it.
  Pelo Celular — "I traded from my phone."
  Noticia      — discretionary news-event call.

Gate state comes from derive-gate.py output (/tmp/gate-by-trade-all.json), which
implements RULE 01 from BRAVO_I_Nuvem.pas (open+close vs EMA27/EMA55, carry-forward).

Usage:
    python rederive-tags.py            # dry-run: print derivation + diff
    python rederive-tags.py --commit   # POST set-tags per trade
"""
from __future__ import annotations
import argparse, json, sys, urllib.request
from datetime import datetime
from collections import defaultdict

AXION = "http://localhost:3011"
TOKEN = "axion-arch-bravo"
USER = "ygor@axion.com"
ACCT = "42aab2ef-eabf-4069-a1b7-524820ce2937"

REAL_LOSS = -0.3          # R below this = a real loss (scratches excluded)
HUGE_WIN = 2.0            # R at/above this = huge win -> 1-loss limit rest of day
DAY_LOSS_LIMIT = 3        # after this many real losses, further trades = overtrading
NOON_BRT_UTC_HOUR = 15    # 12:00 BRT == 15:00 UTC
REENTRY_WINDOW_S = 180    # 3 min
SAME_REGION_PTS = 20      # WIN


def post(p, b):
    req = urllib.request.Request(AXION + p, data=json.dumps(b).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "X-Arch-User": USER, "Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req).read())

def get(p):
    req = urllib.request.Request(AXION + p, headers={"Authorization": f"Bearer {TOKEN}", "X-Arch-User": USER})
    return json.loads(urllib.request.urlopen(req).read())

def f(v):
    try: return float(v)
    except (TypeError, ValueError): return None


def derive():
    post("/api/arch/accounts/switch", {"accountId": ACCT})
    tags = get("/api/arch/tags/list")["data"]["items"]
    TID = {t["name"]: t["id"] for t in tags}

    trades = []
    for off in (0, 100):
        trades += get(f"/api/arch/trades/list?dateFrom=2025-01-01&dateTo=2026-12-31&limit=100&offset={off}")["data"]["items"]

    gate = json.load(open("/tmp/gate-by-trade-all.json"))

    for t in trades:
        t["_dt"] = datetime.fromisoformat(t["entryDate"].replace("Z", "").replace("+00:00", ""))
        t["_r"] = f(t.get("realizedRMultiple"))
        t["_exit_dt"] = datetime.fromisoformat(t["exitDate"].replace("Z", "").replace("+00:00", "")) if t.get("exitDate") else None
        t["_entryPrice"] = f(t.get("entryPrice"))
    trades.sort(key=lambda x: x["_dt"])

    # Include ALL assets in session grouping so WDO trades are also re-derived
    # consistently (they get Fora Operacional for the asset breach, plus any
    # discipline-limit Overtrading; never setup tags since they aren't WIN setups).
    by_session = defaultdict(list)
    for t in trades:
        by_session[t["_dt"].date().isoformat()].append(t)

    derivation = {}

    for sess, day in by_session.items():
        day.sort(key=lambda x: x["_dt"])
        real_losses = 0
        had_huge_win = False
        post_bigwin_losses = 0
        prev = None
        for t in day:
            tid = t["id"]
            setup_tags = set()
            error_tags = set()
            g = gate.get(tid, {})
            gate_valid = g.get("valid", False)
            gate_side = g.get("gateSide")

            # ---- SETUP tags (only if gate-valid) ----
            ir = t.get("indicatorReadout") or {}
            if gate_valid:
                if gate_side in ("BULL", "BEAR"):
                    setup_tags.add("MME60m")  # canonical 60m gate favorable
                if (ir.get("gate15m") or {}).get("favorable"):
                    setup_tags.add("MME15m")
                if (ir.get("vwapD") or {}).get("favorable"):
                    setup_tags.add("VWAP")
                if (ir.get("ajuste") or {}).get("favorable"):
                    setup_tags.add("Ajuste")

            # ---- Fora Operacional: asset or contra-gate ----
            if (t.get("asset") or "").upper() != "WIN":
                error_tags.add("Fora Operacional")
            elif not gate_valid:
                error_tags.add("Fora Operacional")

            # FOMO is NOT auto-derived — emotional intent isn't readable from price
            # (RULE 03: a re-entry with conditions present is not a mistake).

            # ---- Overtrading: discipline-limit breaches ----
            over = False
            over_reasons = []
            # (a) after 3 real losses
            if real_losses >= DAY_LOSS_LIMIT:
                over = True; over_reasons.append("post-3-loss-limit")
            # (b) after huge win, the 2nd+ real loss / past first post-bigwin loss
            if had_huge_win and post_bigwin_losses >= 1:
                over = True; over_reasons.append("post-bigwin-1-loss-limit")
            # (c) entry after noon BRT (15:00 UTC)
            if t["_dt"].hour >= NOON_BRT_UTC_HOUR:
                over = True; over_reasons.append("after-noon-brt")
            if over:
                error_tags.add("Overtrading")

            derivation[tid] = {
                "entry": t["entryDate"],
                "dir": t.get("direction"),
                "asset": t.get("asset"),
                "r": t["_r"],
                "gateSide": gate_side,
                "gateValid": gate_valid,
                "setupTags": sorted(setup_tags),
                "errorTags": sorted(error_tags),
                "overtradingReasons": over_reasons,
                "sessionState": {"realLossesBefore": real_losses, "hadHugeWin": had_huge_win,
                                 "postBigwinLossesBefore": post_bigwin_losses},
                "currentTags": sorted(t.get("tagNames") or []),
            }

            # advance session counters AFTER classifying this trade
            if t["_r"] is not None and t["_r"] < REAL_LOSS:
                real_losses += 1
                if had_huge_win:
                    post_bigwin_losses += 1
            if t["_r"] is not None and t["_r"] >= HUGE_WIN:
                had_huge_win = True
            prev = t

    return derivation, TID, trades


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    derivation, TID, trades = derive()

    # Build final tagId arrays (setup + error). Pelo Celular / Noticia ERASED (not included).
    plan = {}
    for tid, d in derivation.items():
        names = d["setupTags"] + d["errorTags"]
        plan[tid] = [TID[n] for n in names if n in TID]

    # Diff summary
    from collections import Counter
    new_counts = Counter()
    for tid, d in derivation.items():
        for n in d["setupTags"] + d["errorTags"]:
            new_counts[n] += 1
    old_counts = Counter()
    for tid, d in derivation.items():
        for n in d["currentTags"]:
            old_counts[n] += 1

    print("=== TAG COUNT: OLD (stored) vs NEW (derived) ===")
    allnames = sorted(set(new_counts) | set(old_counts))
    print(f"  {'tag':22s} {'old':>5s} {'new':>5s}  {'delta':>6s}")
    for n in allnames:
        o, nw = old_counts.get(n, 0), new_counts.get(n, 0)
        print(f"  {n:22s} {o:5d} {nw:5d}  {nw-o:+6d}")

    erased = old_counts.get("Pelo Celular", 0) + old_counts.get("Noticia", 0)
    print(f"\n  ERASED (operator tags, need re-input): Pelo Celular={old_counts.get('Pelo Celular',0)}, Noticia={old_counts.get('Noticia',0)}")

    # Overtrading detail
    over = [(tid, d) for tid, d in derivation.items() if "Overtrading" in d["errorTags"]]
    print(f"\n=== OVERTRADING (new): {len(over)} trades ===")
    for tid, d in sorted(over, key=lambda x: x[1]["entry"]):
        print(f"  {tid[:8]} {d['entry'][:16]} {d['dir']:5s} R={d['r']:+.2f}  reasons={d['overtradingReasons']}  (was: {d['currentTags']})")

    if args.verbose:
        print(f"\n=== FULL DERIVATION ===")
        for tid, d in sorted(derivation.items(), key=lambda x: x[1]["entry"]):
            print(f"  {tid[:8]} {d['entry'][:16]} {d['dir']:5s} R={d['r']} gate={d['gateSide']}/{('OK' if d['gateValid'] else 'X')}")
            print(f"      setup={d['setupTags']} error={d['errorTags']}  was={d['currentTags']}")

    with open("/tmp/tag-derivation.json", "w") as fp:
        json.dump({"derivation": derivation, "plan": plan, "tagIds": TID}, fp, indent=2, default=str)
    print("\nSaved → /tmp/tag-derivation.json")

    if args.commit:
        print("\n=== COMMITTING set-tags per trade ===")
        ok = fail = 0
        for tid, tagIds in plan.items():
            try:
                post("/api/arch/trades/set-tags", {"tradeId": tid, "tagIds": tagIds})
                ok += 1
            except Exception as e:
                print(f"  {tid[:8]} FAIL: {e}")
                fail += 1
        print(f"  committed: {ok}, failed: {fail}")
    else:
        print("\n(dry-run — pass --commit to write)")


if __name__ == "__main__":
    main()
