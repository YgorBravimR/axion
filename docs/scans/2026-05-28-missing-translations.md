# Scan: missing translations — 2026-05-28

**Branch**: main
**Base**: b37b9deb (`feat(hawks-engine): v0.6 — stay-armed re-arm + slide FUNDO/TOPO + cooldown`)
**Files audited**: ~932 TS/TSX under `src/**` + 2 locale files (`messages/en.json`, `messages/pt-BR.json`, 4792 keys each)
**Trigger**: runtime `MISSING_MESSAGE` errors thrown by `DezkEntrySection` in pt-BR caught by `bug-report-capture`.
**Verdict**: 4 critical (runtime errors), 4 high (hardcoded user-visible strings), 2 medium (error fallback strings), 2 low (dev tooling intentional). 12 actioned, 0 deferred.

## Findings (full table)

| #   | Severity | Category                  | File:Line                                                                                      | Issue                                                                               | Rule violated                           | Status                                              |
| --- | -------- | ------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| 1   | Critical | i18n / missing key        | `src/app/actions/indicators.ts:122`                                                            | `settings.indicators.errors.groupNotFound` referenced but not in any locale         | i18n key-set integrity                  | fixed                                               |
| 2   | Critical | i18n / missing key        | `src/app/actions/indicators.ts:143`                                                            | `settings.indicators.errors.groupHasDefinitions` referenced but not in any locale   | i18n key-set integrity                  | fixed                                               |
| 3   | Critical | i18n / missing key        | `src/app/actions/indicators.ts:250`                                                            | `settings.indicators.errors.definitionNotFound` referenced but not in any locale    | i18n key-set integrity                  | fixed                                               |
| 4   | Critical | i18n / wrong key          | `src/components/settings/user-profile-settings.tsx:139`                                        | Called `register.passwordMismatch` but actual key is `register.passwordsDoNotMatch` | i18n key-set integrity + no-duplication | fixed (code-side rename)                            |
| 5   | High     | i18n / hardcoded          | `src/components/backtest/sections/dezk-entry-section.tsx:45`                                   | Section header `<p>MACD</p>` not translated                                         | i18n hardcoded UI copy                  | fixed (`backtest.dezk.macdLabel`)                   |
| 6   | High     | i18n / hardcoded          | `src/components/imports/detailed-trade-importer.tsx:197`                                       | Broker dropdown literal `"Clear"`                                                   | i18n hardcoded UI copy                  | fixed (`imports.brokers.clear`)                     |
| 7   | High     | i18n / hardcoded          | `src/components/imports/detailed-trade-importer.tsx:198`                                       | Broker dropdown literal `"XP"` (missed by audit, caught during fix)                 | i18n hardcoded UI copy                  | fixed (`imports.brokers.xp`)                        |
| 8   | High     | i18n / hardcoded          | `src/components/imports/detailed-trade-importer.tsx:199`                                       | Broker dropdown literal `"Genial"`                                                  | i18n hardcoded UI copy                  | fixed (`imports.brokers.genial`)                    |
| 9   | High     | i18n / hardcoded          | `src/components/fractal-plan/cockpit/tax-tab.tsx:173-174`                                      | Empty-state literal hardcoded in PT inside JSX child                                | i18n hardcoded UI copy                  | fixed (`tax.monthlyDarf.noDarfLines` with `{year}`) |
| 10  | Medium   | i18n / hardcoded fallback | `src/components/backtest/inspector/backtest-overview-chart.tsx:109`                            | `setError(..., "Failed to load")`                                                   | i18n hardcoded UI copy                  | fixed (`backtest.inspector.failedToLoad`)           |
| 11  | Medium   | i18n / hardcoded fallback | `src/components/backtest/inspector/triple-screen-inspector.tsx:136`                            | Same `"Failed to load"` fallback                                                    | i18n hardcoded UI copy                  | fixed (`backtest.inspector.failedToLoad`)           |
| 12  | Low      | i18n / dev-only           | `src/components/dev/hawks-audit-debugger.tsx` + `src/components/dev/hawks-audit-inspector.tsx` | Hardcoded English in developer debug tools (~16 strings + 1 fallback)               | None — dev-only is exempt               | wontfix (annotated `// i18n-exempt`)                |

(There is a previous Dezk entry section gap — `backtest.builder.entryDescriptionDezk` + 10 `backtest.dezk.*` keys — fixed before this scan started. Not listed here.)

## Root causes

### RC-1: `t("key")` references can be authored without compile-time validation

**What**: `next-intl` resolves keys at runtime against the active locale's JSON tree. There is no TypeScript type generation in this repo binding `useTranslations(namespace)` to the available keys under that namespace. A developer can write `t("anything")` and it compiles green even when the key doesn't exist.
**When it manifests**: runtime, only when the user (a) views the page in the locale that's missing the key AND (b) hits the code path that calls `t("...")`. Server-action error branches (#1, #2, #3) only fire on edge cases (record not found, FK constraint), so the bug can live undetected for weeks.
**Anti-pattern signature**: any `t("...")` or `getTranslations(...).then(t => t("..."))` where the dotted path is not a key in `messages/en.json` AND `messages/pt-BR.json`.

### RC-2: Hardcoded string literals inside JSX children / SelectItem labels

**What**: A string literal appears directly as a JSX text child (`<p>MACD</p>`, `<SelectItem>Clear</SelectItem>`). The developer intended it as a placeholder during scaffolding and never came back to extract it.
**When it manifests**: render time, in any locale — the string never translates, breaking the localized UX even though `MISSING_MESSAGE` doesn't fire.
**Anti-pattern signature**: JSX text children starting with a capital letter and ≥2 characters, that aren't already wrapped in `{t(...)}`.

### RC-3: Hardcoded fallback strings inside `setError(... ?? "literal")` / catch blocks

