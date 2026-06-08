# Scan: Hard-Coded Colors / Brand-Token Drift — 2026-06-02

**Branch**: `feat/optimize-phase-1-trust-foundations`
**Base**: `main`
**Files audited**: `src/**/*.{ts,tsx}` (excluding `globals.css`, `eslint-rules/`, `docs/`)
**Verdict**: 1 high · 4 medium · 4 low · 11 legitimate exceptions (no action)

This is a **drift sweep** following [`2026-05-11-theming-tokens.md`](./2026-05-11-theming-tokens.md), which cleaned bulk violations and added the `axion/enforce-token-usage` ESLint rule. Findings here are either things the linter doesn't catch (semantic-not-lexical) or files exempt from the linter (data, email, error pages).

## Findings (full table)

| #   | Severity | Category           | File:Line                                                                                                           | Issue                                                                                                     | Rule violated                                                                                                           | Status  |
| --- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | High     | wrong-token        | `optimize/pareto-scatter.tsx:61`                                                                                    | `var(--color-accent, #6366f1)` — `--color-accent` aliases `bg-300` (muted border), not interactive accent | Semantic: a chart "selection highlight" must use `acc-100`                                                              | fixed   |
| 2   | High     | palette-bypass     | `backtest/sections/user-catalog-entry-section.tsx:192`                                                              | `text-red-500` on error alert                                                                             | Use `text-fb-error`                                                                                                     | fixed   |
| 3   | Medium   | stale-fallback     | `optimize/pareto-scatter.tsx:58, 59, 60`                                                                            | Hex fallbacks on guaranteed-defined vars (`#34d399`, `#fbbf24`)                                           | Don't pair `var()` with hex fallbacks for in-system tokens                                                              | fixed   |
| 4   | Medium   | brand-light-fail   | `optimize/pareto-scatter.tsx:373, 395, 429, 440, 452, 549`                                                          | `text-white` on `bg-accent` (= `bg-300`) → low contrast in light themes                                   | Use theme-aware `text-txt-100`                                                                                          | fixed   |
| 5   | Medium   | hardcoded-fallback | `settings/tag-list.tsx:228`                                                                                         | `tag.color ?? "#6B7280"` — fallback doesn't theme-switch                                                  | Use `"var(--color-txt-300)"`                                                                                            | fixed   |
| 6   | Low      | inline-rgb         | `dev/hawks-audit-inspector.tsx:466, 485`                                                                            | `color: "rgb(234, 179, 8)"` / `"rgb(96, 165, 250)"`                                                       | Use `var(--color-warning)` / `var(--color-acc-200)`                                                                     | fixed   |
| 7   | Low      | shimmer-white      | `ui/loading-overlay.tsx:161`                                                                                        | `via-white/25` in progress shimmer                                                                        | `via-txt-100/25` for theme-aware shimmer                                                                                | fixed   |
| 8   | Low      | shadcn-overlay     | `ui/dialog.tsx:25`, `ui/sheet.tsx:26`, `ui/alert-dialog.tsx:39`                                                     | `bg-black/80` modal scrim                                                                                 | Modal scrims are conventionally always dark across themes (Material, iOS, Bootstrap) — UX consistency overrides theming | wontfix |
| 9   | Low      | icon-overlay       | `ui/color-picker.tsx:258`                                                                                           | `text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]` on pipette                                           | Icon sits over arbitrary user-picked color — white + shadow is correct regardless of theme                              | wontfix |
| L1  | n/a      | legit-data         | `db/seed-user-data.ts` (8 hex), `settings/tag-form.tsx:32-39` (8 hex), `settings/brand-switcher.tsx:17-25` (16 hex) | Hex is **data**, not styling (DB seed values, user-selectable presets, brand preview swatches)            | —                                                                                                                       | legit   |
| L2  | n/a      | legit-constrained  | `lib/email-templates.ts` (~30 hex)                                                                                  | Email clients strip CSS vars — must be inline hex                                                         | —                                                                                                                       | legit   |
| L3  | n/a      | legit-constrained  | `app/global-error.tsx` (38 inline rgb)                                                                              | Next.js global-error must be self-contained — no access to project CSS                                    | —                                                                                                                       | legit   |
| L4  | n/a      | legit-input        | `ui/color-picker.tsx:127, 294`                                                                                      | Component edits hex strings — `#000000` initial state and `#FF5733` placeholder are data                  | —                                                                                                                       | legit   |
| L5  | n/a      | comment            | `optimize/pareto-scatter.tsx:72-74`                                                                                 | `// rgb(...) ≈ #...` documents `qualityFill()` interpolation anchors                                      | —                                                                                                                       | legit   |
| L6  | n/a      | false-positive     | `journal/csv-import.tsx:619`                                                                                        | `&#8599;` (HTML ↗ arrow entity) matched the hex regex                                                     | —                                                                                                                       | legit   |

## Root causes

### Root cause A — `bg-accent` ≠ accent (shadcn alias surprise)

Tailwind v4 generates the `bg-accent` utility from `--color-accent`. shadcn-ui's CSS-var convention sets `--color-accent` to a _muted surface_ (axion: aliased to `--color-bg-300`). The name "accent" implies "primary interactive highlight" but the token resolves to "subtle inset surface". Every site that reads `bg-accent` as "show the brand color" is silently wrong.

