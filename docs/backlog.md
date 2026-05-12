# Backlog — "For Later" Single Source of Truth

This file is the canonical home for ideas, follow-ups, deferred work, and open product/eng questions that surfaced during sweeps, scans, and feature work but were intentionally **not** shipped at the time.

## Why this file exists

Inline `// TODO`, "Phase 2 will…", and "future iteration may…" notes scatter knowledge across the codebase. By the time the work matters again, the context is lost and the note rots. This file consolidates them so we can:

- **Cherry-pick** the next thing to tackle without a codebase grep tour.
- **Avoid losing ideas** when the original spec/scan ages out.
- **See the shape of debt** at a glance (which clusters keep growing, which are dormant).

## Conventions

- Every entry has a **Source** line linking back to the doc/spec/file that surfaced it. Update the source when you cherry-pick — don't leave stale "for later" prose behind.
- Group by capability area, not by date. Within a group, ordered by "ROI per hour" descending where known.
- Mark items shipped by **deleting** them, not striking through. The git log is the audit trail.
- When in doubt, file new ideas here first — they cost nothing here, and a one-liner is enough.

---

## Journey suite (`e2e/journey/`)

### Fixed Bravo email + per-chain DB reset

- **What**: Replace `bravo-${Date.now()}@axion-demo.com` with a fixed email backed by a globalSetup that cascade-deletes + reinserts the Bravo row at chain start.
- **Why**: Recognizable identity in the showcase video (sales/marketing pickup). Today the timestamped email is the cheapest workaround for the DB-backed login rate-limit (`login:<email>` in `src/app/actions/auth.ts`).
- **Source**: `e2e/journey/fixtures/bravo-seed.ts` header; `e2e/journey/README.md` "Bravo persona".

### Tag-based filtering

- **What**: Wire `@journey` / `@stage:<name>` JSDoc tags to Playwright's `--grep` so contributors can run "all weekly+ stages" with one flag.
- **Why**: Today the suite uses `--project=journey-NN-...` selection, which is explicit but verbose for partial-chain runs.
- **Source**: `e2e/journey/README.md` "Tags".

### Edge-case separation pass

- **What**: Audit existing `e2e/tests/*.spec.ts` for overlap with the journey suite — keep edge cases, deprecate happy-path duplication. Add new `e2e/<feature>-edge/` specs as needs surface.
- **Why**: Two suites covering the same happy path is wasted CI minutes and split maintenance.
- **Source**: `docs/design/zero-to-hero-e2e.md` §13 Phase 4 (ongoing).

### Onboarding integration (Product-owned)

- **What**: Use the demo-mode video as the new-user walkthrough; embed stage gallery in `docs/zero-to-hero.md`; nightly-publish demo artifact to S3 / internal docs site.
- **Source**: `docs/design/zero-to-hero-e2e.md` §13 Phase 5.

---

## Test coverage (unit / integration)

Source for all four items: `docs/scans/2026-05-11-test-coverage.md` Phase 5b. Best ROI ordering noted in that scan.

### Cluster C — Stats module (best unsupervised candidate)

- **What**: Write tests for `monte-carlo`, `monte-carlo-v2`, `risk-simulation-advanced`.
- **Why**: Pure functions, deterministic seeding, no protected paths, no fixture coordination cost. High coverage ROI per hour.

### Cluster B — Tax module

- **What**: Fill in tests for `asset-defaults`, `mark-dirty`, `month-status`.
- **Why**: Extends the existing tax test pattern. Lower coordination cost.

### Cluster D — Parsers

- **What**: Fixture-driven tests for `sinacor-parser`, `matching-engine`, `csv-parsers`. Sample broker outputs live at `e2e/fixtures/notas/`.

### Cluster A — Security (coordination required)

- **What**: Tests for `crypto.ts`, `user-crypto.ts`, `auth-utils.ts`.
- **Coordination**: Protected paths per `CLAUDE.md`. Security review required on test fixtures + design. **Do not unilaterally tackle.**

### Backtest / equity-shield / fractal-plan suites

- **What**: `__tests__/lib/backtest/*` (entry, stop, target, sizing modules), `__tests__/lib/equity-shield/*` (smoothing + shield calc), `__tests__/lib/fractal-plan/*` (capital + week aggregation).
- **Source**: same scan, "test files missing" list.

---

## Server-action zod-hardening

### Cluster D — Write actions missing zod input validation

- **What**: Add zod input schemas to the 4 write actions flagged in the scan. Specifically must coordinate with the user because one of them touches `src/lib/tax/recompute-month.ts` (protected path — single source of truth for tax recomputation).
- **Why**: Known bug classes are config-enforced now; remaining gap is input validation at write boundaries. Bulk-fix is real refactor work — schema decisions (required vs optional defaults vs transforms) + ~6 client call-sites per action.
- **Out of scope**: Cluster C (7 read-only typed-only actions). Auth gates the data; misshapen filter params yield empty results, not state corruption.
- **Source**: `docs/scans/2026-05-11-server-actions.md` Phase 5b.

