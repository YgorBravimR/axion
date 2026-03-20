# Bug Fix Batch — Manual Review (2026-03-20)

Post-mortem covering 11 bugs identified and fixed during a manual console/UI review session.

---

## [BUG-2026-03-20] LoadingOverlay setState During Render

**Date:** 2026-03-20
**Severity:** Medium
**Affected Area:** `src/components/journal/csv-import.tsx`

### Cause
`showLoading()` was called synchronously inside a state update chain in `processFile`. React batches multiple synchronous `setState` calls, and calling `showLoading` (which updates context state in a parent component) during that batch triggers a render-phase state update on a different component — the classic "Cannot update a component while rendering a different component" warning.

### Effect
React console warning on every CSV file upload. While not a crash, it signals an incorrect data flow that could lead to stale state or skipped renders under certain race conditions.

### Solution
Wrapped the `showLoading` call with `queueMicrotask()` to defer it to the next microtask. This breaks the synchronous render chain while still executing before the next paint, preserving the perceived immediacy of the loading overlay.

### Prevention
When calling context-provided state setters (like `showLoading`/`hideLoading`) inside functions that also call local `setState`, always defer the context call with `queueMicrotask()`. If multiple components need state updates in the same flow, prefer dispatching through a single shared reducer or using `useTransition`.

### Related Files
- `src/components/journal/csv-import.tsx`

---

## [BUG-2026-03-20] Recharts ResponsiveContainer width(-1)/height(-1) Warnings

**Date:** 2026-03-20
**Severity:** Medium
**Affected Area:** `src/components/ui/chart-container.tsx`

### Cause
`ResponsiveContainer` from Recharts initializes its internal state with `{ width: -1, height: -1 }` as defaults. On the first render cycle — before its internal `ResizeObserver` fires — it calls `calculateChartDimensions(-1, -1)` and emits the warning. A `useEffect(() => setMounted(true))` guard was insufficient because `ResponsiveContainer` always uses `-1` defaults on its first render regardless of whether the parent is mounted.

### Effect
Console warning "The width(-1) and height(-1) of chart should be greater than 0" on every page that renders a chart.

### Solution
Replaced the mount-boolean approach with a custom `ResizeObserver` that measures the container `div` first. The measured dimensions are passed via the `initialDimension` prop to `ResponsiveContainer`, so its first render cycle already has valid positive values and never falls back to `-1`.

### Prevention
When wrapping third-party components that have internal sizing logic, don't just guard with a mount boolean — provide the actual measured dimensions so the first render cycle has valid data. Check the component's API for props like `initialDimension` that exist specifically for this purpose.

### Related Files
- `src/components/ui/chart-container.tsx`

---

## [BUG-2026-03-20] Missing i18n Key for DD Tier Risk Reason

**Date:** 2026-03-20
**Severity:** High
**Affected Area:** `src/lib/risk-simulation-advanced.ts`, `src/lib/risk-reason-i18n.ts`, `messages/en.json`, `messages/pt-BR.json`

### Cause
The simulation engine concatenated raw English text ` (DD tier: -${tier.reducePercent}%)` directly to an i18n key string — e.g., `"riskSimulation.reasons.t1BaseRisk (DD tier: -50%)"`. This created an invalid key that the translation system could never resolve, since i18n keys must be exact matches, not concatenated strings.

### Effect
Risk simulation trace displayed raw broken text like `riskSimulation.reasons.t1BaseRisk (DD tier: -50%)` instead of a properly translated string. Affected both English and Portuguese locales.

### Solution
Changed the engine to append structured pipe-separated parameters (`|ddTier:50`) instead of raw text. Updated `risk-reason-i18n.ts` to parse the pipe-delimited params and compose the DD tier suffix using a proper i18n key `reasons.ddTierSuffix`. Added the new key to both `en.json` and `pt-BR.json`.

### Prevention
NEVER concatenate raw text to i18n key strings. Always use structured parameters (pipe-delimited, object params, interpolation variables) that the translation layer can parse and compose with proper translations. If context needs to be appended to a translated string, create a dedicated translation key for the suffix.

### Related Files
- `src/lib/risk-simulation-advanced.ts`
- `src/lib/risk-reason-i18n.ts`
- `messages/en.json`
- `messages/pt-BR.json`

---

## [BUG-2026-03-20] Strategy Creation Shows Generic Error for Duplicate Code

**Date:** 2026-03-20
**Severity:** High
**Affected Area:** `src/app/actions/strategies.ts`

### Cause
The Neon serverless driver wraps PostgreSQL errors in a generic `Error` object. The real `NeonDbError` — containing the `23505` unique constraint violation code — is stored in `error.cause`, not in `error.message`. The existing code only checked `error.message.includes("unique")` which missed the wrapped error entirely.

### Effect
Creating a strategy with a duplicate code showed the generic "Failed to create strategy" error instead of the specific "A strategy with this code already exists" message. Users had no way to know what was wrong.

### Solution
Created an `isUniqueViolation()` helper that checks both `error.message` and `error.cause` (including `.cause.message` and `.cause.code`) for the PostgreSQL `23505` unique constraint violation code.

### Prevention
When detecting specific PostgreSQL error codes through Neon's serverless driver, always check `error.cause` in addition to `error.message`. Use the numeric code `23505` as the primary check — it is more reliable than string matching on "unique". Consider creating a shared `pgErrorCode()` utility for all DB error detection.

