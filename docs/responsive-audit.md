# ProfitJournal — Mobile Responsiveness Audit (360px)

> Domain-by-domain assessment following `docs/app-audit.md` structure.
> CSS patterns informed by `css-mastery.md` responsive concepts.
> Generated: March 2026

---

## Audit Methodology

**Target viewport:** 360px (smallest common Android — Samsung Galaxy S series)
**Reference:** CSS Mastery concepts applied:
- **Intrinsic sizing** (`min()`, `clamp()`, `fit-content`) over fixed pixel widths
- **Flex `min-width: auto` trap** — flex items won't shrink below content without `min-w-0`
- **Grid responsive stacking** — `grid-cols-1 sm:grid-cols-N` pattern
- **iOS auto-zoom** — inputs with `font-size < 16px` trigger zoom; use `text-base md:text-sm`
- **Touch targets** — WCAG 2.2 AA minimum 24px, recommended 44px
- **Dynamic viewport units** — `dvh`/`dvw` for mobile toolbar adaptation

---

## Issue Severity Scale

| Level | Meaning | Impact at 360px |
|-------|---------|-----------------|
| **CRITICAL** | Content overflows viewport or is completely unusable | Horizontal scroll, clipped content, broken layout |
| **HIGH** | Significant UX degradation | Cramped text, tiny touch targets, iOS zoom, unusable forms |
| **MEDIUM** | Noticeable but functional | Tight spacing, suboptimal layout, minor overflow |

---

## Domain 1: Journal Components

**Directory:** `src/components/journal/`
**Files audited:** 17

### Critical Issues (7)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| J1 | `trade-form.tsx` | 605, 660 | Execution grid `min-w-[480px]` overflows 360px | `min-w-[480px] grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr]` |
| J2 | `scaled-trade-form.tsx` | 605, 660 | Same execution grid overflow | `min-w-[480px]` |
| J3 | `inline-execution-row.tsx` | 41 | Grid with `min-w-[480px]` — no scroll container | `grid min-w-[480px] grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr]` |
| J4 | `period-filter.tsx` | 79 | 5 period buttons in flex without wrap | `gap-s-100 flex items-center` |
| J5 | `period-filter.tsx` | 102 | Date picker `min-w-[260px]` in 360px container | `min-w-[260px]` |
| J6 | `trade-row.tsx` | 81 | Flex row with 12+ items, no wrap | `gap-s-200 px-s-300 py-s-200 flex items-center` |
| J7 | `ocr-import.tsx` | 431 | Hardcoded `p-l-800` padding on all screens | `p-l-800 rounded-lg border-2 border-dashed` |

### High Issues (7)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| J8 | `trade-row.tsx` | 118 | Fixed `min-w-[70px]` asset width | `min-w-[70px] shrink-0` |
| J9 | `trade-day-group.tsx` | 86 | Stats flex row without wrap | `gap-s-200 sm:gap-m-400 flex items-center` |
| J10 | `csv-import.tsx` | 365 | Excessive padding on upload area | `p-m-600 sm:p-l-700 lg:p-l-800` |
| J11 | `csv-import-summary.tsx` | 130 | `justify-between` with wrapping text | `flex flex-wrap items-center justify-between` |
| J12 | `csv-trade-card.tsx` | 129 | 6+ elements in flex-wrap header | `gap-s-200 sm:gap-m-400 flex flex-wrap items-center` |
| J13 | `nota-match-card.tsx` | 105, 122 | Oversized gap + missing flex-wrap | `gap-m-400`, `flex items-center gap-s-200` |
| J14 | `ocr-import.tsx` | 614 | Oversized gap on mobile grid | `gap-m-400 grid grid-cols-2` |

### Fix Plan — Journal Domain

**Pattern A: Execution grids (J1, J2, J3)**
```
Current:  min-w-[480px] grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr]
Fix:      Wrap in overflow-x-auto container. On mobile, stack as card layout:
          - Show: Type, Price, Qty, Actions
          - Hide: Commission, Slippage with hidden sm:block
```
**Concept:** Table responsive pattern — hide non-essential columns + scroll container

**Pattern B: Period filter buttons (J4)**
```
Current:  gap-s-100 flex items-center
Fix:      gap-s-100 flex items-center overflow-x-auto
          Add shrink-0 to each button child
```
**Concept:** Horizontal scroll tabs pattern from css-mastery.md §2.2

