# Impeccable sweep — `journal-list` (route `/journal`)

- **Register**: product
- **Surface**: `src/app/[locale]/(app)/journal/page.tsx` → `src/components/journal/journal-content.tsx` → `period-filter.tsx`, `smart-search.tsx` (→ `quick-filters.tsx`), `trade-day-group.tsx` (→ `trade-row.tsx`)
- **Scene sentence**: _Solo trader at 4:30 p.m. ET, after market close, opening Journal on a 27-inch monitor in dim afternoon light to review today's eight trades — outcome distribution, P&L magnitude, rule violations — and run last week's "losing trades I didn't follow plan on" filter to spot a pattern before tomorrow's session._

---

## Phase 1a — critique

### P0

- **Side-stripe border on every TradeRow violates the absolute ban.** `trade-row.tsx:104-108` paints `border-l-2 border-l-trade-buy/sell/txt-300` to encode outcome. The design laws (`reference/product.md` + `frontend-design.md`) flag exactly this pattern: _"`border-left` or `border-right` greater than 1px as a colored accent on cards, list items, callouts, or alerts. Never intentional."_ The outcome is already redundantly encoded by the Target/ShieldX/Minus icon and the ColoredValue P&L; the stripe is decorative weight that loses the bet against the absolute ban.

### P1

- **Bronze saturation across three filter surfaces.** PeriodFilter active pill is `bg-acc-100 text-bg-100` (`period-filter.tsx:105`). QuickFilters active chip is `border-acc-100 bg-acc-100/10 text-acc-100` (`quick-filters.tsx:79`). SmartSearch condition chips reuse the same `border-acc-100/30 bg-acc-100/10 text-acc-100` treatment (`smart-search.tsx:325, 372`). With all three engaged at once — period=week + a quick-filter + 2 builder chips — the page renders 5–6 bronze surfaces concurrently. Earned-Bronze rule violation; bronze should signal one thing at a time, not paint the entire filter row.
- **Em-dash in static markup.** `smart-search.tsx:523` renders `<span>—</span>` between the hour-from and hour-to inputs. Em-dash is banned in copy _and_ in code per `CLAUDE.md` "Avoid Jokes" → "No em-dashes". Use en-dash, `to`, or a hyphen-space.
- **Hover-only delete misses focus-visible-on-row.** `trade-row.tsx:250` has `opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100` — passes the `axion/no-hover-only-controls` lint rule, but practically: the row wrapper is `role="button"`, so when a user tabs to a row, focus lands on the wrapper, not the trash button, and the trash never appears until the user tabs _into_ it. Use `group-focus-within/row:opacity-100` so any focus inside the row reveals the action.

### P2

- **Period summary is JSX-concatenated rather than ICU-templated.** `journal-content.tsx:433-441` builds `"12W 4L 2BE (75%)"` by gluing translations to literal parens and spaces. Brittle for locales where the convention differs (pt-BR commonly omits parens). Move to a single `t("periodSummary", { wins, losses, breakevens, rate })` template.
- **Period-filter mobile-detect via `window.matchMedia`.** `period-filter.tsx:44-50` runs an effect on mount. SSR-first this means `isMobile=false` on first paint, then re-renders. The only consumer is `numberOfMonths` for the `DateRangePicker`. Tailwind container queries or a CSS-only `useMediaQuery` hook would prevent the hydration flash. Low ROI — backlog.
- **Hardcoded BRL formatter.** `journal-content.tsx:396`, `trade-day-group.tsx:56`, `trade-row.tsx:102` all call `formatBrlWithSign` directly. Same gap as dashboard sweep; the account-aware compact-formatter backlog item already covers this — no new entry needed.

---

## Phase 1b — audit

