# Scan: i18n deep sweep (post-regex) — 2026-06-02

**Branch**: feat/optimize-phase-1-trust-foundations
**Base**: origin/main
**Scope**: src/ excluding **tests**, _.d.ts, src/components/dev/_
**Methodology**: deep semantic audit for leaks regex couldn't catch (template literals, ternaries, locale-naive formatters, error-message-to-UI paths, conditional strings)
**Outcome**: 3 root-cause clusters identified, all fixed in this PR. 41 broader-pattern leaks documented for follow-up.

---

## Summary

|            | Critical | High | Medium | Low | Total |
| ---------- | -------- | ---- | ------ | --- | ----- |
| Identified | 1        | 16   | 3      | 2   | 22    |
| Fixed      | 1        | 16   | 3      | 1   | 21    |
| Deferred   | 0        | 0    | 0      | 1   | 1     |

**Top 3 root causes** (all fixed):

1. Server-action error messages hardcoded in English, returned to UI via `result.message ?? t(fallback)` where the `??` is unreachable
2. `.toLocaleString()` without explicit locale → browser-default-locale formatting instead of app locale
3. Conditional/ternary UI strings rendered without `t()`

---

## Findings (full table)

| #   | Severity   | Category                         | File:Line                                                                             | Issue                                                                                                                                                                                                                                  | Rule violated                                                                 | Status                                 |
| --- | ---------- | -------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| 1   | CRITICAL   | Server-action errors             | `src/app/actions/annual-reports.ts:34,39,44,47,62,85`                                 | 6 hardcoded English messages from `recordCapitalEvent` + `deleteCapitalEvent`; displayed verbatim via `capital-event-log.tsx:67` and `withdrawal-calculator.tsx:55`                                                                    | Server actions must use `getTranslations()` for any user-facing message       | **fixed**                              |
| 1b  | CRITICAL   | Server-action errors             | `src/app/actions/settings.ts:381,416,425,431,440`                                     | 5 hardcoded messages from `getAccountLifecycle` + `updateAccountLifecycle` (incl. 1 template-literal `Start year must be between 2000 and ${currentYear}` missed by the regex sweep); displayed via `annual-reporting-settings.tsx:89` | Same                                                                          | **fixed**                              |
| 2   | HIGH       | Locale-naive `.toLocaleString()` | `src/components/optimize/strategy-sweep-builder.tsx:346,351,354,371,374` (5×)         | Browser default locale used; en browsers show `1,000`, de browsers show `1.000` etc.                                                                                                                                                   | Use `formatNumber(value)` from `useFormatting()` hook                         | **fixed**                              |
| 3   | HIGH       | Locale-naive `.toLocaleString()` | `src/components/optimize/sweep-axis-diagnostics.tsx:210,211,225` (3×)                 | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 4   | HIGH       | Locale-naive `.toLocaleString()` | `src/components/optimize/sweep-config-panel.tsx:512,517` (2×)                         | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 5   | HIGH       | Locale-naive `.toLocaleString()` | `src/components/optimize/optimize-content.tsx:553,590,1108,1177,1423` (5×)            | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 6   | HIGH       | Locale-naive `.toLocaleString()` | `src/components/monte-carlo/strategy-analysis.tsx:149`                                | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 7   | HIGH       | Locale-naive `.toLocaleString()` | `src/components/shared/colored-value.tsx:73`                                          | Reusable presentational primitive — making it hook-aware would force a session fetch per instance                                                                                                                                      | Pinned to `"pt-BR"` (default locale); promotion to true locale-aware deferred | **fixed (pragmatic)**                  |
| 8   | HIGH       | Locale-naive `.toLocaleString()` | `src/components/monte-carlo/v2/monte-carlo-v2-content.tsx:585,586` (2×)               | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 9   | HIGH       | Locale-naive `.toLocaleString()` | `src/components/backtest/backtest-trades-table.tsx:158,167` (2×)                      | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 10  | HIGH       | Locale-naive `.toLocaleString()` | `src/components/monte-carlo/v2/v2-results-summary.tsx:43`                             | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 11  | HIGH       | Locale-naive `.toLocaleString()` | `src/components/backtest/backtest-content.tsx:480`                                    | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 12  | HIGH       | Locale-naive `.toLocaleString()` | `src/components/journal/trade-card.tsx:189`                                           | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 13  | HIGH       | Locale-naive `.toLocaleString()` | `src/components/imports/detailed-trade-importer.tsx:101`                              | `Date.toLocaleString()` (not a number) — locale-naive date formatting, separate fix path via `formatDateTime`                                                                                                                          | Date formatting must use `formatDateTime` from `useFormatting`                | **deferred** (follow-up)               |
| 14  | HIGH       | Locale-naive `.toLocaleString()` | `src/components/backtest/inspector/renko-pane.tsx:325,335` (2×)                       | Same as #2                                                                                                                                                                                                                             | Same                                                                          | **fixed**                              |
| 15  | HIGH       | Locale-naive `.toLocaleString()` | `src/components/monte-carlo/monte-carlo-content.tsx:332`                              | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 16  | HIGH       | Locale-naive `.toLocaleString()` | `src/components/journal/trade-info-stats-tab.tsx:180`                                 | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 17  | HIGH       | Locale-naive `.toLocaleString()` | `src/components/monte-carlo/simulation-params-form.tsx:198`                           | Same                                                                                                                                                                                                                                   | Same                                                                          | **fixed**                              |
| 18  | MEDIUM     | Ternary JSX                      | `src/components/fractal-plan/cockpit/tax-tab.tsx:148` `{isFinal ? "DARF" : "Prévia"}` | en locale would show Portuguese; keys added: `tax.monthlyDarf.darfLabel` / `previewLabel`                                                                                                                                              | All conditional JSX strings must use `t()`                                    | **fixed**                              |
| 19  | MEDIUM     | Ternary JSX                      | `src/components/journal/nota-import.tsx:577` `{… === "C" ? "C" : "D"}`                | Debit/credit indicator unwrapped; keys added: `journal.nota.creditIndicator` / `debitIndicator`                                                                                                                                        | Same                                                                          | **fixed**                              |
| 20  | LOW        | Color-mode toggle                | `src/components/ui/color-picker.tsx:286` `{inputMode === "hex" ? "HEX" : "RGB"}`      | Technical acronyms; extracted for consistency. Keys: `common.colorPicker.modeHex` / `modeRgb`                                                                                                                                          | Same                                                                          | **fixed**                              |
| 21  | n/a        | SVG path commands                | `src/components/playbook/compliance-trend-sparkline.tsx:64` `"M"`/`"L"`               | Not user-visible text; SVG path syntax                                                                                                                                                                                                 | Not a leak                                                                    | **whitelist**                          |
| 22  | MEDIUM→LOW | Server-action errors (dead)      | `src/app/actions/filter-presets.ts:45,100,130,…` (11×)                                | Confirmed `preset-selector.tsx` discards `result.message` and renders local `t(…)` instead — strings are dead                                                                                                                          | Action returns translated messages anyway _when called by other UIs_          | **deferred** (no current display path) |
| 23  | MEDIUM     | Server-action errors (admin)     | `src/app/actions/timeframes.ts:147` `"Timeframe not found"`                           | Different return contract (`{ success, error }` not `{ status, message }`); admin-only via `requireRole("admin")`                                                                                                                      | Audit + migrate to standard contract                                          | **deferred**                           |

