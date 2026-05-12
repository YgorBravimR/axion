# Impeccable Page Runbook

> **Per-page horizontal review blueprint.** Replace `<page>` with the target route (e.g. `dashboard`, `journal`, `playbooks`, `settings`). Run phases in order. Log every finding into the same shared scratchpad so cross-page patterns surface before per-page fixes begin.

## How to use this doc

1. Pick a page from the **Sweep order** below. Do not jump waves.
2. Set `<page>` for this run (e.g. `dashboard`, `journal-list`).
3. Open / create `docs/scans/<YYYY-MM-DD>-impeccable-<page>.md` as the **findings log** for this run. Append to it after every command.
4. Walk Phase 1 → Phase 4 in order. Do not skip phases; conditional steps (marked _opt-in_) may be skipped only with a one-line justification in the findings log.
5. When the page is done, paste its findings log path under the page's row in the Sweep order table below, and append cross-cutting findings to `docs/backlog.md` so the next page starts from prior findings, not a blank slate.

## Sweep order

Pages are grouped into eight waves. Run waves sequentially; within a wave, run pages in the listed order. Each wave establishes patterns that the next wave inherits — skipping ahead means re-doing extraction work later.

**Rationale (read once, then trust the order):** Wave 1 is the trader's daily cockpit and where the most reusable patterns live. Waves 2–4 are heavy data and modeling surfaces that share grammar with the cockpit. Wave 5 covers form editors, which inherit from Wave 1 detail views. Waves 6–8 are self-contained leaves (settings, auth, public).

| #   | Wave              | Route slug           | `<page>` token         | Route path                       | Findings log                                                                                                          |
| --- | ----------------- | -------------------- | ---------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | 1 — Daily cockpit | dashboard (app root) | `dashboard`            | `/`                              | [scans/2026-05-12-impeccable-dashboard.md](scans/2026-05-12-impeccable-dashboard.md) — Phase 3 done                   |
| 2   | 1 — Daily cockpit | command-center       | `command-center`       | `/command-center`                | [scans/2026-05-12-impeccable-command-center.md](scans/2026-05-12-impeccable-command-center.md) — Phase 3 done         |
| 3   | 1 — Daily cockpit | journal list         | `journal-list`         | `/journal`                       | [scans/2026-05-12-impeccable-journal-list.md](scans/2026-05-12-impeccable-journal-list.md) — Phase 3 done             |
| 4   | 1 — Daily cockpit | journal detail       | `journal-detail`       | `/journal/[id]`                  | [scans/2026-05-12-impeccable-journal-detail.md](scans/2026-05-12-impeccable-journal-detail.md) — Phase 3 done         |
| 5   | 1 — Daily cockpit | playbook list        | `playbook-list`        | `/playbook`                      | [scans/2026-05-12-impeccable-playbook-list.md](scans/2026-05-12-impeccable-playbook-list.md) — Phase 3 done           |
| 6   | 1 — Daily cockpit | playbook detail      | `playbook-detail`      | `/playbook/[id]`                 | [scans/2026-05-12-impeccable-playbook-detail.md](scans/2026-05-12-impeccable-playbook-detail.md) — Phase 3 done       |
| 7   | 2 — Heavy data    | analytics            | `analytics`            | `/analytics`                     | [scans/2026-05-12-impeccable-analytics.md](scans/2026-05-12-impeccable-analytics.md) — Phase 3 done                   |
| 8   | 2 — Heavy data    | account comparison   | `analytics-comparison` | `/analytics/account-comparison`  | [scans/2026-05-12-impeccable-account-comparison.md](scans/2026-05-12-impeccable-account-comparison.md) — Phase 3 done |
| 9   | 2 — Heavy data    | reports              | `reports`              | `/reports`                       | [scans/2026-05-12-impeccable-reports.md](scans/2026-05-12-impeccable-reports.md) — Phase 3 done                       |
| 10  | 2 — Heavy data    | monthly review       | `monthly`              | `/monthly`                       | _pending_                                                                                                             |
| 11  | 3 — Modeling      | backtest             | `backtest`             | `/backtest`                      | _pending_                                                                                                             |
| 12  | 3 — Modeling      | backtest optimize    | `backtest-optimize`    | `/backtest/optimize`             | _pending_                                                                                                             |
| 13  | 3 — Modeling      | monte carlo          | `monte-carlo`          | `/monte-carlo`                   | _pending_                                                                                                             |
| 14  | 3 — Modeling      | risk simulation      | `risk-simulation`      | `/risk-simulation`               | _pending_                                                                                                             |
| 15  | 3 — Modeling      | equity shield        | `equity-shield`        | `/equity-shield`                 | _pending_                                                                                                             |
| 16  | 4 — Planning      | plan year            | `plan-year`            | `/plan/[year]`                   | _pending_                                                                                                             |
| 17  | 4 — Planning      | plan quarter         | `plan-quarter`         | `/plan/[year]/[quarter]`         | _pending_                                                                                                             |
| 18  | 4 — Planning      | plan month           | `plan-month`           | `/plan/[year]/[quarter]/[month]` | _pending_                                                                                                             |
| 19  | 5 — Form editors  | journal new          | `journal-new`          | `/journal/new`                   | _pending_                                                                                                             |
| 20  | 5 — Form editors  | journal edit         | `journal-edit`         | `/journal/[id]/edit`             | _pending_                                                                                                             |
| 21  | 5 — Form editors  | playbook new         | `playbook-new`         | `/playbook/new`                  | _pending_                                                                                                             |
| 22  | 5 — Form editors  | playbook edit        | `playbook-edit`        | `/playbook/[id]/edit`            | _pending_                                                                                                             |
| 23  | 6 — Settings      | settings             | `settings`             | `/settings`                      | _pending_                                                                                                             |
| 24  | 7 — Auth          | login                | `login`                | `/login`                         | _pending_                                                                                                             |
| 25  | 7 — Auth          | register             | `register`             | `/register`                      | _pending_                                                                                                             |
| 26  | 7 — Auth          | forgot password      | `forgot-password`      | `/forgot-password`               | _pending_                                                                                                             |
| 27  | 7 — Auth          | verify email         | `verify-email`         | `/verify-email`                  | _pending_                                                                                                             |
| 28  | 7 — Auth          | select account       | `select-account`       | `/select-account`                | _pending_                                                                                                             |
| 29  | 8 — Public        | monitor              | `monitor`              | `/monitor`                       | _pending_                                                                                                             |
| 30  | 8 — Public        | painel               | `painel`               | `/painel`                        | _pending_                                                                                                             |

