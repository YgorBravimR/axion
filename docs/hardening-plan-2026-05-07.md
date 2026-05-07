# Codebase Hardening Plan — Agent-Resistant Lint/TS/Tailwind Rules

**Date**: 2026-05-07
**Branch**: `feat/yearly-tax-reporting`
**Author**: Arch (Claude) + Ygor
**Status**: research + plan; execution deferred

## Context

Axion ships a lot of agent-written code. Several recurring bug classes have already been catalogued in `docs/scans/2026-05-07-cockpit-tokens.md` and `~/.claude/memory.md`:

- Invalid Tailwind v4 tokens (`rounded-m-200`, `s-400`, `text-h4`) compile to nothing — silent layout regressions.
- `"use server"` file type-export footgun (Next.js 16 RSC bundler rewrites types as runtime refs).
- Raw HTML elements used where shadcn UI primitives exist.
- Hover-revealed controls invisible on touch.
- Mixed PT/EN i18n strings.

Three layers of defence already exist:
1. `eslint-plugin-better-tailwindcss` (no-unknown-classes, no-deprecated-classes, no-conflicting-classes).
2. `scripts/token-fix.ts` (declarative bulk-rewrite of invalid tokens; CI-friendly `--dry`).
3. `docs/scans/*.md` post-mortems with prevention rules.

This document captures the **next layer**: ESLint/TypeScript/Tailwind rules that catch a broader bug class. Sourced from sibling Baerskin repos (services, channels) plus 2026 best-practice research.

---

## Research summary

### Sibling repo findings

#### services (`/Users/ygorbravim/baerskin/services`)

ESLint config — flat, ESLint 10. Plugins beyond axion baseline: `eslint-plugin-drizzle`, in-house `packages/eslint-plugin-custom`.

```js
// Drizzle safety — bans naked delete/update (no .where())
"drizzle/enforce-delete-with-where": ["error", { drizzleObjectName: drizzleDbNames }]
"drizzle/enforce-update-with-where": ["error", { drizzleObjectName: drizzleDbNames }]

// Custom rule: 2+ mutations on same db object require .transaction()
"custom/enforce-transaction-on-sequential-mutations": ["warn", { drizzleObjectName: drizzleDbNames }]

// Custom rule: ban manual date math (Date.now() + ms, .setDate(), etc.) — use date-fns
"custom/enforce-date-fns": "error"

// Ban default exports
"no-restricted-syntax": ["error",
  { selector: "ExportDefaultDeclaration", message: "Avoid default exports (AGENTS.md)" }
]

"no-await-in-loop": "error"
"@typescript-eslint/consistent-type-imports": "error"
"@typescript-eslint/ban-ts-comment": "error"
"@typescript-eslint/no-explicit-any": "error"
"@typescript-eslint/no-empty-object-type": "error"
"no-useless-catch": "error"
"preserve-caught-error": "error"        // in-house rule
"no-useless-assignment": "error"
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "noFallthroughCasesInSwitch": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true
  }
}
```

Custom in-house rules worth porting:
- **`custom/enforce-date-fns`** — flags `.toISOString().split("T")[0]`, `Date.now() + 86400000` style ms arithmetic, `.getFullYear()`/`.getMonth()`/`.getDate()` in string contexts, `.setDate()`/`.setHours()` mutations. Forces `date-fns` usage.
- **`custom/enforce-transaction-on-sequential-mutations`** — tracks `await db.insert/update/delete(...)` calls per function scope; warns when 2+ mutations on same db object aren't wrapped in `.transaction()`.

Husky pre-commit:

```bash
# Full repo lint + per-app typecheck scoped to staged files
bun lint
declare -a app_paths=( "apps/bff" "apps/canary" ... )
for app_path in "${app_paths[@]}"; do
  if git diff --cached --name-only | grep --quiet "$app_path"; then
    (cd $app_path && bun tsc --noEmit)
  fi
done
```

CLAUDE.md notable agent rules:
- "no default exports", "no await in loops"
- Always `import type` for type-only imports
- Pinned versions only — no `^` or `~`
- "Never use try-catch as conditionals"
- "Drizzle: $inferSelect over manual interfaces"
- "Drizzle: `.delete()`/`.update()` without `.returning()` returns `never` — always add `.returning()`"
- PR target: always `staging`
- Linear: "In Review" before "Done"

---

#### channels (`/Users/ygorbravim/baerskin/channels`)