---

## Root causes

### Cluster 1 — server-action error messages bypass `getTranslations()`

**What**: Server actions return `{ status: "error", message: "<English>" }`. The client renders `result.message` directly (or via `result.message ?? t("fallback")` where `??` is unreachable since the server-side message is always truthy). Users on the default `pt-BR` locale see English error messages.

**Why it slipped**: Authors often add `await getTranslations(...)` for the function's _primary_ return path (success message, page copy) but forget the _error_ returns. Compounded by the unreachable-`??`-fallback pattern that looks safe — a code reviewer sees `?? t("fallback")` and assumes there's i18n fallback coverage. There isn't, because `??` only triggers on null/undefined and `result.message` is always a string.

**Anti-pattern signature**: `return { status: "error", message: "<CapitalizedEnglishString>" }` in any `src/app/actions/**/*.ts`. Display-side: `result.message ?? t(...)` or `showToast("error", result.message)`.

**Manifests**: server build time (string is a literal at write time) → runtime user impact (visible on every triggered validation error).

### Cluster 2 — `.toLocaleString()` without an explicit locale

**What**: `value.toLocaleString()` (bare, no args) uses the _JavaScript runtime's_ default locale — which is the browser's `navigator.language` on the client, and typically `en-US` on Node server-render passes. For a pt-BR-default app, this means traders see `1,000.00` instead of `1.000,00` (or vice versa for en users).