**Wave checkpoint:** at the end of every wave, pause to update `docs/backlog.md` with any system-wide patterns surfaced. Do not start the next wave until the backlog reflects what the previous wave learned. This is the mechanism that makes the sweep horizontal instead of thirty independent reviews.

**Register note:** all pages in Waves 1–7 are `product` register. Wave 8 (`monitor`, `painel`) may be `brand` register if they're marketing-facing — confirm during that wave's pre-flight and load the matching Impeccable reference.

## Pre-flight

Confirm before issuing any `/impeccable …` command:

- [ ] `PRODUCT.md` and `DESIGN.md` are current (bronze lock = commit `350650a` or later).
- [ ] `.impeccable/design.json` mirrors the same tokens (sanity-check via `node -e "JSON.parse(require('fs').readFileSync('.impeccable/design.json'))"`).
- [ ] You can name the page's **register** out loud (product vs brand). Dashboard, journal, playbooks, settings → all `product`. Marketing/landing routes → `brand`. The register dictates which reference Impeccable loads.
- [ ] You can name the page's **scene sentence** out loud (who, where, when, ambient light, mood). Example for dashboard: _"Solo day trader at 8:55 a.m. ET on a 27-inch monitor in a dim office, scanning their command center for today's setup."_
- [ ] Findings log file exists at `docs/scans/<YYYY-MM-DD>-impeccable-<page>.md` with empty section headers for each phase.

If any pre-flight item fails, stop and resolve before running commands.

---

## Phase 1 — Diagnose (read-only)

Run both commands. Capture verbatim output into the findings log. Do not fix anything yet.

### 1a. UX critique

```text
/impeccable critique <page>
```

**What it surfaces:** heuristic UX scoring, hierarchy issues, signal/noise violations, anti-reference matches.