ESLint — flat config in `packages/eslint-config-custom/eslint.config.mjs`. Plugins beyond axion baseline: `eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`, `eslint-plugin-react-you-might-not-need-an-effect`, `eslint-config-turbo/flat`, custom inline `@local/custom`.

```js
// Next.js
"@next/next/no-html-link-for-pages": "error"
"@next/next/no-img-element": "error"

// React correctness (react-hooks v5 + React Compiler rules merged in)
"react/jsx-key": "error"
"react-hooks/rules-of-hooks": "error"
"react-hooks/exhaustive-deps": "error"
"react-hooks/set-state-in-effect": "error"
"react/no-unstable-nested-components": "error"
"react-hooks/static-components": "error"
"react-hooks/immutability": "error"
"react-hooks/purity": "error"
"react-hooks/refs": "error"

// Logging / debug
"no-console": ["warn", { allow: ["warn", "error", "info"] }]
"no-debugger": "error"
"no-unreachable": "error"

// Ban .forEach() — agent guidance baked into the message
"no-restricted-syntax": ["error", {
  selector: "CallExpression[callee.property.name='forEach']",
  message: "Avoid .forEach() — use for...of, map(), or reduce() instead (AGENTS.md)."
}]

"no-await-in-loop": "error"

// Ban barrel imports from @local/* — force deep paths
"no-restricted-imports": ["error", {
  paths: [
    "@local/api", "@local/cart", "@local/contact-form", ...
  ].map(name => ({ name, message: "Import directly from " + name + "/src/… instead." }))
}]

"curly": ["error", "all"]
"func-style": ["warn", "expression"]

"@typescript-eslint/consistent-type-imports": ["error", {
  prefer: "type-imports",
  fixStyle: "separate-type-imports"
}]

"@typescript-eslint/ban-ts-comment": ["error", {
  "ts-ignore": "allow-with-description",
  "ts-expect-error": "allow-with-description",
  "minimumDescriptionLength": 10
}]

"@typescript-eslint/no-non-null-asserted-optional-chain": "error"
"@typescript-eslint/no-empty-object-type": "error"
"@typescript-eslint/no-explicit-any": "warn"

"turbo/no-undeclared-env-vars": "error"
"@typescript-eslint/no-unused-expressions": "error"
```

Custom in-house rules worth porting:
- **`no-dynamic-functions-in-pages`** — bans `cookies()`, `headers()`, `connection()` imported from `"next/headers"`/`"next/server"` inside `page.tsx`/`layout.tsx`. Rationale: those calls force the route into dynamic rendering, killing RSC island architecture.
- **`no-components-in-store-app`** — flags JSX in `store/src/` files outside `store/src/app/`. Components belong in `@local/*` packages. Pattern: package-boundary enforcement via JSX detection.

Husky:
```bash
# .husky/pre-commit
pnpm lint-staged

# .husky/commit-msg
pnpm commitlint --verbose --edit $1
```

`lint-staged`:
```json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.md": "prettier --write"
}
```

`commitlint.config.ts`: `extends: ["@commitlint/config-conventional"]`.

CI: `pnpm test:unit` (Vitest) on PRs to main/staging.

CLAUDE.md / agent rules to borrow:
- **Protected directories** — agent must refuse modifications to `packages/cart/src/{shelf,cart}`; suggest alternatives instead.
- **Cached fetchers** — always `@local/offer/src/fetchers/cached`, never raw fetcher classes.
- "Minimize 'use client', useEffect, setState; prefer RSC."
- "Always use braces for if/else/for/while — no braceless one-liners."
- "Never use try-catch as conditionals."
- Strict versioning: no `^` or `~`.
- PR target: always `staging`.
- **Session Prompts format** — agent-created PRs include a collapsible `<details>` section listing all substantive user prompts verbatim, numbered, secrets redacted.

`packages/ui/CLAUDE.md` design-system rules:
- "NEVER use arbitrary hex (`bg-[#xxx]`) — every colour has a token."
- "NEVER add `dark:` variants — dark mode unsupported."
- "NEVER use `rounded-lg` or `rounded-xl` — use `rounded-md`, `rounded`, `rounded-sm`, `rounded-full`, `rounded-none`."
- "NEVER use arbitrary `z-index` — use named `z-base`..`z-toast`."
- "NEVER use `transition-all` — target specific properties."
- "NEVER use arbitrary font sizes (`text-[28px]`) — use the token."
- `font-display` (Barlow Condensed) must always be `uppercase`.

---

### 2026 best-practice research

