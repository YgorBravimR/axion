# Impeccable sweep — `command-center` (route `/command-center`)

**Wave:** 1 — Daily cockpit · **Page #:** 2 of 30
**Register:** product
**Scene sentence:** Solo day trader at 8:45 a.m. ET, coffee in hand, 27-inch monitor in a dim home office, opening Command Center to review yesterday's circuit-breaker outcome, journal a pre-market thesis on the open, run through their morning discipline checklist, and confirm asset rules + risk parameters before the 9:30 bell.
**Source surface:** `src/app/[locale]/(app)/command-center/page.tsx` → `command-center-tabs.tsx` → `command-center-content.tsx` and 14 `src/components/command-center/*` panels (date-navigator, circuit-breaker-panel, live-trading-status-panel, daily-checklist, pre-market-notes, post-market-notes, asset-rules-panel, daily-summary-card, checklist-manager, bias-selector, mood-selector). Includes 3-tab shell with lazy Monitor + Calculator tabs.
**Bronze-lock baseline:** dashboard sweep commit `b6f06d2` (Panel + SegmentedToggle primitives + Earned-Bronze ledger).

## Pre-flight

- [x] PRODUCT.md / DESIGN.md current (bronze lock).
- [x] Register named (`product`).
- [x] Scene sentence written (above).
- [x] Findings log created (this file).
- [x] Primitives from dashboard sweep are landed (Panel, SegmentedToggle, StatCard without side-stripe).

---

## Phase 1a — critique (UX heuristic review)

**P0 — must fix this sweep**

- **Panel chrome duplication.** Same `border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border` recurs in ≥14 places across 10 panels (circuit-breaker empty/active, live-trading 4 variants, daily-checklist 2 wrappers, pre/post-market 2 each, asset-rules, daily-summary 2, plan-summary placeholder). Dashboard sweep already exposes `<Panel>` — adopt here.
- **Stale `plan-summary` placeholder** (command-center-content.tsx:168-180). Dashed-border card on the right column saying "fractal-plan UI replaces this." Half the above-fold right rail is a deprecation notice. Distill candidate.
- **Category leak — `text-trade-sell` on non-trade outcomes.** CircuitBreakerPanel paints `maxTradesHit` and `secondOpBlocked` with `text-trade-sell` (rule-discipline events, not losses). DailySummaryCard paints `consecutiveLosses ≥ 3` with `text-trade-sell` (a behavioral warning, not P&L direction). MoodSelector tone dots map positive→`bg-trade-buy`, negative→`bg-trade-sell` (mood is decoupled from P&L). Use `text-warning` / `text-fb-error` / neutral, keep `trade-buy/sell` for P&L magnitude only.
- ~~`xs:grid-cols-2` in CircuitBreakerPanel~~ — **verified valid**: `--breakpoint-xs: 30rem` in `globals.css:138`. No action.

**P1 — earned-bronze + a11y**

