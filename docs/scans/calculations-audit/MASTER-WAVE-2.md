# Calculations Audit — Master Ledger (Wave 2)

**Date**: 2026-06-08
**Scope**: Math zones NOT touched in Wave 1 — risk simulation + fractal plan, reports aggregation, dashboard + analytics card aggregation, optimization sweep math (non-Pareto). Plus a cross-cutting concern: do these zones reimplement Wave 1 metrics with different conventions?
**Method**: Same orchestrator (Opus 4.7) + 4 parallel scan subagents (Sonnet 4.6) pattern as Wave 1. Per-zone reports at `docs/scans/calculations-audit/wave2-1{1..4}-*.md`.

---

## Executive summary

**Wave 2 found zero BLOCKERs.** The Wave 1 BLOCKERs (annualization gap, missing CAGR) were the loud ones — Wave 2 confirms no equally-bad findings lurk in the surrounding aggregation, reporting, and sweep layers.

**Two MAJOR findings, both in Zone 12 (reports)** — both are code hygiene, not numerical correctness:

- `calculatePropProfit` is implemented twice with different signatures (mathematically identical, DRY violation).
- Annual report `patrimonio` label could be confused for a sum when it's actually a stock (final-month capital balance). No wrong-number bug today, but copy-paste risk.

**5 MINORs across Zones 11 + 12** — documentation, threshold guards, label clarifications.

**Zones 13 (dashboard) and 14 (optimization sweep) are completely clean** — zero findings.

**Important systemic finding from Zone 13**: dashboard + analytics components don't reimplement Wave 1 math — they receive already-computed server data. So Bundle A's annualization fix will propagate automatically to dashboards with no secondary fix needed. That's exactly the architectural pattern you want for fidelity propagation.

**Important systemic finding from Zone 14**: the parity bug we fixed in commit `1022fdc4` (Zod schema strip) **cannot recur in the sweep pipeline** — sweep mutates plain objects and stringifies whole structures rather than using schema filtering. The failure mode was specific to the server-action Zod gate. Sweep itself is structurally safe against this bug class.

---

## Per-zone status table

| #   | Zone                              | Status     | Blocker | Major | Minor | Report                              |
| --- | --------------------------------- | ---------- | ------- | ----- | ----- | ----------------------------------- |
| 11  | Risk simulation + Fractal Plan    | ✅ Clean   | 0       | 0     | 3     | `wave2-11-risk-simulation.md`       |
| 12  | Reports aggregation               | ⚠️ Hygiene | 0       | 2     | 3     | `wave2-12-reports.md`               |
| 13  | Dashboard + analytics aggregation | ✅ Clean   | 0       | 0     | 0     | `wave2-13-dashboard-aggregation.md` |
| 14  | Optimization sweep (non-Pareto)   | ✅ Clean   | 0       | 0     | 0     | `wave2-14-optimization-sweep.md`    |

---

## Severity-ranked findings

### MAJOR 1 — Duplicate `calculatePropProfit` implementations (Zone 12)

`calculatePropProfit` is defined in `src/app/actions/reports.ts` AND in a legacy API route, with different signatures. **Mathematically identical** so no wrong-number bug today, but DRY violation creates drift risk — a future fix applied to one site won't propagate to the other.

**Fix shape**: consolidate to `src/lib/reports/calculate-prop-profit.ts`, import from both call sites, delete the duplicate.

**Why MAJOR not MINOR**: even though numerically clean today, this is the same class of risk as the orphan `calculateWinRate` issue from Wave 1 — two sites that COULD diverge silently. Codifying the single source of truth now prevents the silent-divergence variant of the bug.

### MAJOR 2 — `patrimonio` semantic ambiguity in annual reports (Zone 12)

Annual report footer shows the FINAL month's `patrimonio` (capital balance — a stock) as a single value. Mathematically correct for displaying a stock. But the label sits next to flow values (P&L, deposits, withdrawals) without disambiguation, and a future "yearly patrimonio" tile copy-pasting this would naturally sum across months, producing a meaningless number.

**Fix shape**: rename to `patrimonioFinal` (or `endOfPeriodCapital`) in the data shape; tooltip in UI explains "balance as of period end".

### MINOR findings (5 total)

**Zone 11 (Risk simulation):**

1. `drawdown-trigger.ts` allows user-set threshold with no bounds check (default 2.0R). Recommend `0.5R ≤ threshold ≤ 5R` guard on creation/edit.
2. `getHistoricalAssertivity()` computes day-level assertivity (win days / total days), not trade-level. UI should label "daily assertivity (%)"; JSDoc should clarify.
3. Tier clamping convention (capital above top ladder → top tier) is a defensible design choice; worth documenting in `docs/code-conventions.md` for future maintainers.

