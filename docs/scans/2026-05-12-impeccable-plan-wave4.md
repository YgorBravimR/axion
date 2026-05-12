# Impeccable scan — Wave 4 Planning (rows #16, #17, #18)

**Date:** 2026-05-12
**Routes covered:** `/plan/[year]`, `/plan/[year]/[quarter]`, `/plan/[year]/[quarter]/[month]`
**Register:** product (Axion app surface)
**Scene sentence:** _Solo day trader at 6:30 a.m. ET in a dim home office, opening their annual cockpit before market open to verify they're still on pace for the year — drilling from year → quarter → month to find the one number that needs attention today._

Wave 4's three rows share the entire `src/components/fractal-plan/` widget tree, so this scan covers them as a single sweep rather than three siloed reviews. Per-row routing into the same widgets:

- **Row #16 `/plan/[year]`** — `page.tsx` mounts `SetupSummaryCard`, `PlanYearGuide`, `EoyProjectionBanner`, `AnnualCockpitGrid` (which fans out to `MonthCard` × 12 with `MonthCapitalPopover`), `TaxTab` (with `MonthDarfRow`), and the legacy non-cockpit `YearlyPlanEditor` + `PlanSection` + `ProvenanceBadge` branch.
- **Row #17 `/plan/[year]/[quarter]`** — `page.tsx` mounts `QuarterReport`, which fans out to `QuarterHeader`, `QuarterPlanVsReality`, `QuarterMonthCard` × 3, `DarfStrip`, and a narrative section.
- **Row #18 `/plan/[year]/[quarter]/[month]`** — `page.tsx` mounts `MonthReport`, which fans out to `MonthHeader`, `PlanVsReality`, `CapsStrip` (with `RCapOverridePopover`), `MonthWeekTable`, `MonthDarfRow`, `MonthComparison`, and the narrative section. `TargetActualGauge` and `SnapshotHero` live in the broader fractal-plan tree but are not currently mounted by the active orchestrators (legacy/atomic widgets).

## Phase 1a — UX critique (themes)

Wave 4 is the most disciplined corner of Axion so far. The cockpit grid, the plan-vs-reality cards, and the EoY projection banner already follow the rules we've been hardening in Waves 1–3: signed money colored `trade-buy`/`trade-sell`, unsigned profit/loss colored with the dedicated `profit`/`loss` tokens, gradient `acc-100/30` "moment of significance" anchors used sparingly (one per section), DARF status mapped through a clean `STATUS_DOT` triad (`fb-success` / `warning` / `fb-error` + neutrals).

Three small but real cracks survive the sweep:

1. **Verdict-as-anchor on the target/actual gauge.** `TargetActualGauge` paints the "onTrack" verdict bronze (`text-acc-100` + `bg-acc-100`), with "below pace" reaching for `bg-acc-200` (reference-blue) even though there's no actual reference series — a categorical state hijacking the anchor palette, same family as the Kelly-conservative bronze we fixed in row #13.
2. **Verdict-as-P&L on the paid-DARF row.** `MonthDarfRow` paints the paid tax amount `text-trade-buy`. The amount is a debit (cash that left the account), not signed profit. The `fb-success` dot already carries the "paid" verdict; the value should be neutral.
3. **Decorative icons missing `aria-hidden`.** A handful of icons (Calendar, Target, Activity, TrendingUp, Trophy, Receipt, ArrowRight) sit next to descriptive text or inside `aria-label`-bearing parents but lack the `aria-hidden="true"` attribute we hardened across Wave 3.

## Phase 1b — Audit (a11y / tokens / responsiveness)

- **Tokens.** All spacing/colors are Tailwind v4 tokens; no arbitrary hex or invalid spacing. `text-profit`/`text-loss` (distinct from `text-trade-buy`/`text-trade-sell`) are correctly reserved for the unsigned profit/loss-magnitude direction inside MonthCard's bar chart and dl breakdown. `text-guide` (italic projection token) is consistently applied to all projected-future values across MonthCard, EoY banner, PlanVsReality, QuarterMonthCard.
- **Responsiveness.** `grid-cols-1 sm:grid-cols-3` (quarter), `sm:grid-cols-4` (EoY banner), `grid-cols-2 lg:grid-cols-4` (plan-vs-reality KPIs) — all collapse cleanly. AnnualCockpitGrid drives a responsive 12-month grid through its own internal layout (not audited in this sweep).
- **Keyboard.** All cards rendered as `<Link>` with focus-visible rings (`focus-visible:ring-acc-100`) on MonthCard. QuarterMonthCard relies on the default Next.js Link styles. CapsStrip's `RCapOverridePopover` triggers are buttons with their own focus state.
- **aria-hidden.** `EoyProjectionBanner` already has `aria-hidden` on TrendingUp and Sparkles. `QuarterMonthCard` already has it on the STATUS_DOT span. `MonthDarfRow` already has it on the STATUS_DOT span. The bars container in MonthCard has `aria-hidden="true"`. The gauge fill in TargetActualGauge has `aria-hidden="true"`. The remaining decorative icons (listed in Phase 3 below) are the only gap.