**Pattern C: Fixed min-widths (J5)**
```
Current:  min-w-[260px]
Fix:      w-full sm:min-w-[260px]
```
**Concept:** Intrinsic sizing — use `min()` / `w-full` on mobile, fixed on desktop

**Pattern D: Trade row (J6)**
```
Current:  flex items-center (12+ items, no wrap)
Fix:      Already has hidden sm:inline-flex on some items.
          Verify remaining items fit. Add min-w-0 to text containers.
```

**Pattern E: Oversized padding (J7)**
```
Current:  p-l-800
Fix:      p-m-500 sm:p-l-700 lg:p-l-800
```

---

## Domain 2: Dashboard Components

**Directory:** `src/components/dashboard/`
**Files audited:** 12

### Critical Issues (1)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| D1 | `day-trades-list.tsx` | 65 | Touch target 24px (w-8 icon button) | `px-s-200 py-s-200 w-8` |

### High Issues (9)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| D2 | `kpi-cards.tsx` | 38 | Text overflow on subValues at 165px width | `grid-cols-2 gap-s-300` — missing `min-w-0` |
| D3 | `quick-stats.tsx` | 27 | `justify-between` without wrap or min-w-0 | `flex items-center justify-between` |
| D4 | `cumulative-pnl-chart.tsx` | 138 | YAxis `width={70}` = 20% of viewport | Recharts YAxis prop |
| D5 | `daily-pnl-bar-chart.tsx` | 137 | YAxis `width={70}` | Recharts YAxis prop |
| D6 | `performance-radar-chart.tsx` | 94, 99 | 200px height + 11px font cramped | `h-[200px]`, `fontSize: 11` |
| D7 | `day-detail-modal.tsx` | 89 | Modal 328px content area, inner overflow | `w-[calc(100%-2rem)] max-w-3xl` |
| D8 | `day-equity-curve.tsx` | 84, 114 | 120px height + YAxis 60px = tiny chart | `h-[120px]`, `width={60}` |
| D9 | `trading-calendar.tsx` | 186, 198 | 1px padding on cells + 10px font | `p-px`, `text-[0.625rem]` |
| D10 | `quick-stats.tsx` | 120 | 2-col grid text overflow | `grid grid-cols-2 gap-s-300` |

### Fix Plan — Dashboard Domain

**Pattern F: Chart YAxis width (D4, D5, D8) — applies globally**
```
Current:  YAxis width={70}
Fix:      Use useIsMobile hook, pass width={isMobile ? 45 : 70}
          Or better: width={window.innerWidth < 640 ? 45 : 70}
```
**Concept:** Recharts doesn't support CSS — must use JS-driven responsive values.
**Global impact:** This pattern applies to ~15 charts across Analytics, Dashboard, Monte Carlo.

**Pattern G: Touch targets (D1)**
```
Current:  w-8 (32px)
Fix:      w-8 sm:w-8 with min-h-[40px] min-w-[40px] wrapper
          Or simply: size-10 (40px)
```
**Concept:** WCAG 2.2 AA touch target minimum

**Pattern H: KPI card overflow (D2)**
```
Current:  grid-cols-2 gap-s-300 (no min-w-0)
Fix:      Add min-w-0 to each grid child, truncate on subValues
```
**Concept:** Flex/grid `min-width: auto` trap — children default to content width

**Pattern I: Calendar cells (D9)**
```
Current:  p-px text-[0.625rem]
Fix:      p-0.5 text-[0.6875rem] sm:p-s-100 sm:text-xs
```

---

## Domain 3: Analytics Components

**Directory:** `src/components/analytics/`
**Files audited:** 12

### Critical Issues (2)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| A1 | `time-heatmap.tsx` | 194 | `min-w-125` (500px) forces overflow | `min-w-125` |
| A2 | `session-asset-table.tsx` | 84 | `min-w-[500px]` table | `w-full min-w-[500px]` |

### High Issues (1)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| A3 | `filter-panel.tsx` | 215 | `max-w-sm` (384px) exceeds 360px | `max-w-sm` on DateRangePicker |