---

## Tax / yearly-reports pre-existing baseline (still armed)

Items below were known when `docs/scans/2026-05-05-tax-yearly-reports.md` shipped but were out of scope at the time. They live on `main` today.

- `src/components/tax/fee-rate-form.tsx:332` — `<Select>` missing `id` attribute.
- `src/lib/tax/tax-engine.ts:245,246,324` — type holes in `YearTaxSummary` return shape.
- `src/app/actions/*`, `src/lib/queries/*` — ~80 drizzle relational type errors (generator config issue, not in scope at the time of the scan).

**Source**: `docs/scans/2026-05-05-tax-yearly-reports.md` "Still Armed".

---

## Journal-list polish (deferred from sweep)

### Mobile-detect via container queries instead of `matchMedia` effect

- **What**: `period-filter.tsx:44-50` runs a `useEffect` on mount to read `window.matchMedia("(max-width: 419px)")` so it can pass `numberOfMonths={1|2}` to the `DateRangePicker`. Replace with a CSS-only approach (container query on the picker wrapper, or render one calendar and let CSS hide the second below the breakpoint).
- **Why**: SSR-first the first paint always renders `isMobile=false`, then re-renders after hydration. The hydration flash is small but real, and the effect is the only state-setting code in PeriodFilter.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-list.md` Phase 1a P2.

### Listbox-style arrow-nav within trade-day-group

- **What**: After the TradeRow Link migration, focus moves row-by-row on Tab. For dense days (30+ trades) consider a listbox roving-tabindex pattern so ↑↓ navigates between rows without leaving the day group, and Tab leaves the group entirely.
- **Why**: Power-user shortcut. Not blocking — Tab works fine — but the cockpit register favors keyboard density.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-list.md` Phase 1b P1.

### `h-50` Suspense-fallback height across page-level shells

- **What**: 5 page.tsx files (`journal/page.tsx`, `settings/page.tsx`, `risk-simulation/page.tsx`, `backtest/page.tsx`, `backtest/optimize/page.tsx`) and `journal-content.tsx:457` use `className="h-50"` on the LoadingSpinner. Tailwind v4 resolves it to `12.5rem` (200px) via the implicit `n * 0.25rem` scale, but the project's named spacing scale tops at `l-900` (64px). Either codify `h-50` in `globals.css` (`--height-l-1000` or similar) so it's intentional, or swap all 6 sites to `min-h-48` / `min-h-52` / a named token.
- **Why**: It works, but reads as a token escape hatch every time someone greps the spacing system.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-list.md` Phase 3 out-of-scope.

---

## Command Center polish (deferred from sweep)

### `useTransition` on refresh callbacks

- **What**: Wrap `refreshCompletions` / `refreshDailyPlan` / `refreshAssetSettings` in `command-center-content.tsx` with `useTransition` and surface an `aria-busy` dim on the affected panel during the fetch.
- **Why**: Today the save buttons inside each panel render their own `Loader2` spinner so the in-flight state is covered for sighted, mouse-driven users. AT users (and anyone whose focus has moved away from the save button) get no panel-level signal that data is being re-fetched. Dashboard sweep already adopted this pattern for its initial loads; command-center can match.
- **Source**: `docs/scans/2026-05-12-impeccable-command-center.md` Phase 3c.

### Mood/Bias primitive consolidation

- **What**: `MoodSelector` renders an inline `role="radiogroup"` of pill buttons; `BiasSelector` wraps the Radix `Select` dropdown. Both are 4-option 1-of-N controls used adjacently inside `PreMarketNotes`. Unify on a shared `SegmentedToggle` primitive (or extract one from the dashboard sweep) so the visual + a11y model matches.
- **Why**: Two controls with the same job and different keyboard models is a small but real friction every pre-market.
- **Source**: `docs/scans/2026-05-12-impeccable-command-center.md` Phase 1a P2.

---

## Currency formatting — account-aware compact formatters

- **What**: `formatCompactCurrency`, `formatCompactCurrencyWithSign`, `formatBrlWithSign`, `formatBrlCompactWithSign` in `src/lib/formatting.ts` take a raw `symbol` string (or hardwire `"R$"`). Wire them to read from the active account's `currency` (or fall back to `user.defaultCurrency`) so a USD account never renders `R$10K`. The full-form `formatCurrency`/`formatCurrencyWithSign` already accept an optional `currency` parameter — the compact siblings should match that shape, plus a hook (e.g. `useAccountCurrency`) that resolves the active account's symbol once.
- **Why**: The schema already stores per-account `currency` (`schema.ts:361`) and per-user `defaultCurrency` (`schema.ts:173`, `:1389`), but the dashboard hardcodes `"R$"` at every call site (`pnl-card.tsx:34`, `quick-stats.tsx:90/103`, all `equity-curve.tsx` axes/tooltips, every chart tick formatter). The moment a non-BRL account exists, every compact display lies.
- **Source**: `docs/scans/2026-05-12-impeccable-dashboard.md` Phase 2d.

---

## Playbook list — deferred follow-ups

### StrategyCard menu should adopt Radix `DropdownMenu`

- **What**: `src/components/playbook/strategy-card.tsx:109-181` rolls a custom dropdown with manual focus management (`menuRef`, `menuButtonRef`, arrow-key `onKeyDown`, escape close, overlay click-out). The project already ships `@/components/ui/dropdown-menu` (Radix-based). Migrate so focus trapping, portal rendering, outside-click handling, and proper `aria-controls` wiring come for free.
- **Why**: Hand-rolled focus machinery is a maintenance liability and tends to drift out of WAI-ARIA spec (e.g. roving tabindex vs single-tabbable composite, role="menu" focusability). Radix already solves this for every other dropdown in the app.
- **Source**: `docs/scans/2026-05-12-impeccable-playbook-list.md` Phase 1b audit P3.

---

### Distill pass — `/playbook` reads as nested cards

- **What**: The compliance overview and the strategy grid each live inside their own `border-bg-300 bg-bg-200 rounded-lg border` wrapper, and the strategy grid itself contains up to ~10 `StrategyCard` boxes — yielding a "cards inside a card" structure. Either drop the outer chrome on the strategy section (let the cards float on the page background and use a section heading instead), or remove the per-card border and let the section wrapper provide the boundary.
- **Why**: Shared design law: "nested cards are always wrong." Two layers of borders compete for attention and consume horizontal whitespace.
- **Source**: `docs/scans/2026-05-12-impeccable-playbook-list.md` Phase 1a P2.

---

## Journal detail — deferred follow-ups

### Detail-page delete uses `window.confirm()`

- **What**: The trade-detail action menu's delete handler still triggers native `window.confirm()` (`src/app/[locale]/(app)/journal/[id]/page.tsx` — delete affordance / client island). Swap to the project `AlertDialog` pattern the way `journal-content.tsx` already does for the list view (controlled `open` state, `AlertDialogAction variant="destructive"`).
- **Why**: CLAUDE.md explicitly bans `window.confirm()` ("ugly, unthemed, inaccessible, brand-breaking"). The list page already migrated; the detail page is the last hold-out for trade deletion.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-detail.md` Phase 1b audit P1.