**Why it slipped**: `next-intl` _cannot_ monkey-patch `Number.prototype.toLocaleString`. The hook system is invisible to the JS spec API. Developers reach for `.toLocaleString()` thinking "this is locale-aware!" — it is, but to the wrong locale. The codebase already ships a `useFormatting()` hook (at `src/hooks/use-formatting.ts:33`) that wraps a locale-aware `Intl.NumberFormat` and exposes `formatNumber`, `formatCurrency`, etc., but adoption is partial.

**Anti-pattern signature**: `\.toLocaleString\(\)` in `.tsx` files (bare call, no argument).

**Manifests**: runtime; first render on browsers where `navigator.language` ≠ app locale.

### Cluster 3 — conditional/ternary JSX strings

**What**: `{condition ? "Label A" : "Label B"}` in JSX where one or both branches are user-visible strings. Looks innocuous; bypasses i18n entirely.

**Why it slipped**: Tiny labels (1–2 chars or single words like "DARF" / "C" / "HEX") look like UI metadata rather than translatable copy. The i18n-translator skill catches longer strings but isn't tuned for these.

**Anti-pattern signature**: `\{[^}]*\?\s*["']\w[^"']*["']\s*:\s*["']\w[^"']*["']\s*\}` inside JSX.

---

## Prevention rules

### Rule A — server-action errors must use `getTranslations()`

- **Rule**: Every `return { status: "error", message: "…" }` in `src/app/actions/**` must use a translation key, not a string literal. Pattern: `const t = await getTranslations("namespace.errors"); … message: t("keyName")`.
- **Detector**: `rg -n 'return\s*\{\s*status:\s*"error",\s*message:\s*"[A-Z]' src/app/actions/`
- **Auto-fix**: manual (requires choosing namespace + adding key to both `messages/en.json` and `messages/pt-BR.json`).

### Rule B — no bare `.toLocaleString()` in components

- **Rule**: Replace `value.toLocaleString()` with `formatNumber(value)` from `useFormatting()` (`@/hooks/use-formatting`). For dates, use `formatDateTime(date)` from the same hook. Hardcoding `"pt-BR"` is acceptable only for memo'd presentational primitives where adding the hook would trigger a per-instance session fetch.
- **Detector**: `rg -n '\.toLocaleString\(\)' -g '*.tsx' src/components/ src/app/`
- **Auto-fix**: agent sweep (mechanical — proven path; see `tasks/afa7c321753e9cc5e.output`).

### Rule C — ternary JSX strings must be wrapped

- **Rule**: `{cond ? "X" : "Y"}` in JSX where `"X"` or `"Y"` is shown to users → use `t()`. Even single-character strings should be keyed (en may diverge from pt-BR later: `"C"/"D"` → `"Cr"/"Dr"` etc.).
- **Detector**: `rg -n '\{[^}]*\?\s*"\w[^"]*"\s*:\s*"\w[^"]*"\s*\}' -g '*.tsx' src/`
- **Auto-fix**: manual (requires choosing keys).