**Log under:** `## Phase 1a — critique` in the findings file. Bullet each issue with `[severity] [area] — observation`.

**Exit criterion:** every issue raised by the command appears in the log with a severity label (`P0` blocks ship, `P1` should fix this sweep, `P2` backlog).

### 1b. Technical audit

```text
/impeccable audit <page>
```

**What it surfaces:** a11y violations (WCAG AA), responsive breakpoints, perf hotspots, semantic HTML issues, token drift.

**Log under:** `## Phase 1b — audit` with the same severity scheme as 1a.

**Exit criterion:** lint-style findings normalized into the log; any `P0` is also added to `docs/backlog.md` if it spans more than this page.

### Phase 1 synthesis

Before moving to Phase 2, write a `## Phase 1 — Cross-cutting themes` block at the bottom of the findings log. Three to five bullets max. Examples:

- "Bronze used decoratively in 4 of 7 cards (violates Earned-Bronze rule)."
- "No empty-state for the trade list (also missing on journal, see prior sweep)."
- "Two custom `<table>` elements bypass `@/components/ui/table` primitive."

This synthesis is what Phase 2 acts on.

---

## Phase 2 — System-level fixes (one-shot, before any per-page work)

Only run this phase if Phase 1's synthesis flags a pattern that repeats across pages or violates the design system. If nothing repeats and nothing drifts, skip with a one-line note.

### 2a. Extract recurring patterns

```text
/impeccable extract <pattern-name>
```

**When to run:** a component or layout repeats with minor variations across ≥2 pages. Promote it into `src/components/` (or extend an existing primitive) before polishing the instances.

**Log under:** `## Phase 2a — extracted` with the file path of the new/updated primitive and the call sites it replaces.

**Exit criterion:** instances of the pattern in this page now import the extracted primitive; remaining instances on other pages are listed in `docs/backlog.md` for the next sweep.

---

## Phase 3 — Per-page corrections (in order)

Each step has an exit criterion. Do not advance until met. Each commit follows Conventional Commits (CLAUDE.md → "Hardening Guardrails").

### 3a. Clarify copy

```text
/impeccable clarify <page>
```

**Why first in Phase 3:** copy decisions cascade into layout decisions. A renamed CTA may shrink a button; a rewritten empty-state may delete a card.

**Voice gate:** every string must pass Axion's voice — _spare, declarative, technical when accuracy demands it. Never cheerful filler._ Reject "Welcome back!", "Let's get started", emoji, exclamation marks.

**Exit criterion:** every visible string on the page has been re-read and either kept (no edit) or replaced. No em dashes. `pnpm lint` green.

### 3b. Adapt for breakpoints

```text
/impeccable adapt <page>
```

**Coverage:** mobile (375), tablet (768), laptop (1280), wide (1920). Trading workstations also include ultrawide (≥2560) — note any layout that breaks past `max-w-screen-2xl`.

**Exit criterion:** page renders without horizontal scroll, clipped data, or collapsed hierarchy at all five widths. Screenshots logged.

### 3c. Harden states

```text
/impeccable harden <page>
```

**Cover all states:** loading, empty, error, partial-data, slow-network, permission-denied. Trading data also has the "market closed" and "no broker connected" states — name them explicitly if relevant.

**Exit criterion:** every async boundary has a deliberate state for each of the above. Skeleton/loading is keyboard-focusable. Errors include actionable recovery, not just "Something went wrong."

### 3d. Distill

```text
/impeccable distill <page>
```

**Purpose:** subtract. Remove cards, dividers, headings, badges, and accent halos that do not earn their place. The bronze-lock rule (`acc-100` is a signal, not chrome) makes this step especially load-bearing for Axion.

**Exit criterion:** at least one removal per dense view. If you removed nothing, defend it in one sentence in the log.

### 3e. Quieter _(opt-in, conditional on audit findings)_

```text
/impeccable quieter <page>
```

**Run only if:** Phase 1 flagged over-decoration, accent over-use, or motion overload.

**Exit criterion:** bronze count on the page (count occurrences of `acc-100` / `text-acc-100` / `bg-acc-100`) is lower than before, and the page still passes the cockpit scene sentence.

### 3f. Polish

```text
/impeccable polish <page>
```