### Related Files
- `src/app/actions/strategies.ts`

---

## [BUG-2026-03-20] Strategy Form Error Banner Instead of Toast

**Date:** 2026-03-20
**Severity:** Medium
**Affected Area:** `src/app/[locale]/(app)/playbook/new/page.tsx`, `src/app/[locale]/(app)/playbook/[id]/edit/page.tsx`

### Cause
The playbook form used a simple `error` state string rendered as a static red `<div>` banner at the top of the form. This pattern did not match the rest of the application which uses toast notifications for server action feedback, and it provided no field-level indication of which input was problematic.

### Effect
Duplicate strategy errors appeared as a static banner that the user could easily miss or not associate with the specific code field. Inconsistent UX compared to other forms in the app.

### Solution
Replaced the `error` state with a `fieldErrors` record. Used `showToast("error", message)` for the notification. Added `aria-invalid` + `ref` to the code input for visual highlighting and auto-focus on duplicate errors. Error clears on the next keystroke.

### Prevention
Use toast notifications for server action errors, not inline banners. When the error relates to a specific field, highlight that field with `aria-invalid` and auto-focus it. The Input component already supports `aria-[invalid=true]:border-fb-error` styling out of the box.

### Related Files
- `src/app/[locale]/(app)/playbook/new/page.tsx`
- `src/app/[locale]/(app)/playbook/[id]/edit/page.tsx`

---

## [BUG-2026-03-20] Lightbulb Icon Rendered as "bulb" Text

**Date:** 2026-03-20
**Severity:** Medium
**Affected Area:** `src/components/monte-carlo/strategy-analysis.tsx`

### Cause
Two issues compounded: (1) The `Insight` component had a conditional `type === "tip" ? <span>bulb</span>` that was a remnant placeholder — likely a stripped emoji that lost its character. This branch bypassed the `insightConfig` map which already had icons for all types. (2) The `Lightbulb` icon was used for tips/improvements, but project convention reserves `Lightbulb` for page-guide triggers only.

### Effect
Literal text "bulb" appeared in the Monte Carlo strategy analysis UI where an icon should have been.

### Solution
Removed the conditional branch so all insight types route through their `insightConfig` icon mapping. Replaced `Lightbulb` with `Zap` throughout the component to respect icon semantics.

### Prevention
(1) Never use hardcoded text as icon placeholders — use the actual icon component or leave a `TODO` comment with a lint marker. (2) Maintain icon semantics: `Lightbulb` is reserved for page-guide triggers; use `Zap` for tips/insights elsewhere.

### Related Files
- `src/components/monte-carlo/strategy-analysis.tsx`

---

> **[FIX-2026-03-20]** `Severity: Low` — **Affected:** `src/components/ui/command.tsx`, `src/components/analytics/filter-panel.tsx`, `src/components/risk-simulation/decision-trace-modal.tsx`, `src/components/analytics/day-detail-modal.tsx`, `src/components/journal/checklist-manager.tsx`, `src/components/monte-carlo/decision-tree-modal.tsx`
> **Report:** Radix UI console warning about missing `DialogDescription` on multiple dialogs/sheets.
> **Fix:** Added `aria-describedby={undefined}` to all `DialogContent` and `SheetContent` components that intentionally omit a description. When using Radix Dialog/Sheet without a description, always add `aria-describedby={undefined}` to suppress the warning.

---

> **[FIX-2026-03-20]** `Severity: Low` — **Affected:** `src/components/analytics/filter-panel.tsx`, `src/components/risk-simulation/decision-trace-modal.tsx`
> **Report:** Advanced Filters and Risk Simulator sheet panels had content touching the edges with no horizontal padding.
> **Fix:** Added `px-m-400 pt-m-400 pb-m-500` to affected `SheetContent` instances. `SheetContent` does not include padding by default (unlike `DialogContent` which has `p-4 sm:p-6`). Always explicitly add padding to `SheetContent`.

---

> **[FIX-2026-03-20]** `Severity: Low` — **Affected:** `src/components/settings/user-list.tsx`
> **Report:** React warning about missing `key` prop in user list.
> **Fix:** Changed shorthand `<>...</>` Fragment to `<Fragment key={user.id}>` with named import. When `.map()` returns multiple elements wrapped in a Fragment, always use `<Fragment key={...}>` — the shorthand `<>` does not accept props.

---

> **[FIX-2026-03-20]** `Severity: Low` — **Affected:** `src/components/layout/sidebar.tsx`, `src/components/layout/app-shell.tsx`
> **Report:** Next.js warning about image aspect ratio being modified by CSS.
> **Fix:** Added `style={{ width: "auto", height: "auto" }}` to both `Image` components. When using Next.js `Image` with CSS dimension overrides (`w-auto`, `h-10`, etc.), always pair with `style={{ width: "auto", height: "auto" }}` to suppress the optimization warning.

---

> **[FIX-2026-03-20]** `Severity: Low` — **Affected:** `src/components/ui/dialog.tsx`
> **Report:** Dialog modals felt cramped on 1440px+ screens due to fixed `max-w-lg` (512px).
> **Fix:** Added responsive breakpoints: `max-w-lg lg:max-w-xl xl:max-w-2xl` (512px -> 576px -> 672px). Dialogs that override with custom `max-w-*` classes are unaffected. Base UI components should always have responsive sizing.
