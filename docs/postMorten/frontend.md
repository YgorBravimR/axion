# Frontend Post-Mortem Log

---

> **[FIX-2026-07-14]** `Severity: Low` — **Affected:** `src/components/hawks-chart/hawks-chart-workspace.tsx:689-702`, `messages/en.json:171`, `messages/pt-BR.json:171`
> **Report:** "Raw server error string leaked to Hawks chart page (technical file path + script name). Page is pt-BR, so user saw untranslated English error."
> **Fix:** Replaced `{windowResult.message}` render with translated error key `t("loadError")`. Added console.error for debugging. Mirrored empty-state structure (header + message box). New key: en "Could not load chart data. Please try again.", pt-BR "Não foi possível carregar os dados do gráfico. Tente novamente."

---

## [BUG-2026-06-10] Hardcoded Portuguese month labels bypass i18n locale switching

**Date:** 2026-06-10
**Severity:** High (breaks UI in EN locale; affects user experience across multiple pages)
**Affected Area:** Monthly plan pages, quarterly plan pages, annual report generation; `src/components/fractal-plan/cockpit/month-report.tsx:62`, `quarter-report.tsx:85,352`, `src/app/actions/annual-reports.ts:383,451`

### Cause

The codebase imported and used hardcoded Portuguese month label functions (`monthLabelPt()`, `monthAbbrPt()`) unconditionally, bypassing the i18n translation system. These functions return only Portuguese names (Janeiro, Fevereiro, etc.) regardless of the app's current locale.

On `/en/plan/2026/2/6`, the header rendered "Junho 2026" instead of "June 2026" because `monthLabelPt(6)` always returns the Portuguese string. The functions were defined in `src/lib/fractal-plan/month-labels.ts` and used across four files without locale awareness.

### Effect

Users viewing the monthly plan in English locale saw Portuguese month names on the header (breadcrumb + right-side label), creating a jarring mixed-language UI. The bug also propagated to the quarterly plan summary and annual report generation.

### Solution

Replaced all hardcoded `monthLabelPt()` / `monthAbbrPt()` calls with `next-intl`'s `getTranslations("months")` function, which respects the app's locale. The i18n messages already contained a `months` object with 0-based numeric keys (0-11) for both EN and PT-BR:

```json
"months": {
  "0": "January",
  "1": "February",
  ...
  "5": "June",
  ...
}
```

Fixed four locations:

1. **month-report.tsx:62** — Changed `monthLabelPt(month)` to `tMonths(String(month - 1))`
2. **quarter-report.tsx:85** — Changed month abbreviation loop to use i18n
3. **quarter-report.tsx:352** — Changed month label prop for card rendering
4. **annual-reports.ts:383,451** — Changed two monthName assignments in getAnnualRollup action

The month parameter (1-12) is reduced by 1 to match the 0-based i18n keys.

### Prevention

- Never hardcode language-specific strings in UI components or server actions. Always route through `getTranslations()`.
- When importing utility functions like `monthLabelPt()`, treat them as internal helpers (e.g., for database defaults or fallbacks when i18n is unavailable), never as the primary UI rendering path.
- Add linter rule or TypeScript check to flag imports of `monthLabelPt` / `monthAbbrPt` in RSC/client components.

### Related Files

- `src/components/fractal-plan/cockpit/month-report.tsx`
- `src/components/fractal-plan/cockpit/quarter-report.tsx`
- `src/app/actions/annual-reports.ts`
- `src/lib/fractal-plan/month-labels.ts` (unchanged; still serves as fallback utility)
- `messages/en.json`, `messages/pt-BR.json` (i18n keys verified present)

---

## [BUG-2026-06-10] Weekly plan targets not derived from monthly goal

**Date:** 2026-06-10
**Severity:** High (weekly targets show 0.00R when monthly goal is non-zero, breaking financial plan visibility)
**Affected Area:** `/en/plan/2026/2/6` monthly plan page; `src/components/fractal-plan/cockpit/month-week-table.tsx:103-112`

### Cause

The weekly plan table displayed zero targets for weeks even when a monthly goal cap was set. The `monthlyGoalCents` value (R$ 50.160 = 5,016,000 cents in the bug report) was correctly derived at the month level but never cascaded down to weekly rows.

The `MonthWeekTable` component received `planWeeks` with `targetR` fields that could be null or zero (no explicit manual target set). When rendering, the component calculated `targetCents = targetR * oneRCents`, which evaluated to 0 for any null/zero `targetR`, ignoring the monthly cap entirely.

### Effect

Users saw the Weeks section with four rows, each labeled `target 0.00R real 0.00R` and showing `R$ 0,00` on the right, despite the monthly goal at the top showing `R$ 50.160`. This made weekly planning impossible — users had no visibility into how the monthly cap should be split across weeks.

### Solution

Added automatic weekly target derivation in `MonthWeekTable`:

1. Calculate `derivedWeeklyGoalCents = monthlyGoalCents / numberOfWeeks` when monthly goal is set and weeks have no explicit target.
2. Pass `monthlyGoalCents` as a new prop from `month-report.tsx` to `MonthWeekTable`.
3. Change target calculation logic from:
   ```ts
   const targetCents = Math.round(targetR * oneRCents)
   ```
   to:
   ```ts
   const targetCents =
   	targetR > 0 ? Math.round(targetR * oneRCents) : derivedWeeklyGoalCents
   ```

This maintains the priority: explicit weekly targetR (if set) takes precedence; otherwise, derive equally from the monthly cap.

### Prevention

- When a parent plan level (month) has a cap that cascades to child levels (weeks), ensure the cascade happens both at the data layer (database) AND at the UI render layer as a fallback.
- Add tests for derivation logic to catch missing cascades early.
- Document the cascade hierarchy: Yearly → Quarterly → Monthly → Weekly → Daily.

### Related Files

- `src/components/fractal-plan/cockpit/month-week-table.tsx` (added derivation logic)
- `src/components/fractal-plan/cockpit/month-report.tsx` (pass monthlyGoalCents prop)
- `src/__tests__/components/month-week-table.test.ts` (new test file verifying derivation)

---

## [BUG-2026-06-02] E2E setup test hangs 90s when session already authenticated

**Date:** 2026-06-02
**Severity:** High (blocks all 33 E2E tests; cascades from setup timeout)
**Affected Area:** `e2e/global.setup.ts:22-29`

### Symptom

`pnpm exec playwright test --project=setup` times out at 90s with "Test timeout of 90000ms exceeded". The screenshot shows the dashboard fully rendered in pt-BR (sidebar "Painel", header "Início", calendar "Calendário de Trades", metrics visible), proving the login succeeded. But the test never completed.

### Root Cause

When the auth session from a previous E2E run is still valid in the browser context, `page.goto("/en/login")` auto-redirects to the dashboard before the login form is rendered. The subsequent code (lines 27–28) then calls:

```ts
await page.getByLabel("Email").fill(TEST_USER.email)
await page.locator("#password").fill(TEST_USER.password)
```

Playwright's actionability check waits up to 30s for the `Email` input element to become interactive. Since we're on the dashboard (not login), the element doesn't exist and never will. This 30s wait exhausts before the test can proceed, leaving only 60s from the original 90s budget. The test continues through the race and expect, but cumulative waits exceed 90s and the test timeout fires.

The early 30s hang is invisible to the test author — it looks like the test is stuck at the form-fill line, when actually it's blocked on element actionability.

### Why it Surfaced

Between E2E test runs, the browser context persists authentication cookies and localStorage. When re-running setup on a warm dev environment, the same user session is still valid, and Next.js redirects happen at the Router layer (before React hydration). The first run clears nothing (or clears partially), so the second run inherits the cookies.

### Fix

Detect early if the page is already on the dashboard (not `/login` path) and skip the form fill:

```ts
if (!page.url().includes("/login")) {
	// Already authenticated, skip form fill
} else {
	// Form fill as before
	await page.getByLabel("Email").fill(TEST_USER.email)
	await page.locator("#password").fill(TEST_USER.password)
	await page.getByRole("button", { name: "Sign In" }).click()
}
```

This eliminates the 30s actionability wait when the session is already valid, reducing test time from 90s to ~7s on a warm run.

### Verification

- Ran `pnpm exec playwright test --project=setup` twice in succession: first run 7.2s (fresh login), second run 6.8s (skipped form, used existing session). Both passed.
- Auth state persisted to `e2e/.auth/user.json` after both runs.
- Timestamp on user.json updated on each run, confirming re-authentication path still works when session is missing.

### Prevention

1. **Check page URL early in auth flows.** Before waiting on form elements that require navigation to occur, verify the current URL to short-circuit waits on missing elements.
2. **E2E context cleanup between runs.** Add a `teardown` hook that clears storage and cookies if re-running setup is common. (Axion already has `global.teardown.ts` — consider extending it to clear auth state.)
3. **Timeouts on form actionability waits.** If keeping the form-fill pattern, wrap in a `try/catch` with a shorter timeout so "element not found" fails fast (~5s) rather than waiting the default 30s.