**Final per-page pass:** spacing rhythm, alignment grid, focus-visible rings, hover/active state symmetry, hairline borders vs surface contrast.

**Exit criterion:**

- `pnpm lint` 0 errors.
- `pnpm lint:strict` 0 errors.
- `pnpm exec tsc --noEmit` clean.
- Manual smoke pass on the golden path documented in the log.
- WCAG checklist from CLAUDE.md (keyboard, aria, focus ring, reduced-motion, AA contrast) ticked.

---

## Phase 4 — Enhancement _(opt-in, justify each)_

For a cockpit product, default to **skipping this entire phase**. Run a step only when Phase 3's polish left a deliberate gap that the enhancement closes. Write the justification in the log _before_ running the command.

### 4a. Animate _(opt-in)_

```text
/impeccable animate <page>
```

**Allowed motions:** state transitions, hierarchy reveals, value-change tweens. **Banned:** entrance animations on static content, parallax, scroll-jacking, micro-interactions on every hover.

**Exit criterion:** every animation honors `prefers-reduced-motion`. No animated CSS layout properties. Easing is `ease-out-quart`/`quint`/`expo`. No bounce.

### 4b. Bolder _(opt-in, rare)_

```text
/impeccable bolder <page>
```

**When:** the page reads as bland or interchangeable after polish. Almost never the dashboard, which trades on restraint.

### 4c. Delight _(opt-in, rarer)_

```text
/impeccable delight <page>
```

**When:** there is a single moment of significance (first trade logged, week closed, monthly review opened) that deserves a one-time grace note. Never run as a default sweep step.

### 4d. Overdrive _(opt-in, rarest)_

```text
/impeccable overdrive <page>
```

**Almost never used on product surfaces.** Reserved for brand-register routes.

---

## Sign-off checklist

Before declaring the page done, confirm in the findings log:

- [ ] Phase 1 synthesis written, with severity labels.
- [ ] Phase 2 actions either taken or explicitly skipped with reason.
- [ ] Phase 3 steps 3a–3d and 3f completed; 3e completed or explicitly skipped.
- [ ] Phase 4 entirely skipped, or each step has a one-line justification.
- [ ] `pnpm lint` / `pnpm lint:strict` / `pnpm exec tsc --noEmit` all green.
- [ ] WCAG checklist ticked.
- [ ] Findings log committed under `docs/scans/`.
- [ ] `docs/backlog.md` updated with any cross-page issues this sweep surfaced.
- [ ] Conventional Commit messages for each Phase 3 step (`refactor(<page>): …`, `fix(<page>): …`, `style(<page>): …`).

---

## Example invocation: dashboard

Concrete walkthrough for the first run.

1. Pre-flight scene sentence: _"Solo day trader at 8:55 a.m. ET, 27-inch monitor in a dim office, scanning their command center for today's setup and yesterday's leftovers."_
2. Create `docs/scans/2026-05-12-impeccable-dashboard.md` with empty Phase 1a / 1b / 1-synthesis / 2 / 3a–f / 4 sections.
3. Run `/impeccable critique dashboard`. Paste output into 1a. Severity-label each item.
4. Run `/impeccable audit dashboard`. Paste output into 1b. Severity-label each item.
5. Write Phase 1 synthesis (3–5 bullets).
6. If synthesis flags any pattern repeating with other pages already swept (or expected to be swept), `/impeccable extract <pattern>` and log under 2a. Otherwise skip 2a with one-line reason.
7. `/impeccable clarify dashboard` → commit → log 3a.
8. `/impeccable adapt dashboard` → commit → log 3b with five-width screenshots.
9. `/impeccable harden dashboard` → commit → log 3c with each state named.
10. `/impeccable distill dashboard` → commit → log 3d with what was removed.
11. _(opt-in)_ `/impeccable quieter dashboard` if audit flagged bronze over-use; otherwise skip with one-line reason.
12. `/impeccable polish dashboard` → commit → run lint / lint:strict / tsc → log 3f.
13. Phase 4: default skip. Note in log.
14. Sign-off checklist → commit findings log → update `docs/backlog.md`.

This same recipe runs for `journal`, `playbooks`, `settings`, etc. — replace `<page>` everywhere, keep everything else identical.
