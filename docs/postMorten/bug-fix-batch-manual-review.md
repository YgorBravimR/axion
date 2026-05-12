# Bug Fix Batch — Manual Review (2026-03-20)

11 bugs fixed during manual console/UI review session.

---

## [BUG-2026-03-20] LoadingOverlay setState During Render

**Severity:** Medium | **Affected:** `src/components/journal/csv-import.tsx`

**Cause:** `showLoading()` called synchronously inside state update chain in `processFile` → context state update on parent during React batch → "Cannot update a component while rendering a different component" warning.

**Fix:** Wrapped `showLoading` call with `queueMicrotask()` to defer to next microtask (executes before next paint, breaking sync render chain).

**Prevention:** When calling context-provided setters inside fns that also call local `setState`, defer context call with `queueMicrotask()`. For multi-component updates in same flow: shared reducer or `useTransition`.

---

## [BUG-2026-03-20] Recharts ResponsiveContainer width(-1)/height(-1) Warnings

**Severity:** Medium | **Affected:** `src/components/ui/chart-container.tsx`

**Cause:** `ResponsiveContainer` initializes with `{ width: -1, height: -1 }` defaults. `useEffect(() => setMounted(true))` guard insufficient — `ResponsiveContainer` always uses `-1` defaults on first render regardless of parent mount state.

**Fix:** Replaced mount-boolean with custom `ResizeObserver` measuring container `div` first. Measured dimensions passed via `initialDimension` prop → first render cycle has valid values.

**Prevention:** Wrapping third-party components with internal sizing — provide actual measured dimensions, not just mount guard. Check API for `initialDimension`-style props.

---

## [BUG-2026-03-20] Missing i18n Key for DD Tier Risk Reason

**Severity:** High | **Affected:** `src/lib/risk-simulation-advanced.ts`, `src/lib/risk-reason-i18n.ts`, `messages/en.json`, `messages/pt-BR.json`

**Cause:** Engine concatenated raw English text to i18n key: `"riskSimulation.reasons.t1BaseRisk (DD tier: -50%)"` → invalid key, translation system can't resolve.

**Fix:** Changed to pipe-separated structured params (`|ddTier:50`). Updated `risk-reason-i18n.ts` to parse params and compose suffix using `reasons.ddTierSuffix` key. Added key to both `en.json` and `pt-BR.json`.

**Prevention:** NEVER concatenate raw text to i18n key strings. Use structured parameters (pipe-delimited, interpolation vars). Create dedicated translation key for any context appended to translated string.

---

## [BUG-2026-03-20] Strategy Creation Shows Generic Error for Duplicate Code

**Severity:** High | **Affected:** `src/app/actions/strategies.ts`

**Cause:** Neon serverless driver wraps PostgreSQL errors in generic `Error`. Real `NeonDbError` (code `23505`) in `error.cause`, not `error.message`. Code checked only `error.message.includes("unique")` → missed wrapped error.

**Fix:** Created `isUniqueViolation()` helper checking both `error.message` and `error.cause` (incl. `.cause.message` and `.cause.code`) for `23505`.

**Prevention:** Detecting specific PostgreSQL error codes through Neon: always check `error.cause`. Use numeric code `23505` as primary (more reliable than string match on "unique"). Consider shared `pgErrorCode()` utility.

---

## [BUG-2026-03-20] Strategy Form Error Banner Instead of Toast

**Severity:** Medium | **Affected:** `src/app/[locale]/(app)/playbook/new/page.tsx`, `.../playbook/[id]/edit/page.tsx`

**Cause:** Playbook form used `error` state string rendered as static red `<div>` — inconsistent with rest of app (toast notifications).

**Fix:** Replaced `error` state with `fieldErrors` record. `showToast("error", message)` for notification. Added `aria-invalid` + `ref` to code input for visual highlight + auto-focus on duplicate error. Error clears on next keystroke.

**Prevention:** Server action errors → toast, not inline banners. Field-specific error → highlight field with `aria-invalid` + auto-focus. `Input` supports `aria-[invalid=true]:border-fb-error` out of box.

---

## [BUG-2026-03-20] Lightbulb Icon Rendered as "bulb" Text

**Severity:** Medium | **Affected:** `src/components/monte-carlo/strategy-analysis.tsx`

**Cause:** `Insight` component had `type === "tip" ? <span>bulb</span>` remnant placeholder (stripped emoji). Bypassed `insightConfig` map which already had icons for all types.

**Fix:** Removed conditional branch — all types route through `insightConfig`. Replaced `Lightbulb` with `Zap` (project convention: `Lightbulb` reserved for page-guide triggers).

**Prevention:** Never hardcode text as icon placeholder — use actual icon component or `TODO` comment. `Lightbulb` = page-guide only; `Zap` = tips/insights.

---

> **[FIX-2026-03-20]** `Severity: Low` — Multiple dialogs/sheets
> Radix UI warning about missing `DialogDescription`. Fix: add `aria-describedby={undefined}` to all `DialogContent`/`SheetContent` that intentionally omit description.

---

> **[FIX-2026-03-20]** `Severity: Low` — `filter-panel.tsx`, `decision-trace-modal.tsx`
> Sheet panels had content touching edges. Fix: added `px-m-400 pt-m-400 pb-m-500` to `SheetContent`. Note: `SheetContent` has no default padding (unlike `DialogContent` which has `p-4 sm:p-6`).

---

> **[FIX-2026-03-20]** `Severity: Low` — `src/components/settings/user-list.tsx`
> Missing `key` prop warning in user list. Fix: `<>...</>` → `<Fragment key={user.id}>` with named import. When `.map()` returns multiple elements in Fragment, must use `<Fragment key={...}>` — shorthand `<>` doesn't accept props.

---

> **[FIX-2026-03-20]** `Severity: Low` — `sidebar.tsx`, `app-shell.tsx`
> Next.js warning: image aspect ratio modified by CSS. Fix: added `style={{ width: "auto", height: "auto" }}` to both `Image` components. Required when using Next.js `Image` with CSS dimension overrides (`w-auto`, `h-10`, etc.).

---

> **[FIX-2026-03-20]** `Severity: Low` — `src/components/ui/dialog.tsx`
> Dialogs felt cramped on 1440px+. Fix: `max-w-lg` → `max-w-lg lg:max-w-xl xl:max-w-2xl` (512→576→672px). Dialogs with custom `max-w-*` override unaffected.