### Medium Issues (7)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| A4 | `variable-comparison.tsx` | 238 | YAxis `width={70}` | Recharts prop |
| A5 | `expected-value.tsx` | 71 | 2-col grid cramped (~155px/box) | `grid-cols-2 md:grid-cols-4` |
| A6 | `r-distribution.tsx` | 121 | Same 2-col constraint | `grid-cols-2 md:grid-cols-4` |
| A7 | `hourly-performance-chart.tsx` | 138 | YAxis `width={65}` | Recharts prop |
| A8 | `day-of-week-chart.tsx` | 172 | YAxis `width={65}` | Recharts prop |
| A9 | `session-performance-chart.tsx` | 281, 309 | YAxis + 2-col stats | `width={65}`, `grid-cols-2` |
| A10 | `time-heatmap.tsx` | 197 | 33px heatmap cells (< 40px touch) | `w-14 shrink-0` + `flex-1` per cell |

### Fix Plan — Analytics Domain

**Pattern J: Heatmap (A1, A10)**
```
Current:  min-w-125 with overflow-x-auto
Fix:      Remove min-w-125. Keep overflow-x-auto.
          On mobile: show fewer hours (9:00-17:00 only) or use horizontal scroll with
          visual scroll affordance (gradient fade on right edge).
          Cells: min-w-[40px] for touch targets.
```

**Pattern K: Session-asset table (A2)**
```
Current:  min-w-[500px] on <table>
Fix:      Remove min-w. Use hidden sm:table-cell to hide session columns on mobile.
          Show: Asset, Best Session, Total — hide individual session columns.
```
**Concept:** Table responsive pattern — progressive disclosure

**Pattern L: Filter panel (A3)**
```
Current:  max-w-sm (384px)
Fix:      w-full sm:max-w-sm
```
**Concept:** `min()` equivalent — never exceed viewport width

---

## Domain 4: Market Monitor Components

**Directory:** `src/components/market/`
**Files audited:** 7

### Critical Issues (2)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| M1 | `quote-row.tsx` | 98 | B3 6-col grid doesn't collapse | `grid-cols-[2.5fr_2.5fr_1.2fr_1.8fr_1.2fr_1.8fr]` |
| M2 | `economic-calendar.tsx` | 69, 107 | 7-column table overflows | Table with 7 `<th>` columns |

### High Issues (1)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| M3 | `market-monitor-content.tsx` | 175-176 | Market status dots overflow | `flex flex-wrap items-center justify-between gap-x-4` |

### Medium Issues (1)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| M4 | `b3-trading-calendar.tsx` | 135, 145 | Calendar cells 44px (borderline) | `grid-cols-7 gap-0.5` |

### Fix Plan — Market Domain

**Pattern M: Quote row grid (M1)**
```
Current:  grid-cols-[2.5fr_2.5fr_1.2fr_1.8fr_1.2fr_1.8fr]
Fix:      Mobile: grid-cols-[2fr_2fr_1.5fr_1.5fr] — hide H/L columns
          Use hidden sm:block on High/Low columns.
          Alternative: overflow-x-auto with min-w on container.
```

**Pattern N: Economic calendar table (M2)**
```
Current:  7 columns (Time, Country, Event, Impact, Actual, Forecast, Previous)
Fix:      Mobile: Show Time, Event, Actual only.
          Use hidden sm:table-cell on Country, Impact, Forecast, Previous.
```

---

## Domain 5: Reports Components

**Directory:** `src/components/reports/`
**Files audited:** 4

### High Issues (2)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| R1 | `monthly-report-card.tsx` | 152 | `grid-cols-2` no mobile fallback | `grid grid-cols-2 gap-m-400` |
| R2 | `weekly-report-card.tsx` | 171 | `grid-cols-3` too tight (~97px/col) | `grid grid-cols-3 sm:grid-cols-6` |

### Medium Issues (1)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| R3 | `mistake-cost-card.tsx` | 72 | `justify-between` without min-w-0 | `flex items-center justify-between` |

### Fix Plan — Reports Domain

**Pattern O: Grid column density (R1, R2)**
```
R1: grid-cols-2 gap-m-400 → grid-cols-1 sm:grid-cols-2 gap-s-300 sm:gap-m-400
R2: grid-cols-3 sm:grid-cols-6 → grid-cols-2 sm:grid-cols-3 lg:grid-cols-6
```
**Concept:** Mobile-first grid — start with fewest columns, add at breakpoints

---

## Domain 6: Monthly Planning Components

**Directories:** `src/components/monthly/` + `src/components/monthly-plan/`
**Files audited:** 11

### Critical Issues (1)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| MP1 | `decision-tree-modal.tsx` | 644 | 4-column table overflows | `<table>` with 4 `<th>` columns |

