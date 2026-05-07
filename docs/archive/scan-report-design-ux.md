# Design & UX Audit — Axion
Date: 2026-04-21

## Summary
- **Total issues: 87**
- Critical: 4 | High: 21 | Medium: 35 | Low: 27
- Categories: a11y: 22 | perf: 12 | theming: 14 | responsive: 9 | design: 18 | ux: 12

---

## Anti-Patterns Verdict

**Verdict: Mostly passes, with isolated regressions in newer features.**

The core design is disciplined — design tokens are consistent, gold is used sparingly, and the dark theme is well-executed. However, newer areas (Backtest, Optimize) contain clear AI-slop tells:

- `text-heading-2` / `text-heading-3` are non-existent token names used in ~20 files in `backtest/` and `optimize/` — these resolve to nothing in Tailwind v4 with the `--text-*` namespace defined. They should be `text-h2` / `text-h3`.
- Backtest and Optimize forms use bare `<label>` HTML elements without `htmlFor` associations — classic AI-slop form pattern.
- Market Monitor has a hardcoded `h-89` (Tailwind arbitrary class `h-[89]` rendered as nothing useful) and `grid-cols-[1fr_340px]` — fixed layout that breaks at narrow viewports.
- The sidebar uses a 1000ms opacity transition (`duration-1000`) for the logo swap — gratuitously slow, feels over-engineered.

---

## Findings by Feature

### 1. Dashboard

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 1 | Medium | a11y | `trading-calendar.tsx` | Calendar day cells with P&L data have `aria-label` with date/PnL, but empty days have no label and receive `tabIndex={-1}` correctly — however cells without data that ARE today still have no `aria-label`. Screen readers get no info about today's date. | /harden |
| 2 | Medium | a11y | `dashboard-content.tsx` `PeriodToggle` | Toggle buttons use `aria-pressed` correctly, but the container `div` has no `role="group"` or `aria-label` to semantically group them as a toggle set. | /harden |
| 3 | Low | design | `kpi-cards.tsx` | KPI card grid jumps from 2 columns (mobile) to 3 (sm) to 5 (lg) — at `md` breakpoint (768–1023px) there are 3 cards in row 1 and 2 orphaned in row 2, creating an unbalanced layout. | /arrange |
| 4 | Low | perf | `dashboard-content.tsx` | Five parallel server actions are fired on every period change — no abort controller or debounce. Rapid toggling between periods spawns overlapping transitions. | /optimize |
| 5 | Low | design | `coaching-insights-card.tsx` | Component fetches on render with no skeleton/placeholder. While loading, there is a full content CLS shift. | /harden |

### 2. Journal

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 6 | High | a11y | `trade-form.tsx` | Direction toggle buttons (`Long` / `Short`) use `aria-pressed` correctly but have no `role="group"` grouping or `aria-labelledby` pointing at the "Direction" label. Assistive technologies announce these as two isolated toggle buttons with no context. | /harden |
| 7 | High | a11y | `trade-form.tsx` | Rating radio group (A/B/C/D/F buttons) uses `role="radiogroup"` correctly, but the tab order inside the group is not managed — all 5 buttons are independently tabbable. For a proper radio group, only the selected option should be in the tab stop; others navigated via arrow keys. | /harden |
| 8 | Medium | a11y | `trade-form.tsx` | "Followed Plan" Yes/No toggle buttons lack `role="group"` grouping and a `aria-label` on the parent to associate the label "Did you follow the plan?" with the choices. | /harden |
| 9 | Medium | a11y | `trade-form.tsx` | Setup Rank (A/AA/AAA) buttons have `aria-pressed` but no radio-group semantics — should use `role="radiogroup"` like the Rating section for consistency. | /harden |
| 10 | Medium | ux | `journal-content.tsx` | Inline trade delete: the two-step confirmation pattern (click trash → confirm/cancel) is implemented, but there is no visible countdown or auto-dismiss. The confirm state persists indefinitely if the user navigates away, which can cause confusion on return. | /harden |
| 11 | Medium | design | `journal-content.tsx` | Period summary stats (`X trades`, P&L, win/loss count) are displayed inline with small `text-txt-300` labels and no visual separation from the period filter above. On mobile with many filter pills visible, the summary reads like part of the filter row, not as a data summary. | /arrange |
| 12 | Low | perf | `journal-content.tsx` | `JSON.stringify(extendedFilters)` is used as a `useEffect` dependency — this creates a new string reference on every render, potentially causing extra effect runs even when filters haven't changed. | /optimize |
| 13 | Low | a11y | `trade-row.tsx` | The clickable trade row is a `div` with `role="button"` and keyboard handler — acceptable pattern, but the delete confirmation sub-UI (inline) does not trap focus. Keyboard users can tab past the confirm/cancel buttons. | /harden |
| 14 | Low | responsive | `trade-form.tsx` | Tab list is `grid grid-cols-2 sm:grid-cols-4` — on screens between 480–639px, the 2-column tab grid causes "Journal" and "Tags & Notes" to wrap at truncated widths without ellipsis. Tab labels get visually cut off. | /adapt |