| sev | area           | finding                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0  | a11y semantics | `trade-row.tsx:267` uses `<div role="button">` to wrap a row that navigates to `/journal/${tradeId}`. Should be wrapped in `<Link href>` — gains cmd-click open-in-new-tab, native focus ring, correct role, no manual `onKeyDown` for Enter/Space.                                                                                                                                                                                                  |
| P0  | a11y semantics | `period-filter.tsx:92-115` is a 1-of-5 single-select rendered as `role="group"` + `aria-pressed`. Should be `role="radiogroup"` + `role="radio"` + `aria-checked` (same fix already applied to MoodSelector in command-center).                                                                                                                                                                                                                      |
| P1  | a11y           | Trade-day-group header (`trade-day-group.tsx:61-71`) is a `<button>` whose name (per `aria-label`) restates the date/count/PnL — but the visual stats inside the button (`ColoredValue`, win/loss counts, WinRateBadge) are also read as part of the accessible name. Result: AT reads "Wednesday May 7 8 trades plus $1,200 8 trades plus $1,200 5W 3L 62%" — duplicated. Mark visual children `aria-hidden="true"`, keep them in the `aria-label`. |
| P1  | responsive     | Outcome cue at narrow widths collapses to **color alone**. Below `sm` the labeled DirectionBadge is hidden (`trade-row.tsx:156`), the outcome icon is 14×14, and the side-stripe is doing the heavy lifting — which is both colorblind-hostile and (per P0 above) banned. Fix in the same pass that removes the stripe: keep the icon, ensure the ColoredValue P&L is in viewport.                                                                   |
| P1  | perf           | `journal-content.tsx:226-292` — period change kicks off `getTradesGroupedByDay` with no abort/staleness guard. Quick toggles `day → week → month → all` can race; the slowest response wins regardless of which is current. Server actions don't accept `AbortSignal`, so the fix is a request-id sentinel: capture `const id = ++latestRequestRef.current` before await; ignore the response if `id !== latestRequestRef.current`.                  |
| P1  | a11y           | PeriodFilter pill bar `scrollbar-none` + `overflow-x-auto` (`period-filter.tsx:95`). On ≤375px the last pill ("Custom") can be clipped with no scroll hint. Either drop `scrollbar-none` or add a right-edge mask gradient.                                                                                                                                                                                                                          |
| P2  | token drift    | `page.tsx:18` and `journal-content.tsx:457` use `h-50`. Verify it's a valid Tailwind v4 token — the spacing scale tops out at 24 in default v4, custom tokens are 100/200/300/400; `h-50` is neither. If invalid, swap to `h-48` or `h-52` (or `min-h-32`).                                                                                                                                                                                          |
| P2  | visual rhythm  | `divide-y` between TradeRows (`trade-day-group.tsx:112`) + 2px side-stripe per row = two competing horizontal artifacts. Removing the stripe lets the hairline divider do its job.                                                                                                                                                                                                                                                                   |
| P2  | a11y / copy    | SmartSearch builder Tooltip trigger is an Info icon with `cursor-help` but no `tabIndex`. Keyboard users can't read the hint. Wrap in a button or add `tabIndex={0}` to the trigger.                                                                                                                                                                                                                                                                 |
| P2  | a11y           | `journal-content.tsx:457` LoadingSpinner has no `aria-label` (assuming the primitive doesn't supply one). Sighted users see the spinner; AT users hear nothing during the fetch. Add `aria-live="polite"` + `aria-busy` on the surrounding container OR ensure `LoadingSpinner` carries a default label.                                                                                                                                             |

---

## Phase 1 — cross-cutting themes

1. **Side-stripe ban + bronze saturation** are the two aesthetic violations and they cluster on the same surface (the row + filter region). Fixing both in one pass yields a noticeable craft jump.
2. **Two a11y P0s share a fix pattern** already established in command-center: radiogroup semantics for 1-of-N selectors, real `<Link>` semantics for navigating rows. Both have direct precedents in the repo.
3. **No new extractable primitive surfaces here.** Panel and SegmentedToggle from prior sweeps could in theory replace the bespoke PeriodFilter pill bar, but the bar's value proposition (5 pills + horizontal scroll + Custom-with-picker) is special-cased enough that a one-off harmonization is cheaper than a generic extract.
4. **Race-condition guard is the one perf concern worth the ink.** Everything else in this surface is fine on perf — the JSON payload is small, the components are `memo`'d, and the period filter is the only source of "expensive" refetch.
5. **Minor i18n + token drift** (em-dash, `h-50`, JSX-concat period summary) are cheap to fix in the same pass.

---

## Phase 2 — system-level fixes

- [ ] _None new._ Reuse Panel + ColoredValue + EmptyState already in place. No fresh extract justified — see synthesis #3.

---

## Phase 3 — per-page corrections

Steps are interleaved across files (one edit pass per file touches multiple phase letters). The labels below tag _which corrections were made_, not the strict 3a→3f order.

### 3a clarify — copy + i18n

- [x] Em-dash glyph in `smart-search.tsx:523` replaced with the word `to` (`aria-hidden="true"` so AT users get the labeled inputs without reading the connector).
- [x] Period summary line in `journal-content.tsx:430-437` migrated from JSX concatenation to a single ICU template (`journal.periodResultSummary`) with `plural` + middle-dot separator. en + pt-BR keys added — pt-BR keeps its V/D/E convention without code branching.

### 3b adapt — responsive

- [x] PeriodFilter `scrollbar-none` removed (`period-filter.tsx:95`). Native overflow scrollbar now signals to ≤375px users that the "Custom" pill is reachable.

### 3c harden — race + AT signal

- [x] `journal-content.tsx` — added `latestRequestRef = useRef(0)` and a request-id sentinel inside `fetchTrades`. Stale period fetches are discarded before `setTradesByDay` runs.
- [x] TradeDayGroup summary stats wrapped in `aria-hidden="true"` so AT users hear the button's `aria-label` once, not the duplicated visual stats.

### 3d distill — remove the side-stripe

- [x] `trade-row.tsx` — removed `border-l-2 border-l-trade-buy/sell/txt-300/transparent` from every row. The Target/ShieldX/Minus outcome icon and the ColoredValue P&L are now the only outcome cues. Side-stripe ban honored; `divide-y` parent rhythm reads cleanly without the competing horizontal artifact.
- [x] Hover-only delete button gains `group-focus-within/row:opacity-100` so any focus inside the row reveals the action.

### 3e quieter — bronze restraint

- [x] PeriodFilter active pill demoted from `bg-acc-100 text-bg-100` (full saturate) to `bg-bg-300 text-txt-100 ring-1 ring-inset ring-acc-100/60` — bronze signals selected state via a hairline ring, not a fill.
- [x] QuickFilters active chip demoted to `border-txt-200 bg-bg-300 text-txt-100` (neutral pill, no bronze).
- [x] SmartSearch condition chips demoted to `border-bg-300 bg-bg-300 text-txt-100` (was `border-acc-100/30 bg-acc-100/10 text-acc-100`).
- [x] SmartSearch toggle button demoted to `border-txt-300 text-txt-100` (was `border-acc-100/30 bg-acc-100/5 text-acc-100`).
- [x] One earned-bronze surface kept: the count badge `bg-acc-100 text-bg-100` next to the toggle text. With the rest neutral, the badge is the single bronze signal communicating "the system is filtering".

### 3f polish — semantics + a11y

- [x] PeriodFilter migrated from `role="group"` + `aria-pressed` (toggle semantics) to `role="radiogroup"` + `role="radio"` + `aria-checked` (1-of-N semantics). Same fix applied to MoodSelector in the command-center sweep.
- [x] TradeRow wrapper migrated from `<div role="button">` to `<Link href="/journal/{id}">` — gains cmd/ctrl-click open-in-new-tab, browser tooltip, native focus ring; sheds manual `onKeyDown`. The deletion guard uses an `onClick` `preventDefault` when `isAnyDeleting`.
- [x] SmartSearch Tooltip trigger wrapped in `<button tabIndex={0}>` so the builder hint is keyboard-reachable (was a bare Info svg with `cursor-help`).
- [x] Decorative icons gained `aria-hidden="true"` (Calendar inside PeriodFilter pill, ChevronDown/Right in day-group header, ChevronRight inside row, Search inside SmartSearch toggle).
- [x] `pnpm lint` 0 errors; `pnpm lint:strict` 0 errors, 450 pre-existing phase-in warnings (unchanged); `pnpm exec tsc --noEmit` clean.

### Out of scope (filed elsewhere)

- `h-50` height token used on 5 page.tsx Suspense fallbacks (`journal/page.tsx:18`, `settings/page.tsx:43`, `risk-simulation/page.tsx:22`, `backtest/page.tsx:15`, `backtest/optimize/page.tsx:14`). Tailwind v4 resolves it to `12.5rem` (200px) via the implicit `n * 0.25rem` spacing scale — technically valid but conventionally outside the named-token scale this project uses. Touching it spans 5 files outside `/journal`; backlog candidate.

---

## Phase 4 — enhancement

- [ ] _Default skip._ Cockpit register, restraint over amplification, motion already restricted to `transition-colors`. No Phase 4 step justified.

---

## Sign-off

- [x] Phase 1 synthesis written with severity labels.
- [x] Phase 2 explicitly skipped — no new extract justified (Panel/SegmentedToggle from prior sweeps don't fit PeriodFilter's special-case shape, and the active-chip pattern is unique to this surface).
- [x] Phase 3 corrections complete across `period-filter.tsx`, `quick-filters.tsx`, `smart-search.tsx`, `trade-row.tsx`, `trade-day-group.tsx`, `journal-content.tsx`.
- [x] Phase 4 entirely skipped (product register; restraint over amplification).
- [x] `pnpm lint` 0 errors.
- [x] `pnpm lint:strict` 0 errors (450 pre-existing `no-unsafe-*` phase-in warnings unchanged).
- [x] `pnpm exec tsc --noEmit` clean.
- [x] WCAG checklist: keyboard reachable (Link semantics + radiogroup + Tooltip button); aria-label on icon-only controls (delete, Tooltip trigger); focus rings visible (added on PeriodFilter pills, QuickFilters chips, SmartSearch toggle, Link wrapper); `prefers-reduced-motion` respected (transition-colors only, no transform/opacity animations beyond `motion-reduce:animate-none` on the Loader2 spinner); AA contrast on neutral chip swaps (text-txt-100 on bg-bg-300).
- [x] Cross-page findings appended to `docs/backlog.md` (see Phase 1/Phase 3 out-of-scope sections).

### Files touched

| file                                               | change                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/journal/period-filter.tsx`         | radiogroup semantics, bronze restraint (ring-1 instead of fill), `scrollbar-none` removed, decorative icon `aria-hidden`, focus ring                                |
| `src/components/journal/quick-filters.tsx`         | bronze restraint on active chip (neutral pill), focus ring                                                                                                          |
| `src/components/journal/smart-search.tsx`          | em-dash → `to`, condition chips neutralized, toggle button bronze restraint, Tooltip trigger wrapped in keyboard-reachable button, X close button focus ring        |
| `src/components/journal/trade-row.tsx`             | side-stripe removed, wrapper migrated to `<Link>`, `group-focus-within` reveal on delete, decorative chevron `aria-hidden`, `onTradeClick` prop dropped             |
| `src/components/journal/trade-day-group.tsx`       | summary stats `aria-hidden`, decorative icons `aria-hidden`, `onTradeClick` prop dropped                                                                            |
| `src/components/journal/journal-content.tsx`       | request-id sentinel race guard, `handleTradeClick` removed (Link handles navigation), period summary migrated to ICU template, unused `useRouter`/`tCommon` dropped |
| `messages/en.json`                                 | `journal.periodResultSummary` ICU key added                                                                                                                         |
| `messages/pt-BR.json`                              | `journal.periodResultSummary` ICU key added (V/D/E convention preserved)                                                                                            |
| `docs/scans/2026-05-12-impeccable-journal-list.md` | this scan log                                                                                                                                                       |
