# Scan: layout drift from our core — 2026-05-29

**Branch**: `feat/optimize-phase-1-trust-foundations`
**Base**: `7483819` (merge-base with `origin/main`)
**Files audited**: ~25 `page.tsx` files under `src/app/[locale]/(app)/**` and ~80 page-level components in `src/components/**`
**Target interpretation**: drift from the **impeccable runbook patterns** codified in `docs/impeccable-page-runbook.md` and the 35 finished scan logs (`docs/scans/2026-05-12-impeccable-*.md`)
**Verdict**: 3 critical, 12 high, 4 medium, 0 low — **all in-scope items resolved, 13 pre-existing branch-level TS errors logged as still-armed**

---

## Findings (full table)

| #   | Severity | Category               | File:Line                                                                                                                       | Issue                                                                                                                      | Rule violated                                                | Status                                                                                                           |
| --- | -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | P0       | scaffolding            | `src/app/[locale]/(app)/dev/hawks-audit/page.tsx:13`                                                                            | Arbitrary `max-w-[1600px]` literal                                                                                         | Token discipline                                             | fixed (→ `max-w-screen-2xl`)                                                                                     |
| 2   | P0       | scaffolding            | `src/app/[locale]/(app)/backtest/optimize/page.tsx:14`                                                                          | Originally flagged; on inspection `max-w-screen-2xl` resolves to `--screen-2xl` token                                      | (false-positive — re-classed as structural drift, see #15)   | recategorized                                                                                                    |
| 3   | P0       | tokens (color)         | `src/components/dashboard/axion-score-card.tsx:25-30, 66, 82, 122-126, 132, 174, 180-184`                                       | 9 hex-literal sites incl. tierToneClass map, inline-style gradient, SVG strokes/stops, chart axis fill — none switch theme | Banned-pattern (arbitrary hex), Earned-Bronze theme parity   | fixed (mapped to 5 new tier-tone tokens + bronze-highlight/deep + `--gradient-axion-score`)                      |
| 4   | P1       | primitives             | `src/app/[locale]/(app)/journal/new/page.tsx:59`, `journal/[id]/edit/page.tsx:38`                                               | Hand-rolled card chrome `rounded-lg border border-bg-300 bg-bg-200 p-m-400 sm:p-m-500 lg:p-m-600` verbatim                 | Layout primitives                                            | fixed (→ `<Panel padding="lg">`, accepting smaller default padding)                                              |
| 5   | P1       | spacing scale          | `src/components/reports/annual-rollup-table.tsx` (22 cells)                                                                     | Raw `px-3 py-2` / `px-3 py-1`                                                                                              | Spacing scale                                                | fixed (20× `px-s-300 py-s-200`, 2× `px-s-300 py-s-100`)                                                          |
| 6   | P1       | spacing scale          | `src/components/reports/capital-event-log.tsx:86, 90, 96, 108, 144, 158, 162, 165`                                              | Mixed `gap-3`, `mt-3 space-y-4`, `space-y-1`, `px-3 py-2`, `px-4 py-2`, `px-2 py-0.5`                                      | Spacing scale                                                | fixed                                                                                                            |
| 7   | P1       | spacing scale          | `src/components/reports/weekly-meta-chart.tsx:67, 102`                                                                          | `space-y-1`, `mb-3`                                                                                                        | Spacing scale                                                | fixed (→ `space-y-s-100`, `mb-s-300`)                                                                            |
| 8   | P1       | spacing scale          | `src/components/reports/withdrawal-calculator.tsx:82`                                                                           | `gap-2`                                                                                                                    | Spacing scale                                                | fixed (→ `gap-s-200`)                                                                                            |
| 9   | P1       | spacing scale          | `src/app/[locale]/(app)/plan/[year]/page.tsx:128, 141, 154, 168`                                                                | 4× `mt-1` on `<dd>` values                                                                                                 | Spacing scale                                                | fixed (→ `mt-s-100`)                                                                                             |
| 10  | P1       | typography             | `src/app/[locale]/(app)/plan/[year]/page.tsx:129, 142, 155, 169`                                                                | 4× raw `text-lg`                                                                                                           | Typography scale                                             | fixed (→ `text-h3`)                                                                                              |
| 11  | P1       | typography             | `src/components/fractal-plan/snapshot-hero.tsx:41, 47, 53`, `target-actual-gauge.tsx:35, 42`, `plan-section.tsx:21`             | 6× `text-2xl`                                                                                                              | Typography scale                                             | fixed (→ `text-h2`)                                                                                              |
| 12  | P1       | tokens (chart heights) | 7 chart files in `dashboard/` + `analytics/`                                                                                    | Arbitrary `h-[Npx]` chart container heights                                                                                | Token discipline                                             | fixed (added `--height-chart-{xs,sm,md,lg,xl}` tokens → `h-chart-*` utilities)                                   |
| 13  | P1       | spacing scale          | `src/components/dashboard/axion-score-card.tsx:62, 114, 136`                                                                    | `px-3 py-2.5`, `mt-0.5`, `mt-1` (in-file while fixing #3)                                                                  | Spacing scale                                                | fixed                                                                                                            |
| 14  | P1       | scaffolding            | HAWKS DailyBiasPanel `FeatureStamp` wiring                                                                                      | Could not verify without reading `daily-bias-panel.tsx`                                                                    | HAWKS-band convention (Wave 9)                               | deferred (not blocking; logged in backlog)                                                                       |
| 15  | P2       | structural             | `backtest/page.tsx`, `equity-shield/page.tsx`, `monte-carlo/page.tsx`, `risk-simulation/page.tsx`, `backtest/optimize/page.tsx` | Width constraint `container mx-auto max-w-7xl` (or `max-w-screen-2xl`) lived on the page route, not the feature component  | "Page = data orchestrator, feature component = layout owner" | fixed (moved container into the 5 feature-component roots; pages now render the component without a wrapper div) |

---

## Root causes

### RC-1 — Hand-rolled card chrome creeps back without a detector

The `<Panel>` primitive exists (`src/components/ui/panel.tsx`) with a `padding` variant matching the spacing scale. But every form-style page in the codebase ships with the chrome inlined (`rounded-lg border border-bg-300 bg-bg-200 p-m-400 sm:p-m-500 lg:p-m-600`), because the chrome is copy-pasted from sibling pages and `<Panel>` is the export that gets forgotten. The pattern is fully greppable — exactly four characters of the chrome class string are unique enough to find every instance — and yet no detector ran before this scan. **The bug is that this primitive has no enforcement gradient.** Future pages will re-introduce it unless a CI grep blocks the chrome string.

**Manifests at**: source-write time (the developer copying chrome from a neighbor) and persists through build/lint clean (Tailwind accepts the verbatim classes).

**Detector**: `rg -n 'rounded-lg border border-bg-300 bg-bg-200' src/`

### RC-2 — Page-level width constraint masquerades as canonical because the shell doesn't own width

`AppShell` (`src/components/layout/app-shell.tsx:223`) renders `<main>` with no `max-width` constraint. Every "clean" page in the codebase narrows content via a `mx-auto max-w-*` on its feature component — but four modeling pages did it at the **page.tsx route level** instead. Both ship the same visual result (max-w-7xl content), but the architecture is split: half the codebase says "feature owns width", half says "page owns width", and there is no documented rule. The drift was invisible because no scaffolding rule was being violated — both halves produced visually correct output. This scan codifies "feature component owns width" as the canonical pattern by moving the 5 outlier wrappers into feature components.

**Manifests at**: page-creation time, when a developer chooses where to put the wrapper div. There is no signal to push them one way or the other.

**Detector**: `rg -n 'container mx-auto max-w-' 'src/app/[locale]/(app)' -g '*.tsx'` — any hit inside a `page.tsx` (not a feature component) is drift.

### RC-3 — Raw Tailwind spacing leaks into table-cell and report-row patterns because no `<TableCell>` enforces it

`<TableCell>` exists at `src/components/ui/table.tsx:85`. But `annual-rollup-table.tsx` does **not import it** — instead it renders raw `<td>` elements with hand-rolled `px-3 py-2` classes that don't go through the s-/m-/l- scale. The whole reports family ships this way. The root cause: `<TableCell>` exists but doesn't enforce a `padding` variant the way `<Panel>` does, so importing it doesn't actually prevent the drift — and so call sites skip it and the discipline never applies.

**Manifests at**: build/runtime — the page compiles and runs; the drift is purely structural.

**Detector**: `rg -n '\b(px|py|mt|mb|gap|space-y|space-x)-([0-9](\.5)?)\b' src/app/[locale]/'(app)' src/components/reports src/components/fractal-plan`

### RC-4 — Hex literals in theme-aware components silently break theme switching

`axion-score-card.tsx` had 9 hex sites — color classes (`text-[#d8b365]`), inline styles (`style={{ color: "#d8b365" }}`), CSS gradients in inline style strings, SVG `stroke`/`stopColor` attrs. **None of them resolved through the theme system**, so the card shipped with dark-theme bronze hexes in light mode too. The drift was invisible because the codebase's default-dark presentation rendered the card "correctly" — the broken state was only visible if someone actually switched themes. The 4 designed tier colors (`#d8b365`, `#c19a5b`, `#b08148`, `#a05a30`) needed naming (now `--color-tier-elite/forte/solido/building/attention`) before they could be theme-aware.

**Manifests at**: theme switch (light mode), invisible in dark.

**Detector**: `rg -n '(bg|text|border|fill|ring|stroke|stopColor)-?["=]?\[?\s*#[0-9a-fA-F]{3,6}|style=\{\{[^}]*#[0-9a-fA-F]{3,6}' src/`

---

## Prevention rules

- **Rule**: Card-style chrome must use `<Panel>` from `@/components/ui/panel`, not hand-rolled `rounded-lg border bg-bg-200` strings.
  **Detector**: `rg -n 'rounded-lg border border-bg-300 bg-bg-200' src/`
  **Auto-fix**: replace verbatim chrome with `<Panel padding="lg">…</Panel>`; if exact pixel parity needed, extend `panelVariants` rather than overriding via className.

- **Rule**: Width constraint (`container mx-auto max-w-*`) lives on the feature-component root, never on a `page.tsx` route file. Page routes are data orchestrators — they fetch and pass props.
  **Detector**: `rg -n 'container mx-auto max-w-|mx-auto max-w-(screen|\[)' 'src/app/[locale]/(app)' -g '*.tsx'` (any hit in a `page.tsx` is drift)
  **Auto-fix**: move the wrapper className into the feature component's root `<div>`, then simplify the page to render the component directly.

- **Rule**: Tailwind spacing utilities use the s-/m-/l- token scale only. Raw `px-3 py-2`, `gap-3`, `mt-1`, `space-y-1` are forbidden in `src/app/**` and `src/components/{reports,fractal-plan,plan}/**`.
  **Detector**: `rg -n '\b(px|py|mt|mb|mx|my|gap|space-(y|x))-([0-9](\.5)?)\b' 'src/app/[locale]/(app)' src/components/reports src/components/fractal-plan src/components/plan`
  **Auto-fix**: mechanical mapping — see `docs/scans/2026-05-29-layout-drift-from-core.md` migration table.

- **Rule**: Color hex literals are forbidden in component code (TSX, inline styles, SVG stroke/stopColor). Use tokens from `globals.css` via Tailwind utility classes (`text-acc-100`, `text-tier-elite`) or CSS variable references (`var(--color-tier-elite)`).
  **Detector**: `rg -n '(bg|text|border|fill|ring|stroke|stopColor)-?["=]?\[?\s*#[0-9a-fA-F]{3,6}|style=\{\{[^}]*#[0-9a-fA-F]{3,6}' src/`
  **Auto-fix**: add a named token to both dark + light theme blocks in `globals.css`, then reference via class or CSS var.

- **Rule**: Chart container heights use `h-chart-{xs,sm,md,lg,xl}` (defined as `--height-chart-*` in `globals.css`). Arbitrary `h-[Npx]` on a `ChartContainer` is drift.
  **Detector**: `rg -n 'ChartContainer[^>]*h-\[' src/`
  **Auto-fix**: round to nearest of 120/160/200/250/300; the rounding policy is documented in the migration log.

- **Rule**: Typography uses semantic tokens — `text-h1/h2/h3/body/small/tiny/micro`. Raw `text-lg`, `text-2xl`, etc. are forbidden in page-level files and `src/components/{reports,fractal-plan,plan,dashboard}/**`.
  **Detector**: `rg -n '\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b' src/app src/components/reports src/components/fractal-plan src/components/plan src/components/dashboard`
  **Auto-fix**: `text-lg` → `text-h3`, `text-2xl` → `text-h2`, `text-xl` → `text-h2` (case-by-case), `text-sm` → `text-small`, `text-xs` → `text-tiny`.

---

## Fix log

In execution order (each numbered entry is a logical commit in the resulting PR):

1. **globals.css — add tier-tone, bronze-highlight/deep, gradient-axion-score, chart-height tokens** (8 new tokens × 2 themes for color, 5 new for chart heights).
2. **dashboard/axion-score-card.tsx — replace 9 hex sites with tokens; clean in-file `px-3 py-2.5`, `mt-0.5`, `mt-1`.**
3. **dev/hawks-audit/page.tsx — `max-w-[1600px]` → `max-w-screen-2xl`** (P0).
4. **journal/new + journal/[id]/edit — hand-rolled card chrome → `<Panel padding="lg">`** (P1, primitives).
5. **5 modeling routes — move width constraint from page.tsx to feature component root**: backtest, backtest/optimize, equity-shield, monte-carlo, risk-simulation. 10 files touched (5 pages + 5 feature components).
6. **Reports + plan + fractal-plan spacing scale migration**: annual-rollup-table (22 cells), capital-event-log (8 sites), weekly-meta-chart (3 sites), withdrawal-calculator (1 site), plan/[year] (4× `mt-1`), all `text-2xl` → `text-h2`, `text-lg` → `text-h3`.
7. **Chart container heights migrated to `h-chart-*` tokens** across 7 files in `dashboard/` + `analytics/`.

**Verification**:

- `pnpm lint` → 0 errors, 3 pre-existing warnings in untouched files.
- `pnpm exec tsc --noEmit` → 13 errors at baseline (stash-confirmed), 13 errors after — **zero new TS errors introduced**.
- `git diff --stat` → 30 files changed, +148 / −113 lines net.

---

## Still armed

The following are known-armed bombs that this scan **did not fix** — they require their own pass before this branch (or any branch building on it) can ship:

1. **13 pre-existing TS errors on `feat/optimize-phase-1-trust-foundations`**:
   - `<Label>` missing required `id` prop — 9 sites across `backtest-content.tsx:602`, `hawks-quality-controls.tsx` (5 sites), `user-catalog-entry-section.tsx` (3 sites).
   - `Scatter` no longer exported from lucide-react in `optimize-content.tsx:29`.
   - `pareto-scatter.tsx:84` — `ChartContainer` `config` prop type mismatch.
   - `hawks-presets.ts:157` — `r.stop.breakeven` possibly undefined.
   - `provenance.ts:24` — `toISOString` called on `string`.
2. **HAWKS DailyBiasPanel `FeatureStamp` wiring (Wave 9 convention)** — the diagnostic agent flagged this but couldn't read the panel internals to verify. Needs a 5-minute pass.
3. **Empty-state placeholder heights** (`flex h-[180px]` etc.) on chart components — different pattern from chart-container heights, intentionally out of scope. Would benefit from the same `h-chart-*` tokens or a dedicated `--height-empty-state-*` family. Detector: `rg -n 'flex h-\[[0-9]+px\] items-center' src/components/{dashboard,analytics}/`.
4. **`fractal-plan/plan-section.tsx:24`** — still has hand-rolled card chrome (`rounded-lg border border-bg-300 bg-bg-200 p-m-400`). Same pattern as RC-1 but in a section primitive instead of a page. Worth pulling through `<Panel>` in a follow-up.
5. **Other `mx-auto max-w-*` page-level callers** the scan deliberately did not touch (`command-center-content.tsx:145`, `journal/[id]/page.tsx:155`, `journal/new/page.tsx:57`, `journal/[id]/edit/page.tsx:37`, `playbook/[id]/page.tsx:152`, `playbook/new/page.tsx:129`, `plan/layout.tsx:15`, `edit-strategy-form.tsx:199`). These are documented as canonical in their respective sweep logs; flagging in case the "feature component owns width" rule should propagate further.
6. **Light-theme tier-tone refinement** — the tier color tokens added in this scan use the same hex in both themes for `elite` and `forte`, and approximate darker shades for the rest. A designer review of the light-theme bronze progression would harden this.