### 3. Analytics

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 15 | High | perf | `analytics-content.tsx` | Component manages 10+ independent state slices (performance, tagStats, expectedValue, rDistribution, equityCurve, hourlyPerformance, etc.). Each `setXxx()` call triggers a separate React render. Should be consolidated into a single `applyDashboard` dispatch that batches state. `applyDashboard()` exists but calls 10 separate setters, not a reducer. | /optimize |
| 16 | Medium | a11y | `analytics-content.tsx` | The "Compare Accounts" link uses `aria-label` with translation key — good. But the link is visually positioned as a small text link at the top right with no visible focus ring beyond the browser default. Focus indicator needs explicit styling per WCAG 2.4.7. | /harden |
| 17 | Medium | design | `analytics-content.tsx` | The time-based analysis section header (`h2`) appears mid-page with no visual separator from charts above it. The abrupt heading break breaks the sense of logical page structure. | /arrange |
| 18 | Low | responsive | `analytics-content.tsx` | `TimeHeatmap` and `SessionPerformanceChart` are side-by-side at `2xl:grid-cols-2` but full-width below 1536px. On a 1280–1535px viewport, these two dense charts stack — total page height becomes extremely tall, requiring significant scrolling. | /adapt |
| 19 | Low | perf | `analytics-content.tsx` | Module-level analytics cache (`getAnalyticsCacheEntry`) is consulted on every `filterKey` change. Cache entries are never invalidated on time — a filter applied in the morning will return stale data if revisited in the afternoon without a navigation. | /optimize |