### High Issues (2)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| MP2 | `month-comparison.tsx` | 127-157 | Spacing uneven after hiding values | `hidden sm:inline` + `justify-between` |
| MP3 | `monthly-plan-form.tsx` | 843 | Inner content missing min-w-0 | `grid-cols-1 sm:grid-cols-2` |

### Medium Issues (3)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| MP4 | `monthly-projection.tsx` | 62 | 2-col forced on mobile | `grid-cols-2 gap-s-300` |
| MP5 | `recovery-paths-tree.tsx` | 970-1047 | SVG fixed dimensions, no scaling | SVG with calculated width/height |
| MP6 | `weekly-breakdown.tsx` | 50 | Tight spacing | `space-y-s-200 sm:space-y-s-300` |

### Fix Plan — Monthly Domain

**Pattern P: Decision tree table (MP1)**
```
Current:  <table> with Scenario, Gain, Net, Action columns
Fix:      On mobile, convert to stacked card layout.
          Each row becomes: Scenario (title) → Gain / Net / Action (stacked below).
```

**Pattern Q: Monthly projection (MP4)**
```
Current:  grid-cols-2 gap-s-300
Fix:      grid-cols-1 sm:grid-cols-2 gap-s-200 sm:gap-s-300
```

---

## Domain 7: Command Center Components

**Directory:** `src/components/command-center/`
**Files audited:** 11

### Critical Issues (1)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| CC1 | `live-trading-status-panel.tsx` | 166, 190, 211 | MiniCalculator `min-w-[140px]`, `min-w-[100px]`, `min-w-[120px]` | Fixed min-widths in flex-wrap |

### High Issues (3)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| CC2 | `asset-rules-panel.tsx` | 169 | Select trigger `w-48` | `w-48` |
| CC3 | `asset-rules-panel.tsx` | 259, 278, 294 | Input fields `w-20` in editing mode | `w-20` |
| CC4 | `live-trading-status-panel.tsx` | 177, 205 | `text-small` on inputs (iOS zoom) | `text-small` |

### Medium Issues (3)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| CC5 | `circuit-breaker-panel.tsx` | 290, 324 | `grid-cols-2` no 1-col fallback | `grid-cols-2 sm:grid-cols-3` |
| CC6 | `daily-summary-card.tsx` | 49 | `grid-cols-2` starts too dense | `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` |
| CC7 | `date-navigator.tsx` | 93, 122 | `h-9 w-9` touch target (36px) | `h-9 w-9 p-0` |

### Fix Plan — Command Center Domain

**Pattern R: MiniCalculator inputs (CC1)**
```
Current:  min-w-[140px] + min-w-[100px] + min-w-[120px] in flex-wrap
          Total minimum = 360px (exactly viewport width, no room for gaps/padding)
Fix:      Remove min-w constraints. Use w-full on mobile:
          w-full sm:min-w-[140px] sm:w-auto
```

**Pattern S: Asset rules table inputs (CC2, CC3)**
```
Current:  w-48 (Select), w-20 (Input)
Fix:      w-full sm:w-48 (Select), w-full sm:w-20 (Input)
          Wrap table in overflow-x-auto on mobile.
```

---

## Domain 8: Playbook Components

**Directory:** `src/components/playbook/`
**Files audited:** 8

### Critical Issues (1)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| PB1 | `condition-picker.tsx` | 232 | SelectTrigger `w-[160px]` | `w-[160px]` |

### High Issues (2)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| PB2 | `condition-picker.tsx` | 211 | Flex row `justify-between` overflows | `flex items-center justify-between gap-m-400` |
| PB3 | `strategy-card.tsx` | 86 | Dropdown `absolute right-0` clips left | `absolute top-full right-0 z-20` |

### Medium Issues (2)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| PB4 | `strategy-card.tsx` | 123 | `grid-cols-2` tight on 360px | `grid-cols-2 sm:grid-cols-4` |
| PB5 | `scenario-section.tsx` | 159 | Image grid no 1-col fallback | `grid-cols-2 sm:grid-cols-3` |

### Fix Plan — Playbook Domain

**Pattern T: Condition picker (PB1, PB2)**
```
Current:  w-[160px] SelectTrigger + flex justify-between
Fix:      w-full sm:w-[160px]
          Parent: flex flex-col sm:flex-row sm:items-center sm:justify-between
```

---

## Domain 9: Monte Carlo Components

**Directory:** `src/components/monte-carlo/`
**Files audited:** 18