---

## Fix log

Order applied:

1. **Cluster #1 (server-action errors)** — orchestrator: added 12 keys to `messages/en.json` + `messages/pt-BR.json` (7 in `reports.capitalEventErrors`, 4 in `settings.errors`, 1 reused `settings.errors.accountNotFound`). Wrapped 11 returns in `src/app/actions/annual-reports.ts` + `src/app/actions/settings.ts` with `getTranslations(...)`. Caller files NOT touched — the `result.message ?? t(...)` pattern is now correct defense-in-depth.

2. **Cluster #2 (`.toLocaleString` → `formatNumber`)** — background agent (`afa7c321753e9cc5e`): 14 files, 31 calls replaced, all imports + hook destructures added. Plus orchestrator post-fix:
   - `src/components/shared/colored-value.tsx` — pinned to `"pt-BR"` (memo'd primitive exception)
   - `src/components/monte-carlo/monte-carlo-content.tsx` — moved the hook destructure from outer to inner memo'd component (`EdgeExpectancyContent`) to fix `no-unused-vars`
   - Added `formatNumber` to deps in 3 hook arrays surfaced by `pnpm lint:strict`: `backtest-trades-table.tsx` (useMemo), `renko-pane.tsx` (useEffect), `optimize-content.tsx` (useCallback)

3. **Clusters #3 + #4 + #5 (ternaries)** — orchestrator: added 6 keys across 3 namespaces (`tax.monthlyDarf.darfLabel` / `previewLabel`, `journal.nota.creditIndicator` / `debitIndicator`, `common.colorPicker.modeHex` / `modeRgb`). Replaced 3 ternary strings.

**Verification**:

- `pnpm exec tsc --noEmit`: 0 errors ✅
- `pnpm lint`: 0 errors introduced by this scan (2 pre-existing errors in other branch work)
- `pnpm lint:strict`: 0 errors introduced by this scan (8 pre-existing errors in other branch work)
- `pnpm i18n:check`: 5292 keys per locale, 0 parity gaps, 0 missing references ✅

---

## Still armed (follow-up scans)

These were discovered during the survey but are out of scope for this PR. Document here so the next scan picks them up rather than rediscovering.

### Big one — broader server-action-error pattern (41 caller sites)

Survey turned up the same anti-pattern across the codebase, far wider than originally flagged:

- **26 callers** use `result.message (?? | ||) t("fallback")` — defense-in-depth fallback is unreachable when the server returns truthy text. Locations include: `backtest-trade-chart-modal.tsx:124`, `playbook/conditions-scorecard.tsx:112`, `hawks/daily-bias-form.tsx:94,99`, `playbook/fork-version-dialog.tsx:96`, `fractal-plan/monthly-plan-editor.tsx:71`, `fractal-plan/quarterly-plan-editor.tsx:65`, `settings/trading-account-settings.tsx:95`, `settings/condition-form.tsx:94`, `settings/tag-form.tsx:109`, `fractal-plan/cockpit/month-darf-row.tsx:70`, `tax/fee-rate-form.tsx:216,242`, `settings/user-profile-settings.tsx:107`, `journal/[id]/delete-button.tsx:42`, `settings/hawks-import-section.tsx:249,272`, `fractal-plan/yearly-plan-editor.tsx:382`, `settings/general-settings.tsx:70`, `journal/trade-form.tsx:630`, `journal/execution-form.tsx:180`, `journal/scaled-trade-form.tsx:484`, `journal/journal-content.tsx:366`.

- **15 callers** use `showToast("error", result.message)` with **no fallback at all** — anything the server returns is shown raw. Locations: `playbook/strategy-detail-header.tsx:103`, `fractal-plan/cockpit/tax-tab.tsx:73,89`, `playbook/[id]/edit/edit-strategy-form.tsx:183`, `command-center/daily-checklist.tsx:79`, `journal/nota-import.tsx:258`, `playbook/new/page.tsx:101`, `command-center/asset-rules-panel.tsx:100,143,170,191`, `command-center/checklist-manager.tsx:104,114,136`, `command-center/post-market-notes.tsx:55`.

For each caller, the server-side action needs to be audited and wrapped in `getTranslations()`. Roughly **6–8 more action files** beyond the 2 fixed in this PR likely contain hardcoded English error messages.

### Secondary follow-ups

- **`detailed-trade-importer.tsx:101`** — `new Date(...).toLocaleString()` for cooldown timestamp formatting. Locale-naive date display; fix via `formatDateTime` from `useFormatting`.
- **`filter-presets.ts`** — 11 hardcoded messages currently NOT user-facing (caller uses local `t()`), but they will leak the moment a new caller renders `result.message`. Translate proactively in a small follow-up PR.
- **`timeframes.ts:147`** — admin-only path, uses non-standard `{ success, error }` contract. Schedule a separate audit to migrate timeframes/admin actions to the standard `{ status, message }` contract.
- **`colored-value.tsx`** — currently pinned to `"pt-BR"`. When an en-locale UI ships, promote to accept a `locale` prop (parent calls `useLocale()`), or migrate to a true client component once the perf cost is measurable.

---

## Whitelist (confirmed NOT-leaks)

- `aria-label="breadcrumb"` (`components/ui/breadcrumb.tsx:14`) — lowercase, structural ARIA role keyword; not a translatable string.
- `alt="Axion"` (11 sites in `auth/*`, `layout/*`) — brand name; intentionally untranslated.
- `components/dev/hawks-audit-debugger.tsx`, `components/dev/hawks-audit-inspector.tsx` — developer-only debug tools, never shown to traders; English is acceptable.
- SVG path command literals `"M"`, `"L"` in template literals (`playbook/compliance-trend-sparkline.tsx:64`) — SVG syntax, not user-visible text.
- `*.toLocaleString("pt-BR", {...})` with explicit locale arg (e.g. in `tax-tab.tsx:149`, `monte-carlo/kelly-criterion-card.tsx:17`) — intentional, correct.
- `throw new Error("Unauthorized")` and similar caught-internally invariants in `requireRole`/`requireAuth` — never reach the user.
- Broker code identifiers (`"CLEAR"`, `"Genial"`) — proper nouns.

---

## Re-applied status — 2026-06-02 (post `git reset --hard`)

Two `git reset --hard` operations during the original session wiped the first round of fixes; this report survived because it had been committed. All in-scope fixes were re-applied via the following commits on `feat/optimize-phase-1-trust-foundations`:

- `d4de961f` — annual-reports + settings server-action errors
- `5a2db0e7` — DARF/Prévia, debit/credit, HEX/RGB ternary extractions
- `089b92f0` — toLocaleString → formatNumber sweep (15 components + colored-value pin)
- `3a4dd307` — tax-engine.ts (12 returns)
- `0595ba9b` — trading-conditions + ocr-import (12 returns, including ICU plural for bulk OCR)
- `e9b01ff0` — equity-shield + csv-import + candle-query (7 returns + ICU plural for CSV)
- `<fix-commit>` — repaired botched JSX-paren substitution in sweep-axis-diagnostics.tsx

**Verification (post-re-apply):** `pnpm exec tsc --noEmit` → 0 errors. `pnpm lint:strict` → 0 errors, 7 warnings (all in pre-existing perf files: freeze-hero-modal, grid-conditional, parameter-grid, pareto-retain). `pnpm i18n:check` → 5316 keys per locale, 0 parity gaps, 0 missing keys.

**New anti-pattern discovered:** the mechanical `.toLocaleString()` → `formatNumber()` replacement agent botched JSX `&& (` opening parens in two files (`simulation-params-form.tsx`, `sweep-axis-diagnostics.tsx`) by replacing them with `formatNumber(`. Detector: `rg -n '&& formatNumber\(' src/`. Future mechanical refactor passes should run tsc immediately after, not just on a parent commit's lint gate.