Sources:
- https://typescript-eslint.io/rules/
- https://typescript-eslint.io/rules/consistent-type-imports
- https://react.dev/reference/eslint-plugin-react-hooks
- https://www.eslint-react.xyz/
- https://github.com/Rel1cx/eslint-react
- https://nextjs.org/docs/app/api-reference/config/eslint
- https://nextjs.org/docs/messages/invalid-use-server-value
- https://orm.drizzle.team/docs/eslint-plugin
- https://github.com/un-ts/eslint-plugin-import-x
- https://github.com/jsx-eslint/eslint-plugin-jsx-a11y
- https://factory.ai/news/using-linters-to-direct-agents
- https://www.typescriptlang.org/tsconfig/
- https://tailwindcss.com/docs/theme
- https://medium.com/@albro/eslint-as-ai-guardrails-the-rules-that-make-ai-code-readable-8899c71d3446

Key findings:

- **typescript-eslint v8** ships type-checked rules behind `parserOptions.projectService: true` (replaces older `project: true`). The `no-unsafe-*` family + `no-floating-promises` + `no-misused-promises` is the single biggest catch surface for AI bugs (silent unhandled promises, `any` leakage).
- **`eslint-plugin-react-compiler` is deprecated** — its rules merged into `eslint-plugin-react-hooks` v5 `recommended-latest` preset.
- **`@eslint-react/eslint-plugin`** supersedes legacy `eslint-plugin-react` for React 19. Use its `disable-legacy` config to remove conflicts when both are present.
- No official Tailwind ESLint rules from Tailwind team yet (May 2026). `eslint-plugin-better-tailwindcss` is best-in-class for v4.
- No official ESLint rule for "`use server` file must export only async functions". Mitigated by `@typescript-eslint/consistent-type-exports` + runtime Next.js error + CI typecheck. Custom AST rule possible (~50 LoC).
- **`eslint-plugin-import-x`** is the flat-config-native fork of `eslint-plugin-import`. Use this, not the legacy.
- TypeScript compiler flags: `noUncheckedIndexedAccess` is the highest-ROI strict flag for catching agent crashes (`array[0].foo` on empty arrays). `verbatimModuleSyntax` complements `consistent-type-imports` at the compiler layer.

---

## Tier 1 — wire now, low blast, big bug coverage

| Rule / setting | Severity | Source | Bug class caught |
|---|---|---|---|
| `drizzle/enforce-delete-with-where` | error | services | `db.delete(table)` without `.where()` = full table wipe |
| `drizzle/enforce-update-with-where` | error | services | mass-overwrite on update without `.where()` |
| `@typescript-eslint/consistent-type-imports` (`fixStyle: "separate-type-imports"`) | error | both | runtime imports of type-only symbols; `"use server"` type-export footgun |
| `@typescript-eslint/no-import-type-side-effects` | error | web | `import type` specifiers with side-effect imports |
| `@typescript-eslint/no-explicit-any` | error | services | agents reach for `any` to bypass inference |
| `@typescript-eslint/no-empty-object-type` | error | both | empty `{}` types defeat type narrowing |
| `@typescript-eslint/ban-ts-comment` w/ `minimumDescriptionLength: 10` | error | channels | naked `@ts-ignore` / `@ts-expect-error` |
| `@typescript-eslint/no-non-null-asserted-optional-chain` | error | channels | `foo?.bar!` defeats null safety |
| `@typescript-eslint/no-unused-expressions` | error | channels | dead expression statements |
| `no-restricted-syntax: ExportDefaultDeclaration` (with msg) | error | services | aligns with axion CLAUDE.md "no default exports" |
| `no-restricted-syntax: TSEnumDeclaration` (with msg) | error | web | enums emit runtime objects → break `"use server"` re-exports |
| `no-restricted-syntax: CallExpression[callee.property.name='forEach']` (with msg) | error | channels | aligns with axion CLAUDE.md "use map/reduce/for-of" |
| `no-await-in-loop` (off in `scripts/**` and `**/*.test.ts`) | error | both | sequential awaits where `Promise.all` was meant |
| `no-console` (allow `warn`, `error`, `info`) | error | web + channels | strewn debug logs from agents |
| `eqeqeq` | error | web | `==` / `!=` instead of strict equality |
| `no-debugger` | error | channels | `debugger` left in by agents |
| `no-unreachable` | error | channels | dead code after `return`/`throw` |
| `no-useless-catch` | error | services | `try { ... } catch (e) { throw e }` no-op wraps |
| `curly: ["error", "all"]` | error | channels | brace-required prevents one-liner footguns |
| `@next/next/no-async-client-component` | error | next docs | `"use client"` + async function = RSC violation |
| `@next/next/no-html-link-for-pages` | error | channels + next | raw `<a href="/dashboard">` breaks client routing |
| `@next/next/no-img-element` | error | channels + next | raw `<img>` instead of `next/image` (LCP regression) |
| `@next/next/no-typos` | error | next | typos in convention exports (`getStaticProps` etc.) |
| `jsx-a11y/anchor-is-valid` | error | web | `<a href="#">` / `<a onClick>` without real `href` |
| `jsx-a11y/interactive-supports-focus` | error | web | `onClick` on `<div>` without `tabIndex`/`role` |
| `jsx-a11y/label-has-associated-control` | error | web | `<label>` not linked to input |
| `jsx-a11y/click-events-have-key-events` | error | web | click handler without keyboard equivalent |
| **tsconfig**: `"verbatimModuleSyntax": true` | — | services | type-only imports enforced at TS layer; complements consistent-type-imports |
| **tsconfig**: `"noUncheckedIndexedAccess": true` | — | web | `arr[0].foo` runtime crash on empty array |
| **tsconfig**: `"noFallthroughCasesInSwitch": true` | — | services | missing `break`/`return` in switch |