---

### Followed-plan yes/no should be a `radiogroup`, not two `aria-pressed` toggles

- **What**: `TradeInfoNotesTab` renders the followed-plan choice as two `<button aria-pressed>` controls inside `role="group"`. The semantics are 1-of-N with a third "unset" state — closer to a `radiogroup` with arrow-key navigation and a clear "clear selection" affordance. Mirror the rating radiogroup pattern (roving tabindex, `onKeyDown` Left/Right) so both single-select controls in the same tab share one model.
- **Why**: Two toggles with `aria-pressed` imply independent on/off state to assistive tech; a screen reader user can't tell that picking Yes implicitly unpicks No. The visual cue (one filled, one outlined) is misleading without the radio semantics.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-detail.md` Phase 1b audit P2.

---

### Card-rhythm distill pass on `/journal/[id]`

- **What**: The detail page stacks ~10 sibling cards (header, P&L block, R-multiples, prices, risk, SL/TP, MFE/MAE, classification, rating+plan, tags, notes). Several adjacent groupings (prices ↔ SL/TP, MFE ↔ MAE, rating ↔ plan) read as one logical unit but render with identical visual weight. Distill into 4-5 grouped sections with deliberate spacing variance, or move the secondary metrics into a collapsible "Details" disclosure so the primary outcome (P&L, R, executions, notes) leads.
- **Why**: Shared design law: "vary spacing for rhythm; same padding everywhere is monotony" + "cards are the lazy answer." The current page is a uniform card stack; nothing earns visual prominence over anything else.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-detail.md` Phase 1a critique P3 — distill deferred to keep this slice surgical.

---

## Documentation drift watch

- **Design doc Phase 3 / §12 Open Questions**: `docs/design/zero-to-hero-e2e.md` §12-13 was the original rollout spec. Stages 0-8 ship; Phase 3 is functionally done except for the multi-month seeder + CI wiring (both captured above). When those land, retire §13 Phase 3 in favour of a one-liner pointing here.
- **`docs/zero-to-hero.md:284`** — "Bias and mood are recorded for later correlation analysis." That's a _product_ statement (what the data is for), not a backlog item; left in place.

---

## How to retire an item from this backlog

1. Implement the work.
2. Update the original `Source` if it still has the deferred prose ("Phase 2 will…", "future iteration may…") — replace with a concrete reference to the shipped commit/PR, or delete the prose entirely.
3. Delete the item from this file in the same PR.

Result: the backlog only ever lists work that's still in front of us.