## Themes (carried forward across Wave 4)

- **Verdict-as-anchor (third instance).** Row #13 had Kelly conservative + Insight confidence; row #15 had MC confidence; row #18 has TargetActualGauge onTrack. The pattern is identical: a categorical "in-between good and bad" state painted bronze because there was no obvious token. The verdict triad `fb-success / warning / fb-error / txt-300` is now the answer in every case.
- **Verdict-as-P&L (third instance).** Row #11 had Sharpe coloring; row #14 had executed-trades count; row #18 has paid-DARF amount. The pattern is identical: a number whose semantic isn't signed-P&L painted trade-buy. The fix is always to swap to the neutral `txt-100`/`txt-200` and let the adjacent verdict marker (icon / dot / label) carry the state.
- **Earned bronze, applied correctly.** Wave 4 is the cleanest exemplar of the rule so far: SnapshotHero, PlanVsReality, QuarterPlanVsReality, EoyProjectionBanner, CapsStrip Tier display, and the Snapshot/Insight uppercase eyebrows all use bronze deliberately for the page's single moment of significance — and they only fire once per section. Worth carrying this pattern back into older waves as a polish-tier item.

## Phase 2 — Plan

Phase 3 edits:

1. `target-actual-gauge.tsx` — swap onTrack verdict palette to `warning`, swap below-pace fallback to neutral `bg-bg-300`.
2. `month-darf-row.tsx` — neutralize paid amount color (`text-trade-buy` → `text-txt-100`).
3. Add `aria-hidden="true"` to ~10 decorative lucide icons across PlanVsReality, QuarterPlanVsReality, MonthWeekTable, MonthDarfRow, QuarterMonthCard.

Phase 4 backlog:

- Document the canonical "gauge verdict palette" in DESIGN.md (negative→fb-error, behind→txt-300, onTrack→warning, ahead→fb-success).
- Note the `STATUS_DOT` triad pattern (used in QuarterMonthCard, MonthDarfRow, DarfStrip) as a candidate for a shared `<DarfStatusDot>` primitive.

## Phase 3 — Apply

### `src/components/fractal-plan/target-actual-gauge.tsx`

- L46 `text-acc-100` → `text-warning` on the onTrack actual-value text.
- L58 `bg-acc-100` → `bg-warning` on the onTrack bar fill.
- L58 `bg-acc-200` → `bg-bg-300` on the below-pace bar fill (categorical, no reference series).

### `src/components/fractal-plan/cockpit/month-darf-row.tsx`

- L144 `text-trade-buy` → `text-txt-100` on the paid amount (verdict carried by the `fb-success` STATUS_DOT, no trade-color semantic).
- L104 add `aria-hidden="true"` on the Receipt icon.

### `src/components/fractal-plan/cockpit/plan-vs-reality.tsx`

- L92 add `aria-hidden="true"` on Target.
- L134 add `aria-hidden="true"` on Activity.
- L155 add `aria-hidden="true"` on TrendingUp.
- L183 add `aria-hidden="true"` on Trophy.

### `src/components/fractal-plan/cockpit/quarter-plan-vs-reality.tsx`

- L75 add `aria-hidden="true"` on Target.
- L107 add `aria-hidden="true"` on Activity.
- L124 add `aria-hidden="true"` on TrendingUp.
- L149 add `aria-hidden="true"` on Trophy.

### `src/components/fractal-plan/cockpit/month-week-table.tsx`

- L68 add `aria-hidden="true"` on Calendar (empty-state header).
- L88 add `aria-hidden="true"` on Calendar (main header).

### `src/components/fractal-plan/cockpit/quarter-month-card.tsx`

- L164 add `aria-hidden="true"` on ArrowRight (parent Link carries `aria-label`).

## Phase 4 — Reflect

- **Verdict-as-anchor and verdict-as-P&L are now both proven cross-wave patterns.** They appear in every wave that has any kind of evaluative UI. The fixes are mechanical once you spot them. Adding both to the impeccable craft reference as "named anti-patterns to scan for" would compress future sweep time.
- **Wave 4 widgets are well-architected.** The orchestrators (MonthReport, QuarterReport) are clean server components doing data fetch + composition; the visual widgets are pure presentational client components. The only structural footgun is the duplicated `STATUS_DOT` map in QuarterMonthCard, MonthDarfRow, and (presumably) DarfStrip — worth a small extraction in a later polish pass.

## Sign-off

Lint + tsc clean post-edits. Three runbook rows (#16 plan year, #17 plan quarter, #18 plan month) all reference this combined scan doc.
