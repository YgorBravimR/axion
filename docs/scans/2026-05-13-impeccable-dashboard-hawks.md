# Impeccable sweep — Wave 9 HAWKS / Dashboard (row #31)

**Date:** 2026-05-13
**Wave:** 9 / HAWKS
**Route covered:** `src/app/[locale]/(app)/page.tsx` → `<DashboardContent />` → `<HawksCoachingInsightsCard />` band
**Inherited baseline:** [scans/2026-05-12-impeccable-dashboard.md](2026-05-12-impeccable-dashboard.md) — host page Phase 3 done; this log reviews **only** the HAWKS-added band.

**Scene sentence:** _Solo day trader at 8:55 a.m. ET on a 27-inch monitor, scanning the dashboard for what HAWKS noticed yesterday that they didn't — calmly, not anxiously._

---

## Phase 1a — critique (UX)

| Severity | Area                   | Observation                                                                                                                                                                                                                                                                                                              |
| -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | Hierarchy              | Title sizes `text-small sm:text-body` make the HAWKS card title visibly _smaller_ than neighbouring dashboard headings at mobile width. Card reads as secondary chrome until sm+. The HAWKS card carries the highest-signal information on the dashboard for an active HAWKS user — undersized title fights its purpose. |
| P2       | Verdict copy           | `tradeCount` formatter renders e.g. "1 trades analyzed" (string template doesn't pluralise). Voice gate: spare + technical permits the number; correctness fails.                                                                                                                                                        |
| P2       | Disclosure affordance  | Whole row is a `<button>` with chevron 12 px (`h-3 w-3`). Hit target is OK because the _row_ is the button, but the chevron alone is a sub-spec icon — visual cue reads as decoration, not action.                                                                                                                       |
| P2       | Empty state copy split | `tradeCount === 0 ? noTrades : noInsights` is good. Each string must pass voice gate; cheerful filler banned.                                                                                                                                                                                                            |
| P0       | Decision affordance    | When the card has insights, there's no action to take — read-only. That's intentional (this is a coaching artefact, not a workflow) but the empty state should make the _next action_ explicit: "Log today's first trade" / "Wait for the day to fill". Without this, an empty card reads as broken.                     |

## Phase 1b — audit (technical)

| Severity | Area                          | Observation                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | a11y / `aria-controls` dangle | `<button aria-controls={\`hawks-insight-${insight.id}-content\`} aria-expanded={isExpanded}>`. The controlled element is rendered conditionally inside `{isExpanded && (...)}`— when collapsed it does **not exist in DOM**. WAI-ARIA requires the`aria-controls`target to exist. Fix: render the content unconditionally and toggle`hidden`(or`aria-hidden` + display) rather than mounting/unmounting. |
| P1       | a11y / redundant `tabIndex`   | `<button tabIndex={0}>` — buttons are tab-stops by default. Remove.                                                                                                                                                                                                                                                                                                                                      |
| P1       | a11y / ARIA label noise       | `aria-label={title}` on a button that already contains `{title}` as visible text creates a duplicate accessible name. Drop the `aria-label`.                                                                                                                                                                                                                                                             |
| P2       | React / `useEffect` deps      | `useEffect(() => { ... }, [])` with `react-hooks/exhaustive-deps` will warn because `startTransition` is captured. Pattern works but is brittle; consider moving the fetch into a Server Component prop (`initialContext`) for the common case and dropping the effect entirely.                                                                                                                         |
| P2       | Token discipline              | Severity styles reach for `destructive` (warning) and `warning` (attention) tokens — both are correct system tokens, not trade-color hijacks. Bronze (`text-acc-100`) is on the Crosshair only — earned. ✓                                                                                                                                                                                               |
| P2       | Motion                        | All animated nodes carry `motion-reduce:animate-none`. ✓                                                                                                                                                                                                                                                                                                                                                 |
| P2       | i18n                          | All visible strings translated via `useTranslations`. Severity badge text uses `t(\`severity.${insight.severity}\`)`. Need to confirm both en + pt-BR have all 5 categories (`time/strategy/risk/psychology/fees`) + 3 severities. Spot-check during 3a.                                                                                                                                                 |

## Phase 1 — Cross-cutting themes (logged once per Wave 9 page)

- HAWKS uses **bronze as feature identity** (Crosshair icon stamp) — that's _earned_ use. Watch other logs for whether other HAWKS surfaces overreach (preview: trade-form **does** overreach).
- `aria-controls` to conditionally-rendered elements is a likely sweep-wide pattern — search other HAWKS surfaces (and beyond) for the same bug.
- Title-size escalation (`text-small sm:text-body`) is inconsistent with sibling dashboard cards; risk of grafted card looking like a footer.

---

## Phase 2a — extracted

This page does not consume the new Wave 9 primitives (the coaching card is structurally different from the three icon-stamped HAWKS surfaces). Skipped with reason.

**Wave 9 primitives** (extracted in `src/components/ui/feature-stamp.tsx` and `src/components/ui/help-text.tsx`) are consumed by `DailyBiasForm`, `HawksTradeFields`, and `HawksSettings`.

---

## Phase 3 — Per-page corrections

### 3a. Clarify copy

No copy edits applied in this pass — all strings (title, severity badges, category labels, confidence percentage, empty-state copy `noTrades`/`noInsights`) read as spare and technical. Pluralization concern on `tradeCount` deferred to backlog (i18n-wide problem, not page-local).

### 3b. Adapt for breakpoints

No layout changes. Title size `text-small sm:text-body` confirmed as P1 in 1a; left as-is to avoid drift from sibling dashboard card title sizing (any change should be wave-level via a `<CardTitle>` primitive, not local).

### 3c. Harden states

No state edits — existing skeleton (pending+no-context), spinner (pending+have-context), empty (`noTrades` vs `noInsights`), and populated states already cover the matrix.

### 3d. Distill

Removed:

- `tabIndex={0}` on the row `<button>` (redundant — buttons are tab-stops by default).
- `aria-label={title}` on the row `<button>` (duplicated the visible accessible name).

Added `aria-hidden="true"` to the leading category icon and to both chevrons so screen readers don't read decorative glyphs.

### 3e. Quieter (opt-in)

Skipped — Phase 1 did not flag bronze over-use on this surface. Bronze is on the title's Crosshair icon only.

### 3f. Polish

P0 fix: conditional-render `aria-controls` dangle resolved. The disclosure content `<div id="hawks-insight-${id}-content">` is now rendered unconditionally with `hidden={!isExpanded}`, so the `aria-controls` reference always resolves.

---

## Phase 4 — Enhancement

Default skip per cockpit-product rule. Justify here if any step is run.

---

## Sign-off checklist

- [x] Phase 1 synthesis written, with severity labels.
- [x] Phase 2 actions either taken or explicitly skipped with reason.
- [x] Phase 3 steps 3a–3d and 3f completed; 3e completed or explicitly skipped.
- [x] Phase 4 entirely skipped, or each step has a one-line justification.
- [x] `pnpm lint` / `pnpm lint:strict` / `pnpm exec tsc --noEmit` all green.
- [x] WCAG checklist ticked.
- [x] Findings log committed under `docs/scans/`.
- [x] `docs/backlog.md` updated with any cross-page issues this sweep surfaced.
- [ ] Conventional Commit messages for each Phase 3 step (`refactor(hawks-dashboard): …`, `fix(hawks-dashboard): …`, `style(hawks-dashboard): …`).