**What**: A `.catch` handler converts an unknown error to a UI string using a literal fallback (`err instanceof Error ? err.message : "Failed to load"`). Easy to miss because it only renders when an exception is thrown — `pt-BR` users see English on chart fetch failures.
**When it manifests**: error path only, in the user's locale.
**Anti-pattern signature**: a string literal as the right operand of a ternary inside `setError(...)`, `setErrorMessage(...)`, `throw new Error(...)` when rendered, or `toast.error(...)`.

### RC-4: Wrong-key drift from copy-paste rename

**What**: Code references `register.passwordMismatch` but the canonical key (used elsewhere) is `register.passwordsDoNotMatch`. Likely a copy-paste from another codebase or a half-finished rename.
**When it manifests**: when the user mistypes their password confirmation. Rare branch → easy to miss in QA.
**Anti-pattern signature**: a `t("...")` key whose dotted path resembles, but doesn't exactly match, an existing key (string-distance 1–3).

## Prevention rules

- **Rule**: Every `t("...")` / `getTranslations(...)` static key must exist in BOTH `messages/en.json` AND `messages/pt-BR.json`.
  **Detector**: `node scripts/check-i18n-keys.ts` (proposed — see "Suggested follow-up" below). Stop-gap one-liner:

  ```bash
  rg -oN 't\("([a-zA-Z][a-zA-Z0-9._]+)"\)' src/ -r '$1' | sort -u > /tmp/refs.txt && \
    node -e 'const f=require("fs");const flat=(o,p="",s=new Set())=>{for(const[k,v]of Object.entries(o)){const x=p?p+"."+k:k;if(v&&typeof v=="object"&&!Array.isArray(v))flat(v,x,s);else s.add(x)}return s};const en=flat(JSON.parse(f.readFileSync("messages/en.json","utf8")));const pt=flat(JSON.parse(f.readFileSync("messages/pt-BR.json","utf8")));' # (then diff /tmp/refs.txt against keys; see scripts/ directory if added)
  ```

  **Auto-fix**: manual — surface report to /scan, then fix per category.

- **Rule**: No string literal as a JSX text child unless it is a number, symbol, identifier, or the file is under `src/components/dev/**`.
  **Detector**: `rg -n '>[A-Z][a-zA-Z ]{2,}<' src/components src/app --type tsx | rg -v 'src/components/dev/'`
  **Auto-fix**: `i18n-translator` subagent (Haiku).

- **Rule**: No string literal in `setError(...)` / `toast.error(...)` / `toast.success(...)` fallbacks outside `src/components/dev/**`.
  **Detector**: `rg -nP 'setError\([^)]*\?\s*[^:]+\s*:\s*"[^"]+"' src/ | rg -v 'src/components/dev/'`
  **Auto-fix**: manual — pick existing key from same hook's namespace.

- **Rule**: Locale files must have identical key sets (`messages/en.json` ⊕ `messages/pt-BR.json` = ∅).
  **Detector**: same Node script as RC-1 — diff the two flattened key sets.
  **Auto-fix**: `i18n-translator` subagent (Haiku).

## Fix log

In order applied:

1. **Phase 3 / data**: added 8 new keys + 1 alias path across both locale files
   - `messages/en.json` + `messages/pt-BR.json` — `settings.indicators.errors.{groupNotFound,groupHasDefinitions,definitionNotFound}`, `imports.brokers.{clear,xp,genial}`, `tax.monthlyDarf.noDarfLines`, `backtest.inspector.failedToLoad`, `backtest.dezk.macdLabel`
2. **Phase 3 / components**:
   - `src/components/settings/user-profile-settings.tsx:139` — `passwordMismatch` → `passwordsDoNotMatch`
   - `src/components/imports/detailed-trade-importer.tsx:197-199` — 3 broker literals → `t("brokers.*")`
   - `src/components/fractal-plan/cockpit/tax-tab.tsx` — added `useTranslations("tax.monthlyDarf")` hook, replaced PT literal with `t("noDarfLines", { year })`
   - `src/components/backtest/inspector/backtest-overview-chart.tsx:109` — `"Failed to load"` → `t("failedToLoad")`
   - `src/components/backtest/inspector/triple-screen-inspector.tsx:136` — same
   - `src/components/backtest/sections/dezk-entry-section.tsx:45` — `"MACD"` → `t("macdLabel")`
3. **Phase 3 / dev exemption**: prepended `// i18n-exempt` banner to `src/components/dev/hawks-audit-debugger.tsx` and `src/components/dev/hawks-audit-inspector.tsx`.
4. **Phase 4 / verify**: `pnpm exec tsc --noEmit --pretty false` → No errors found. JSON parity confirmed (both files parse, 4801 keys each post-edit).

## Still armed

None from this scan's scope. Two adjacent classes were observed but explicitly out of scope:

- **1905 orphan keys per locale** (present in JSON, unreferenced in code). Likely safe-to-delete deprecated namespaces, but verifying requires a dedicated dead-i18n-keys pass with attention to dynamic key construction (`t(\`day.\${name}\`)`) and route-table generation. Recommend a follow-up `/scan` scoped to dead i18n keys before any deletion.
- **Dynamic key construction** — no occurrences detected in this scope, but the diagnose pass intentionally skipped them. If introduced, the Detector above can't catch missing keys statically.

## Suggested follow-up

The catalog now has 4 greppable detectors all targeting the same `messages/*.json ⇄ src/` boundary. Recommend adding `scripts/check-i18n-keys.ts` (CI-runnable, fail-on-mismatch) and wiring it into `pnpm lint:strict`. This becomes the Phase 0 pre-flight for future `/scan` invocations: run all detectors before launching diagnose agents, catch recurring bombs before they reach the LLM.
