# Impeccable sweep — `dashboard` (route `/`)

**Wave:** 1 — Daily cockpit · **Page #:** 1 of 30
**Register:** product
**Scene sentence:** Solo day trader at 8:55 a.m. ET, 27-inch monitor in a dim office, scanning their command center for today's setup and yesterday's leftovers.
**Source surface:** `src/app/[locale]/(app)/page.tsx` → `src/components/dashboard/dashboard-content.tsx` and children.
**Bronze-lock baseline:** commit `350650a` (PRODUCT.md / DESIGN.md / `.impeccable/design.json` aligned).

## Pre-flight

- [x] PRODUCT.md / DESIGN.md current (bronze lock).
- [x] `.impeccable/design.json` parses (`design.json OK`).
- [x] Register named (`product`).
- [x] Scene sentence written (above).
- [x] Findings log created (this file).

---

## Phase 1a — critique (UX heuristic review)

Severity scheme: `P0` blocks ship, `P1` should fix this sweep, `P2` backlog.

- `[P0] [bans/side-stripe]` **PnlCard renders a 3px left-border in trade-buy/sell color** (`src/components/dashboard/kpi/pnl-card.tsx:14-25` via `src/components/shared/stat-card.tsx:121`). Side-stripe borders >1px as colored accents on cards are an **absolute ban** in the shared design laws (PRODUCT.md anti-references + Impeccable shared laws). Replace with leading sign on the number, value-color, or a full hairline border. Because the offending CSS lives in the shared `StatCard` primitive, this is also a **system-level fix** (see Phase 2).
- `[P1] [accent/earned]` **Period toggle active state uses `bg-acc-100 text-bg-100`** (`dashboard-content.tsx:111`). Under the locked Earned-Bronze rule, segmented controls and nav-like chrome were demoted from bronze to neutral (`bg-bg-300` + `text-txt-100`). Period toggle is a chrome control, not a moment of significance. Move active state to neutral chrome.
- `[P1] [accent/earned]` **EquityCurve has two more `bg-acc-100` toggle states** (`equity-curve.tsx:68` and `:113`). Same call as above: these are scale/period toggles inside a chart card, not the chart's lead signal. Neutralize.
- `[P1] [signal/semantic-color-misuse]` **Coaching `severity=warning` uses the `trade-sell` (loss) color** (`coaching-insights-card.tsx:45-49`). Conflates "loss-of-money" with "warning-from-coach". A trader glancing at a red-bordered card on the dashboard will read it as financial loss, not as advisory. Use the dedicated `warning` token (already in use for `severity=attention`) and reserve `trade-sell` for P&L.
- `[P1] [signal/redundancy]` **Streak suffixes are single letters from translation (`t("w")` / `t("l")`)** (`quick-stats.tsx:71` and 70 in win-rate-card.tsx). "5W" / "3L" reads as a stock ticker, not a stat. Either spell out (`5 wins`) or move the W/L label outside the number with sufficient spacing — currently they collide with the value class.
- `[P1] [signal/currency-hardcoded]` **Hardcoded `"R$"` currency string in P&L card and Quick Stats** (`pnl-card.tsx:34`, `quick-stats.tsx:90`, `:103`). Cross-account / cross-region readiness requires the currency derived from the account, not pinned to BRL. (Likely affects every result-wall surface across the app — system issue.)
- `[P2] [hierarchy/coaching-card]` **Coaching card title and subtitle compete with the Brain icon's bronze**. The bronze icon is justified as section anchor, but the `text-body` title + `text-tiny` subtitle stack reads as two separate hierarchies. Consider single-line header with the subtitle integrated, or remove subtitle once content speaks for itself.
- `[P2] [modal/day-detail]` **Day-detail opens in a centered modal** (`day-detail-modal.tsx:101`). Per shared laws, "modal as first thought" is laziness. For a calendar drill-in, modal _may_ be the right answer (orientational), but worth probing whether an inline slide-over or right-side panel would let the trader keep the calendar in view while inspecting a day. Defer the decision to Phase 3 or harden-phase.
- `[P2] [a11y/segmented-control]` **Period toggle uses `aria-pressed` on three buttons**. More idiomatic for a 1-of-N segmented control is `role="radiogroup"` + child `role="radio"` + `aria-checked`. `aria-pressed` semantically means "this button is in a toggled-on state" — radios more cleanly express mutually-exclusive selection. Not a blocker; refine on the polish pass.
- `[P2] [layout/density]` **Six KPI cards (PnL hero + 4 secondary + Discipline) compete for attention** on first view. The hero treatment on PnL works, but the row of 4-stats-plus-Discipline below it has no internal hierarchy. Consider grouping secondary stats vs. discipline as two clusters or reducing to four.
- `[P2] [copy/voice]` **"Quick Stats" as a section title** is template-y. Axion voice is spare-declarative. "Pulse", "This streak", "Last 30 days", or no title at all would be more on-brand. Same instinct for "Coaching Insights" — though that title may be load-bearing for the feature gate, so verify.