Cascading consequence: `text-white` was paired with `bg-accent` for active toggle states. In dark mode this happens to look right (white on `#272a2e`). In light mode it breaks (white on `#cdced2` — ~2.4:1 contrast, fails WCAG AA).

**When it manifests**: render time, but only visible if the user toggles a brand light theme. Dev usually tests dark first.

**Anti-pattern signature**: `bg-accent` paired with literal `text-white`/`text-black`.

### Root cause B — `var(--token, #hex)` fallbacks rot

`var(--color-accent, #6366f1)` looks defensive but is harmful: the hex shadows the wrong-named token bug (var doesn't exist? Hex paints anyway, no error). It also drifts — the design system updates `#34d399` to `#5dd29e`, but the file still ships the old hex as a "fallback" that's reachable in any future state where the var becomes undefined.

For tokens defined in `@theme` (always present in every brand block), the fallback is dead code that hides authoring bugs.

**Anti-pattern signature**: `var(--color-` followed by `, #` inside string literal.

### Root cause C — linter is class-scoped; inline `style` slips through

`axion/enforce-token-usage` and `better-tailwindcss/no-unknown-classes` operate on Tailwind class strings. Inline `style={{ color: "rgb(...)" }}` and `style={{ backgroundColor: "#..." }}` are invisible to them. The `hawks-audit-inspector` and `tag-list` violations are exactly this gap.

**When it manifests**: write time. Silent — no lint warning.

**Anti-pattern signature**: `style={{ (color|backgroundColor|borderColor|fill|stroke): "(#|rgb|hsl)` (excluding files in `email-templates.ts`, `global-error.tsx`).

## Prevention rules

- **Rule**: Don't pair `text-white`/`text-black` with `bg-accent`, `bg-acc-*`, `bg-trade-*`, `bg-fb-*`. Use a theme-aware text token (`text-txt-100`) or introduce a `--color-on-<surface>` semantic token if true on-color text differs from primary.
  **Detector**: `rg -n 'bg-(accent|acc-[12]00|trade-(buy|sell|profit|loss|win|lose)|fb-(error|success)|warning).*text-(white|black)|text-(white|black).*bg-(accent|acc-[12]00|trade-|fb-|warning)' src/ -g '*.tsx'`
  **Auto-fix**: manual (depends on intended foreground)

- **Rule**: Don't write `var(--color-X, #hex)` for tokens defined in `@theme`. The hex is dead code that hides typos.
  **Detector**: `rg -n 'var\(--color-[a-z0-9-]+,\s*#[0-9a-fA-F]' src/ -g '*.ts' -g '*.tsx'`
  **Auto-fix**: manual (drop fallback; verify var name)

- **Rule**: No raw colors in inline `style`. Use `var(--color-X)` strings if dynamic, or move to a class.
  **Detector**: `rg -n "style=\{\{[^}]*(color|background(Color)?|borderColor|fill|stroke):\s*['\"](#|rgb|hsl)" src/ -g '*.tsx' -g '*.ts' --glob '!**/email-templates.ts' --glob '!**/global-error.tsx'`
  **Auto-fix**: manual

- **Rule**: `--color-accent` is **not** the brand accent in this codebase — it's aliased to `bg-300` for shadcn compat. Use `--color-acc-100` / `--color-acc-200` for interactive highlights.
  **Detector**: `rg -n '\bvar\(--color-accent\b|\bbg-accent\b' src/ -g '*.tsx'`
  **Auto-fix**: contextual — review each use; rename to `acc-100` for highlights, leave for muted surfaces.

## Fix log

Single commit (proposed): `fix(theme): clear color-token drift — palette bypass, wrong --color-accent ref, brand-light contrast`

Files (in order applied):

1. `src/components/optimize/pareto-scatter.tsx` — dropped hex fallbacks (3×), fixed `--color-accent` → `--color-acc-100`, `text-white` → `text-txt-100` (6×).
2. `src/components/backtest/sections/user-catalog-entry-section.tsx` — `text-red-500` → `text-fb-error`.
3. `src/components/settings/tag-list.tsx` — `"#6B7280"` → `"var(--color-txt-300)"`.
4. `src/components/dev/hawks-audit-inspector.tsx` — 2× `rgb(...)` → semantic vars.
5. `src/components/ui/loading-overlay.tsx` — `via-white/25` → `via-txt-100/25`.

Verification: `pnpm exec tsc --noEmit` ✓; post-fix detectors return 0 hits in `src/components/**`.

## Still armed

- **Modal scrim convention** (`bg-black/80` in `dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx`) — deferred as `wontfix`. If a future brand needs an inverted scrim, introduce a `--color-overlay-scrim` token instead of editing 3 shadcn files.
- **Color picker pipette** (`text-white` + arbitrary `rgba` shadow) — deferred. White-on-arbitrary is correct here; only revisit if accessibility audit reports a specific failure.
- **Brand light themes**: only the pareto-scatter chart was audited for `text-white`-on-colored-bg contrast. Other surfaces using `bg-trade-*` / `bg-fb-*` with `text-white` (none found in this scan) could exist in routes not yet audited. Re-run detector after each new chart/visualization is added.
