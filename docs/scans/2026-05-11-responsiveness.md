# Subject Sweep — Responsiveness (mobile + tablet)

**Date**: 2026-05-11
**Subject**: #5 from `docs/scan-roi-plan-2026-05-07.md` (recommended execution order)
**Scope**: `src/components/**`, `src/app/**/*.tsx`

## Why this subject

Traders check the dashboard on phone pre/post-market (pre-open prep, post-close review). Cockpit (`plan`), command-center, and journal forms are the most-likely-to-be-desktop-only surfaces. The design brief mandates fluid `clamp()` typography that "scales gracefully from mobile to desktop" — so layout-level breaks would betray the system promise.

## Phase 0 — detectors run

```bash
# Fixed pixel widths (potential overflow on small viewports)
rg -n '\bw-\[[0-9]+px\]' src/ -g '*.tsx'                                # 35 hits
rg -n '\b(min|max)-w-\[[0-9]+px\]' src/ -g '*.tsx'                      # 32 hits

# Fixed pixel heights (chart containers, mostly already responsive)
rg -n '\bh-\[[0-9]+px\]' src/ -g '*.tsx'                                # 35 hits

# Grids of 3+ columns without responsive breakpoint
rg -n 'grid-cols-[3-9]' src/components -g '*.tsx' \
  | rg -v 'sm:|md:|lg:|grid-cols-(1|2)'                                  # 12 hits

# Overflow-x escape hatches (often signals intentional scrollable rows)
rg -n 'overflow-x-' src/components -g '*.tsx'                           # 25 hits
```

## Phase 1 — findings classified

| Cluster                                                                                         | Severity   | Status                                                                                                                                                                              | Action                                         |
| ----------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **A** `min-w-[44px]` / `min-h-[44px]` on touch-target buttons                                   | n/a        | 3 hits (`market-status-panel`, `market-monitor-content`, `risk-simulation-content`) — WCAG AAA touch-target compliance                                                              | skip — correct usage                           |
| **B** Fixed-width data columns inside `overflow-x-auto` parents                                 | n/a        | `inline-execution-row.tsx`, `scaled-trade-form.tsx` 480px-min grids with `sm:after:hidden` fade-out indicators — intentional horizontal scroll on mobile for a 6-col execution grid | skip — intentional                             |
| **C** `lg:max-w-[380px] lg:min-w-[300px]` chart sidebars                                        | n/a        | `trade-chart-view.tsx` — only at `lg:` breakpoint, hidden below                                                                                                                     | skip                                           |
| **D** `w-full sm:w-auto sm:min-w-[X]` mobile-first patterns                                     | n/a        | `live-trading-status-panel.tsx` (4 hits), `command-center` widgets, `csv-import.tsx`                                                                                                | skip — correct mobile-first                    |
| **E** Chart container `h-[Npx] sm:h-[Npx+50] lg:h-[Npx+100]`                                    | n/a        | 14 hits across `dashboard/`, `analytics/`, `equity-shield/`, `risk-simulation/` — all responsive-graduated                                                                          | skip                                           |
| **F** `flex flex-wrap` rows with `min-w-[200px]` on wrapped block                               | n/a        | `analytics/filter-panel.tsx:342` — wraps on narrow screens, `min-w` only kicks in after wrap                                                                                        | skip                                           |
| **G** `grid-cols-3` for 3 wide values (text-h3 BRL numbers) without breakpoint                  | **medium** | `fractal-plan/cockpit/what-if-calculator.tsx:124` — 3 large currency values would cramp/overflow below ~360px                                                                       | **fixed**: `grid-cols-1 sm:grid-cols-3`        |
| **H** `grid-cols-3` for 3 number inputs without breakpoint (inconsistent with sibling sections) | **medium** | `backtest/sections/dezk-entry-section.tsx:46` — MACD inputs row. Sibling rows (WMA, time) already use `grid-cols-2 sm:grid-cols-4`                                                  | **fixed**: `grid-cols-1 sm:grid-cols-3`        |
| **I** `grid-cols-3` Select groups (heatmap X/Y/filter, sweep min/max/step)                      | low        | `optimize/parameter-heatmap.tsx:328`, `optimize/sweep-config-panel.tsx:331` — Selects ellipsize; usable but tight at <320px                                                         | deferred (optimize is desktop-first by design) |
| **J** `grid-cols-4`/`grid-cols-3` rows inside Sheet slideovers (`trade-info-executions-tab`)    | low        | Slideovers are ≥380px wide → 4×~85px columns fit                                                                                                                                    | skip                                           |

## Phase 5a — key insight on `grid-cols-N` audit