Estimated initial backlog: drizzle rules ~0 hits; type-import rules ~50–100 (auto-fixable); `noUncheckedIndexedAccess` ~50–150 places needing guards; `no-console` ~30–50 hits.

## Tier 2 — type-checked rules + React 19 modern plugin

Requires `parserOptions.projectService: true` in flat config. Lint cost ~3–5x slower on cold runs. Split into `pnpm lint:strict` (CI-only) so editor + dev loop stays fast.

| Rule | Severity | Source | Bug class caught |
|---|---|---|---|
| `@typescript-eslint/no-floating-promises` | error | web | unhandled async in server actions / event handlers |
| `@typescript-eslint/no-misused-promises` (`checksVoidReturn: { attributes: true }`) | error | web | `async` passed to JSX `void` event handlers (errors swallowed) |
| `@typescript-eslint/await-thenable` | error | web | `await nonPromise` |
| `@typescript-eslint/no-unsafe-assignment` | error | web | `any` spreading into typed vars |
| `@typescript-eslint/no-unsafe-member-access` | error | web | member access on `any` (raw fetch responses) |
| `@typescript-eslint/no-unsafe-return` | error | web | `any` leaking out of functions |
| `@typescript-eslint/no-unsafe-argument` | error | web | `any` into typed params |
| `@typescript-eslint/no-unsafe-call` | error | web | calling `any` as a function |
| `@typescript-eslint/restrict-template-expressions` | error | web | `${complexObject}` → `[object Object]` |
| `@typescript-eslint/no-base-to-string` | error | web | `.toString()` on objects without override |
| `@typescript-eslint/consistent-type-exports` | error | web | mixed value/type in single `export {}` (= "use server" bomb) |
| `@typescript-eslint/no-unnecessary-condition` | warn | web | always-true/false conditions agent didn't read types for |
| `@eslint-react/eslint-plugin` recommended preset | error | web | React 19 `use()`, RSC patterns |
| `@eslint-react/no-nested-component-definitions` | error | web | inline-component remount loop |
| `@eslint-react/no-missing-key` | error | web | missing `key` on list renders |
| `@eslint-react/no-array-index-key` | warn | web | array-index keys break reconciliation on reorder |
| `@eslint-react/dom/no-dangerously-set-innerhtml` | warn | web | `dangerouslySetInnerHTML` injection |
| `@eslint-react/set-state-in-render` | error | web | unconditional `setState` during render = infinite loop |
| `react-hooks/immutability` (v5) | error | channels | prop/state mutation (`props.list.push(item)`) |
| `react-hooks/refs` (v5) | error | channels | reading/writing refs during render |
| `react-hooks/set-state-in-effect` (v5) | warn | channels | synchronous `setState` in effect = double render |
| `react-hooks/static-components` (v5) | warn | channels | components recreated every render |
| `react-hooks/purity` (v5) | error | channels | side effects in render |
| `react/no-unstable-nested-components` | error | channels | (legacy variant of nested-component-defs) |
| `import-x/no-default-export` (Next conventions exempt) | error | web | matches axion CLAUDE.md preference |
| `import-x/no-cycle` (`maxDepth: 5`) | error | web | circular deps from sloppy module splits |
| `import-x/no-duplicates` | error | web | duplicate imports for same module |
| `import-x/no-relative-parent-imports` | warn | web | enforces `@/` alias usage |