---

## [BUG-2026-05-31-01] Parameter heatmap grid disappears when sweep has optional params

**Date:** 2026-05-31
**Severity:** High (completely breaks heatmap visualization for affected sweeps; users see control UI but no data grid)
**Affected Area:** `src/components/optimize/parameter-heatmap.tsx:206-213`, `src/lib/optimize/heatmap-utils.ts:220-236`

### Symptom

On `/backtest/optimize` after a 1631-run sweep completes, the "Heatmap de Parâmetros" card renders all chrome correctly: title, subtitle, X/Y/Metric selectors, slice pickers, axis-label footer, hover-detail strip, and legend. But the actual colored-cell grid (lines 446–506) is invisible — no header row, no Y-labels, no data cells. The grid div renders with `gridTemplateColumns: auto repeat(N, ...)` but `N = 0`.

### Root Cause

The heatmap component seeds `slices` (constraints for filtering runs to display) from a "best run" via `getNestedValue(seedRun.recipe, paramPath)`. When a param is disabled/missing in the seed run (e.g., `stop.breakeven = undefined`), `getNestedValue` returns `NaN`. This `NaN` value gets stored in `slices`.

Inside `buildHeatmapData` (line 231), the filter checks `if (actual !== value)` to match runs against slice constraints. When `value = NaN`:

- `5 !== NaN` evaluates to `true` (NaN never equals anything)
- Every run is filtered out, leaving `filtered = []`
- Downstream `xValuesSet` and `yValuesSet` stay empty
- Grid renders with zero columns/rows → invisible

The footer labels (X: param name, Y: param name) still render because they depend on `heatmapData && xParam && yParam` being truthy, and `heatmapData` IS created (with empty arrays) — the condition doesn't guard on non-empty arrays.

### Why it Surfaced

The inline-sweep refactor changed how recipes are structured during strategy/preset swaps. A sweep that had been created with full param values later loads into the heatmap with a different seed run (the "best" run might not have all params enabled). The bug was latent before because sweeps rarely mixed "all params present" and "some params disabled" runs in the same set — but Phase 1 trust-foundations introduced this mixing pattern.

### Fix

Only seed slice values if they're finite numbers (line 207):

```ts
for (const param of sliceParams) {
	const val = getNestedValue(seedRun.recipe, param.path)
	// Only add numeric slices if they resolve to finite values.
	// A missing param (returns NaN) should not become a slice —
	// it would reject all runs in the filter.
	if (Number.isFinite(val)) {
		defaultSlices[param.path] = val
	}
}
```

Now optional params that are missing in the seed run simply don't become a slice constraint. The grid includes all runs regardless of whether they have the optional param.

### Verification

- Unit test probe: seeded slice with NaN → heatmap builds empty grid. After fix: non-empty grid with all 4 runs.
- Edge case: runA has `breakeven`, runB doesn't. Seed from runB → old code filtered runA out; new code includes it. ✓
- `pnpm lint` clean, `pnpm exec tsc --noEmit` clean.

### Prevention

1. **Distinguish between "not in sweep" and "missing in this run".** When seeding slice defaults from one run, only use params that have finite values in that run. Optional/conditional params should only become slices if they vary across the sweep — use `getVaryingParams` output, not raw recipe inspection.
2. **Guard heatmap grid render on non-empty arrays.** Add `heatmapData.xValues.length > 0 && heatmapData.yValues.length > 0` to the grid render condition so degenerate cases (no varying params) fail gracefully with a "No data" message instead of invisible grid.

---

## [BUG-2026-05-31-2] `useHeroPresets` tripped React's `getServerSnapshot` infinite-loop warning

**Date:** 2026-05-31
**Severity:** Low-Medium (no functional regression, but every render of `/backtest/optimize` logged a `console.error` and the warning is the kind that triggers actual infinite-loops under React 19 concurrent rendering paths)
**Affected Area:** `src/lib/optimize/use-hero-presets.ts:21`

### Symptom

Dev console on every `/backtest/optimize` navigation:

```
[browser] The result of getServerSnapshot should be cached to avoid an infinite loop
    at useHeroPresets (src/lib/optimize/use-hero-presets.ts:15:29)
    at OptimizeContent (src/components/optimize/optimize-content.tsx:224:36)
```

Discovered while validating engine accuracy via `scripts/sweep-validate.ts` — the warning came up in `/tmp/axion-dev.log` while the page sat idle behind Playwright.

### Root Cause

`useSyncExternalStore`'s third argument (`getServerSnapshot`) was an arrow returning a fresh array literal `() => []`. React calls this function during SSR/hydration and on every re-render path that needs the server-time value. Because `[] !== []` identity-wise, React's invariant check fires the warning. The same anti-pattern in `getSnapshot` (second argument) is what actually causes the infinite-loop crash; here it was only the SSR variant, so impact was log-noise — but same family of bug.

### Fix

Hoisted a module-level `SERVER_SNAPSHOT` constant and a named `getServerSnapshot` function. Also passed `listHeroPresets` directly (no-arg function) instead of wrapping in an arrow, so the snapshot reader's identity is stable across renders too.

### Verification

- Page reloaded on `localhost:3011/backtest/optimize` — Playwright console reports 0 errors (previously: 1 error per render).
- `pnpm exec tsc --noEmit` clean.
- `pnpm lint` clean.

### Lessons

1. **`useSyncExternalStore` snapshot functions must return stable references for empty/sentinel values.** Hoist them to module scope; never inline `() => []`, `() => null`, `() => {}`.
2. **Dev-log noise is signal.** This warning sat in `/tmp/axion-dev.log` long enough to feel like background hum. Validation-pass discovered it incidentally — worth grepping dev logs for `console.error` patterns after any meaningful feature work.

---

## [BUG-2026-05-30-1] Optimize inline sweep builder shows previous strategy's leaf values after Strategy/Preset swap

**Date:** 2026-05-30
**Severity:** Medium (visible misalignment with the backtest page; users can manually edit each field to recover, but the discrepancy looks like the optimize engine is configured wrong)
**Affected Area:** `src/components/optimize/optimize-content.tsx:147,247-259,396-422`

### What happened

User on `/backtest/optimize` reported that the Stop & Proteção section showed `Tipo de stop = % do range` with `Stop % do range = 30`, and the Alvo section showed `Alvo (R) = 1000` with `Modo do alvo = % do range`. Those are the verbatim values of `orbPresets[0].stop.initial` and `orbPresets[0].target.levels[0]`. The user had selected Hawks v0 from the Strategy dropdown but the inline sweep builder kept rendering ORB values. The legacy form sections (which read `recipe` directly) did update correctly — only the inline builder showed stale data.

### Root cause

Two issues stacked on top of each other:

1. **Pre-existing default.** `optimize-content.tsx:147` initialized `recipe` to `orbPresets[0]`, a leftover from when ORB was the only strategy.
2. **Stale `leafSelections` after `setRecipe`.** The seed effect for the inline sweep builder only ran when `leafSelections === null`:

```ts
useEffect(() => {
	if (!inlineSweepBundle) {
		if (leafSelections !== null) setLeafSelections(null)
		return
	}
	if (leafSelections === null) {
		setLeafSelections(deriveInitialSelections(inlineSweepBundle.leaves, recipe))
	}
}, [inlineSweepBundle, recipe, leafSelections])
```

On mount the effect populated `leafSelections` from the (then-ORB) recipe. When the user later picked Hawks via the Strategy dropdown, `handleStrategyChange("hawks_triple_screen")` ran `setRecipe(hawksV0)` and `setActiveRanges([])` — but left `leafSelections` untouched. The effect re-ran (dependencies `inlineSweepBundle` and `recipe` had changed) but the `leafSelections === null` gate skipped the re-derive. Shared leaf paths between ORB and Hawks (`stop.initial.type`, `stop.initial.pct`, `target.levels.0.value`, `target.levels.0.mode`) kept their ORB-seeded values, so the inline builder rendered ORB-shape inputs.

### Fix

`feat/op` commit fixed at this entry's date. Two-line change in two handlers (`handlePresetChange`, `handleStrategyChange`) to clear `leafSelections` after the recipe swap, plus changing the initial state to `hawksV0`:

```ts
const handleStrategyChange = (type: string) => {
	if (type === "orb_breakout") setRecipe(orbPresets[0])
	else if (type === "hawks_triple_screen") setRecipe(hawksV0)
	else if (type === "user_catalog") setRecipe(hawksUserCatalog)
	setActiveRanges([])
	setLeafSelections(null) // ← forces seed effect to re-derive
}
```