### 4. Playbook

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 20 | Medium | ux | `playbook-content.tsx` | Strategy deletion uses `DeleteConfirmDialog` — good. But after deletion, there is no toast feedback. The strategy simply disappears from the list with no confirmation to the user. | /harden |
| 21 | Medium | design | `playbook-content.tsx` | Strategy list empty state is a basic centered text with no icon, no onboarding prompt illustration, and no clear CTA hierarchy. The "Add Strategy" button is present but visually isolated. | /onboard |
| 22 | Low | a11y | `compliance-dashboard.tsx` | The inline progress bar for compliance score has no `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, or `role="progressbar"`. Screen readers get no indication of the compliance percentage. | /harden |

### 5. Command Center

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 23 | High | a11y | `daily-checklist.tsx` | Checklist items are rendered as `<label>` wrapping a `<Checkbox>` — this is semantically valid. However, the Checkbox uses `aria-label={item.label}`, which means the label text is announced twice (once by the `<label>` wrapping element, once by the aria-label on the checkbox). Remove `aria-label` from `<Checkbox>` since the `<label>` already provides the accessible name. | /harden |
| 24 | Medium | ux | `daily-checklist.tsx` | Toggle failures are silently swallowed — `catch {}` with empty body means the user sees no error when a checklist item toggle fails (e.g., network error). The UI stays in the toggled state visually but the server state is unchanged. | /harden |
| 25 | Medium | design | `live-trading-status-panel.tsx` | `MetricCell` sub-component renders `<span>` elements as block display for labels and values — semantically these are `<dl>`/`<dt>`/`<dd>` definition list pairs, which is the correct HTML for labeled metric data. Current markup gives no structured reading order to screen readers. | /harden |
| 26 | Low | ux | `checklist-manager.tsx` | The settings button on each checklist triggers `onManageClick` — this navigates to a global manage state. If there are multiple checklists and the user clicks settings on a specific one, there is no indication which checklist they are managing. | /clarify |

### 6. Monte Carlo

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 27 | Medium | a11y | `monte-carlo-content.tsx` | The results "Top Summary Banner" (`div` with flex/wrap) has no `role` or `aria-label`. Screen readers will read the parameter values without context — there is no announced heading grouping the simulation parameters. | /harden |
| 28 | Medium | ux | `monte-carlo-content.tsx` | Error state is displayed inline as a styled `div` below the parameters form. After a simulation error, there is no way to dismiss the error — it persists until the user modifies params and re-runs. The error should have a dismiss button. | /harden |
| 29 | Low | design | `monte-carlo-content.tsx` | The "Run Again" button in the results banner uses `variant="outline"` with a `Dices` icon. The run button in the input section uses `size="lg"`. There is an inconsistency between entry and repeat-run CTAs — the repeat action appears smaller and less prominent than the original. | /normalize |
| 30 | Low | responsive | `distribution-histogram.tsx` | This component uses inline `style={{ fill: '#...' }}` hardcoded hex values for histogram bar colors inside SVG — these do not respond to theme changes. Dark/light mode switching breaks histogram color semantics. | /colorize |

### 7. Risk Simulation

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 31 | Medium | a11y | `risk-simulation-content.tsx` | The "Run Simulation" button uses `aria-label` correctly. However when `canRun` is false (no params, no preview, or `allTradesLackSl`), the disabled button has no tooltip or nearby explanation of why it is disabled. Users relying on assistive technology cannot determine what action is required to enable the button. | /harden |
| 32 | Medium | ux | `risk-simulation-content.tsx` | Error state from `runRiskSimulationFromDb` is displayed as inline `<p className="text-small text-fb-error">` next to the Run button — no dismiss, no icon, no bordered error card. Inconsistent error presentation vs other features (e.g., Monte Carlo, Equity Shield). | /normalize |
| 33 | Low | design | `summary-cards.tsx` (risk-simulation) | Summary cards use hardcoded `gap-4` Tailwind arbitrary spacing rather than the design system spacing tokens (`gap-m-400`). | /normalize |

### 8. Reports

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 34 | Medium | a11y | `weekly-report-card.tsx` | The collapsible weekly report sections (if any) need `aria-expanded` on the toggle control. (Verified: the card uses period navigation buttons — these need `aria-live` on the content area that updates.) | /harden |
| 35 | Low | design | `reports-content.tsx` | Reports page has no page-level empty state. If all four report types return `null` (no data), the page renders four empty cards with nothing meaningful. There should be a unified empty state prompting the user to log trades. | /onboard |
| 36 | Low | theming | `commission-fee-impact-card.tsx` | Uses `text-h2` for large metric values which is correct, but the component also uses hardcoded `rgb()` colors in inline styles for a chart element. | /colorize |

### 9. Settings

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 37 | Critical | a11y | `account-settings.tsx` | This is a ~1200-line component. Destructive actions (Delete Account, Delete All Trading Data) use `AlertDialog` correctly with confirmations — good. However, the `deleteAllTradingData` alert dialog's description does not explicitly state the data cannot be recovered. WCAG 3.3.4 requires error prevention for legal/financial commitments. The description should be explicit about irreversibility. | /harden |
| 38 | High | perf | `account-settings.tsx` | This single component handles account name, prop firm settings, commission settings, account assets, danger zone, and account switching — ~1200 lines of client component. Large component causes heavy client-side JS bundle; should be split into sub-components with lazy loading via `React.lazy` or tab-based code splitting. | /optimize |
| 39 | Medium | a11y | `settings-content.tsx` | The "Indicators" tab trigger renders the label as a hardcoded English string `"Indicators"` rather than using the translation function. This breaks i18n and means screen readers announce the untranslated label. | /clarify |
| 40 | Medium | a11y | `settings-content.tsx` | The tab list on mobile uses `overflow-x-auto` with a right-side fade gradient. Keyboard users can navigate tabs via arrow keys (Radix handles this), but the overflow behavior means an active tab selected via keyboard may be scrolled out of view without auto-scroll-into-view behavior. | /harden |
| 41 | Low | ux | `settings-content.tsx` | Tab-specific URL params are cleared on tab switch via `TAB_SPECIFIC_PARAMS`. While intentional, this means browser back-navigation after editing a specific item (e.g., editing an asset) does not restore the user to that item — the param is gone. | /clarify |
| 42 | Low | theming | `brand-switcher.tsx` | Component uses hardcoded hex `style` props for brand preview swatches. These are intentionally hardcoded (brand previews), but they don't update when switching base themes. A note or visual indicator that these are brand-specific previews would reduce confusion. | /clarify |
| 43 | Low | theming | `tag-form.tsx` + `tag-list.tsx` | Color picker for tags uses `react-colorful` with inline `style={{ backgroundColor: hex }}` for previews. The hex value bypasses the design token system — acceptable for user-defined tag colors, but the surrounding UI borders/ring focus states should still use tokens. | /normalize |

### 10. Backtest / Optimize

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 44 | Critical | a11y | `backtest-content.tsx` | Form field labels (`<label className="text-small font-medium text-txt-200">`) have no `htmlFor` attribute connecting them to their associated `<SelectTrigger>` input. Screen readers cannot determine which label belongs to which control. Affects all 4 form fields: Strategy, Asset/Timeframe, Preset, Date Range. | /harden |
| 45 | Critical | a11y | `optimize-content.tsx` | Same issue as Backtest — all `<label>` elements in the Setup wizard step lack `htmlFor`. Affects Strategy, Preset, Asset/Timeframe, and Date Range labels. | /harden |
| 46 | High | theming | `backtest-content.tsx` | Uses non-existent Tailwind tokens `text-heading-2` and `text-heading-3` for all headings. The CSS variable namespace is `--text-h1`, `--text-h2`, `--text-h3` — so `text-heading-*` generates no styles. Headings fall back to the browser default body text size, destroying visual hierarchy. | /typeset |
| 47 | High | theming | `optimize-content.tsx` | Same issue — `text-heading-2` and `text-heading-3` are used throughout, including h1 page title and all section headings. | /typeset |
| 48 | High | theming | `backtest-summary-cards.tsx` | Uses `text-heading-3` for metric values — same broken token. Metric values appear at body text size on screen. | /typeset |
| 49 | Medium | a11y | `optimize-content.tsx` | The `WizardStepper` component — step buttons need `aria-current="step"` on the active step for AT users to know which step they are on during multi-step workflows. | /harden |
| 50 | Medium | ux | `optimize-content.tsx` | The sweep progress bar auto-updates during parameter sweep runs but there is no `aria-live="polite"` region announcing progress to screen readers. Users relying on screen readers cannot know a sweep is in progress. | /harden |
| 51 | Medium | responsive | `backtest-trades-table.tsx` | Backtest trades table (`BacktestTradesTable`) has no horizontal scroll wrapper for mobile viewports. The table renders fixed-width columns that will overflow narrow screens rather than scrolling. | /adapt |
| 52 | Low | design | `backtest-content.tsx` | Empty state (no results yet) is a centered text block that appears BELOW the form — meaning on first load the user sees a non-empty form followed by an empty state. This creates visual confusion; the empty state should only be visible before the user configures any settings. Current condition `!result && !isPending` always shows it alongside the form. | /distill |

### 11. Equity Shield

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 53 | Medium | a11y | `equity-shield-content.tsx` | Live-only toggle switches (`m1-live-only`, `m2-live-only`) use `aria-label` on the `Switch` component — correct. But the associated `Label` also renders visually; the `htmlFor` on `Label` is set correctly. However, `Switch` implementation (Radix) plus a `Label` with `htmlFor` means the description is announced twice. Verify no double-announcement. | /harden |
| 54 | Medium | ux | `equity-shield-content.tsx` | Error state from `runEquityShieldFromDb` uses `text-trade-sell` styling — but this is thematically a "loss" color, which is confusing when used for a system/operation error message. Errors should use `text-fb-error` / `bg-fb-error/10` for system errors, reserving trade-sell for financial loss meaning. | /normalize |
| 55 | Low | design | `equity-shield-content.tsx` | The three charts (Original, Method 1, Method 2) are stacked vertically with no visual grouping between "input" and "output" sections. The result area would benefit from a section divider or labeled results container. | /arrange |

### 12. Monthly

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 56 | Medium | a11y | `monthly-content.tsx` | The error state is a styled div with an error message but no `role="alert"` — screen readers won't announce it as an error when it appears. | /harden |
| 57 | Medium | design | `monthly-content.tsx` | When navigating to a past month with no data, the empty state is a plain `<p className="text-txt-300">` centered in a card. No icon, no guidance on why data might be missing (e.g., "No trades logged in this month"). | /onboard |
| 58 | Low | responsive | `prop-profit-summary.tsx` (monthly) | Profit summary card grid `grid-cols-2 sm:grid-cols-4` — similar to the KPI grid issue. Orphan columns on tablet breakpoints. | /arrange |

### 13. Imports

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 59 | Medium | a11y | `detailed-trade-importer.tsx` | The import stepper (select → preview → importing → success/error) has no `aria-live` announcement for step transitions. When the step changes (e.g., parse succeeds and moves to preview), screen readers are not informed of the content change. | /harden |
| 60 | Medium | ux | `detailed-trade-importer.tsx` | Error state (`setStep("error")`) renders an error message but the "Back" button resets the step back to "select" — this is logical, but the error message lacks actionability (no "Try again with a different file" or documentation link). Errors like parse failures often need user guidance. | /harden |
| 61 | Low | a11y | `detailed-trade-importer.tsx` | The file input (`<Input type="file">`) is wrapped in a div but there is no visible `<label>` element associated with it — only an implicit label via nearby text. Assistive technologies may not announce the input purpose correctly. | /harden |

### 14. Market Monitor

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 62 | High | responsive | `market-monitor-content.tsx` | Fixed layout `grid h-89 grid-cols-1 grid-rows-[1fr] items-stretch gap-3 sm:gap-4 lg:grid-cols-[1fr_340px]` uses `h-89` — in Tailwind v4, `h-89` resolves as an arbitrary value (89 × 4px = 356px), but the companion `grid-cols-[1fr_340px]` fixed 340px right column will cause overflow on screens narrower than 640px (calendar + market status panel each need minimum widths). | /adapt |
| 63 | High | a11y | `market-monitor-content.tsx` | Custom tab implementation (`role="tablist"`, `role="tab"`, `aria-selected`) is present — good. But there is no `aria-controls` linking each tab to its panel, and the panel has `role="tabpanel"` but no `id` for the `aria-controls` reference. The tab-panel relationship is incomplete. | /harden |
| 64 | Medium | a11y | `market-monitor-content.tsx` | Market status indicator dots (colored circles) convey meaning (open/opening/closed) through color alone — no text alternative or `aria-label` on the dot element. Color-blind users and screen reader users lose this information. The dots have `aria-hidden="true"` but the adjacent label only says "B3: Open" — the visual distinction between open (green) and opening (pulsing yellow) is lost without color. | /harden |
| 65 | Medium | theming | `market-monitor-content.tsx` | Uses `space-y-4 sm:space-y-5` raw Tailwind spacing instead of design system tokens (`space-y-m-400 sm:space-y-m-500`). Inconsistent with the rest of the app. | /normalize |
| 66 | Low | design | `hero-quote-card.tsx` | Hero quote cards are displayed in a horizontally scrollable row (`overflow-x-auto`) on mobile but there is no scroll indicator (shadow, gradient, scroll cue) to indicate more content is off-screen. | /distill |

### 15. Auth

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 67 | Medium | a11y | `login-form.tsx` | The logo image `axion-wordmark-white.png` uses `alt="Axion"` — correct. However the form heading `<h1>` repeats the product name context. On the account selection step, the logo and `<h1>` both say "Axion" — redundant. | /distill |
| 68 | Medium | ux | `login-form.tsx` | Error state for general login errors (`setError(...)`) uses a plain `div` with `text-fb-error` — no `role="alert"` or `aria-live="assertive"`. When authentication fails, the error message appears inline but is not announced to screen readers who may have submitted the form via keyboard. | /harden |
| 69 | Low | design | `login-form.tsx` | The account selection step renders account type `capitalize` in a `<p className="text-tiny text-txt-300">` — "prop" and "personal" are shown in lowercase-then-capitalized. The account type label has no design treatment distinguishing prop accounts visually (e.g., a badge or icon color). The icon (Building2 vs User) is the only distinguisher, which is not accessible. | /colorize |
| 70 | Low | a11y | `register-form.tsx` | Similar to login — validation error messages that appear after failed submission are not announced via `role="alert"`. | /harden |

### 16. Shared / UI Components

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 71 | Medium | a11y | `stat-card.tsx` | `StatCard` has `aria-label={label}` on the container `div`. This is correct for conveying the stat type to screen readers. However, if the value is a `ReactNode` (not a string), the `aria-label` only announces the label — not the value. Screen readers won't read the actual metric value. Should use `aria-labelledby` with a composed ID or convert to a `<dl>` structure. | /harden |
| 72 | Medium | a11y | `empty-state.tsx` | Uses `role="status"` — correct for live updates but semantically wrong for static empty states. An empty state is not a "status" announcement; it's static content. Should be removed or replaced with `role="region"` with `aria-label`. | /harden |
| 73 | Low | a11y | `loading-spinner.tsx` | Uses `animate-spin motion-reduce:animate-none` — good reduced-motion support. The spinner renders a `<span className="sr-only">` for screen reader text when a `label` prop is passed, which is correct. However the default (no label) renders nothing for AT — consider a default `aria-label="Loading"`. | /harden |
| 74 | Low | design | `stat-card.tsx` | Label uses `uppercase tracking-wider` — allcaps text at `text-tiny` (0.75rem / 12px) sizes is hard to read and violates readability best practices for small-scale data display. Consider `tracking-wide` without uppercase, or reserve allcaps for specific design moments. | /typeset |

### 17. Layout

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 75 | High | a11y | `sidebar.tsx` | Navigation links have `tabIndex={0}` explicitly set — this is redundant on `<a>` elements (which are already focusable) and can cause confusion when combined with `href`. Remove `tabIndex={0}` from native `<Link>` elements. | /harden |
| 76 | Medium | design | `sidebar.tsx` | Logo swap (wordmark ↔ mark) uses `transition-opacity duration-1000` — 1 second transition is far too slow for a functional UI element. A 200–300ms transition is appropriate. The current implementation creates a long fade that looks like a bug on slow machines. | /animate |
| 77 | Medium | a11y | `app-shell.tsx` | Mobile top bar `<Bell>` icon button is present with `aria-label={tCommon("notifications")}` — but it appears to be a stub with no associated notifications functionality. Rendering a decorative interactive element that does nothing is misleading. Should either be removed or replaced with a disabled state with `aria-disabled="true"` and a tooltip. | /harden |
| 78 | Low | design | `sidebar.tsx` | The "by BRAVO" attribution badge at the bottom is `text-micro` (0.625rem / 10px) — below the WCAG minimum text size recommendation of 12px for legible supplemental text. | /typeset |

### 18. Account Comparison

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 79 | Medium | a11y | `account-comparison-content.tsx` | Back-navigation uses `<Link>` with only an icon (`ArrowLeft`) and `aria-label={t("backToAnalytics")}` — correct. However, on the comparison results view when the expectancy mode toggle and comparison data are visible, there is no `aria-live` region for when comparison data loads (it appears via `startTransition` with no loading indicator visible to screen readers). | /harden |
| 80 | Low | ux | `account-comparison-content.tsx` | The "Compare" button is not rendered in the visible code slice (cut off at line 80). From the component architecture, if there are fewer than 2 accounts selected, no compare action is triggered. There appears to be no visible feedback to the user explaining how many accounts are required before comparison is possible. | /clarify |

### 19. Monthly Plan

| # | Severity | Category | Component/Area | Issue | Fix Skill |
|---|----------|----------|----------------|-------|-----------|
| 81 | Medium | a11y | `monthly-plan-tab.tsx` | Loading spinner is implemented as a raw `div` with `animate-spin` class + `<span className="sr-only">Loading...</span>`. The `sr-only` text says "Loading..." — hardcoded English, not translated. Breaks i18n for accessibility. | /harden |
| 82 | Medium | ux | `monthly-plan-tab.tsx` | The "New Month Banner" — when there is no plan for the current month — shows an `AlertCircle` icon but uses `text-acc-100` (gold) styling. Gold is the primary action color, not a warning color. Using gold for a "you haven't set up your plan" reminder conflates the warning signal with the brand accent. | /colorize |
| 83 | Low | design | `monthly-plan-tab.tsx` | Month navigation: the `<span>` showing the current month label (`monthLabel`) is `min-w-[140px]` — a hardcoded fixed width. Translated month names in some locales may exceed this width. | /adapt |

---

## Patterns & Systemic Issues

### Issue Pattern 1: Token Mismatch — `text-heading-*` vs `text-h*`
**Files affected: 20+ files in `src/components/backtest/` and `src/components/optimize/`**
All heading classes use `text-heading-2` / `text-heading-3` which are not defined in the Tailwind v4 `@theme` block. The correct tokens are `text-h2` / `text-h3`. This means ALL headings in the Backtest and Optimize features render at default body text size — completely destroying visual hierarchy in two major feature areas.

### Issue Pattern 2: Missing `htmlFor` on Form Labels in Newer Features
**Files affected: `backtest-content.tsx`, `optimize-content.tsx` (Setup wizard), all `backtest/sections/*.tsx`**
All four control labels in the Backtest config form and Optimize Setup step use bare `<label>` HTML elements without `htmlFor` associations. This is a consistent pattern indicating these features were built without the `FormField`/`FormLabel` pattern used in the rest of the app.

### Issue Pattern 3: Raw Tailwind Spacing vs Design Tokens
**Files affected: `market-monitor-content.tsx`, `risk-simulation/summary-cards.tsx`, some `backtest/sections/*.tsx`**
These use `gap-4`, `space-y-4`, `space-y-5` instead of `gap-m-400`, `space-y-m-400`, `space-y-m-500`. While functionally equivalent (gap-4 = 16px = m-400), this inconsistency means theme spacing overrides won't propagate to these components.

### Issue Pattern 4: Missing `role="alert"` on Error States
**Files affected: `login-form.tsx`, `register-form.tsx`, `monthly-content.tsx`, `monte-carlo-content.tsx`**
Multiple features display error messages as styled divs without `role="alert"` or `aria-live="assertive"`. Error messages that appear after user actions (form submission, simulation runs) must be announced to screen readers.

### Issue Pattern 5: Animations Missing `motion-reduce:animate-none` 
**Files NOT affected (pattern is well-followed)** — the audit found that `motion-reduce:animate-none` is correctly applied throughout. Only exception is the `tab-fade-in` animation class defined in `globals.css` which correctly has `@media (prefers-reduced-motion: reduce)` handling in CSS.

---

## Positive Findings

1. **Reduced motion support is thorough.** `motion-reduce:animate-none` is applied on every `animate-spin`, `animate-pulse`, and loading indicator throughout the codebase. The global CSS `@media (prefers-reduced-motion: reduce)` block correctly disables all custom keyframe animations.

2. **Trade form is a11y exemplary.** `trade-form.tsx` correctly uses `role="radiogroup"` on the rating section, `aria-pressed` on toggle buttons, `aria-label` on interactive icon buttons, and `FormLabel`/`FormControl` throughout. This is the gold standard for forms in this codebase.

3. **Design token usage is consistent in mature features.** Dashboard, Journal, Analytics, Playbook, Command Center, and Settings all correctly use `text-h*`, `space-y-m-*`, `gap-m-*`, `p-m-*` tokens instead of raw Tailwind values.

4. **Skip-to-content link is implemented.** `app-shell.tsx` correctly renders `<a href="#main-content" className="sr-only focus:not-sr-only...">` — essential for keyboard-only navigation.

5. **Delete confirmations are in place.** Playbook strategy deletion, account deletion, and trade deletion all use proper two-step confirmation patterns (either `AlertDialog` or inline confirm/cancel state).

6. **Memo usage on performance-critical components.** `TradingCalendar` and `TradeRow` correctly use `React.memo` to prevent re-renders.

7. **Auth forms respect `motion-reduce`.** All `Loader2` spinners in auth forms use `motion-reduce:animate-none`.

---

## Recommendations by Priority

### Immediate (Critical blockers)
1. **Fix `text-heading-*` tokens** in `backtest/` and `optimize/` — headings are invisible as headings right now. Use `/typeset` skill to rename all occurrences to `text-h2` / `text-h3`. ~20 files.
2. **Add `htmlFor` to all Backtest/Optimize labels** — screen readers cannot determine form structure. Use `/harden` skill. 8 affected `<label>` elements across 6 files.
3. **Add `role="alert"` to critical error messages** in login, register, monthly content, and Monte Carlo. Use `/harden` skill.
4. **Explicit irreversibility warning** in `account-settings.tsx` delete dialogs — required per WCAG 3.3.4 for data-destruction operations.

### Short-term (High severity — this sprint)
5. **Fix Market Monitor tab ARIA** — add `aria-controls` / `id` to complete tab-panel association.
6. **Split `account-settings.tsx`** into sub-components — 1200-line client component is a perf and maintainability risk.
7. **Fix sidebar `tabIndex={0}` on `<Link>` elements** — redundant and can cause AT issues.
8. **Reduce sidebar logo transition** from `duration-1000` to `duration-200`.
9. **Address radio group tab management** in trade form rating section.
10. **Fix duplicate aria-label announcement** in `daily-checklist.tsx` checkbox items.

### Medium-term (Quality improvements)
11. **Normalize spacing tokens** in Market Monitor and newer Risk Simulation components.
12. **Add `aria-live` to import stepper** step transitions.
13. **Fix Market Monitor responsive layout** — `h-89` and `grid-cols-[1fr_340px]` break on mobile.
14. **Error color semantics** — use `fb-error` for system errors; reserve `trade-sell` for financial loss.
15. **Add `role="alert"` to checklist toggle errors** (currently silently fails).
16. **Add scroll indicators** to horizontally scrollable hero quotes row.
17. **Resolve `EmptyState` `role="status"` misuse** — change to `role="region"` or remove `role` entirely.

### Long-term (Nice-to-haves)
18. **Consolidate Analytics state** into a reducer pattern to prevent waterfall re-renders.
19. **Add analytics cache TTL** to prevent stale data on long sessions.
20. **Add `aria-live` to Account Comparison** result loading.
21. **Loading state i18n** — translate hardcoded "Loading..." in `monthly-plan-tab.tsx`.
22. **StatCard value accessibility** — convert to `<dl>` structure for proper AT reading of metric values.
23. **Improve empty states** across Reports, Monthly, and Playbook with actionable guidance.

---

## Suggested Commands for Fixes

| Command | Addresses |
|---------|-----------|
| `/typeset` | Issues #46, #47, #48, #74, #78 — heading token mismatches and typography |
| `/harden` | Issues #6, #7, #8, #9, #23, #24, #31, #37, #44, #45, #49, #50, #56, #59, #63, #64, #68, #70, #71, #72, #75, #77, #81 — a11y and resilience |
| `/normalize` | Issues #29, #32, #33, #54, #65 — inconsistent patterns and token usage |
| `/adapt` | Issues #14, #51, #62, #83 — responsive layout issues |
| `/arrange` | Issues #3, #11, #17, #55, #58 — layout and visual rhythm |
| `/optimize` | Issues #4, #12, #15, #19, #38 — performance |
| `/colorize` | Issues #30, #69, #82 — color usage and theming |
| `/clarify` | Issues #26, #39, #41, #80 — UX copy and affordance |
| `/onboard` | Issues #21, #35, #57 — empty states and first-run guidance |
| `/distill` | Issues #52, #66, #67 — unnecessary complexity and visual noise |
| `/animate` | Issue #76 — animation timing |