Estimated backlog: `no-unsafe-*` cluster typically surfaces 200+ hits on first run; `no-floating-promises` ~20–50 in server actions; React hook rules ~10–30. Budget 2–3 hours of triage + fix.

## Tier 3 — process / hooks / templates

| Item | Source | Effect |
|---|---|---|
| `lint-staged` config: `eslint --fix` + `prettier --write` on staged `.ts/.tsx` | channels | catches before commit |
| Husky `pre-commit` hook: `pnpm lint-staged` | channels | runs lint-staged automatically |
| Husky `pre-commit` (alternative — heavier): full repo `pnpm lint` + per-area `tsc --noEmit` scoped to staged files | services | catches more, slower |
| Husky `commit-msg` hook: `commitlint --edit $1` | channels | enforces Conventional Commits |
| `commitlint.config.ts`: `extends: ["@commitlint/config-conventional"]` | channels | normalized history |
| `.vscode/settings.json` workspace: `tailwindCSS.experimental.classRegex` for `cva()` calls | web | IntelliSense in cva variants |
| `.vscode/settings.json`: `tailwindCSS.lint.invalidApply: "error"` + `tailwindCSS.lint.cssConflict: "warning"` | web | in-editor surface |
| Prebuild step in CI: `pnpm tailwindcss --input src/app/globals.css --output /dev/null` | web | catches `@theme` reference rot before deploy |
| Custom rule `enforce-token-usage` (extension of `scripts/token-fix.ts` as ESLint rule) | axion-original | auto-fix in editor, not just CLI |
| Custom rule `no-dynamic-functions-in-pages` (ban `cookies()`/`headers()` from `next/headers` in `page.tsx`/`layout.tsx`) | channels | preserves RSC static rendering |
| Custom rule `enforce-server-action-async-only` (forbid non-async exports in `"use server"` files) | axion-original | prevents the recurring footgun |
| Custom rule `no-hover-only-controls` (flag `opacity-0 group-hover:opacity-100` patterns) | axion-original | touch a11y |
| Custom rule `enforce-ui-primitives` (flag raw `<table>`, `<input type="checkbox">` when `@/components/ui/*` exists) | axion-original | matches scan #2 findings |
| `CLAUDE.md` section: protected-directory list | channels | agent refuses modifications |
| `CLAUDE.md` section: PR template with WCAG checklist + Session Prompts collapsible | channels | every agent PR self-documents |
| `CLAUDE.md` section: design-system token rules ("NEVER use arbitrary hex / z-index / font-size") | channels (`packages/ui/CLAUDE.md`) | reinforces token discipline |

## Gaps not currently covered by tooling

