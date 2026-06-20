# Keltner Outer Block — A/B audit results

**Date**: 2026-06-15.
**Window**: 2026-03-02 → 2026-06-13 (full catalog, 8,280 5m bricks).
**Script**: [`scripts/audit-keltner-outer-block-ab.ts`](../../scripts/audit-keltner-outer-block-ab.ts)
**Engine commit**: `45c81f97` (initial wiring of `qualityGates.keltnerOuterBlock`).

## TL;DR

**The veto fires ZERO times in the catalog.** OFF and ON variants produce **identical** results — same 332 trades, same R$ 926.81 net PnL, same win rate, same R-multiple. The veto code path is exercised on every brick (instrumented and confirmed via `scripts/keltner-veto-trace.ts`) but never matches. The methodology-correct walker is plumbed correctly; the engine's playbook fires and the KC outer touch+reject events live on **disjoint sets of bricks**.

Same disjoint-signal pattern as Group D (VWAP). Two methodologically-correct readers that happen to live in completely separate brick ranges.

## Raw numbers

| Metric                      | OFF           | ON            | Δ          |
| --------------------------- | ------------- | ------------- | ---------- |
| trades                      | 332           | 332           | 0          |
| net PnL                     | R$ 926.81     | R$ 926.81     | 0          |
| win / loss / BE             | 75 / 160 / 97 | 75 / 160 / 97 | 0          |
| win rate                    | 22.59%        | 22.59%        | 0          |
| gross win                   | R$ 15,664.23  | R$ 15,664.23  | 0          |
| gross loss                  | R$ 14,737.42  | R$ 14,737.42  | 0          |
| profit factor               | 1.06          | 1.06          | 0          |
| avg R-multiple              | 0.076         | 0.076         | 0          |
| **trades OFF→vetoed in ON** | —             | —             | **0**      |
| trading days affected       | —             | —             | **0 / 53** |

## Why zero vetoes

Per-brick diagnostic (one-shot script, not retained — instrumented the engine to log the walker class at every fire brick). Distribution of KC walker class at the 331 engine fire bricks:

| KC class at engine fire brick       | Count |
| ----------------------------------- | ----: |
| `NONE`                              |   323 |
| `TOUCH_KC1_INF` (inner)             |     5 |
| `TOUCH_KC1_SUP` (inner)             |     1 |
| `TOUCH_KC2_SUP` (outer touch)       |     1 |
| `REJECT_KC1_SUP_NEXT_BRICK` (inner) |     1 |
| **outer rejects** (`REJECT_KC2_*`)  | **0** |

For comparison, the full-catalog distribution (from the Group C audit script and reconfirmed here):

- `REJECT_KC2_INF_SAME_BRICK` = 4 bricks (0.05% of catalog)
- `REJECT_KC2_INF_NEXT_BRICK` = 4 bricks (0.05%)
- `REJECT_KC2_SUP_SAME_BRICK` = 3 bricks (0.04%)
- `REJECT_KC2_SUP_NEXT_BRICK` = 2 bricks (0.02%)
- **Total outer rejects: 13 bricks** across 8,280

Engine fires on 331 bricks; outer rejects on 13. Random-overlap expectation: ~0.5 trades. Observed: 0. **The disjointness is consistent with chance**, not a bug.

## Two reads of the result

### Read A — the veto is dead code in practice

The Hawks playbook engine already filters fires through the HTF gate, the 5-brick cooldown, and per-playbook structural conditions. Outer-band exhaustion bricks may already be excluded by one of those upstream filters. If so, the keltner veto is policy-correct but operationally inert — it adds complexity (a second walker, snapshot threading, config plumbing) for zero observed behavior change.

### Read B — the veto is methodology-correct but mis-scoped

The methodology spec (per Ygor's session 2026-06-15) defined the touch+reject as a **same-brick OR next-brick** signal. Maybe the methodologically-correct exhaustion veto should look at a **wider window** — e.g., "veto a fire if any of the last 3-5 bricks was an outer touch+reject." That would 4-7× the surface area. The current narrow window may be too tight to see the signal even when it's there.

Read B is plausible because:

- Outer-reject bricks (13/year) are too rare to align by chance with playbook fire bricks (~50/year by random-overlap math, observed 0).
- The methodology calls the outer band an "exhaustion" level — exhaustion at brick N reasonably implies "don't enter against the trend for the next several bricks", not just brick N+1.
- The current implementation is the literal minimum interpretation; a wider window matches the trader's mental model better.

**My recommendation**: Don't promote the gate as default-on yet. Two follow-ups before this is decision-ready:

1. **Sanity-check the same-brick spec with Ygor.** Confirm whether the methodology truly intends a 1-brick window or whether the intended window is wider. Single-brick was my interpretation of the audit + walker design; widening is a 1-line change in `isKeltnerOuterVeto`.
2. **Re-run the A/B with a 3-brick and a 5-brick window.** If the wider window still produces zero or near-zero vetoes, that's strong evidence for Read A and we should consider removing the wiring rather than shipping an inert feature.

## Sanity-check log

- Walker correctly emits `REJECT_KC2_*` classes on the 13 expected bricks (matches Group C audit).
- Engine queries walker on every fire brick — 0 misses (`missing-from-walker fire bricks: 0`).
- `keltnerOuterBlock: false` (default) leaves the walker unbuilt — zero overhead. Confirmed.
- 7 unit tests still pass (`hawks-playbook-keltner-veto.test.ts`).

## File pointers

- Veto logic: `src/lib/backtest/modules/entry/hawks-playbook.ts:79-105` (`isKeltnerOuterVeto`)
- Walker build: `src/lib/backtest/engine.ts:128-136` (lazy on `keltnerOuterBlock === true`)
- Audit script: `scripts/audit-keltner-outer-block-ab.ts`
- Group C audit doc: `docs/hawks-strategy/indicator-isolation/group-c-keltner.md`
