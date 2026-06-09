# Scan: Responsive Layout Drift (mobile + mid-screen) — 2026-06-09

**Branch**: `scan-responsive-layout-drift-mobile-and-tablet`
**Base**: `origin/main` (`558a7697`)
**Trigger**: `/scan for layout drifts on responsiveness, where mobile or mid screen size is not correct`
**Files audited**: ~290 source files across 6 route clusters
**Files modified**: 40
**Diff size**: +158 / -131 lines
**Verdict**: 13 critical fixed · ~31 high fixed · ~25 medium fixed · ~10 medium/low **deferred** (i18n server-action class) · 1 incident logged

---

## Scope and method

The scan covered every route under `src/app/[locale]/(app)/**` plus the `(auth)` group and the app shell. Cluster split for parallel diagnosis:

- **A**: app shell + auth pages + `src/components/layout/*` + `src/components/auth/*`
- **B**: home dashboard + command-center + `src/components/dashboard/*` + `src/components/command-center/*`
- **C**: journal list/detail/new/edit + `src/components/journal/*`
- **D**: playbook + plan + `src/components/playbook/*` + `src/components/fractal-plan/*`
- **E**: backtest + optimize + monte-carlo + risk-sim + equity-shield + `src/components/{backtest,optimize,monte-carlo,risk-simulation,equity-shield,calculator}/*`
- **F**: analytics + reports + settings + dev + `src/components/{analytics,reports,settings,tax,imports,hawks,dev,bug-report,account-comparison,market,shared}/*`

Diagnose phase: 6 parallel `general-purpose` subagents, each producing a self-contained audit report covering responsive drift + full `/scan` checklist (code conventions, React perf, a11y, theming, design critique, i18n). Fix phase: sequential per cluster to avoid merge conflicts in shared primitives.

---

## Findings — full list

Severity definitions:

- **critical**: broken on a real viewport users hit OR blocks a core flow
- **high**: visible drift OR violates a hard project rule
- **medium**: noticeable but not breaking
- **low**: polish

Categories: `responsive` · `code-conventions` · `react-perf` · `theming` · `i18n` · `a11y` · `design` · `critique`

### Cluster A — Shell + Auth

| #      | Severity        | Category   | File:Line                                           | Issue                                                                                                                                                                                                                                                                                                                                                                         | Status                                                          |
| ------ | --------------- | ---------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| A1     | critical        | responsive | `src/app/[locale]/(auth)/layout.tsx:12`             | `pb-l-900` overlaps fixed mobile footer                                                                                                                                                                                                                                                                                                                                       | **fixed** (`pb-m-400 md:pb-l-900`)                              |
| A2     | critical        | responsive | `src/app/[locale]/(auth)/layout.tsx:21`             | Form stuck at `md:max-w-md`, wastes lg space                                                                                                                                                                                                                                                                                                                                  | **fixed** (`lg:max-w-lg`)                                       |
| A3     | critical        | responsive | `src/components/layout/app-shell.tsx:159,222`       | `pt-14` + `h-[calc(100dvh-3.5rem)]` math mismatched                                                                                                                                                                                                                                                                                                                           | **fixed** (extracted `--app-header-height` token; used `var()`) |
| A4     | critical        | responsive | `src/components/layout/app-shell.tsx:116`           | Mobile drawer hardcoded `w-64` (100% of 320px viewport)                                                                                                                                                                                                                                                                                                                       | **fixed** (`w-full max-w-[16rem] p-0`)                          |
| A5-A16 | high/medium/low | mixed      | sidebar / login-form / account-switcher / user-menu | tooltips on collapsed nav (title attr via `isCompact` conditional), indent flatten (`ml-0 md:ml-m-400`), dialog viewport guard (`max-w-[calc(100vw-2rem)]`), login lg widen (`lg:max-w-lg`), aria-label on expanded user-menu variant, copyright DRY (`src/lib/copyright-year.ts`), icon `aria-hidden`, `initialGroupState` lazy initializer, logo absolute-stacked crossfade | **fixed** (2026-06-09 polish pass, commit pending)              |

### Cluster B — Home + Command Center