Same `setLeafSelections(null)` added inside `handlePresetChange`. The existing seed effect now picks up the change and re-derives `leafSelections` from the new recipe + the new strategy's leaf catalog (`HAWKS_LEAVES` vs `ORB_LEAVES`).

### Why we didn't fail twice

`docs/gotchas.md` doesn't have an existing entry that would have caught this — it's the first time a controlled state mirrors another controlled state through an effect with a `null` reset gate. The gate pattern is fine for "seed once" — but it traps any caller that mutates the upstream state without nulling the mirror. Logging this here for next time:

> **Mirror state with a `=== null` seed gate must be nulled explicitly when the upstream changes**. If you have `useEffect(() => { if (mirror === null) deriveMirror(upstream) }, [upstream, mirror])`, the gate prevents re-derives on upstream changes. Either drop the gate (always re-derive) or null the mirror at every upstream mutation site. Don't rely on the dependency array alone — the gate makes the effect silently no-op.

### Files

- `src/components/optimize/optimize-content.tsx` (lines 147, 396-422)

---

## [BUG-2026-05-26-2] Lightweight Charts assertion: "data must be asc ordered by time" on same-brick trades

**Date:** 2026-05-26
**Severity:** Medium (chart fails to mount, error-boundary catches; rest of `/backtest` UI continues to work)
**Affected Area:** `src/components/backtest/inspector/backtest-overview-chart.tsx:232`, `src/components/backtest/inspector/renko-pane.tsx:214`

### What happened

After fixing the `ReferenceError` (BUG-2026-05-26-1) and loading `/backtest`, the overview chart crashed with:

```
Assertion failed: data must be asc ordered by time, index=1, time=3882, prev time=3882
  at BacktestOverviewChart.useEffect (backtest-overview-chart.tsx:232)
```

The `<ErrorBoundaryHandler>` caught it, so the page kept rendering, but the overview chart never mounted.

### Root cause

Each backtest trade renders as a `LineSeries` from `entryBrickIdx → exitBrickIdx` at the entry price:

```ts
const a = Math.min(entryIdx, exitIdx)
const b = Math.max(entryIdx, exitIdx)
line.setData([
	{ time: a as UTCTimestamp, value: trade.entryPrice },
	{ time: b as UTCTimestamp, value: trade.entryPrice },
])
```

`entryIdx` and `exitIdx` are reconstructed at render time from the trade's wall-clock timestamps via `findBrickIndexForTime(bricks.times, trade.entryTime)` — a nearest-time lookup on `bricks.closeTimestamp[]`. The engine emits `entryTime`/`exitTime` as **candle timestamps** (`engine.ts:445,659`), not brick indices.

The lossy step: a single 5m candle can produce **0 to N** bricks. Many candles produce zero. So `bricks.closeTimestamp[]` is a sparse projection of the wall-clock axis. Two distinct trade timestamps (entry candle, exit candle) can nearest-collapse onto the **same** brick when both candles fall in a zero-brick gap, or when one of them lacks an exact brick match and the nearest brick happens to also be the nearest for the other.

**Methodologically same-brick trades are impossible in Hawks** — entry brick ≠ exit brick is a strategy invariant (entry at brick N's close, exit checks earliest at brick N+1's close). So every `a === b` we hit is a reconstruction artifact, not real data.

The same pattern existed inside `renko-pane.tsx` for the per-pane entry-price segment, so the bug would also fire on the 60m pane (where multi-hour trades span few bricks) even when the overview was OK.

### Why we didn't catch it earlier

- The synthetic test fixture and the design-doc walkthrough both used multi-brick trades. Real Hawks 5m data has plenty of in-brick exits (stop hit on the entry brick, target hit on the entry brick on noisy days).
- `tsc` + lint can't see a runtime assertion inside a third-party library; this was only catchable by actually rendering with real data.

### Fix (defensive, shipped)

`backtest-overview-chart.tsx`: guard the `addSeries` + `setData` call with `if (b > a)`. When `a === b`, skip the line entirely — the entry-direction marker (already pushed separately, `arrowUp`/`arrowDown`) still pinpoints the trade.

`renko-pane.tsx`: same guard around the `tradeLineRef.current = line` block. The entry/exit markers (`arrowUp/Down` + `circle`) still render at the correct brick index, so the trade is still visible — only the connecting segment is omitted.

### Proper fix (deferred, backlogged)

The defensive guard prevents the crash but silently hides the underlying mapping inaccuracy: when entry and exit collapse to the same brick, the user sees only a marker even though methodologically there should always be a multi-brick segment. The lossless approach is for the engine to emit `entryBrickIndex` and `exitBrickIndex` directly on `BacktestTrade`, so consumers don't reconstruct from timestamps. Tracked in `docs/backlog.md` → "Backtest / Inspector / Emit `entryBrickIndex` / `exitBrickIndex`…" (P2, M).

### Lessons / guardrails

- **Lightweight Charts strictly asserts ascending times** on `setData`, `update`, and `setMarkers`. Any code that derives times from non-uniform sources (Renko brick indices, candle aggregations, sparse event streams) must dedupe or guard. Documented in `docs/gotchas.md` under "Lightweight Charts".
- **Don't reconstruct identifiers you can carry**. When the producer knows the brick index (the engine consumes the brick stream directly), it should ship that index downstream rather than emit a timestamp the consumer has to nearest-match back. Every nearest-match is a place where data can collapse silently. This is the broader pattern behind the immediate crash.
- When expressing a trade as a **segment**, always think about the degenerate "zero-extent" case before calling `setData`. Pattern: compute `a, b`; if `b === a`, skip the segment but keep the marker.
- No lint rule can catch this — it's data-dependent. The defense is the gotcha entry + the explicit `b > a` guard at every `setData` site that takes a two-point segment, plus the backlog item to eliminate the lossy step at the source.

---

## [BUG-2026-05-23] Dark flash between account-switch overlay and page (ResumedOverlay hydration race)

**Date:** 2026-05-23 | **Severity:** Medium | **Affected Area:** `src/components/ui/account-transition-overlay.tsx`, `src/app/layout.tsx`, `src/app/globals.css`

### Symptom

When switching accounts (e.g. from Pessoal to Stop Loss Lab), the sequence visible to the user was:

1. Pre-reload overlay (dark, gold ring, "Alternando para Stop Loss Lab") — looks correct.
2. Hard reload — new page paints, **including the underlying app UI**, briefly visible.
3. A short dark flash snaps in over the now-visible page.
4. That dark flash fades out, revealing the page again.

So instead of one smooth fade from the gold overlay to the new page, the user saw page-flicker-dark-fade — jarring.

### Cause

`ResumedOverlay` (the post-reload cover) was only mounted _after_ hydration:

```tsx
useEffect(() => {
	const flag = sessionStorage.getItem(TRANSITION_SESSION_KEY)
	if (flag) {
		sessionStorage.removeItem(TRANSITION_SESSION_KEY)
		setIsVisible(true)
	}
	setIsMounted(true)
}, [])
```

`useEffect` only runs _after_ the browser has already done its first paint of the new page. Concretely:

1. Browser unloads old page → new HTML arrives.
2. New page paints with `bg-bg-100` body **and the entire SSR'd app UI** — the user sees the destination already.
3. React hydrates.
4. Provider's `useEffect` finally runs, sees the sessionStorage flag, calls `setIsVisible(true)`.
5. React renders the cover div with `opacity: 1` — _snap_, dark flash appears over the already-visible page.
6. `animate-overlay-fade-out` runs (300ms delay + 500ms fade) → page revealed again.

The cover was solving the right problem (mask the post-reload paint) but doing it one paint too late. Anything you set inside `useEffect` is by definition post-first-paint.

### Fix