- **DateNavigator bronze overuse.** `text-acc-100` appears on (a) non-today date, (b) "today" jump button, (c) "next replay day" button, (d) read-only badge. Demote three; the readonly badge keeps it (it's the state signal).
- **PreMarketNotes/PostMarketNotes icon coding.** `Sun` painted `text-trade-buy`, `Moon` painted `text-acc-100`. Sunrise is not "buy"; an evening icon is not "earned-bronze." Demote both to `text-txt-300`.
- **DailyChecklist `isComplete` border** uses `border-trade-buy/50`. Checklist completion is discipline, not a buy outcome. Use `border-acc-100/50`.
- **AssetRulesPanel** uses raw HTML entities (`&times;`, `&uarr;`, `&darr;`) as button glyphs. Replace with Lucide `X` / `ArrowUp` / `ArrowDown` for icon parity (still has aria-label for SR).
- **Refresh callbacks fire without loading affordance.** `refreshCompletions` / `refreshDailyPlan` / `refreshAssetSettings` mutate state silently. Wrap callers in `useTransition` like the dashboard calendar pattern.
- **Daily Checklist progress bar** lacks `aria-valuetext` — exposes bare numbers to AT instead of "3 of 8 items complete."
- **Inline bias save in AssetRulesPanel** auto-fires on dropdown change. No toast confirmation; the only visual is a spinner in a row action button. P1 harden — add a quiet success affordance or move bias edit into the edit-mode row.

**P2 — polish**

- **Mood vs. Bias primitive mismatch.** Both are 4-option 1-of-N selectors in adjacent context (PreMarketNotes contains both). Mood uses inline pills (good — discoverable). Bias uses Radix Select dropdown (one-extra-click). Consider `SegmentedToggle` (extracted in dashboard sweep) for bias when there's row space.
- **Header save-button shift in Pre/Post-Market.** `hasChanges &&` renders the save button conditionally, causing header layout jump on first edit. Reserve the slot with a `<Saved/>` placeholder.
- **MetricCell re-exported from circuit-breaker-panel.tsx** (live-trading imports it). Lift to a sibling `_metric-cell.tsx` to drop the cross-file dependency.
- **`parseInt` without radix** in AssetRulesPanel (lines 130, 133). Use `parseInt(v, 10)`.
- **ChecklistManager parses `checklist.items` via `JSON.parse` + cast** with no validation (line 49). The DB type guarantees it, but a zod schema would catch corruption.

**Not issues (defended)**

- **CircuitBreakerPanel limit-hit colored borders + bg tints** are _full borders_ with semantic state colors, not banned side-stripes. They're earned because the state IS the message.
- **ChecklistManager as modal** — checklist editing has reorder + multi-field add/remove. Inline edit would dominate the panel. Modal is correct here.

---

## Phase 1b — audit (technical quality)

| Check                                                                           | Result                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens (v4 only, no arbitrary px)                                               | Pass — all panels use valid s-/m-/text-/rounded- tokens. `xs:` breakpoint TBD (P0 above).                                                                                                                                                               |
| Side-stripe ban (`border-l/r-[Npx]` colored)                                    | Pass — none found.                                                                                                                                                                                                                                      |
| Gradient text (`bg-clip-text` + gradient)                                       | Pass — none.                                                                                                                                                                                                                                            |
| Modal-as-first-thought                                                          | Pass — ChecklistManager is a justified modal; no other modals on the page.                                                                                                                                                                              |
| `axion/enforce-ui-primitives` (raw `<table>`, `<a>`, `<input type="checkbox">`) | Pass — AssetRulesPanel uses `<Table>`, DailyChecklist uses `<Checkbox>`, no raw `<a>`.                                                                                                                                                                  |
| `axion/no-hover-only-controls`                                                  | Pass — every interactive control is a `<Button>` with focus-visible ring.                                                                                                                                                                               |
| `.forEach()`                                                                    | Pass — none in the read files.                                                                                                                                                                                                                          |
| useFormatting consumed for currency                                             | Pass on LiveTrading, CircuitBreaker, DailySummary; full-format only (compact backlog item carries over).                                                                                                                                                |
| Type safety                                                                     | One unchecked `JSON.parse` cast (P2).                                                                                                                                                                                                                   |
| Refresh state has aria-busy                                                     | **Fail** — no loading state on refresh callbacks (P1).                                                                                                                                                                                                  |
| Progress bars expose aria-valuetext                                             | **Fail** on DailyChecklist (P1). RecoveryStepTracker has aria-label only (acceptable for bar steps).                                                                                                                                                    |
| Premium gate fallback                                                           | **Open question** — when `!isPremium`, half the panels render `null`. Page degrades to date-navigator + circuit-breaker + live-status + daily-summary + plan placeholder. Is that intentional, or do we need a soft upsell? (Defer to Phase 3c harden.) |

---

## Phase 1 — synthesis

**Theme of this page:** the cockpit _runs the morning prep_. P0s are about visual discipline — adopt the dashboard's `Panel`, evict the `trade-buy/sell` color leak from rule-discipline UI, and remove the dead `plan-summary` placeholder. P1s tighten bronze restraint and refresh-state a11y. The page is functionally complete; the work is **distill + normalize**, not new features.

**Carryover from dashboard:**

- `<Panel>` primitive — 14 sites here vs. ~8 there. Bigger payoff.
- `useFormatting().formatCurrency` — already used everywhere on CC. Good.
- **Compact-formatter backlog item still pending** — `formatCompactCurrencyWithSign` still hardcodes `"R$"`. No compact formatters consumed on CC (only full format), so no new instances of the leak here.

**No Phase 4 justified** (same reasoning as dashboard): product register, "Precise. Confident. Elite." brand voice; current transitions on phase-state changes already feel right.

---

## Phase 2 — system-level actions

- [ ] **2a · Panel adoption** — migrate all 14 inline panel-chrome sites to `<Panel padding="lg">`. Loading/empty states keep `border-dashed` variant if `Panel` supports it; otherwise compose with `cn`.
- [ ] **2b · Severity tokens vs. trade tokens** — replace `text-trade-sell` on `maxTradesHit`, `secondOpBlocked` (circuit-breaker), `consecutiveLosses` (daily-summary) with `text-warning` (≥3) and `text-fb-error` (limit hit). Replace MoodSelector tone dots with neutral `bg-acc-100/30` + `bg-txt-300/30` + `bg-fb-error/40` (or drop tones).
- [ ] **2c · Bronze restraint on DateNavigator** — keep `acc-100` for the read-only badge only; demote currentDate-not-today to `text-txt-100`, demote today/advance buttons to default ghost color.
- [ ] **2d · Remove `plan-summary` placeholder** in command-center-content.tsx:168-180. Track the fractal-plan landing in backlog.
- [ ] **2e · Lift `MetricCell`** out of `circuit-breaker-panel.tsx` into `components/command-center/_metric-cell.tsx`.

---

## Phase 3 — per-page corrections

- [x] **3a · clarify** — em-dashes removed from `commandCenter.liveStatus.stop.*` (en + pt-BR). 4 keys: `recoverySequenceExhausted`, `singleTargetGainMode`, `gainSequenceExhausted`, `recoveryWinExit` → period-separated clauses. The `riskSimulation` em-dashes (en.json:977-985) are out of scope (separate surface).
- [x] **3b · adapt** — Panel adoption preserves all existing responsive padding (`p-s-300 sm:p-m-400 lg:p-m-500`) and the `xs:grid-cols-2` (valid custom breakpoint). No new responsive regressions; layout topology unchanged.
- [x] **3c · harden** — `DailyChecklist` progress bar now exposes `aria-valuetext` for AT. `useTransition` on refresh callbacks deferred: refresh always follows a save action whose button already shows a `Loader2`, so the in-flight state is already user-visible. **Filed to backlog.**
- [x] **3d · distill** — Stale `plan-summary` placeholder deleted from `command-center-content.tsx`. The right column now contains only PostMarketNotes (matched to PreMarketNotes on the left for symmetry).
- [x] **3e · quieter** — DateNavigator demoted from 4× `acc-100` to 1× (the read-only state badge keeps it). MoodSelector tone dots moved from `trade-buy`/`trade-sell` to `acc-100`/`warning`. DailyChecklist completion badge + progress fill moved from `trade-buy` to `acc-100`/`acc-100/40`.
- [x] **3f · polish** — `parseInt` radix added in AssetRulesPanel; raw `&times;` HTML entity replaced with Lucide `X`. tsc and lint:strict both green.

---

## Phase 4 — Enhancement

**Skipped — same rationale as dashboard sweep.**

1. **Register**: command-center is `product`, not `brand`. Phase 4 amplifiers (`animate`, `bolder`, `delight`, `overdrive`) are brand-register defaults.
2. **Brand voice**: "Precise. Confident. Elite." actively contradicts `bolder`/`delight`. The page is a cockpit before market-open — readiness, not entertainment.
3. **Motion is already purposeful**: `transition-colors` on the live-trading phase Panel and circuit-breaker state Panel; `motion-reduce:transition-none` on the daily-checklist progress bar; `Loader2` `animate-spin motion-reduce:animate-none` on save buttons. The transitions that earn motion already have it; adding more would be decorative.

---

## Sign-off

- [x] Phase 1 synthesis reviewed.
- [x] Phase 2 items either done or moved to backlog with explicit reason. (2a Panel adoption, 2b severity tokens, 2c bronze restraint, 2d placeholder removal, 2e MetricCell lift — all done in-sweep.)
- [x] Phase 3 steps complete (a11y harden item with `useTransition` filed to backlog).
- [x] Phase 4 entirely skipped — justification above.
- [x] `pnpm lint` 0 errors / 0 warnings.
- [x] `pnpm lint:strict` 0 errors (warnings = pre-existing `no-unsafe-*` phase-in).
- [x] `pnpm exec tsc --noEmit` clean.
- [x] WCAG: keyboard reachable, aria-label on icon-only controls, focus ring visible via Button primitive, `prefers-reduced-motion` respected on animated affordances, contrast at AA on touched surfaces. Added `aria-valuetext` on DailyChecklist progress bar. `aria-hidden="true"` added to decorative icons (Sun, Moon, CalendarDays, SkipForward, X).
- [x] Cross-page findings appended to `docs/backlog.md`.

### Files touched

- `src/components/ui/panel.tsx` — added `tone: "default" | "muted"` variant; default `tone` is `default`.
- `src/components/command-center/metric-cell.tsx` — **new file**; lifted `MetricCell` out of `circuit-breaker-panel.tsx`.
- `src/components/command-center/circuit-breaker-panel.tsx` — Panel adoption, MetricCell extraction, severity-token swap (`text-trade-sell` → `text-warning` on `maxTradesHit` + `secondOpBlocked`).
- `src/components/command-center/live-trading-status-panel.tsx` — Panel adoption (4 sites), MetricCell re-import from new location.
- `src/components/command-center/daily-checklist.tsx` — Panel adoption (2 sites), bronze-restraint on completion badge + progress fill, `aria-valuetext` on progress bar.
- `src/components/command-center/pre-market-notes.tsx` — Panel adoption (2 sites), Sun icon demoted to `text-txt-300` + `aria-hidden`.
- `src/components/command-center/post-market-notes.tsx` — Panel adoption (2 sites), Moon icon demoted to `text-txt-300` + `aria-hidden`.
- `src/components/command-center/asset-rules-panel.tsx` — Panel adoption, `&times;` → Lucide `X`, `parseInt` radix.
- `src/components/command-center/daily-summary-card.tsx` — Panel adoption (2 sites), `consecutiveLosses ≥ 3` color `text-trade-sell` → `text-warning`.
- `src/components/command-center/date-navigator.tsx` — bronze restraint (4 acc-100 → 1), removed unused `cn` import, `aria-hidden` on decorative icons.
- `src/components/command-center/mood-selector.tsx` — tone dots `bg-trade-buy`/`bg-trade-sell` → `bg-acc-100`/`bg-warning`.
- `src/app/[locale]/(app)/command-center/command-center-content.tsx` — removed stale `plan-summary` placeholder + unused `tPlan` + `CalendarDays` import.
- `messages/en.json`, `messages/pt-BR.json` — added `commandCenter.checklist.progressValueText`, removed 4 em-dashes from `commandCenter.liveStatus.stop.*`.

---

## Phase 4 — Enhancement

Default skip per runbook. If any step runs, justification goes here first.

- [ ] 4a — `animate`
- [ ] 4b — `bolder`
- [ ] 4c — `delight`
- [ ] 4d — `overdrive`

---

## Sign-off

- [ ] Phase 1 synthesis reviewed by user.
- [ ] Phase 2 items either done or moved to backlog with explicit reason.
- [ ] Phase 3 steps complete.
- [ ] Phase 4 entirely skipped or each step justified.
- [ ] Lint / lint:strict / tsc green.
- [ ] WCAG checklist ticked.
- [ ] Cross-page findings appended to `docs/backlog.md`.