### Critical Issues (1)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| MC1 | `v2/mode-distribution-chart.tsx` | 92 | Fixed `w-52` (208px) pie chart | `h-52 w-52` |

### High Issues (7)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| MC2 | `monte-carlo-content.tsx` | 299 | `min-w-[200px]` button | `min-w-[200px]` |
| MC3 | `metrics-cards.tsx` | 72 | Missing `grid-cols-1` fallback | `grid sm:grid-cols-2 lg:grid-cols-3` |
| MC4 | `v2/monte-carlo-v2-content.tsx` | 276, 379 | Missing `grid-cols-1` fallback | `grid sm:grid-cols-2 lg:grid-cols-4` |
| MC5 | `v2/risk-profile-selector.tsx` | 109 | `grid-cols-2` cramped | `grid grid-cols-2 gap-s-200` |
| MC6 | `v2/v2-metrics-cards.tsx` | 84 | Missing `grid-cols-1` fallback | `grid md:grid-cols-2 lg:grid-cols-3` |
| MC7 | `v2/mode-distribution-chart.tsx` | 91 | Flex row doesn't stack | `flex items-center gap-m-500` |
| MC8 | `v2/monte-carlo-v2-content.tsx` | 544 | `min-w-[200px]` button | `min-w-[200px]` |

### Medium Issues (8)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| MC9 | `equity-curve-chart.tsx` | 154 | YAxis `width={65}` | Recharts prop |
| MC10 | `drawdown-chart.tsx` | 116 | YAxis `width={50}` | Recharts prop |
| MC11 | `distribution-histogram.tsx` | 265 | YAxis `width={40}` | Recharts prop |
| MC12 | `trade-sequence-list.tsx` | 154 | YAxis `width={50}` | Recharts prop |
| MC13 | `v2/daily-pnl-chart.tsx` | 124 | YAxis `width={55}` | Recharts prop |
| MC14 | `v2/v2-distribution-histogram.tsx` | 123 | YAxis `width={40}` | Recharts prop |
| MC15 | `simulation-params-form.tsx` | 43 | Grid skips sm breakpoint | `grid md:grid-cols-3` |
| MC16 | `strategy-analysis.tsx` | 35 | Fixed `pl-7` nesting | `pl-7` |

### Fix Plan — Monte Carlo Domain

**Pattern U: Missing grid-cols-1 (MC3, MC4, MC5, MC6) — bulk fix**
```
MC3: grid sm:grid-cols-2 lg:grid-cols-3 → grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
MC4: grid sm:grid-cols-2 lg:grid-cols-4 → grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
MC5: grid grid-cols-2 → grid grid-cols-1 sm:grid-cols-2
MC6: grid md:grid-cols-2 lg:grid-cols-3 → grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
```
**Note:** Tailwind's grid defaults to `grid-cols-1` implicitly, but explicit is clearer and safer.

**Pattern V: Pie chart (MC1, MC7)**
```
Current:  flex items-center gap-m-500 with h-52 w-52
Fix:      flex flex-col sm:flex-row items-center gap-m-400 sm:gap-m-500
          Chart: w-full max-w-[208px] sm:w-52 aspect-square
```

---

## Domain 10: Risk Simulation Components

**Directory:** `src/components/risk-simulation/`
**Files audited:** 10