Move the visibility signal **before** first paint via an inline pre-paint script (same pattern `next-themes` uses for `data-theme`, and that the repo's orphaned `BrandScript` was written for):

1. **New `AccountTransitionScript`** (`src/components/providers/account-transition-script.tsx`) — `next/script` with `strategy="beforeInteractive"`, inlined into `<head>`. Synchronously reads `sessionStorage.account-transition` and, if present, sets `data-account-transitioning="visible"` on `<html>` before body parses.

2. **Cover div is always SSR-rendered** inside `AccountTransitionOverlayProvider` (no `isVisible` state). It has Tailwind base classes `bg-bg-100 fixed inset-0 z-50 opacity-0 pointer-events-none` and a `data-resumed-overlay` attribute.

3. **CSS in `globals.css`** keys visibility off the `<html>` attribute:

   ```css
   html[data-account-transitioning="visible"] [data-resumed-overlay] {
   	opacity: 1;
   	pointer-events: auto;
   }
   html[data-account-transitioning="fading"] [data-resumed-overlay] {
   	animation: overlay-fade-out 500ms ease-in forwards;
   }
   ```

4. **`ResumedOverlay`'s `useEffect`** now just orchestrates the fade-out: reads the attribute, schedules `setAttribute("fading")` after a 300ms hold, then `removeAttribute` after a further 500ms fade.

End state: the cover is opaque from the very first paint of the new page (CSS rule matches before any pixel hits the screen), so the user never sees the underlying app between the gold overlay and the fade-out.

### Files touched

- `src/components/providers/account-transition-script.tsx` (new)
- `src/app/layout.tsx` — import and mount `<AccountTransitionScript />`
- `src/components/ui/account-transition-overlay.tsx` — rewrote `ResumedOverlay`
- `src/app/globals.css` — added `data-account-transitioning` selector rules

### Lessons

- **`useEffect` is always too late for "cover the first paint" UX.** If a UI element needs to be visible on the very first frame after navigation/reload, its visibility must be encoded in something the renderer can resolve synchronously: a server-rendered class, an inline pre-paint script setting an attribute, a `data-` flag from a cookie. Client effects run _after_ the browser has already shown the user something.
- **Hard reload + post-paint mask is a recurring trap.** Any future flow that uses `window.location.reload()` to refresh state should follow this pattern (pre-paint signal → SSR'd cover) instead of mounting the cover in an effect.
- **The orphaned `BrandScript` was a hint.** Someone wrote the exact pattern for `data-brand` but never wired it up; that script is the canonical reference for "set an html attribute before paint" in this repo.

---

## [BUG-2026-05-23] `getTranslations` in async Server Component rendered from Client Component (DarfStrip / TaxTab)

**Date:** 2026-05-23 | **Severity:** High | **Affected Area:** `src/components/fractal-plan/cockpit/darf-strip.tsx`, `src/components/fractal-plan/cockpit/tax-tab.tsx`

### Symptom

On `/plan/2026` the **Impostos** tab rendered the global error boundary ("Algo deu errado! Ocorreu um erro ao carregar o painel. Isso pode ser um problema temporário."). Console showed:

```
<DarfStrip> is an async Client Component. Only Server Components can be
async at the moment. This error is often caused by accidentally adding
"use client" to a module that was originally written for the server.

Uncaught (in promise) Error: `getTranslations` is not supported in Client Components.
  at DarfStrip (darf-strip.tsx:39:33)

A component was suspended by an uncached promise. Creating promises inside
a Client Component or hook is not yet supported, except via a Suspense-compatible
library or framework.
```

### Cause

`DarfStrip` was declared as `async` and called `getTranslations` from `next-intl/server`. It has two callers:

1. `quarter-report.tsx` — Server Component (works fine).
2. `tax-tab.tsx` — `"use client"` Client Component (broken).

Next.js App Router rule: a Client Component cannot render an `async` child, and `next-intl/server` APIs only run during server rendering. Rendering `<DarfStrip>` from `<TaxTab>` therefore threw on first render of the Impostos tab and the boundary caught it. The dev console error message even names the suspected cause: "accidentally adding 'use client' to a module that was originally written for the server" — except in our case it was the **parent** that was client, not the child.

### Fix

Converted `DarfStrip` to a Client Component:

- Added `"use client"` directive.
- Replaced `import { getTranslations } from "next-intl/server"` with `import { useTranslations } from "next-intl"`.
- Removed `async` from the function signature and `await` from the `t` initialization.

The other caller (`quarter-report.tsx`, Server Component) keeps working because Server Components can freely render Client Components.

### Why it slipped through

The Tier-2 type check did not catch this — `async` + JSX is structurally valid TypeScript. There is no lint rule yet that bans `getTranslations` (server) in modules that are reachable from `"use client"` parents. Reachability is a graph property the linter doesn't track.

### Prevention

- Logged the pattern as a gotcha (`docs/gotchas.md` → Next.js / App Router section) so future agents recognize the symptom on sight.
- **Heuristic**: if a leaf component might ever be rendered from a Client Component (anything in `cockpit/`, `journal/`, `dashboard/`, `command-center/` tends to be client-heavy), prefer `useTranslations` + `"use client"` over `getTranslations` + `async`. Reserve the server variant for components that are only ever rendered from a `page.tsx` / `layout.tsx` directly.

---

## [BUG-2026-05-21] React infinite loop in EquityCurve component (nested useCallback deps)

**Date:** 2026-05-21 | **Severity:** High | **Affected Area:** `/src/components/dashboard/equity-curve.tsx`

### Cause

After the initial infinite loop fix (commit f28f70b5), the dashboard still failed the E2E navigation test with "Maximum update depth exceeded" error. The root cause was an unnecessary function dependency in the `useEffect` at line 207-211 of `equity-curve.tsx`:

```typescript
const fetchData = useCallback(
	(newPeriod: Period, newMode: ViewMode) => { ... },
	[calendarMonth, effectiveDate]
)

useEffect(() => {
	if (period === "month") {
		fetchData("month", viewMode)
	}
}, [calendarMonth, fetchData, period, viewMode])  // <-- fetchData in deps!
```

The problem: `fetchData` itself depends on `[calendarMonth, effectiveDate]`. By including `fetchData` as a dependency of the effect, we created a situation where:

1. If `calendarMonth` or `effectiveDate` changes, `fetchData` is recreated (new identity)
2. The effect sees `fetchData` changed, so it re-runs
3. The effect calls `fetchData()`, which may trigger state updates
4. The component re-renders
5. Now `fetchData` is recreated again (because its deps changed)
6. The effect re-runs again, creating a cascade of updates until React's depth limit is exceeded

**Root principle:** When a function is included in a `useEffect` dependency array, that function's own dependencies become indirect dependencies of the effect. It's redundant and error-prone to include both the function AND its dependencies in the same effect's deps.

### Effect

Browser console error (caught in E2E test): `Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate.` The E2E test `should display all navigation items` failed because the dashboard page never fully rendered.

### Solution

Replaced the function reference with its actual dependencies in the `useEffect` dependency array:

```typescript
useEffect(() => {
	if (period === "month") {
		fetchData("month", viewMode)
	}
}, [calendarMonth, effectiveDate, period, viewMode]) // <-- dependencies instead of function
```

This way:

- The effect still re-runs when the inputs change (same observable behavior)
- We break the circular dependency where the function's identity affects the effect's re-run condition
- The effect's dependencies are explicitly the values the effect actually depends on, not an intermediate function

### Prevention

- **Include function dependencies, not function references, in effect dependency arrays.** If you need `fetchData()` to re-run when its dependencies change, include those dependencies directly in the effect, not the function itself.
- **Be suspicious of patterns like `[..., callbackFunction, ...]` in useEffect deps.** Ask: does the effect depend on the function's identity, or on the function's inputs?
- **ESLint `react-hooks/exhaustive-deps` can be deceived by this pattern.** It sees `fetchData` used in the effect, suggests adding `fetchData` to deps, but doesn't catch that `fetchData`'s own deps are missing. Manual code review is essential.
- **Test dashboard rendering with charts and date filters** to catch cascading re-render issues early.

### Related Files

- `src/components/dashboard/equity-curve.tsx`

---

## [BUG-2026-05-21] React "Maximum update depth exceeded" infinite loop on dashboard with fresh accounts

**Date:** 2026-05-21 | **Severity:** High | **Affected Area:** `/src/components/dashboard/dashboard-content.tsx`, `/src/components/dashboard/dashboard-strategy-filter.tsx`, `/src/components/shared/mode-variant.tsx`

### Cause

The dashboard page rendered an error boundary ("Something went wrong!") when accessed by fresh accounts with no trading data. The root cause was a circular dependency in `DashboardStrategyFilter`'s `useEffect`:

1. `DashboardStrategyFilter` had an effect that checked if a selected strategy no longer exists in the options and cleared the filter:

   ```typescript
   useEffect(() => {
   	if (value.strategyId && options.length > 0 && !selectedStrategy) {
   		onChange({ strategyId: null, strategyVersionId: null })
   	}
   }, [options.length, selectedStrategy, value.strategyId, onChange]) // onChange in deps!
   ```

2. The `onChange` callback prop came from parent `DashboardContent` and was created with `useCallback(..., [fetchFilteredData, period])`.

3. `fetchFilteredData` had `useCallback(..., [effectiveDate])` as its dependency.

4. Because `effectiveDate` was obtained from `useEffectiveDate()` hook which was not stably memoized relative to parent re-renders, and because `onChange` was passed as a dependency to the child's effect, the effect would re-run on every render, calling setState in the parent, causing re-renders, triggering the effect again. This exceeded React's 50-update limit.

Additional issues:

- `ModeVariant` component was not memoized, causing unnecessary child component re-renders
- `coachingVariants` object in `DashboardContent` was created inline, recreating on every render

### Effect

Browser console error: `Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.` The error boundary caught this and displayed "Something went wrong! An error occurred while loading the dashboard."

### Solution

1. **Removed `onChange` from `DashboardStrategyFilter` useEffect dependency array.** The effect only needs to watch when the available options or selected strategy changes, not when the callback function itself changes. Added eslint-disable comment to document this intentional omission.

2. **Memoized `ModeVariant` component** with `memo()` wrapper to prevent re-renders when props don't change structurally.

3. **Memoized `coachingVariants` object in `DashboardContent`** using `useMemo` with `[initialHawksContext]` dependency to prevent recreation on every parent render.

4. **Added defensive error handling in `EffectiveDateProvider`** to handle malformed date strings gracefully.

### Prevention

- **Never include callback props in useEffect dependency arrays unless the effect logic actually depends on their identity.** If an effect calls a callback, ensure the callback is stably memoized in the parent, or exclude it from dependencies if the call is side-effect-only.
- **Memoize components that are used as render props or passed as object properties** to prevent cascading re-renders.
- **Avoid creating object/array literals inline in JSX**, especially when they're passed as props to child components. Use `useMemo` for complex objects and arrays.
- **Test dashboard rendering with fresh accounts** (no trading data, no strategies) as part of E2E suite to catch infinite loop issues early.

### Related Files

- `src/components/dashboard/dashboard-content.tsx`
- `src/components/dashboard/dashboard-strategy-filter.tsx`
- `src/components/shared/mode-variant.tsx`
- `src/components/providers/effective-date-provider.tsx`

---

## [BUG-2026-05-13] AccountTransitionOverlayProvider hydration mismatch in ResumedOverlay

**Severity:** High | **Affected:** `src/components/ui/account-transition-overlay.tsx`

**Cause:** The `ResumedOverlay` component read from `sessionStorage` during initial state setup (`useState(() => checkResumedTransition())`). On the server, `sessionStorage` doesn't exist, so the check returned `false` (wrapped in try-catch). On the client, the flag could be `true` if set by a previous page reload. This mismatch caused Next.js hydration to fail because server rendered without overlay, but client rendered with it.

**Effect:** Browser console error: `Uncaught Error: Hydration failed because the server rendered HTML didn't match the client.` The ResumedOverlay showed `aria-hidden="true"` and fade-out animation styles only on client, not on server.

**Solution:**

1. Removed `checkResumedTransition()` helper function (no longer needed).
2. Changed `ResumedOverlay` to use `isMounted` state to defer sessionStorage check to `useEffect` (client-only).
3. On mount, read sessionStorage in `useEffect`, set `isVisible` if flag exists, then set `isMounted = true`.
4. Return `null` if not mounted yet (server-safe).
5. Moved fade-out delay to second `useEffect` that only runs when `isVisible` changes.
6. Updated provider to always render `<ResumedOverlay />` (component manages its own visibility internally).

**Prevention:** Never read from `sessionStorage` / `localStorage` in `useState` initializer or at component top level. Always defer to `useEffect` to ensure client-only execution. Use `isMounted` state to suppress rendering until hydration-safe state is achieved.

**Related Files:** `src/components/ui/account-transition-overlay.tsx`

---

## [BUG-2026-05-13] Script tag rendered inside React component

**Severity:** Medium | **Affected:** `src/components/providers/brand-script.tsx`

**Cause:** The `BrandScript` component rendered a native `<script>` tag with `dangerouslySetInnerHTML`. While the component itself is a server component, if ever wrapped in a "use client" parent or rendered in a client context, React throws a warning: "Encountered a script tag while rendering React component."

**Effect:** Browser warning in console. The script still executes (Next.js handles it), but the warning indicates improper pattern usage.

**Solution:** Replaced native `<script>` tag with `<Script>` from `next/script` and set `strategy="beforeInteractive"` to ensure it runs before React hydration starts, matching the original behavior of synchronous script execution in the `<head>`.

**Prevention:** Use Next.js `<Script>` component from `next/script` instead of native `<script>` tags in React components. Strategies: `"beforeInteractive"` for blocking head scripts, `"afterInteractive"` for deferred execution, `"lazyOnload"` for background scripts.

**Related Files:** `src/components/providers/brand-script.tsx`

---

## [BUG-2026-05-13] Image aspect ratio warnings for Axion wordmark and mark

**Severity:** Low | **Affected:** `src/components/ui/account-transition-overlay.tsx`, `src/components/layout/sidebar.tsx`, `src/components/auth/register-form.tsx`, `src/components/auth/login-form.tsx`, `src/components/auth/forgot-password-form.tsx`, `src/components/auth/verify-email-form.tsx`, `src/components/layout/app-shell.tsx`

**Cause:** Images with `height={N}` (explicit height) and `w-auto` (width auto) in className but no explicit height style. Next.js Image component warning: "Image has either width or height modified, but not the other. If you use CSS to change the size of your image, also include styles 'width: "auto"' or 'height: "auto"' to maintain the aspect ratio."

**Effect:** Browser warning in console for images: `/axion-mark-white.png` and `/axion-wordmark-white.png`. No functional impact, but indicates improper image sizing pattern.

**Solution:** Added `style={{ height: "auto" }}` inline style to all `<Image>` components using these assets. This tells the browser to compute height from width while maintaining intrinsic aspect ratio (since Tailwind's `h-8`, `h-7`, `h-14` set fixed heights). Total 8 Image components updated across 7 files.

**Prevention:** When using Next.js `<Image>` with CSS-driven sizing (e.g., Tailwind `h-X w-auto`), always add inline `style={{ height: "auto" }}` or `style={{ width: "auto" }}` to match the missing dimension. This prevents aspect ratio distortion warnings and browser warnings about inconsistent sizing.

**Related Files:** `src/components/layout/sidebar.tsx`, `src/components/auth/register-form.tsx`, `src/components/auth/login-form.tsx`, `src/components/auth/forgot-password-form.tsx`, `src/components/auth/verify-email-form.tsx`, `src/components/layout/app-shell.tsx`

---

> **[FIX-2026-05-13]** `Severity: Low` — `src/components/reports/reports-content.tsx`, `src/components/reports/withdrawal-calculator.tsx`, `messages/pt-BR.json`, `messages/en.json`
> **Report:** /reports Annual Report section displayed English hardcoded strings: "Annual Report — 2026", "Weekly Meta vs Real", "Annual Rollup", "Log Withdrawal", and withdrawal message text.
> **Fix:** Replaced all hardcoded strings with `t()` i18n calls. Added 10 new translation keys to both locales: `annualReportTitle`, `weeklyMetaTitle`, `annualRollupTitle`, `withdrawalLoggedSuccess`, `withdrawalMessage`, `withdrawalAmountLabel`, `withdrawalDateLabel`, `withdrawalLog`, `withdrawalLogging`. All text now localized and translatable.

---

> **[FIX-2026-05-13]** `Severity: Low` — `src/components/journal/trade-form.tsx`
> **Report:** React warning on `/journal/new` when filling Preço de Entrada and Preço de Saída fields: "Warning: A component is changing an uncontrolled input of type 'text' to be controlled."
> **Fix:** Input fields were initialized with `value={undefined}` from spread `{...field}` where field was initially empty. Added explicit `value={field.value ?? ""}` to ensure inputs start as controlled components with defined state.

---

> **[FIX-2026-05-13]** `Severity: Low` — `messages/pt-BR.json`, `messages/en.json`
> **Report:** Smoke test: 3 IntlError missing i18n keys — `plan.common.actions`, `backtest.dezk.name`, `backtest.builder.allocationUsed`, `backtest.builder.allocationOver`.
> **Fix:** Added missing keys to both Portuguese and English messages. (1) `plan.common.actions: "Ações" / "Actions"` — yearly plan table header. (2) `backtest.dezk.name: "10K — Alinhamento MACD WMA" / "10K — MACD WMA Alignment"` — strategy selector. (3) `backtest.builder.allocationUsed/Over/Exact/Remaining` — allocation tracker display. All keys now present in both locales.

---

> **[FIX-2026-04-21]** `Severity: Low` — `src/__tests__/lib/error-utils.test.ts`
> 9 failing: `getUserMessage()` expected `"An unexpected error occurred"` but fn returns i18n key `"common.unexpectedError"`. Fix: updated 9 `expect().toBe()` assertions to match actual return. Source unchanged.

---

> **[FIX-2026-02-13]** `Severity: Medium` — `trade-form.tsx`, `scaled-trade-form.tsx`, `journal/new/page.tsx`
> Trade form used `new Date()` for default dates instead of account's effective date. Fix: fetch `getCurrentAccount()` in new trade page, compute `getEffectiveDate(account)`, thread as `defaultDate` prop through `NewTradeTabs` → `TradeForm`/`ScaledTradeForm`. Updated `max` on date inputs to use effective date.

---

> **[FIX-2026-02-15]** `Severity: Low` — `scaled-trade-form.tsx`
> Exit table headers misaligned vs entry headers. Exits used `grid-cols-[1fr_80px_90px_90px_100px_40px]` (fixed px); entries used `grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr]` (fractional). Fix: exits header → `grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr]`.

---

> **[FIX-2026-02-15]** `Severity: Low` — `inline-execution-row.tsx`
> Commission currency prefix "BRL" at `left-2` (8px) overlapped input with `pl-5` (20px) padding. Fix: `pl-5` → `pl-10` (40px). Added `pointer-events-none` to currency prefix span.

---

> **[FIX-2026-03-07]** `Severity: Medium` — `risk-params-form.tsx`
> Cursor jumped to end of `,00` on any input in "Saldo da Conta" field — controlled input reformatting each keystroke. Fix: replaced `Field` with `CurrencyField` that maintains local string state while focused, formats only on blur.

---

> **[FIX-2026-03-18]** `Severity: Medium` — `weekly-report-card.tsx`, `monthly-report-card.tsx`, `mistake-cost-card.tsx`
> Monetary values showing raw numbers (`+428.34`) instead of formatted currency (`R$ 428,34`). Fix: replaced `.toFixed(2)` on monetary values with `formatCurrencyWithSign()` / `formatCurrency()` from `useFormatting` hook. Non-monetary `.toFixed()` (win rate, R-multiples) unchanged.

---

> **[FIX-2026-03-19]** `Severity: Low` — `live-trading-status-panel.tsx`
> Raw i18n key `riskSimulation.reasons.t1BaseRisk` displayed as text. Fix: imported `translateRiskReason` from `@/lib/risk-reason-i18n`; added `tRisk = useTranslations("riskSimulation")`; applied `translateRiskReason(tRisk, status.riskReason)` in both stop/active branches.

---

> **[FIX-2026-03-19]** `Severity: Low` — `circuit-breaker-panel.tsx`
> Shows `$` prefix instead of `R$` for all monetary values. Fix: removed local `formatCurrency(value, currency = "$")` fn and `currency` prop; replaced with `useFormatting` hook's locale-aware `formatCurrency`.

---

## [BUG-2026-03-23] Analytics page crashes on date filter click

**Severity:** High | **Affected:** `src/components/analytics/analytics-content.tsx`

**Cause:** React state `const [performance, setPerformance] = useState(...)` shadowed `window.performance` Web API. Inside filter-change `useEffect`, `performance.now()` resolved to React state array → `TypeError: performance.now is not a function`. Error propagated to `src/app/error.tsx` which called `useTranslations()` outside `NextIntlClientProvider` → double crash masking root cause.

**Effect:** Clicking any date filter preset crashed entire analytics page with no recovery.

**Fix:**

1. Renamed state variable `performance` → `performanceData`.
2. `performance.now()` → `globalThis.performance.now()` for explicit Web API reference.

**Prevention:** Avoid naming state variables after global browser APIs (`performance`, `location`, `history`, `navigator`, `screen`). Use `globalThis.performance` when accessing Web Performance API in components with possible name collisions.

**Related:** `src/components/analytics/analytics-content.tsx`, `src/app/error.tsx`

---

> **[FIX-2026-03-23]** `Severity: Medium` — `analytics-content.tsx`, `src/lib/cache/analytics-cache.ts`
> Analytics cache reset on every page navigation. Fix: replaced `useRef(new Map())` in-component cache with module-level singleton (`analytics-cache.ts`) with 5-min TTL auto-expiry. Cache cleared when SSR delivers fresh `initialDashboard` (via `revalidatePath` after trade/tag/strategy mutations). Flow: mutation → `invalidateTradeData()` → `revalidatePath("/analytics")` → next SSR fresh → reset effect → `clearAnalyticsCache()`.

---

> **[FIX-2026-04-21]** `Severity: Low` — `src/__tests__/lib/validations/auth-schemas.test.ts`
> Test "should reject code shorter than 6 digits" failing — regex `/6/i` expected digit `6` in error message, but schema uses i18n key `"validation.auth.codeLength"`. Fix: regex `/6/i` → `/codelength/i`.

---

> **[FIX-2026-04-21]** `Severity: Low` — `src/__tests__/lib/risk-simulation.test.ts`
> 6 tests failing — `riskReason` assertions used human-readable strings but engine emits i18n keys (`"riskSimulation.reasons.baseRisk"`, etc.). Fix: updated 6 `toContain()` assertions to match i18n key prefixes. Source unchanged.

---

## [BUG-2026-04-27] Playwright sidebar navigation tests fail — link clicks don't update URL

**Severity:** High | **Affected:** `e2e/tests/navigation.spec.ts`

**Cause (3 compounding issues):**

1. **`"use server"` violation:** `src/app/actions/filter-presets.ts` exported Zod schema object alongside async server actions → Next.js disallows non-async-function exports → any route importing it triggered RSC render error.
2. **Playwright hydration timing:** `page.goto(url, { waitUntil: "load" })` fires before React hydration completes. App Router `<Link>` requires React hydrated before `onClick` intercepts → click fell through to native `<a>` or ignored → URL never updated.
3. **`spawn EBADF` in dev server:** `DevServer.getStaticPathsWorker` fails in environments with closed file descriptors → RSC navigation requests return HTTP 500.

**Effect:** 5–8 sidebar navigation tests fail consistently. `toHaveURL(/journal/)` times out. URL stays at source page.

**Fix:**

1. Created `src/lib/filter-preset-schema.ts` (plain module, no directive) with Zod schema; removed from `filter-presets.ts`; updated consumers.
2. Added `await page.waitForLoadState("networkidle")` after each `page.goto()` in 7 sidebar tests.
3. Added `experimental.workerThreads: true` to `next.config.ts`.

**Prevention:** Never export non-async values from `"use server"` files. Shared schemas → plain modules. In Playwright for App Router: always `waitForLoadState("networkidle")` before clicking `<Link>`. Set `experimental.workerThreads: true` in automated/shell-less environments.

**Related:** `src/app/actions/filter-presets.ts`, `src/lib/filter-preset-schema.ts` (created), `src/components/analytics/preset-selector.tsx`, `src/components/analytics/filter-panel.tsx`, `e2e/tests/navigation.spec.ts`, `next.config.ts`

---

## [BUG-2026-05-14] DateRangePicker closes after first date click (react-day-picker v9 behavior change)

**Severity:** High | **Affected:** `src/components/ui/date-range-picker.tsx`

**Cause (2 compounding issues):**

1. **react-day-picker v9 changed first-click behavior:** In v8, clicking the first date in `mode="range"` called `onSelect` with `{ from: date, to: undefined }`. In v9 it calls `onSelect` with `{ from: date, to: date }` — same date for both fields. The existing `handleSelect` check `range?.from && range?.to` was truthy on first click, immediately triggering `setOpen(false)`.

2. **`onInteractOutside` ref race (pre-existing):** The original guard in `handleOpenChange` read `isSelectingRef.current` after Radix had already fired the close. The ref was cleared in `onInteractOutside` before `onOpenChange(false)` ran, so the guard always saw `false`. Fix: call `e.preventDefault()` inside `onInteractOutside` to cancel the Radix DismissableLayer dismissal inline, before the close propagates.

**Effect:** Clicking any date in the DateRangePicker immediately closed the calendar popover. Users could not select a date range — only single-date selections were possible (from = to = clicked date). Affected backtest date range, and potentially any other DateRangePicker usage in the app.

**Fix:**

1. Changed the "selection complete" condition in `handleSelect` from `range?.from && range?.to` to check that `from` and `to` are actually different dates: `range.from.getTime() !== range.to.getTime()`. Same-date (first click) is now treated as mid-selection, keeping the picker open.
2. Changed `onInteractOutside` to call `e.preventDefault()` when `isSelectingRef.current` is true, which cancels the Radix DismissableLayer dismissal at the source rather than trying to intercept it in `onOpenChange` after the fact.

**Prevention:** When upgrading react-day-picker across major versions, test range selection UX end-to-end. The v8→v9 change in first-click `to` semantics is undocumented and easy to miss. Never guard popover-close behavior on the presence of `to` alone — always compare the actual date values.

**Related Files:** `src/components/ui/date-range-picker.tsx`

---

## [BUG-2026-05-21] Trade form silently drops Hawks payload when mode is deactivated

**Severity:** High | **Affected:** `src/components/journal/trade-form.tsx`, `src/app/actions/trades.ts`, `src/app/actions/trades.types.ts`

**Cause:**

When editing a trade that was originally saved with Hawks mode active (so `trade_hawks_metadata` row exists), the form's `buildTradeFormValues()` function did not extract the Hawks payload from the loaded trade. The defaultValues logic only added Hawks when `hawksModeActive` was true.

Flow:

1. User creates trade with Hawks mode ON → `hawks: { tripleScreenConfirmed: true, vwapRespected: true, ajusteRespected: true }` stored in `trade_hawks_metadata`.
2. User deactivates Hawks mode in settings.
3. User reloads the draft to edit it.
4. Trade loads via `getTrade(id)` which fetched `trades` but **not** `tradeHawksMetadata` relation.
5. Form calls `buildTradeFormValues(trade)` — trade has no hawks field, so Hawks data is omitted from defaultValues.
6. Since `hawksModeActive = false`, the defaultValues logic doesn't add an empty hawks object either.
7. Form submits without hawks field → `createTrade` / `updateTrade` receives no hawks payload → Hawks metadata is lost on save.

**Effect:** Silent data loss. The trade's Hawks pre-flight confirmations (`tripleScreenConfirmed`, `vwapRespected`, `ajusteRespected`) were permanently dropped when the user deactivated Hawks mode, with no warning to the user.

**Solution:**

1. **Updated `getTrade` action** to fetch `hawksMetadata` relation alongside existing relations.
2. **Updated `TradeWithRelations` type** to include optional `hawksMetadata` field.
3. **Updated `buildTradeFormValues` helper** to extract Hawks data from `trade.hawksMetadata` and include it in the returned form values.
4. **Updated trade form type** to include Hawks metadata in the `TradeWithTags` type definition.

The fix preserves Hawks payload across all scenarios: edit mode (loaded trade always includes hawks if present), new trade with Hawks active (form includes empty hawks object), and mode deactivation (form now preserves hawks from loaded trade regardless of current mode status).

**Prevention:**

- When loading relational data for editing, always fetch **all** relations that may be needed in the form, even if the current mode/setting would hide them. Relations should be loaded comprehensively, not conditionally based on feature flags.
- For optional payload fields, extract them in the `buildFormValues` function **once** (for edit mode) so the data flows through the form's normal state management. Don't rely on defaultValues logic to re-create them, as that doesn't account for loaded data.

**Related Files:**

- `src/app/actions/trades.ts` (getTrade query)
- `src/app/actions/trades.types.ts` (TradeWithRelations type)
- `src/components/journal/trade-form.tsx` (buildTradeFormValues, TradeWithTags type)
- `src/__tests__/components/trade-form-hawks-preservation.test.ts` (new test)

---

## [BUG-2026-05-21] Invalid currency code "R$" passed to Intl.NumberFormat in 43 call sites

**Severity:** Critical | **Affected:** 43 files across Analytics, Reports, and other feature modules

**Cause:** The `formatCompactCurrency` and `formatCompactCurrencyWithSign` functions accept a `currency` parameter that is passed directly to `Intl.NumberFormat`. The ISO 4217 standard requires currency codes like `"BRL"` (Brazilian Real), not display symbols like `"R$"`.

Every call site in the codebase was passing the display symbol `"R$"` instead of the currency code `"BRL"`:

- `formatCompactCurrency(value, "R$")` → throws `RangeError: Invalid currency code : R$`
- `formatCompactCurrencyWithSign(value, "R$")` → throws same error

The error occurred at runtime in:

- Analytics dashboard (variable-comparison.tsx, day-of-week-chart.tsx, session-performance-chart.tsx, etc.)
- Reports section (weekly-meta-chart.tsx)
- Equity Shield (equity-shield-chart.tsx)
- Monte Carlo simulator (daily-pnl-chart.tsx, v2-metrics-cards.tsx)
- Account Comparison (comparison-equity-chart.tsx)

**Effect:** `RangeError` caught by ErrorBoundaryHandler at component level, rendering full-page error screens. Users could not view Analytics or Reports sections. Browser console: `RangeError: Invalid currency code : R$`.

**Solution:** Replaced all 43 occurrences of `"R$"` with `"BRL"` across the entire codebase:

- Used `sed` to globally replace `"R\$"` → `"BRL"` in all `.ts` and `.tsx` files under `src/`
- Verified no remaining `"R$"` strings in formatCompact calls (grep returned 0 results)
- Verified 49 total uses of `"BRL"` (43 fixed + 6 that were already correct)
- `pnpm exec tsc --noEmit` passed with no type errors

Fixed files (43 total):

- `src/components/equity-shield/equity-shield-chart.tsx` (6 occurrences)
- `src/components/equity-shield/equity-shield-stats.tsx` (1)
- `src/components/equity-shield/mc-calibration-banner.tsx` (1)
- `src/components/account-comparison/comparison-equity-chart.tsx` (2)
- `src/components/monte-carlo/v2/risk-profile-selector.tsx` (1)
- `src/components/monte-carlo/v2/v2-metrics-cards.tsx` (3)
- `src/components/monte-carlo/v2/daily-pnl-chart.tsx` (2)
- `src/components/analytics/day-of-week-chart.tsx` (3)
- `src/components/analytics/r-distribution.tsx` (1)
- `src/components/analytics/session-performance-chart.tsx` (3)
- `src/components/analytics/tag-cloud.tsx` (4)
- `src/components/analytics/hourly-performance-chart.tsx` (3)
- `src/components/analytics/expected-value.tsx` (5)
- `src/components/analytics/cumulative-pnl-chart.tsx` (2)
- `src/components/analytics/variable-comparison.tsx` (3)
- `src/components/reports/weekly-meta-chart.tsx` (2)

**Prevention:**

1. **Type safety for currency codes:** The `formatCompactCurrency` function signature should enforce `currency: "BRL"` as a literal type or accept a strict enum, not a free string. This would have caught the error at compile time.
2. **Linting rule:** Add an ESLint rule to forbid passing `"R$"` to `formatCompact*` functions, with auto-fix to replace with `"BRL"`.
3. **Code review checklist:** Currency formatting calls are a common mistake point when supporting multiple locales. Flag during review if a currency code is unfamiliar (e.g., "R$" looks like a symbol, not a code).

**Related Files:**

- `src/lib/formatting.ts` (function definitions — no changes needed, they are correct)
- 43 files listed above (call sites fixed)

---

## [BUG-2026-05-22] React 19 + Radix ScrollArea crash in navigation (sidebar, app-shell, new-trade-tabs)

**Date:** 2026-05-22 | **Severity:** High | **Affected Area:** `src/components/layout/sidebar.tsx`, `src/components/layout/app-shell.tsx`, `src/components/journal/new-trade-tabs.tsx`

### Cause

`@radix-ui/react-scroll-area` v1.2.10 uses `useComposedRefs` internally. `useComposedRefs` calls `setState` during React 19's `disappearLayoutEffects` phase — the internal teardown step that runs on unmount and on Suspense "disappear" (when a component is temporarily removed from the tree while streaming). React 19 added a stricter invariant: `setState` is illegal during this phase. The result is an unhandled "Maximum update depth exceeded" error that propagates up to the nearest error boundary.

Three independent crash paths existed:

1. **Mobile sidebar in Sheet**: `Sidebar` renders `<ScrollArea>` for its nav section. On mobile, `Sidebar` lives inside a Radix `Sheet`. Opening/closing the sheet unmounts/remounts the sidebar → crash.
2. **Desktop sidebar during RSC route transition**: Next.js App Router streams RSC responses through a Suspense boundary that wraps the entire layout. During route transitions the layout participates in a brief "disappear" cycle → `disappearLayoutEffects` fires on the sidebar's `ScrollArea` → crash.
3. **New-trade tab panels (CSV / Nota / Screenshot)**: All three panels were eagerly mounted (CSS `hidden` class) so their `ScrollArea` refs were live even when invisible. Navigating to `/journal/new` triggered the same crash pattern.

The error boundary caught all three and left "Something went wrong!" on the page. Because navigation tests share browser context across test cases within the same Playwright project, the first crash poisoned subsequent tests in `chromium-navigation` and `mobile-navigation`.

### Effect

E2E failures:

- `[chromium-navigation] Navigation › Sidebar Navigation › should navigate to Reports` (1.5m timeout — error boundary rendered instead of Reports page)
- `[mobile-navigation] Navigation › User Menu › should display user avatar/initials` (error boundary from prior Sheet cycle)
- `[mobile-navigation] Navigation › Breadcrumbs / Back Navigation › should show cancel button on sub-pages` (same)

### Solution

1. **`sidebar.tsx`**: Replaced `<ScrollArea className="flex-1">` wrapping the `<nav>` with `<div className="flex-1 overflow-y-auto">`. Removed `ScrollArea` import.
2. **`app-shell.tsx`**: Replaced `<ScrollArea className="h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-3rem)]">` wrapping `<main>` with an equivalent `<div>`. Removed `ScrollArea` import.
3. **`new-trade-tabs.tsx`**: Changed CSV, Nota, and Screenshot tab panels from CSS `hidden` toggling (eager mount) to conditional rendering (`activeTab === "csv"`, etc.). The `ScrollArea` inside `CsvImport` / `DetailedTradeImporter` is now only mounted when its tab is active.

### Prevention

- **Never use `<ScrollArea>` in a component that can unmount** (modal, sheet, dialog, lazy tab). Use `<div className="overflow-y-auto">` instead. The only safe context is a permanently-mounted, never-Suspense-wrapped surface.
- **Known risky survivors** (not yet failing in E2E but carry the same risk): `dashboard/day-detail-modal.tsx:105`, `monte-carlo/stats-preview.tsx:118`. Tracked in `docs/backlog.md`.
- **Eager tab panel mounting is a hidden mount risk.** Prefer conditional rendering (`activeTab === X`) over CSS-hiding for panels that contain complex components with ref callbacks.

### Related Files

- `src/components/layout/sidebar.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/journal/new-trade-tabs.tsx`

---

## [BUG-2026-05-22] Journey-07 E2E spec navigating to non-existent `/en/analytics/account-comparison` route

**Date:** 2026-05-22 | **Severity:** Low (test-only) | **Affected Area:** `e2e/journey/07-quarter-year.spec.ts`

### Cause

Stage 7 step 7d navigated to `/en/analytics/account-comparison` and asserted `#comparison-selector`. Neither the route nor the selector exist:

- The analytics pages are all under `/en/analytics` (one route). There is no sub-route for account comparison.
- `#comparison-selector` is gated behind `isPremium && accounts.length >= 2`. Bravo's seed account is a single account, so the selector never renders.

### Effect

`[chromium-journey] Journey Stage 7 — Quarter + Year` failed with a 404 page or timeout on `#comparison-selector`.

### Solution

Changed step 7d to navigate to `/en/analytics` and assert `#analytics-anchor-equity` (the "Cumulative P&L" heading anchor, always rendered regardless of account count or premium status).

### Prevention

- **Route assertions must match the actual Next.js App Router file tree.** Before adding a `goto()` to a new URL in an E2E spec, verify the route exists in `src/app/`.
- **Feature-gated selectors need a fallback assertion.** When the feature (account comparison) requires conditions Bravo's seed data doesn't satisfy, assert the surrounding page load instead of the gated element.

### Related Files

- `e2e/journey/07-quarter-year.spec.ts`

---

## 2026-05-29 — ParameterHeatmap crashes after inline-Hawks sweep

### Symptom

After running an inline-Hawks sweep that varied an addon sub-path (e.g. `stop.breakeven.triggerPct`), the Results step crashed:

```
TypeError: Cannot read properties of undefined (reading 'triggerPct')
  at getNestedValue (parameter-grid.ts:142)
  at getVaryingParams (heatmap-utils.ts:151)
  at ParameterHeatmap.useMemo[varyingParams] (parameter-heatmap.tsx:139)
```

Caught by `ErrorBoundaryHandler`, but the heatmap tab was empty.

### Root cause

`getNestedValue` was written when every recipe path was guaranteed populated — it cast each intermediate segment to a `Record<string, unknown>` without a null check. The new inline-Hawks sweep produces recipes where addon sub-trees are intentionally `undefined` (e.g. `stop.breakeven === undefined` in combos where BE is disabled). Reading the next key off `undefined` crashed.

Contract mismatch: `recipeFromCombo` produces "addon-as-undefined" representations, but `parameter-grid.ts` pre-dated that representation.

### Effect

Heatmap tab unusable any time the sweep varied a parameter inside an optional addon (breakeven, trailing, reversal — anything that can be `undefined` on the recipe).

### Solution

1. `getNestedValue` now walks each segment with a null/object guard and returns `NaN` when any intermediate is missing or the final value isn't numeric.
2. `heatmap-utils.getVaryingParams` filters NaN out of the values-set — a parameter that's _present-vs-absent_ across runs isn't a numeric sweep axis.
3. `buildHeatmapData` grouping loop skips runs where either axis path is `NaN` so structurally-different runs don't anchor a cell.

### Prevention

- **Defensive reads at integration seams.** When two modules use slightly different shape assumptions, the read-side must tolerate the union of both shapes.
- **NaN as the "missing" signal for numeric paths.** Sets dedupe NaN to one entry, and `Number.isFinite()` is the right downstream check — cleaner than `number | undefined` since it avoids a return-type ripple through every caller.

### Related Files

- `src/lib/optimize/parameter-grid.ts` (`getNestedValue`)
- `src/lib/optimize/heatmap-utils.ts` (`getVaryingParams`, `buildHeatmapData`)

---

## [BUG-2026-06-01] Optimize runs store crashes on payload size: localStorage quota exceeded

**Date:** 2026-06-01
**Severity:** Critical (silent data loss; users unaware runs no longer persist on page reload)
**Affected Area:** `src/lib/optimize/storage.ts:156` (`saveRuns`), `src/components/optimize/optimize-content.tsx:244–259` (hydration + save side effects)

### Symptom

On `/backtest/optimize` after running 2020→2026 backtests with hundreds of optimization sweeps, the browser console logs warnings (swallowed by try/catch):

```
Failed to persist optimization runs to localStorage
QuotaExceededError: Failed to execute 'setItem' on 'Storage': Setting the property exceeded the quota.
```

OR

```
Failed to persist optimization runs to localStorage
RangeError: Invalid string length
```

The UI continues running without visible error — the in-memory `runs` array grows, but new attempts to save also fail (payload never shrinks). On page reload, all runs vanish. Users lose optimization history silently.

### Root Cause

localStorage has a per-origin quota of ~5–10 MB (browser-dependent). The optimize runs store applies a Pareto retention policy (keep full trades for frontier runs only), but:

- Frontier runs monotonically accumulate because the user is optimizing 2020–2026 multi-year backtests.
- Each frontier run carries thousands of trades (`trades[]` array).
- The recipe + config metadata is kept for every run.

Over a long optimize session, `JSON.stringify(retained)` produces a payload that:

1. Exceeds localStorage quota → `QuotaExceededError` on `setItem`.
2. OR hits V8's internal ~512 MB string-length cap → `RangeError: Invalid string length`.

The try/catch at `storage.ts:158` swallows both errors and only `console.warn`s. No UI indication → users don't realize persistence is broken.

### Why It Surfaced

The Phase 1 trust-foundations feature added multi-year backtests (2020–2026) as a testing pattern. With 7 years × 50+ weekly runs × 10–20 frontier runs per session, the payload easily exceeds ~500 KB and approaches the ~5 MB localStorage cap.

### Fix

**Migrate from localStorage to IndexedDB.**

IndexedDB:

- Supports gigabytes of headroom (vs ~5 MB localStorage quota).
- Stores structured-clonable objects directly (no `JSON.stringify` string cap).
- Eliminates both error modes structurally.

Implementation:

- `loadRuns()` now async (`Promise<OptimizationRun[]>`).
- One-shot migration: on first load, if IndexedDB is empty but localStorage has legacy data, read from localStorage, apply the migration chain (v3 → v4 → v5 → v6), write to IndexedDB, clear localStorage keys.
- `saveRuns()` and `clearRuns()` async; write directly to IDB object store.
- Updated call sites in `optimize-content.tsx` to handle async via `void ... then()` pattern in useEffect.
- Tests updated to use `fake-indexeddb`; pure `migrateRun()` function remains independently testable.
- Pareto retention policy preserved — no behavioral change to what's saved.

### Verification

- `pnpm test src/__tests__/lib/optimize/storage-migration.test.ts` — 13 tests pass (all migration chains: v3 → current, v4 → current, v5 → current, idempotency).
- Dev server on `/backtest/optimize` — page loads, IndexedDB `axion:optimize` database confirmed initialized, legacy localStorage keys absent, zero console errors/warnings related to storage.
- Commit: `f208c330`

### Prevention

- **Cap payload size where the storage layer can't expand.** localStorage is ~5 MB hard limit; IndexedDB is gigabytes. Know your quota and choose the right store.
- **Silent try/catch failures are data-loss bugs.** Errors that swallow data without user visibility should escalate (e.g. toast notification) or at minimum log visibly in the UI.
- **Test large-payload persistence.** Regression tests should cover realistic session sizes (2-3 weeks of optimization runs, not just 1–5 test fixtures).

### Related Files

- `src/lib/optimize/storage.ts` (primary migration + new IndexedDB store)
- `src/components/optimize/optimize-content.tsx` (updated useEffect hooks for async load/save)
- `src/__tests__/lib/optimize/storage-migration.test.ts` (migration chain tests with fake-indexeddb)
- `src/lib/optimize/pareto-retain.ts` (retention policy — unchanged behavior)