**Zone 12 (Reports):** 4. `MensalMaximo` totals sum monthly estimates — cosmetically odd (summing maxes), not incorrect for the displayed purpose. 5. Annual report tax estimation uses simple `netCents × rate` without DARF rigor (no R$10 floor, no carryover). **OK as a preview**, but if productionized as a tax-filing document, must integrate with `darf-calculator.ts`.

---

## Cross-zone themes

### Theme 1 — Architecture is doing its job

The most important Wave 2 finding is what we DIDN'T find: dashboard cards, analytics components, reports, and the sweep pipeline don't reimplement Wave 1 math. They either:

- Receive already-computed server data (dashboards, analytics — Zone 13)
- Import canonical helpers from Wave 1 verified files (risk simulation imports `calculateDrawdown`, `calculateRMultiple` — Zone 11)
- Operate on plain objects without schema filtering (sweep pipeline — Zone 14, immune to the parity-bug class)

This means **Bundle A's annualization fix propagates automatically** to most user-facing surfaces. No secondary refactor needed.

### Theme 2 — The remaining drift risk is in `reports.ts`

The two Zone 12 MAJORs are both hygiene issues in `reports.ts`. Reports have a tendency to grow ad-hoc helpers (because each report has unique needs) and to drift from the canonical math layer. The `calculatePropProfit` duplication and the `patrimonio` ambiguity are symptoms of this. A single consolidation pass would address both.

### Theme 3 — No new convention drift discovered

Wave 1 surfaced two convention drifts: population vs sample std dev, and the misleading `calculateWinRate` signature. Wave 2 didn't find a third such drift. Every metric Wave 2 zones compute uses the conventions already documented in `docs/code-conventions.md` (post-Bundle B). That's the result you'd expect from a system that's now self-policing on financial math conventions — the doc is doing its job.

---

## Recommended fix bundles

### Bundle E — Zone 12 hygiene (resolves both MAJORs + MINOR #5)

**Files**:

- New: `src/lib/reports/calculate-prop-profit.ts` (single canonical implementation)
- Modify: `src/app/actions/reports.ts` — import from the new lib
- Delete: the legacy API-route duplicate
- Modify: `src/app/actions/annual-reports.types.ts` — rename `patrimonio` → `patrimonioFinal` (or add `endOfPeriodCapital`)
- Modify: any consumer that reads `patrimonio` from the type
- Migrate: annual report tax estimation to call `darf-calculator.ts` for production-grade rigor (or keep as preview-only and label clearly)

**Test**: existing annual report snapshot tests should still pass; add one test for the `patrimonioFinal` naming change.

**Risk**: low. Pure renames + dedup. No numerical changes.

### Bundle F — Zone 11 minors (3 docs / guards)

**Files**:

- `src/lib/fractal-plan/drawdown-trigger.ts` — add bounds check `0.5 ≤ threshold ≤ 5`
- `src/lib/fractal-plan/historical-assertivity.ts` — JSDoc clarifying day-level semantic
- `docs/code-conventions.md` — add note on tier clamping convention

**Risk**: none.

---

## Decision points for the user

When you're back:

1. **Bundle E (Zone 12 hygiene)** — pursue now, or defer? Recommend pursuing — touches reports which feed into tax decisions, low risk, high clarity gain.
2. **Bundle F (Zone 11 minors)** — bundle with E, or separate? Recommend bundling since both are small and same character.
3. **Wave 3 candidates** — out-of-Wave-1-and-2 scope items remain:
   - **Unit conversion** (cents↔reais↔ticks↔points↔R) — a different class of bug, but high probability of finding real issues
   - **Date / TZ / EOD math** — Hawks day-boundary handling has bitten us before
   - **Display formatters + locale** — where "wrong number on screen" bugs live even when math is right

   None are blockers. Wave 3 timing is your call.

---

## What Wave 2 ruled OUT

The honest read: Wave 2 was a "search for more BLOCKERs in the surrounding layers" and found none. That's a meaningful negative result — it tells us:

- The user-facing dashboard numbers WILL be correct once Bundle A's annualization ships, because dashboards don't recompute.
- Reports won't silently disagree with backtests, because they share the same underlying aggregation primitives.
- The Hawks parity bug pattern (Zod schema strip) won't manifest in the sweep pipeline — different code path, different failure mode.

The system's math fidelity is now characterized: Wave 1 fixed the loud bugs (Bundles A + B + C); Wave 2 confirmed no quiet equally-bad bugs lurk in the surrounding layers. Remaining work (E + F) is hygiene and clarity, not correctness.