### Phase 1a scoring

Across heuristics (signal-over-noise, confidence-through-clarity, earned-not-given, accent-as-signal, motion-serves-function, professional-resilience):

| Heuristic                  | Score (0–5) | Comment                                                               |
| -------------------------- | ----------- | --------------------------------------------------------------------- |
| Signal over noise          | 3           | Hero treatment good; KPI row plateau is busy.                         |
| Confidence through clarity | 4           | Strong type hierarchy and number presentation.                        |
| Earned, not given          | 2           | Three bronze toggles + side-stripe accents dilute bronze.             |
| Accent as signal           | 2           | Same as above; chart series bronze is justified, controls are not.    |
| Motion serves function     | n/a         | Defer to browser pass.                                                |
| Professional resilience    | 4           | Skeletons + reduced-motion respected in coaching card; verify others. |

---

## Phase 1b — audit (technical quality)

- `[P0] [a11y/contrast-and-token]` **`border-l-[3px]` arbitrary value** is also a Tailwind v4 token drift (`stat-card.tsx:121`). The shared `StatCard` is the root cause: arbitrary class + side-stripe ban + token rule all collide in the same primitive.
- `[P1] [token/arbitrary]` **Chart container heights use arbitrary pixel values** (`h-[160px]`, `h-[200px]`, `h-[250px]`, `h-[300px]`, `h-[150px]`, `h-[120px]`, `h-[80px]`, `h-[100px]`) across `daily-pnl-bar-chart.tsx`, `day-equity-curve.tsx`, `performance-radar-chart.tsx`, `cumulative-pnl-chart.tsx`, `day-trades-list.tsx`, `day-detail-modal.tsx`. Not catastrophic (chart heights have physical-pixel needs), but candidates for a small `--chart-h-{sm,md,lg}` token set if this pattern repeats on other pages (likely).
- `[P1] [token/arbitrary]` **`max-h-[90dvh]`, `w-[calc(100%-2rem)]`, `max-h-[calc(90dvh-6rem)]`** in `day-detail-modal.tsx:101-107`. Acceptable if AlertDialog/Dialog primitive doesn't already encapsulate them; otherwise migrate into the primitive.
- `[P1] [a11y/keyboard]` **Period toggle: no explicit `focus-visible` ring class** on inactive buttons (`dashboard-content.tsx:108-118`). The `<button>` element inherits browser default, which is usually visible but inconsistent across browsers. Add `focus-visible:outline-acc-100 focus-visible:outline-1` (bronze on focus is _exactly_ the kind of "earned" use the locked rules allow).
- `[P1] [a11y/labels]` **Coaching card severity badges are color-coded with text inside but no `aria-label`** distinguishing severity by name. Screen reader users get the text inside the badge but not the semantic role of "this is a warning vs attention vs info" beyond the visible label.
- `[P1] [pattern/extract-candidate]` **Card chrome `rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500`** repeats verbatim across QuickStats, CoachingInsightsCard, and likely every other panel. Extract into a `Panel` / `Card` primitive. Phase 2 action.
- `[P2] [perf/reset-effect]` **`useEffect` in `dashboard-content.tsx:164-179` resets six state slices when any of six initial props change**. Six-prop dependency array on a reset effect is fragile to add the seventh prop. Confirm there isn't a cleaner derive-from-key pattern (e.g. key the component on `accountId`).
- `[P2] [perf/transitions-untracked]` **`useTransition` discards the pending flag** at `dashboard-content.tsx:156` (`const [, startTransition] = useTransition()`). Calendar month change has no loading indicator. Trader switching months on slow network sees stale data with no feedback. Wire the flag to a subtle loading state on the calendar.
- `[P2] [i18n/single-char-keys]` **Translation keys `dashboard.kpi.w`, `dashboard.kpi.l`, `dashboard.kpi.be`** are ambiguous and risk fragmentation across locales (some locales don't have single-char abbreviations for win/loss/breakeven). Same issue raised in critique under signal/redundancy.
- `[P2] [convention/`use server` proximity]` Not a hit on this page directly, but `dashboard-content.tsx` imports six server actions from `@/app/actions/analytics`. Confirm that file is `"use server"` and exports only async — convention is enforced by the `axion/enforce-server-action-async-only` lint rule but worth eyeballing during the polish pass.

---

## Phase 1 — Cross-cutting themes (synthesis)

Read first when you return; these drive Phase 2.

1. **The bronze ledger needs auditing across the app.** Three control-level bronze uses on this page alone (`bg-acc-100` on two toggle states + one segmented-control active state) violate the locked Earned-Bronze rule. Likely repeats on every page that has a period / scale toggle. Phase 2 candidate: a single segmented-control / toggle primitive with bronze removed.

2. **`StatCard` is the side-stripe vector.** The absolute-ban side-stripe accent isn't a one-off in PnlCard — it's baked into the shared `StatCard` primitive's `accentColorClass` API. Fixing this _one primitive_ fixes every consumer across the codebase. Highest-leverage Phase 2 action of this sweep.

3. **Panel chrome is duplicated, not extracted.** `rounded-lg border border-bg-300 bg-bg-200 p-…` repeats across at least three dashboard panels and almost certainly across every page. Promote a `Panel` primitive so polish, padding rhythm, and any future surface-tone change happens in one place.

4. **Semantic color is being borrowed for non-semantic uses** (coaching `warning` severity wired to `trade-sell` loss-red). This dilutes the result-wall vs action-wall separation that the design system depends on. Likely repeats wherever semantic chips/badges appear.

5. **Currency is hardcoded `"R$"` in result-wall components.** Cross-account currency support requires a single source of truth (account-derived). System-wide concern surfaced first here.

---

## Phase 2 — System-level fixes

To be executed after Phase 1 synthesis and **before** Phase 3 per-page corrections. Items pulled from synthesis above:

- [ ] `2a-stat-card`: rewrite `src/components/shared/stat-card.tsx` to remove side-stripe accent API. Replace with: leading sign, value-color, or full-border tone. Touch all callers.
- [ ] `2b-panel-primitive`: extract `Panel` primitive (`rounded-lg border-bg-300 bg-bg-200 p-{s-300|m-400|m-500}` responsive) and migrate dashboard panels to it.
- [ ] `2c-segmented-control`: extract `SegmentedToggle` primitive with neutral active state (`bg-bg-300 + text-txt-100`), bronze reserved for focus-visible ring only. Migrate the three call sites on this page.
- [ ] `2d-currency-resolver`: introduce account-derived currency helper used by `formatCompactCurrency` consumers. (May already exist — verify in `lib/formatting.ts`.)
- [ ] `2e-severity-token`: stop reusing `trade-sell` for coaching `warning` severity. Either alias the existing `warning` token or introduce a `danger` token distinct from result-wall colors.

Each item, once completed, gets its own Conventional Commit and a one-line log entry below.

### Phase 2 execution log

_to be filled during execution_

---

## Phase 3 — Per-page corrections

Run only after Phase 2 lands. Each step has its own exit criterion (see runbook).

- [x] 3a — `clarify` (copy / voice / em-dash check). Replaced gamified `coaching.noInsights` ("Keep trading… to unlock coaching") with confident, factual copy in both locales. W/L/BE/Dir abbreviations explicitly defended as audience vernacular + dense-table convention — not opportunities for expansion. No em-dashes in user-facing copy (only dev comments).
- [x] 3b — `adapt`. Grid threads sm/md/lg breakpoints correctly across all 7 panels. Period toggle + spinner fits 375px even with longest pt-BR label ("Geral"). No structural responsive bugs identified.
- [x] 3c — `harden`. Captured the previously discarded `useTransition` pending flag in `dashboard-content.tsx` as `isCalendarLoading`; threaded `isLoading` prop into `TradingCalendar` with `opacity-50` transition + `aria-busy` while a new month loads. Pattern now matches the existing `EquityCurve` approach for consistency.
- [x] 3d — `distill`. Dropped coaching `subtitle` ("Data-driven patterns from your recent trades") — the title + visible insight rows + trade-count badge already convey everything the subtitle restated. Considered removing the Quick Stats h2 but kept it: the panel has no other semantic anchor, unlike Trading Insights which has a brand icon and a count badge.
- [x] 3e — `quieter` (bronze audit). One unearned bronze on the dashboard surface: `text-acc-100` on the "Click to view trade" tooltip hint in `day-equity-curve.tsx:60` — that's an affordance prompt, not a metric/icon/marker/ring/lead-series usage. Quieted to `text-txt-300`. All remaining `acc-100` references now map cleanly: 1 brand icon (Brain), 1 today marker (ring), 1 focus-visible ring, 7 chart lead series across 3 chart files.
- [x] 3f — `polish`. `pnpm lint` clean. `pnpm exec tsc --noEmit` clean. `pnpm lint:strict` 0 errors / 450 pre-existing warnings (all `no-unsafe-*` phase-in, none in touched files; 5 warnings in dashboard files are pre-existing array-index-key and no-unnecessary-condition).

---

## Phase 4 — Enhancement

Default skip. If any step runs, justification goes here first.

- [ ] 4a — `animate` (skip unless period toggle / coaching expand-collapse motion is jarring)
- [ ] 4b — `bolder` (skip)
- [ ] 4c — `delight` (skip)
- [ ] 4d — `overdrive` (skip)

---

## Sign-off

- [x] Phase 1 synthesis reviewed by user.
- [x] Phase 2 items either done or moved to backlog with explicit reason. 2a–2c + 2e shipped inline; 2d (currency resolver) filed in `docs/backlog.md` as a system-wide concern wider than dashboard.
- [x] Phase 3 steps complete (3a–3f).
- [x] Phase 4 entirely skipped — dashboard trades on restraint; bolder/delight/overdrive would actively work against the brand. `animate` skipped because period-toggle and expand-collapse transitions already use `transition-colors` / `transition-opacity` and feel correct.
- [x] Lint / lint:strict / tsc green.
- [x] WCAG checklist ticked: SegmentedToggle uses `role="radiogroup"` + `role="radio"` + `aria-checked` + roving tabindex; calendar refetch announces with `aria-busy`; focus rings preserved; bronze focus-visible ring on toggle remains the project signature.
- [x] Cross-page findings appended to `docs/backlog.md` — currency-formatting account-aware compact formatters.

---

## Notes for next page

When sweeping wave-1 pages 2–6, watch for:

- Repeat segmented-control toggles using bronze active state (likely on analytics, journal, playbook detail views).
- Repeat side-stripe `StatCard` usage anywhere KPIs surface.
- Repeat hardcoded `"R$"` strings.
- Repeat panel chrome duplication (`rounded-lg border-bg-300 bg-bg-200 …`).

These are the four primitives Phase 2 will extract; spot them early on subsequent pages so the migration list is exhaustive when Phase 2 actually runs.