A `grid-cols-3` without an `sm:` fallback is **not automatically a bug**. Severity depends on what's _in_ the cells:

- **Selects / Inputs / Buttons**: Radix Select and `<input>` shrink to fit and ellipsize → usually OK
- **Small mono numbers (`+15.5R`, `74%`)**: `text-tiny` glyphs are ~6-8px wide → 3 cols of 5-char strings fit in 320px
- **Large display numbers (`text-h3` currency like `R$15.000,00`)**: ~28-32px font × 10+ chars = needs ~280px per cell → guaranteed overflow at 3-up below ~960px
- **Long text labels**: depends on truncation strategy

Triaging the 12 detector hits this way collapsed them to **2 real fixes**.

The codebase's dominant responsive pattern is sound: `flex flex-wrap` + `space-y-*` + mobile-first `w-full sm:w-auto`. Files with **no** breakpoint prefixes at all are usually fine because their natural-flow layout adapts. Files with explicit `grid-cols-N` are the ones to audit, because grid is the one layout primitive that doesn't reflow without breakpoint help.

## Phase 5b — fixes applied (2 total)

| File                                                             | Before                       | After                                       | Why                                                               |
| ---------------------------------------------------------------- | ---------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| `src/components/fractal-plan/cockpit/what-if-calculator.tsx:124` | `text-tiny grid grid-cols-3` | `text-tiny grid grid-cols-1 sm:grid-cols-3` | `text-h3` BRL values cramp/overflow below 360px viewports         |
| `src/components/backtest/sections/dezk-entry-section.tsx:46`     | `gap-m-400 grid grid-cols-3` | `gap-m-400 grid grid-cols-1 sm:grid-cols-3` | 3 number inputs; aligns with sibling sections' `cols-2 sm:cols-4` |

## Phase 5c — prevention rules (memory seed)

### New anti-patterns to log

1. **`grid-cols-N` (N ≥ 3) without a breakpoint fallback is a yellow flag, not a red flag.** Triage by cell content:
   - Selects/Inputs ellipsize → OK
   - Small mono digits → OK
   - `text-h3`/`text-h4` values → almost always needs `grid-cols-1 sm:grid-cols-N`
   - Long text → depends on truncation

2. **`min-w-[Npx]` is fine when paired with `flex-wrap` or `w-full sm:w-auto`.** The parent's wrap behavior absorbs the constraint. The bug is `min-w-[Npx]` inside a non-wrapping `flex` row — that creates horizontal scroll.

3. **Horizontal-scroll grids (`min-w-[480px]` + `overflow-x-auto`) are an intentional pattern**, not a bug. Use for dense tabular data that loses meaning when columns stack. Add a `sm:after:hidden` linear-gradient fade-out to signal scrollability on mobile (already used in `scaled-trade-form.tsx`).

4. **Lack of `sm:`/`md:`/`lg:` prefixes is not a smell.** The mobile-first pattern is: default = stacked/wrapped flow, breakpoint prefixes only when you go from stacked to horizontal at wider widths. A file with zero breakpoint prefixes can be perfectly responsive.

5. **Touch targets must be ≥44×44px.** Use `min-h-[44px] min-w-[44px]` on icon-only buttons. Already enforced in `market-status-panel.tsx`, `market-monitor-content.tsx`, `risk-simulation-content.tsx`; extend to other tappable surfaces during /audit.

### Detectors to keep handy

```bash
# Grids without responsive fallback — triage by cell content (see rule 1)
rg -n 'grid-cols-[3-9]' src/components -g '*.tsx' \
  | rg -v 'sm:|md:|lg:|grid-cols-(1|2)'

# Fixed pixel widths
rg -n '\bw-\[[0-9]+px\]' src/ -g '*.tsx'
rg -n '\b(min|max)-w-\[[0-9]+px\]' src/ -g '*.tsx'

# Touch-target audit (find icon-only buttons missing min-w-[44px])
rg -n 'h-[5678] w-[5678]' src/components -g '*.tsx' \
  | rg -v 'min-w-\[44px\]|aria-hidden'
```

## Phase 6 — done criteria

- [x] `pnpm lint` 0 errors
- [x] `pnpm exec tsc --noEmit` clean
- [x] 2 high-confidence grid-overflow fixes applied
- [x] 12 detector hits triaged; 10 confirmed not-bugs (mobile-first patterns, intentional scroll, slideover-constrained, low-priority desktop-first)
- [x] No regression in `flex-wrap` / `w-full sm:w-auto` mobile-first patterns
- [x] Touch-target compliance (`min-w-[44px]`) verified across market panels