- **"`use server` must export only async functions"** — no off-the-shelf rule. Custom AST rule planned in Tier 3.
- **Drizzle schema drift vs Postgres** — no ESLint coverage. Use `drizzle-kit check` in CI.
- **Tailwind `@theme` reference rot** (e.g. `var(--color-bg-400)` in CSS when token doesn't exist) — addressed by Tier 3 prebuild step.
- **i18n key drift** (`tCommon("foo")` when `foo` doesn't exist in `messages/en.json`) — no rule in scope; consider `next-intl` typegen.

---

## Execution plan

Sequence (one PR per tier; gate each on green CI):

### Phase 1 — Tier 1

1. Install plugins: `eslint-plugin-drizzle`, `@next/eslint-plugin-next`, `eslint-plugin-jsx-a11y`.
2. Update `eslint.config.mjs` with all Tier 1 rules. Add file-scope override that turns `no-await-in-loop` off in `scripts/**` and `**/*.test.ts`.
3. Update `tsconfig.json`: `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`.
4. Run `pnpm lint --fix` to auto-fix what can be (consistent-type-imports, etc.).
5. Triage remaining hits by category; commit per-category fix passes:
   - i. `no-console` cleanup (replace with logger or remove).
   - ii. `noUncheckedIndexedAccess` guard additions (most likely needs `if (item) {}` or `?.` adds).
   - iii. `consistent-type-imports` manual cases.
   - iv. `no-restricted-syntax: forEach` rewrites (use `for...of` / `map` / `reduce`).
   - v. `jsx-a11y/*` — add `tabIndex`, `role`, `aria-label`, keyboard handlers.
   - vi. `@next/next/*` — convert raw `<a>`/`<img>` to `<Link>`/`<Image>`.
   - vii. Drizzle rules — should be 0 hits; if not, fix the missing `.where()`.
6. Verify clean: `pnpm lint` (zero errors), `pnpm exec tsc --noEmit` (clean).
7. Update `docs/scans/` with a Tier 1 post-mortem documenting hit counts and fix patterns.
8. Update `~/.claude/memory.md` with new detectors (e.g. catalog entries for each rule's bug class).

### Phase 2 — Tier 2

1. Add `parserOptions.projectService: true` to flat config; verify with single file.
2. Add `pnpm lint:strict` script that runs ESLint with type-checked rules; remove these rules from the default `pnpm lint` to keep editor fast.
3. Install `@eslint-react/eslint-plugin`, `eslint-plugin-import-x`. Wire `@eslint-react/disable-legacy` to remove conflicts with any residual `eslint-plugin-react`.
4. Add Tier 2 rules.
5. Run `pnpm lint:strict --fix` for auto-fixable subset.
6. Triage by cluster; commit per-cluster:
   - i. `no-floating-promises` + `no-misused-promises` — wrap all server-action calls in event handlers; add `void` operator or proper handler.
   - ii. `no-unsafe-*` family — type all `fetch` responses; remove implicit `any`.
   - iii. `consistent-type-exports` — fix any `"use server"` files that mix value + type exports.
   - iv. `@eslint-react/*` — extract nested components; add missing keys; switch array-index keys to stable IDs.
   - v. `react-hooks` v5 new rules — fix mutation patterns, ref-during-render, double-renders.
   - vi. `import-x/no-cycle` — break circular deps via reorganisation.
   - vii. `import-x/no-default-export` — convert remaining default exports to named.
7. Add CI step: `pnpm lint:strict` runs on PRs (gate merge).
8. Verify clean. Post-mortem.

### Phase 3 — Tier 3

1. Install `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`.
2. Wire `package.json` `scripts.prepare = "husky"`.
3. Add `.husky/pre-commit` running `pnpm lint-staged`.
4. Add `.husky/commit-msg` running `pnpm commitlint --edit $1`.
5. Add `.vscode/settings.json` workspace config (cva regex + tailwind lint settings).
6. Add CI prebuild Tailwind check step.
7. Author custom in-house ESLint rules in `packages/eslint-plugin-axion-custom/` (or inline in flat config):
   - `enforce-server-action-async-only` (highest ROI — eliminates a known recurring bomb).
   - `enforce-token-usage` (mirrors `token-fix.ts` rule list).
   - `no-hover-only-controls` (touch a11y).
   - `enforce-ui-primitives` (raw `<table>` / `<input type="checkbox">` → shadcn).
   - `no-dynamic-functions-in-pages` (port from channels).
8. Update `CLAUDE.md`:
   - Protected-directory list (TBD: which axion paths are off-limits to agents?).
   - PR template with WCAG checklist + Session Prompts collapsible.
   - Design-system token rules section.
9. Verify each custom rule with at least one passing + one failing test fixture in `packages/eslint-plugin-axion-custom/tests/`.
10. Run full lint pass. Post-mortem documenting custom-rule rationale + first-week catch counts.

### Roll-back plan

Each tier is a separate PR. If Tier 2 surfaces a backlog too large for one sprint, freeze rules at `warn`, ship, then escalate to `error` per cluster after backlog is cleared.

---

## Cross-references

- `docs/scans/2026-05-07-cockpit-tokens.md` — original token-scan post-mortem
- `scripts/token-fix.ts` — declarative invalid-token rewriter (already shipping)
- `eslint.config.mjs` — current flat config (only `@eslint/js` + `typescript-eslint` + `eslint-plugin-better-tailwindcss`)
- `~/.claude/memory.md` § Axion Anti-Pattern Catalog — bug-class detectors

---

## Open questions for Ygor

- Which axion paths should be **agent-protected** (matching channels' `cart/{shelf,cart}` pattern)? Candidates: `src/db/migrations/`, `src/lib/tax/recompute-month.ts`, anything cryptographic.
- Should `pnpm lint:strict` block CI on warnings or only errors? Channels uses warn-only as a phase-in; services uses error-from-day-one.
- Is there appetite for `commitlint`? Adds friction to ad-hoc commits; trade-off is a clean changelog.
- PR target convention — does axion follow services' "always staging" or main-direct?
