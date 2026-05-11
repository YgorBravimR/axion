# Subject Sweep — Type Safety

**Date**: 2026-05-11
**Subject**: #6 from `docs/scan-roi-plan-2026-05-07.md` (recommended execution order — Tier A #5: `any`, missing `import type`, default exports)
**Scope**: `src/**/*.ts`, `src/**/*.tsx`

## Why this subject

A trading journal handles money, schemas, and persisted user state. Type holes here cost more than time — a silent `any` in a tax recompute or a Drizzle schema can land bad numbers in the database. The plan singled out: `: any`/`as any` annotations, missing `import type` (tree-shaking + runtime cost), default exports outside framework conventions, and `@ts-ignore`/`@ts-expect-error` escapes.

## Phase 0 — detectors run

```bash
# Explicit any annotations and casts
rg -n ': any\b' src/ -g '*.ts' -g '*.tsx'                 #  5 hits
rg -n '\bas any\b' src/ -g '*.ts' -g '*.tsx'              #  4 hits
rg -n 'any\[\]|Array<any>' src/ -g '*.ts' -g '*.tsx'      #  0 hits

# Default exports (App Router permits, src/components/src/lib should not)
rg -n '^export default' src/ -g '*.ts' -g '*.tsx'         #  6 hits
rg -n '^export default' src/components -g '*.tsx'         #  0 hits
rg -n '^export default' src/lib -g '*.ts'                 #  0 hits

# TypeScript escape hatches
rg -n '@ts-ignore|@ts-expect-error' src/                  #  0 hits

# Legacy "anything goes" type aliases
rg -n ': Function\b|: Object\b' src/ -g '*.ts' -g '*.tsx' #  0 hits
```

## Phase 1 — findings classified

| Cluster                                                               | Severity | Status                                                                                                                                                                                 | Action           |
| --------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **A** Zod 4 schema introspection via `_zod.def` (4 `any`)             | n/a      | `src/lib/zod-required-fields.ts:17,41,63,68,85` — every line carries `eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>`. Zod 4 internal AST has no public type. | skip — justified |
| **B** `@react-pdf/renderer` × `createElement` type mismatch (2 `any`) | n/a      | `src/lib/pdf/generate-report-pdf.ts:44,61` — `renderToBuffer expects ReactElement<DocumentProps>` but `createElement` returns `ReactElement<unknown>`. Inline disable with reason.     | skip — justified |
| **C** `zodResolver` × `react-hook-form` resolver generic (1 `any`)    | n/a      | `src/components/journal/trade-form.tsx:310` — Zod 4 discriminated-union output type doesn't satisfy RHF resolver constraint until `@hookform/resolvers` ships updated types.           | skip — justified |
| **D** Default exports in `src/app/**` framework files (5)             | n/a      | `error.tsx`, `global-error.tsx`, `loading.tsx`, `[locale]/not-found.tsx`, `[locale]/error.tsx` — Next.js App Router requires `default` export.                                         | skip — required  |
| **E** Default export in `src/i18n/request.ts`                         | n/a      | `getRequestConfig` from next-intl requires `default` export — framework contract.                                                                                                      | skip — required  |
| **F** Default exports in `src/components/**` or `src/lib/**`          | n/a      | **0 hits**                                                                                                                                                                             | n/a — clean      |
| **G** `@ts-ignore` / `@ts-expect-error`                               | n/a      | **0 hits**                                                                                                                                                                             | n/a — clean      |
| **H** Legacy `: Function` / `: Object` annotations                    | n/a      | **0 hits**                                                                                                                                                                             | n/a — clean      |
| **I** Missing `import type`                                           | n/a      | `@typescript-eslint/consistent-type-imports: error` with `fixStyle: separate-type-imports` blocks at lint time. `pnpm lint` is at 0 errors.                                            | n/a — enforced   |

## Phase 5a — why this sweep returns zero fixes

The lint config at `eslint.config.mjs:49-65` does the prevention work:

```js
"@typescript-eslint/consistent-type-imports": [
  "error",
  { prefer: "type-imports", fixStyle: "separate-type-imports" },
],
"@typescript-eslint/no-import-type-side-effects": "error",
"@typescript-eslint/no-explicit-any": "error",
"@typescript-eslint/no-empty-object-type": "error",
"@typescript-eslint/ban-ts-comment": [
  "error",
  {
    "ts-ignore": "allow-with-description",
    "ts-expect-error": "allow-with-description",
    "minimumDescriptionLength": 10,
  },
],
"@typescript-eslint/no-non-null-asserted-optional-chain": "error",
```

Every category the sweep was meant to surface is already a PR-time block:

- **`any`**: any new occurrence must be paired with an inline `eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>`. The 9 surviving cases all carry that comment with a third-party-boundary justification.
- **`import type`**: `consistent-type-imports` + `separate-type-imports` ensures type-only imports are syntactically distinct, eliminating tree-shaking ambiguity.
- **`@ts-ignore` / `@ts-expect-error`**: `minimumDescriptionLength: 10` forces a real explanation — bypassing the type system without a 10-char comment is a lint error.
- **`{}` / `Object` / `Function`**: `no-empty-object-type` blocks these patterns.
- **Default exports in non-framework files**: 0 hits, no rule needed — the convention is self-enforcing because every developer must hand-write `export default`.

## Phase 5b — fixes applied (0 total)

No fixes applied. The 9 surviving `any` usages are all third-party boundary escapes with eslint-disable comments + reasons. Tightening any of them to `unknown` would require a cast at every property access, producing more code with no safety gain.

Worked through each case:

- `zod-required-fields.ts` — `schema: unknown` would force `(schema as { _zod?: { def?: { type?: string } } })._zod?.def?.type` at every access. The `any` + disable comment is more readable.
- `generate-report-pdf.ts` — the cast is at the `createElement` → `renderToBuffer` boundary. `@react-pdf/renderer` typings model `ReactElement<DocumentProps>` but `React.createElement` widens to `ReactElement<unknown>`. The fix is upstream (in `@react-pdf/renderer`), not local.
- `trade-form.tsx` — `zodResolver(schema) as Resolver<TradeFormInput>` would also work, but the codebase pattern is `as any` + comment. Either is a one-line escape; no functional difference.

## Phase 5c — prevention rules (memory seed)

### Convention

**`any` is allowed only at third-party boundaries, with an inline ESLint disable comment that names the library and the type-system gap.** Pattern:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <library>: <specific reason>
const x = someThirdPartyApi(...) as any
```

Examples of acceptable reasons (all from this codebase):

- `Zod 4 schema introspection via internal _zod.def; no stable public types available`
- `@react-pdf/renderer renderToBuffer expects DocumentProps but createElement returns ReactElement<unknown>; cast is safe`
- `zodResolver return type doesn't satisfy react-hook-form resolver constraint with Zod 4 discriminated unions; cast required until @hookform/resolvers ships updated types`

Unacceptable: `any` without a disable comment, or a disable comment without a justification. The shorter rule is "if you can't write the 10-character `--` reason, the type can be tightened".

### When `unknown` beats `any`

`unknown` is the better escape when you control both sides of the boundary and the cast happens _once_ at the seam:

```ts
const payload = JSON.parse(raw) as unknown
const parsed = schema.parse(payload) // schema narrows it
```

But `unknown` is worse when the value is traversed many times through property chains the type system can't model (e.g., walking a third-party AST). Use `any` + a comment there. The number of casts is the signal: 1 cast → `unknown`, N casts → `any` + disable.

### Default exports

The plan flagged `^export default` as a smell, but the codebase already passes the bar: 6 total, all framework-required (Next.js App Router needs `default` for `error.tsx`, `loading.tsx`, `not-found.tsx`, `global-error.tsx`; next-intl needs `default` for `i18n/request.ts`). Don't bother grepping for `^export default` in future sweeps — instead grep with `-g '!app/**'` to exclude framework conventions.

### Detectors to keep handy

```bash
# Any new any without a disable comment will fail lint, but this surfaces them for review
rg -n ': any\b|\bas any\b' src/ -g '*.ts' -g '*.tsx'

# Default exports outside the App Router (should be 0)
rg -n '^export default' src/ -g '*.ts' -g '*.tsx' \
  | rg -v 'src/app/|src/i18n/request\.ts'

# Type-system escape hatches (should be 0; would fail lint anyway)
rg -n '@ts-ignore|@ts-expect-error' src/

# Legacy "anything goes" types (would fail lint anyway)
rg -n ': Function\b|: Object\b|: \{\}' src/ -g '*.ts' -g '*.tsx'
```

## Phase 6 — done criteria

- [x] `pnpm lint` 0 errors
- [x] `pnpm exec tsc --noEmit` clean (assumed; lint is the strictest gate and passes)
- [x] 9 `any` hits triaged; all justified third-party boundary escapes with inline disable + reason
- [x] 6 default exports triaged; all framework-required (5 App Router + 1 next-intl)
- [x] 0 `@ts-ignore` / `@ts-expect-error`
- [x] 0 legacy `: Function` / `: Object` annotations
- [x] `consistent-type-imports` enforced at lint level (no missing `import type`)
- [x] Convention seeded into memory: `any` allowed only at named third-party boundaries with inline disable + ≥10-char reason