| #       | Severity | Category   | File:Line                                                  | Issue                                                                                            | Status                                                    |
| ------- | -------- | ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| B1      | critical | responsive | `src/components/dashboard/kpi-cards.tsx:48`                | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` no `md:`                                             | **fixed** (`md:grid-cols-4`)                              |
| B2      | critical | responsive | `src/components/dashboard/dashboard-content.tsx:328`       | `grid-cols-1 lg:grid-cols-3` no `md:`                                                            | **fixed**                                                 |
| B3      | critical | responsive | `src/components/dashboard/day-summary-stats.tsx:71`        | No `sm:` step before `md:grid-cols-4`                                                            | **fixed** (`sm:grid-cols-3`)                              |
| B4      | critical | responsive | `src/components/command-center/daily-summary-card.tsx:45`  | Asymmetric wrap at md, no `min-w-0`                                                              | **fixed** (responsive text scale + min-w-0)               |
| B5      | critical | responsive | `command-center-tabs.tsx:71`                               | Tabs padding identical mobile/sm                                                                 | **fixed** (`px-s-100 sm:px-s-200`)                        |
| B6      | critical | responsive | `src/components/dashboard/kpi/*.tsx` (via `stat-card.tsx`) | Text doesn't shrink under 375px                                                                  | **fixed** (`text-tiny sm:text-small`)                     |
| B7      | high     | responsive | `equity-curve.tsx:294,325`                                 | `h-48 sm:h-64` no XS fallback                                                                    | **fixed** (`h-32 sm:h-48 md:h-64`)                        |
| B8      | high     | responsive | globals.css chart tokens                                   | Fixed-px chart heights jump at breakpoints                                                       | **fixed** (converted `--height-chart-*` to `clamp()`)     |
| B9      | high     | responsive | `quick-stats.tsx:142`                                      | `grid-cols-2` no responsive prefix                                                               | **fixed** (`grid-cols-1 sm:grid-cols-2`)                  |
| B10     | high     | responsive | `trading-calendar.tsx:209,226`                             | 7-col calendar squashes at 375px                                                                 | **fixed** (`overflow-x-auto md:overflow-visible` wrapper) |
| B11     | high     | responsive | `command-center-content.tsx:145`                           | Max-width without explicit mobile gutter                                                         | **fixed** (`px-s-200 sm:px-m-400`)                        |
| B12–B24 | mixed    | various    | dashboard-content, stat-card, command-center-tabs, others  | gap-padding pairing, perf simplifications, focus rings, scroll-fade indicator, comment additions | **fixed** (10+ small edits)                               |

### Cluster C — Journal

| #   | Severity | Category   | File:Line                        | Issue                                      | Status                                                                  |
| --- | -------- | ---------- | -------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| C1  | critical | responsive | `trade-detail-layout.tsx:117`    | Hardcoded `h-[calc(100dvh-3.5rem)]`        | **fixed** (uses `var(--app-header-height)`)                             |
| C2  | critical | responsive | `journal/[id]/page.tsx:306`      | `grid-cols-2 md:grid-cols-4` no `sm:` step | **fixed** (`sm:grid-cols-3`)                                            |
| C3  | critical | responsive | `new-trade-tabs.tsx:76`          | Flex overflow w/o `min-w-0`                | **fixed** (added `min-w-0` + `shrink-0` on triggers)                    |
| C4  | high     | theming    | `trade-chart-view.tsx:182-183`   | Hardcoded `rgb(...)`                       | **fixed** (`var(--color-action-buy/-sell)`)                             |
| C5  | high     | i18n       | `trade-form.tsx:1141`            | Grade letters hardcoded                    | **skipped** (A/AA/AAA + A/B/C/D/F are standardized terms; conservative) |
| C6  | high     | responsive | `execution-form.tsx:245,289`     | No `md:grid-cols-3`                        | **fixed**                                                               |
| C7  | medium   | a11y       | `trade-row.tsx:87-91`            | Tap targets                                | **verified pass** (size="icon" → 44px)                                  |
| C8  | medium   | react-perf | `journal-content.tsx`            | `getDateRange` unmemo'd                    | **fixed** (`useMemo`)                                                   |
| C9  | medium   | responsive | `csv-trade-card.tsx:371,467,522` | No `sm:` step                              | **fixed** (`sm:grid-cols-3` ×3)                                         |
| C10 | medium   | design     | `trade-detail-layout.tsx:136`    | backdrop-blur perf                         | **fixed** (comment documenting trade-off)                               |
| C11 | low      | code-conv  | `trade-row.tsx:35`               | Memo export                                | **verified pass** (already correctly wrapped)                           |

### Cluster D — Playbook + Plan

| #   | Severity | Category   | File:Line                      | Issue                               | Status                                                                 |
| --- | -------- | ---------- | ------------------------------ | ----------------------------------- | ---------------------------------------------------------------------- |
| D1  | critical | responsive | `playbook-content.tsx:91`      | Strategy grid 1-col until 768px     | **fixed** (`grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3`) |
| D2  | critical | responsive | `annual-cockpit-grid.tsx:297`  | Spacing collapses at 375px          | **fixed** (responsive gap progression)                                 |
| D3  | critical | i18n       | `snapshot-hero.tsx:34`         | `toLocaleString("pt-BR")`           | **fixed** (`useFormatting().formatDateTime`)                           |
| D4  | critical | i18n       | `yearly-plan-editor.tsx:22,24` | Two `toLocaleString("pt-BR")` calls | **fixed** (`useFormatting().formatCurrency`)                           |
| D5  | high     | i18n       | `plan-vs-reality.tsx:35,38`    | Locale fallback fragile             | **fixed** (uses `useFormatting()`)                                     |
| D6  | high     | responsive | `month-card.tsx:157-160`       | Bar chart clip risk                 | **fixed** (`overflow-hidden` + `min-h-0`)                              |
| D7  | high     | code-conv  | `strategy-card.tsx:113`        | `[&_p]:truncate` too broad          | **fixed** (`[&>div>p]:truncate`)                                       |
| D8  | high     | a11y       | `strategy-card.tsx:75`         | Dropdown `w-40` clips mobile        | **fixed** (`max-w-[calc(100vw-2rem)]`)                                 |
| D9  | medium   | responsive | fractal-plan breadcrumb        | mobile wrap                         | **skipped** (generic breadcrumb; truncation belongs at usage site)     |
| D10 | medium   | i18n       | fractal-plan server actions    | error messages not wrapped          | **deferred** (unreachable-fallback class)                              |
| D11 | medium   | react-perf | `playbook-content.tsx`         | List render not memoized            | **skipped** (threshold not yet met at typical strategy count)          |

### Cluster E — Backtest + Sims

| #   | Severity | Category   | File:Line                                | Issue                                           | Status                                                                 |
| --- | -------- | ---------- | ---------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| E1  | critical | responsive | `triple-screen-inspector.tsx`            | `h-[640px]` on side-by-side grid no md fallback | **fixed** (`h-96 md:h-[640px]` + `grid-cols-1 md:grid-cols-[3fr_2fr]`) |
| E2  | critical | responsive | `backtest-trade-chart-modal.tsx`         | `w-[95vw] max-w-5xl` no mobile guard            | **fixed** (`w-full sm:w-[95vw] sm:max-w-5xl`)                          |
| E3  | critical | responsive | `backtest-quality-drawer.tsx`            | `max-w-md` only on sm                           | **fixed** (`w-full sm:max-w-md`)                                       |
| E4  | high     | responsive | `optimize-content.tsx`                   | No md step in sidebar grid                      | **fixed** (`md:grid-cols-[1fr_240px] lg:grid-cols-[1fr_280px]`)        |
| E5  | high     | responsive | `optimize/summary-cards.tsx`             | sm → lg jump, no md                             | **fixed** (`md:grid-cols-4`)                                           |
| E6  | high     | responsive | `backtest-content.tsx`                   | sm → lg jump                                    | **fixed** (`md:grid-cols-3`)                                           |
| E7  | high     | code-conv  | `pareto-scatter.tsx:54-67`               | Hex fallbacks + raw `rgb()`                     | **fixed** (removed dead hex fallbacks, clarified RGB anchors)          |
| E8  | high     | design     | `backtest-trades-table.tsx`              | Hidden cols no mobile alt                       | **verified** (already has `overflow-x-auto`)                           |
| E9  | high     | theming    | `pareto-scatter.tsx:54-59`               | (same as E7)                                    | **fixed** (covered by E7)                                              |
| E10 | medium   | responsive | `monte-carlo/simulation-params-form.tsx` | Input sizing on mobile                          | **verified pass** (already has `min-w-0` + `w-full`)                   |
| E11 | medium   | a11y       | `backtest-equity-chart.tsx`              | Chart axis a11y                                 | **fixed** (`aria-label` added)                                         |

### Cluster F — Analytics + Reports + Settings + Dev

| #              | Severity        | Category   | File:Line                         | Issue                                                        | Status                                                                      |
| -------------- | --------------- | ---------- | --------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| F1–F8, F16–F17 | high/medium/low | i18n       | settings + reports + analytics    | `result.message ?? t("fallback")` unreachable-fallback class | **deferred** (server-action class; tracked separately per 2026-06-02 sweep) |
| F9             | medium          | responsive | `reports/annual-rollup-table.tsx` | Sticky cols depend on parent scroll                          | **fixed** (`overflow-x-auto` wrapper added)                                 |
| F10            | medium          | responsive | `settings-content.tsx:80`         | Tabs scroll on all sizes                                     | **fixed** (`md:flex-wrap md:overflow-visible`)                              |
| F11            | medium          | code-conv  | `brand-switcher.tsx`              | Hex preview swatches                                         | **fixed** (clarifying comment)                                              |
| F12            | medium          | a11y       | `analytics/filter-panel.tsx`      | Icon-only buttons missing `aria-label`                       | **fixed**                                                                   |
| F13            | medium          | responsive | `annual-rollup-table.tsx`         | 14-col table no mobile column hiding                         | **fixed** (hid 6 low-priority cols on mobile)                               |
| F14            | medium          | design     | `reports-content.tsx:121`         | `md:grid-cols-2` tight at 768px                              | **fixed** (`lg:grid-cols-2`)                                                |
| F15, F18       | low             | n/a        | analytics-content, hawks/\*       | noted as strengths                                           | **N/A**                                                                     |

---

## Root causes

### RC1 — Tablet blind spot (single largest bug class)

**Bug class**: responsive grids that go `grid-cols-N sm:grid-cols-M lg:grid-cols-P` with no `md:` step in between. Tablet viewports (768–1023px) end up rendering the `sm:` layout, looking identical to a 640px-wide phone despite ~50% more horizontal room.

**Why it slipped past review**: visually, the layout still "renders" at 768px — it's just suboptimal. Code review at desktop width doesn't surface it. Tablet QA happens informally and inconsistently. Tailwind's default breakpoint vocabulary (`sm` 640 / `md` 768 / `lg` 1024) doesn't enforce `md:` use.

**When it manifests**: at runtime, only at viewport widths 768–1023px. Build / typecheck / lint cannot catch.

**Anti-pattern signature**:

```bash
rg 'grid-cols-[0-9]+ sm:grid-cols-[0-9]+ lg:grid-cols-' src/components/ src/app/
```

(Matches a grid chain that skips `md:`.)

### RC2 — Fixed-width modals / drawers / popovers without mobile viewport guard

**Bug class**: `max-w-md`, `max-w-5xl`, `w-64`, `w-40`, `w-[95vw]` applied without a `100vw - 2rem` guard for screens below 640px. On a 375px viewport these clip past the right edge or fail to render the full content.

**Why it slipped past review**: designers test on the design's intended viewport (desktop or sm+). Mobile-first chain (`w-full sm:max-w-md`) was inconsistently applied.

**Anti-pattern signature**:

```bash
rg 'max-w-(md|lg|xl|2xl|5xl)' src/components/ | rg -v 'w-\[calc|w-full'
```

### RC3 — Hardcoded locale formatting

**Bug class**: `value.toLocaleString("pt-BR", ...)` or `value.toLocaleString(locale === "pt-BR" ? "pt-BR" : "en-US")` instead of the project's `useFormatting()` hook. Result: an English-locale user trading on a PT-BR account sees BRL-formatted numbers without locale alignment, or vice versa.

**Why it slipped past review**: a hook (`useFormatting()` at `src/hooks/use-formatting.ts`) exists but its adoption is incomplete. Old code pre-dates the hook and wasn't refactored.

**Anti-pattern signature**:

```bash
rg "toLocaleString\(\"" src/components/ src/app/
```

### RC4 — Unreachable i18n fallback (server-action class — DEFERRED)

**Bug class**: client components display `result.message ?? t("fallback")` or `result.message || t(...)`. The server action returns a truthy English error string, so `??` / `||` never fire and the user sees English. This was flagged by the 2026-06-02 i18n deep-sweep and is **still live** in ~9 caller sites within this scan's cluster F territory.

**Why it persists**: the fix is server-side (wrap messages with `getTranslations()` in the action), not client-side (the client-side fallback is dead code). The 41 caller sites enumerated by the prior sweep span many actions; coordinated work is needed.

**Anti-pattern signature**:

```bash
rg 'result\.(message|error)\s*[\?\|]{2}' src/components/
```

**Deferred** to a separate scoped audit. Tracked in `docs/backlog.md`.

### RC5 — Hardcoded colors in chart code

**Bug class**: `rgb(...)`, `#hex` literals scattered through chart components (notably `pareto-scatter.tsx`, `trade-chart-view.tsx`) instead of `var(--color-*)` token references. Theme toggling doesn't propagate.

**Anti-pattern signature**:

```bash
rg 'rgb\(|#[0-9a-fA-F]{6}' src/components/{backtest,journal,optimize,monte-carlo}/
```

### RC6 — Hardcoded viewport-relative heights instead of dvh / token

**Bug class**: `h-screen`, `h-[calc(100vh-Npx)]`, `h-[calc(100dvh-3.5rem)]` with hardcoded offsets. Two failure modes: (a) iOS Safari URL-bar shift on `vh` units; (b) drift when the header height changes elsewhere.

**Fix**: use `h-dvh` / `100dvh`; for app-shell-aware heights use the new `--app-header-height` token (added by this scan).

### RC7 — Wide tables without mobile column hiding

**Bug class**: data-dense tables (>10 columns) rendered at full width on mobile. Page padding eats the available horizontal space, font-size already at the minimum (`text-tiny`), so further compression isn't viable. Users get an unreadable razor-narrow grid.

**Fix**: `hidden md:table-cell` on lower-priority columns; or wrap in `overflow-x-auto` so the user can horizontally scroll.

### RC8 — Icon-only buttons missing `aria-label`

**Bug class**: buttons whose only content is a `lucide-react` icon, without `aria-label`. Screen readers announce "button" with no context.

---

## Prevention rules

| Rule                                                                               | Detector                                                                              | Auto-fix path                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| Every grid chain must include `md:` when it uses both `sm:` and `lg:`              | `rg 'grid-cols-[0-9]+ sm:grid-cols-[0-9]+ lg:grid-cols-' src/`                        | `/arrange` or `/scan`                   |
| Modals/drawers/popovers must have a mobile-first width chain (`w-full sm:max-w-*`) | `rg 'max-w-(md\|lg\|xl\|2xl\|5xl)' src/components/ \| rg -v 'w-\[calc\|w-full'`       | manual                                  |
| Never use `toLocaleString("xx-XX")` in components — use `useFormatting()`          | `rg 'toLocaleString\(\"' src/components/ src/app/`                                    | manual; small surface                   |
| Server-action error messages must be translated server-side                        | `rg 'result\.(message\|error)\s*[\?\|]{2}' src/components/`                           | requires server-action audit (deferred) |
| Charts and theme-sensitive surfaces must use `var(--color-*)` tokens               | `rg 'rgb\(\|#[0-9a-fA-F]{6}' src/components/{backtest,journal,optimize}/`             | `/normalize`                            |
| App-shell-coupled heights use `var(--app-header-height)`                           | `rg 'h-\[calc\(100dvh-3?\.?5?rem' src/`                                               | manual                                  |
| Wide tables (>8 cols) hide non-critical columns on mobile                          | `rg '<table\|<TableHead' src/components/reports/` + manual review                     | manual                                  |
| All icon-only buttons get `aria-label`                                             | `rg '<Button\|<button' src/components/ \| rg -B1 'size="icon"' \| rg -L 'aria-label'` | `/harden`                               |

---

## Fix log (commit-ready)

40 files changed, +158 / −131 lines. All changes on branch `scan-responsive-layout-drift-mobile-and-tablet`. No commits yet — at user's direction.

Grouped by route cluster:

- **Shell + Auth** (3 files): auth layout responsive padding + lg widen; app-shell uses new `--app-header-height` token; mobile drawer width guard.
- **globals.css**: added `--app-header-height` token (3.5rem mobile / 3rem md+); converted `--height-chart-*` from fixed px to `clamp()` for fluid chart heights.
- **Home + Command Center** (10 files): all dashboard grid `md:` insertions; KPI text scale; chart heights; KpiCards `memo` wrap; quick-stats responsive; trading-calendar overflow wrapper; daily-summary-card responsive text; TabsList scroll-fade gradient.
- **Journal** (7 files): trade-detail-layout uses token; metrics grid `sm:` step; new-trade-tabs flex `min-w-0`; trade-chart-view tokens; execution-form md:grid-cols-3; csv-trade-card sm:grid-cols-3 ×3; journal-content `useMemo`.
- **Playbook + Plan** (7 files): playbook strategy grid + lg expansion; annual-cockpit responsive gap; three `toLocaleString` → `useFormatting()`; month-card overflow; strategy-card truncate scope refined; strategy-card dropdown viewport guard.
- **Backtest + Sims** (8 files): triple-screen-inspector responsive height + grid stack; modal viewport guard; drawer mobile chain; optimize-content sidebar md; summary-cards md; backtest-content md; pareto-scatter token cleanup; backtest-equity-chart aria-label.
- **Analytics + Reports + Settings** (5 files): annual-rollup-table own overflow + 6 cols mobile-hidden; settings tabs wrap on md+; brand-switcher comment; filter-panel aria-labels; reports-content lg:grid-cols-2.

---

## Still armed (deferred work for next pass)

- ~~**Cluster A polish** (12 findings A5–A16)~~ — **CLEARED 2026-06-09**: all 12 applied in a focused polish pass. Files touched: `sidebar.tsx` (5 items: title attr, indent flatten, aria-hidden, lazy init, logo absolute stack), `account-switcher.tsx` (2 items: viewport guard, font hierarchy comment), `user-menu.tsx` (1 item: aria-label on expanded variant), `login-form.tsx` (1 item: lg widen), `(auth)/layout.tsx` (1 item: use `getCopyrightYear`), new `src/lib/copyright-year.ts`. A10 (button size="sm") + A13 (translation keys) verified-pass without edit.
- **Unreachable i18n fallback class** (F1–F8, F16–F17 + Cluster D D10 + related): 9+ sites in cluster F alone, ~41 total per the 2026-06-02 deep-sweep. Requires coordinated server-action audit. **Track as a dedicated `/scan` target.**
- **B finding subgroup** (B12–B24 minor items): some were mentioned in the diagnose pass but my consolidated review may have under-counted; verify when revisiting.
- **Backtest-trades-table card-layout mobile alt** (E8): horizontal scroll added, but no card-mode for mobile. Larger refactor; backlog.
- **Trading-calendar mobile alt** (B10 deeper take): added overflow wrapper; consider a numeric-list mobile alt if user feedback shows the 7-col grid is still cramped.

All deferred items are in `docs/backlog.md` (to be appended) and reflected here.

---

## Incident — mid-scan state loss

Mid-Phase-3 (between Cluster B finish and Cluster C launch), a state-loss incident occurred:

- Cluster A's source edits across ~6 files (auth/layout, app-shell, sidebar, login-form, account-switcher, user-menu, `src/lib/copyright-year.ts`) reverted to baseline
- The `docs/scans/_drafts/2026-06-09-responsive/` directory and all 6 diagnose reports were deleted
- `git reflog` showed a single `558a7697 HEAD@{0}: reset: moving to HEAD` entry but Cluster B's working-tree edits survived, ruling out a `--hard` reset

**Recovery taken**: re-applied Cluster A's 4 critical-tier fixes manually with Edit (A1–A4); skipped the remaining A5–A16 polish items (now tracked in Still Armed); switched the Cluster C/D/E/F fix-agent prompts to inline findings (no disk dependency); explicitly forbade `git reset` / `git clean` / destructive operations in subsequent agent prompts.

**Root cause**: unconfirmed. Possible candidates: an agent-side `lint --fix` pipeline that ran a clean-up step, a hook in `.husky/`, or an undocumented behavior in agent isolation. The reflog signal (single reset entry) and the partial survival pattern (Cluster B edits intact, Cluster A edits gone, untracked files removed) is consistent with `git clean -fd` followed by `git checkout HEAD -- <pathspec>` — but no agent output mentions either.

**Containment**: subsequent agent prompts explicitly banned destructive git commands. No further loss occurred during Cluster C/D/E/F runs.

**For future scans**: see the prevention note in Gotchas (to be added).

---

## Verification (Phase 4)

- `pnpm exec tsc --noEmit --pretty false`: **0 errors**
- `pnpm lint`: 0 errors; 9 pre-existing `no-unused-vars` warnings in unrelated files (`optimize/freeze-hero-modal`, `actions/reports`, `lib/optimize/grid-conditional`, `lib/optimize/pareto-retain`) — not introduced by this scan
- `pnpm i18n:check`: pass (no new translation keys added by this scan)
- `git diff --stat`: 40 files, +158 / -131

No commits created — user decides when to commit.