### High Issues (4)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| RS1 | `simulation-config-panel.tsx` | 95 | `max-w-sm` exceeds 360px | `max-w-sm` |
| RS2 | `risk-params-form.tsx` | 147 | `grid-cols-2` tight labels wrap | `grid-cols-2 sm:grid-cols-3` |
| RS3 | `risk-params-form.tsx` | 213 | Same 2-col tight layout | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` |
| RS4 | `summary-cards.tsx` | 68, 104 | Missing `grid-cols-1` fallback | `grid sm:grid-cols-2 md:grid-cols-3` |

### Medium Issues (1)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| RS5 | `equity-curve-overlay.tsx` | 103 | YAxis `width={60}` | Recharts prop |

### Fix Plan — Risk Simulation Domain

**Pattern W: Risk params form (RS2, RS3)**
```
Current:  grid-cols-2 sm:grid-cols-3
Fix:      grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
```

**Pattern X: Summary cards (RS4)**
```
Current:  grid sm:grid-cols-2 md:grid-cols-3
Fix:      grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3
```

---

## Domain 11: Settings Components

**Directory:** `src/components/settings/`
**Files audited:** 18

### Critical Issues (4)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| S1 | `account-settings.tsx` | 239, 318 | Input `w-64` (256px = 71% of 360px) | `w-64` |
| S2 | `user-profile-settings.tsx` | 225 | Input `w-64` | `w-64` |
| S3 | `asset-list.tsx` | 232 | Search input `w-64` | `w-64 pl-9` |
| S4 | `user-list.tsx` | 109 | Search input `max-w-sm` (384px) | `max-w-sm` |

### High Issues (12)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| S5 | `account-settings.tsx` | 260 | Select `w-48` | `w-48` |
| S6 | `account-settings.tsx` | 291 | DatePicker `w-48` | `w-48` |
| S7 | `account-settings.tsx` | 544-582 | Fee inputs `w-24`, `w-20`, `w-16` in row | `w-24`, `w-20`, `w-16` |
| S8 | `account-settings.tsx` | 228-327 | Form rows don't stack on mobile | `flex items-center justify-between gap-m-400` |
| S9 | `user-profile-settings.tsx` | 216, 231 | Form rows don't stack | `flex items-center justify-between gap-m-400` |
| S10 | `trading-account-settings.tsx` | 226-301 | Form rows don't stack | `flex items-center justify-between gap-m-400` |
| S11 | `account-settings.tsx` | 234-334 | `text-small` inputs (iOS zoom) | `text-small` on `<Input>` |
| S12 | `asset-form.tsx` | 148, 207 | `text-small` inputs | `text-small` |
| S13 | `tag-form.tsx` | 135 | `text-small` inputs | `text-small` |
| S14 | `timeframe-form.tsx` | 150, 188 | `text-small` inputs | `text-small` |
| S15 | `condition-form.tsx` | 124, 160 | `text-small` inputs | `text-small` |
| S16 | `user-list.tsx` | 129-139 | Table without scroll wrapper | No `overflow-x-auto` |

### Medium Issues (4)

| # | File | Line(s) | Issue | CSS Classes |
|---|------|---------|-------|-------------|
| S17 | `tag-form.tsx` | 171 | Color picker `h-8 w-8` (32px touch) | `h-8 w-8 rounded-full` |
| S18 | `trading-account-settings.tsx` | 205, 242, 273 | Fee inputs `w-24`, `w-20` | `w-24`, `w-20` |
| S19 | `condition-list.tsx` | 147, 175 | Header gap may wrap awkwardly | `gap-m-400` |
| S20 | `user-list.tsx` | 225 | Role selector `w-28` tight | `w-28` |

### Fix Plan — Settings Domain

**Pattern Y: Fixed input widths (S1, S2, S3, S5, S6, S7) — bulk fix**
```
Current:  w-64, w-48, w-24, w-20, w-16
Fix:      w-full sm:w-64, w-full sm:w-48, w-full sm:w-24, etc.
```
**Concept:** Intrinsic sizing — inputs should be `w-full` on mobile, fixed on desktop

**Pattern Z: Form row stacking (S8, S9, S10) — bulk fix**
```
Current:  flex items-center justify-between gap-m-400
Fix:      flex flex-col gap-s-200 sm:flex-row sm:items-center sm:justify-between sm:gap-m-400
```
**Concept:** Column-first stacking — label above, input below on mobile

**Pattern AA: iOS zoom prevention (S11-S15) — bulk fix**
```
Current:  text-small on <Input> and <Textarea>
Fix:      text-base sm:text-small (or text-base md:text-sm)
```
**Concept:** iOS auto-zoom triggers at font-size < 16px. `text-base` = 16px prevents this.
**Impact:** ~20+ input fields across all settings forms.

---

## Cross-Domain Patterns (Global Fixes)

### Pattern GF1: Recharts YAxis Width
**Affected files:** ~15 chart components across Dashboard, Analytics, Monte Carlo, Risk Simulation
**Fix approach:** Create a shared constant or hook:
```tsx
// src/hooks/use-chart-config.ts
const useChartConfig = () => {
  const isMobile = useIsMobile()
  return {
    yAxisWidth: isMobile ? 40 : 65,
    fontSize: isMobile ? 10 : 12,
  }
}
```

### Pattern GF2: iOS Zoom on Inputs
**Affected files:** ~30+ forms across Settings, Command Center, Journal
**Fix approach:** Update the base `<Input>` component in `ui/input.tsx`:
```tsx
// Add text-base sm:text-sm to the Input component's default className
```
**This single change fixes ALL input zoom issues globally.**

### Pattern GF3: grid-cols-1 Mobile Fallback
**Affected files:** ~12 grid layouts across Monte Carlo, Risk Simulation, Reports, Command Center
**Fix approach:** Search-and-replace `grid sm:grid-cols-` → `grid grid-cols-1 sm:grid-cols-`

---

## Implementation Priority

### Phase 1: Global Fixes (max impact, min effort)
1. **GF2** — Input component base font size (fixes ~30 files)
2. **GF1** — Chart YAxis responsive hook (fixes ~15 charts)
3. **GF3** — Add grid-cols-1 fallbacks (fixes ~12 grids)

### Phase 2: Critical Overflow Fixes (19 issues)
4. **J1-J3** — Execution grid min-w-[480px] (3 files)
5. **S1-S4** — Settings fixed input widths w-64/max-w-sm (4 files)
6. **A1-A2** — Heatmap/table min-w-[500px] (2 files)
7. **M1-M2** — Quote row grid + economic calendar (2 files)
8. **CC1** — MiniCalculator min-widths (1 file)
9. **MC1** — Pie chart fixed width (1 file)
10. **J4-J7** — Period filter, trade row, OCR padding (4 files)
11. **MP1** — Decision tree table (1 file)
12. **PB1** — Condition picker width (1 file)

### Phase 3: High Priority Fixes (54 issues)
13. **Y** — All settings fixed widths w-48/w-24/w-20 (5 files)
14. **Z** — All settings form row stacking (3 files)
15. **F** — Dashboard chart YAxis (5 files)
16. **K** — Session-asset table column hiding (1 file)
17. **O** — Reports grid density (2 files)
18. **U** — Monte Carlo grid fallbacks (4 files)
19. **W** — Risk params form stacking (1 file)

### Phase 4: Medium Priority Polish (54+ issues)
20. All remaining gap adjustments, touch targets, font sizes
21. Calendar cell sizing
22. Dropdown positioning
23. SVG tree scaling

---

## Total Issue Count

| Domain | Critical | High | Medium | Total |
|--------|----------|------|--------|-------|
| Journal | 7 | 7 | ~8 | ~22 |
| Dashboard | 1 | 9 | ~6 | ~16 |
| Analytics | 2 | 1 | 7 | 10 |
| Market Monitor | 2 | 1 | 1 | 4 |
| Reports | 0 | 2 | 1 | 3 |
| Monthly Planning | 1 | 2 | 3 | 6 |
| Command Center | 1 | 3 | 3 | 7 |
| Playbook | 1 | 2 | 2 | 5 |
| Monte Carlo | 1 | 7 | 8 | 16 |
| Risk Simulation | 0 | 4 | 1 | 5 |
| Settings | 4 | 12 | 4 | 20 |
| **TOTAL** | **20** | **50** | **44** | **114** |

---

## Files Verified as Well-Designed (No Changes Needed)

These components already follow mobile-first responsive patterns:

- `command-center-tabs.tsx` — `hidden sm:inline` icons-only on mobile
- `kpi-cards.tsx` — Grid collapses `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`
- All playbook forms — `grid-cols-1 sm:grid-cols-N` pattern
- `scenario-section.tsx` — dvh/dvw viewport units
- `prop-profit-summary.tsx` — `grid-cols-1 sm:grid-cols-3`
- `weekly-breakdown.tsx` — `hidden sm:inline` pattern
- `month-comparison.tsx` — Hides previous values on mobile
- `monte-carlo-v2-content.tsx` — `sm:grid-cols-2 lg:grid-cols-4` (needs grid-cols-1 fallback)
- `summary-cards.tsx` — `sm:grid-cols-2 md:grid-cols-3` (needs grid-cols-1 fallback)
- `ui/tabs.tsx` — `overflow-x-auto scrollbar-none`
- `ui/chart-container.tsx` — `ResponsiveContainer` with `minWidth: 0`
- `kelly-criterion-card.tsx` — `grid-cols-1 sm:grid-cols-3`
- `equity-curve-overlay.tsx` — Responsive heights
- `trade-comparison-table.tsx` — `overflow-x-auto` + `truncate`
- `skipped-trades-warning.tsx` — `flex flex-wrap`
- `prefill-selector.tsx` — `flex flex-wrap gap-2`
