# Scan ROI Plan — Subject-First Sweeps

**Date**: 2026-05-07
**Branch**: `feat/yearly-tax-reporting`
**Author**: Arch (Claude) + Ygor
**Status**: plan; execution deferred — run after `docs/hardening-plan-2026-05-07.md`

## Why this doc

`/scan` defaults to **vertical** sweeps (one feature at a time). High value, but misses **class bugs** that span every feature — one bad memo pattern repeated 30×, one missing `aria-label` style across all icon buttons, one untranslated hardcoded string in every cockpit card.

This plan defines **horizontal subject sweeps**. Each pass covers one concern across the whole app. Output of each pass = greppable detectors added to `/scan` Phase 0 → next vertical scans pre-flight them automatically. Compounds.

## Sequencing

1. Land `docs/hardening-plan-2026-05-07.md` first (ESLint / TS / Tailwind rules). That layer kills the easiest class bugs at write-time.
2. Run subject sweeps below in **recommended order** (Section 5). Each sweep produces:
   - `docs/scans/YYYY-MM-DD-<subject>.md` (Phase 5a artifact)
   - New entries in `~/.claude/memory.md` Anti-Pattern Catalog
   - New detectors for `/scan` Phase 0
3. Re-run vertical `/scan <feature>` on Tier-S features (`journal`, `command-center`, `analytics`) — they will now pre-flight every catalogued detector before launching diagnose agents.

---

## Tier S — high blast, high debt

### 1. Performance (re-renders, memo, server vs client)

- **Why**: Trading tool used live during market hours. Jank = lost trust. `react-best-practices` skill exists; debt likely accrued.
- **Hot targets**: `analytics` (charts + filters), `journal` (trade list virtualization), `command-center` (live data), `backtest` (heavy compute).
- **Expected findings**: inline object props, missing `useMemo` on chart datasets, client components that should be RSC, `'use client'` leaking too high in tree.
- **Skill**: `/scan` + `optimize` skill, `react-best-practices` rules.
- **Detectors to capture**:
  - `rg -n "=\{\{[^}]*\}\}" src/components` → inline object/style props
  - `rg -n "^'use client'" src/app` cross-checked against components that don't need state/effects.

### 2. Accessibility (a11y / keyboard / ARIA / contrast)

- **Why**: WCAG AA non-negotiable per CLAUDE.md. Keyboard-first brand promise.
- **Hot targets**: `journal/new` (forms), `command-center` (selectors), `settings`, all `ui/*` primitives, all modal/slideover.
- **Expected findings**: missing focus rings, no `aria-label` on icon buttons, tab traps in slideovers, contrast on gold-on-light surfaces.
- **Skill**: `audit` + `harden`.
- **Detectors**:
  - `rg -n '<button[^>]*>\s*<(svg|[A-Z])' src/` → icon-only buttons missing label
  - `rg -n 'onClick' src/components | rg -v 'aria-|role='` → click handlers without semantics

### 3. i18n coverage (hardcoded strings)

- **Why**: Mentorship audience global. Mechanical sweep = huge yield. `i18n-translator` skill exists.
- **Hot targets**: every new file on this branch (cockpit components, `tax/*`, `reports`).
- **Expected findings**: literal English strings in JSX, untranslated error messages, hardcoded `aria-label`.
- **Skill**: `i18n-translator`.
- **Detectors**:
  - `rg -n '>[A-Z][a-z]+ [A-Z]?[a-z]+' src/components/**/*.tsx` → English-looking JSX text nodes
  - `rg -n 'aria-label="[A-Z]' src/` → hardcoded aria labels

### 4. Theming / design tokens (color, spacing, typography drift)

- **Why**: "Gold is earned" principle dies on token drift. Cockpit scan already proved drift exists (`docs/scans/2026-05-07-cockpit-tokens.md`) — likely repeats elsewhere.
- **Hot targets**: `tax/*`, `reports`, `playbook`, `analytics`, all new fractal-plan components.
- **Expected findings**: raw hex, `text-yellow-500` instead of `text-acc-100`, `gap-3` mixed with `gap-4` randomly, `font-bold` overuse.
- **Skill**: `normalize` + `theme-designer` agent.
- **Detectors**: already partially covered by `eslint-plugin-better-tailwindcss` after hardening plan lands. Extend with:
  - `rg -n '#[0-9a-fA-F]{3,8}' src/components` → raw hex
  - `rg -n 'text-(yellow|amber|orange)' src/` → semantic-color bypass

---

## Tier A — high stakes, narrower

### 5. Type safety (`any`, missing `import type`, default exports)

- **Why**: CLAUDE.md hard rules. `clean-any` skill exists. One sweep = compile-time guarantees.
- **Hot targets**: `src/app/actions/*`, `src/lib/tax/*`, importers, `lib/fractal-plan/*`.
- **Expected findings**: `any` at API boundaries, value-position type imports, default exports in components.
- **Skill**: `clean-any`.
- **Detectors**:
  - `rg -n ': any\b|as any\b' src/`
  - `rg -n '^export default' src/components src/lib`

### 6. Server-action / data-fetch correctness

- **Why**: Trust boundary. `"use server"` type-export footgun is known catalogued class bug.
- **Hot targets**: `src/app/actions/*`, all `page.tsx` data fetches, `src/lib/tax/recompute-month.ts` (modified on branch).
- **Expected findings**: types exported from `"use server"` files, missing input validation, N+1 DB calls.
- **Skill**: manual + `feature-dev:code-reviewer`.
- **Detectors**:
  - `rg -lF '"use server"' src/ | xargs rg -n '^export (type|interface)'` → footgun
  - `rg -n 'await db\.' src/app/actions | wc -l` (manual review for N+1 patterns)

### 7. Responsiveness (mobile + tablet)

- **Why**: Traders check on phone pre/post-market. Cockpit + plan likely desktop-only.
- **Hot targets**: `plan/*` (wide tables), `analytics` (charts), `journal` (forms), `command-center`.
- **Expected findings**: horizontal scroll on `<md`, touch targets <44px, fixed `px` widths, slideovers full-screen broken.
- **Skill**: `adapt`.
- **Detectors**:
  - `rg -n '\bw-\[[0-9]+px\]' src/` → fixed pixel widths
  - `rg -n '\b(min|max)-w-\[[0-9]+px\]' src/`

### 8. Loading / error / empty states

- **Why**: "Professional-grade resilience" principle. Most likely silently broken.
- **Hot targets**: every async page (`analytics`, `reports`, `backtest`, `monte-carlo`, `imports`).
- **Expected findings**: missing `loading.tsx`, no skeleton, raw "undefined" leaks, no empty-state copy.
- **Skill**: `harden`.
- **Detectors**:
  - `find src/app -name 'page.tsx' | while read p; do d=$(dirname "$p"); test -f "$d/loading.tsx" || echo "missing: $d"; done`
  - `rg -n '\?\? .undefined.|: .undefined.' src/`

### 9. Security (auth, input, server actions)

- **Why**: User financial data. `/security-review` skill exists.
- **Hot targets**: `auth*`, `proxy.ts` (modified on branch), `imports` (CSV parse), `actions/*`.
- **Expected findings**: missing CSRF on actions, unsanitized CSV cell, session edge cases, raw SQL.
- **Skill**: `security-review`.
- **Detectors**:
  - `rg -n 'sql\`' src/` → raw SQL templates (verify all are safe)
  - `rg -n 'dangerouslySetInnerHTML' src/`

---

## Tier B — quality / polish

### 10. Code conventions (CLAUDE.md compliance)

- **Why**: Mechanical, easy fix, raises floor everywhere.
- **Hot targets**: whole `src/` — sweep with detectors first.
- **Expected findings**: `function foo()` instead of arrow, missing `handle*` prefix, mixed tabs/spaces.
- **Skill**: manual + ESLint hardening (after Phase 1 hardening plan lands).
- **Detectors**:
  - `rg -n '^(export )?function [a-z]' src/components` → non-arrow
  - `rg -n 'on[A-Z][a-z]+=\{[a-z]+(?!handle)' src/` → handlers not prefixed

### 11. Animation / motion polish

- **Why**: Brand principle "motion serves function". `prefers-reduced-motion` likely missing.
- **Hot targets**: slideovers, page transitions, cockpit cards.
- **Expected findings**: no reduced-motion guard, decorative animations, missing layout transitions where they would clarify state change.
- **Skill**: `animate` + `react-animation-specialist` agent.
- **Detectors**:
  - `rg -n 'transition|animate-' src/components | rg -v 'motion-reduce'` → animations without reduced-motion variant

### 12. Information density / hierarchy (`/critique`, `/arrange`)

- **Why**: Cockpit-feel brand promise. Subjective but high-signal.
- **Hot targets**: `analytics` dashboards, `command-center`, `plan` overview pages.
- **Expected findings**: bold overuse, weak hierarchy, divider-heavy instead of whitespace.
- **Skill**: `critique` then `arrange`.
- **Detectors**: visual review only — no greppable signal.

### 13. Copy / clarity (`/clarify`)

- **Why**: Error messages, empty-state copy, button labels.
- **Hot targets**: `imports` (parse errors), `auth`, `settings`, form validation.
- **Expected findings**: "Error occurred" generic strings, "Submit" instead of action verbs.
- **Skill**: `clarify`.
- **Detectors**:
  - `rg -n '"(Error|Submit|OK|Cancel|Failed)"' src/`

---

## Tier C — meta sweeps

### 14. Test coverage gaps

- **Why**: `src/__tests__` exists — find untested critical paths.
- **Hot targets**: `lib/tax/*`, `lib/fractal-plan/*`, importers, monte-carlo math.
- **Skill**: `test-architect`.
- **Detectors**:
  - `find src/lib -name '*.ts' -not -name '*.test.ts' | while read f; do test -f "${f%.ts}.test.ts" || echo "no test: $f"; done`

### 15. Bundle size / dead code

- **Why**: Library audit per CLAUDE.md (avoid abandoned/unused deps).
- **Hot targets**: `package.json` deps, `src/lib/*`, unused exports.
- **Skill**: manual + `bun run build --analyze` (if available).
- **Detectors**:
  - `bunx knip` → dead code if installed
  - `bunx depcheck`

### 16. DB / schema correctness

- **Why**: TZ-naive `Date` vs `timestamptz` is catalogued anti-pattern.
- **Hot targets**: `src/db/*`, all `lib/*` doing date math.
- **Skill**: `feature-dev:code-reviewer` + manual.
- **Detectors**:
  - `rg -n 'new Date\(' src/lib src/app | rg -v 'test'` → review each for TZ correctness

---

## Recommended execution order

| # | Subject | Why first | Cost | Yield |
|---|---------|-----------|------|-------|
| 1 | i18n coverage | Mechanical, biggest visible win, fastest scan | low | high |
| 2 | Theming tokens | Already proven detectable; extend cockpit-scan reach | low | high |
| 3 | Performance | Highest user-felt impact; skill primed | medium | high |
| 4 | Accessibility | Non-negotiable baseline before shipping branches | medium | high |
| 5 | Responsiveness | Single afternoon sweep, big mobile-user payoff | medium | medium |
| 6 | Type safety | Mechanical, compounds with hardening plan ESLint rules | low | medium |
| 7 | Server-action correctness | Trust boundary; one footgun = data corruption | medium | high |
| 8 | Loading/error/empty states | Polish gap most visible to new users | medium | medium |
| 9 | Security | Run before any prod deploy of branch | high | high |
| 10+ | Tier B/C subjects | After Tier S/A catalog stabilizes | varies | varies |

After subjects 1–4 land, vertical scans (`/scan journal`, `/scan command-center`, `/scan analytics`) gain Phase 0 detectors → cheaper, more thorough each run.

## Done-criteria per sweep

- `docs/scans/YYYY-MM-DD-<subject>.md` written with full Phase 5 sections.
- Every CRITICAL/HIGH finding either fixed, marked `wontfix`, or marked `deferred` with explicit reason.
- ≥1 greppable detector added to `~/.claude/memory.md` Anti-Pattern Catalog if class-bug recurs.
- TypeScript clean (`bunx tsc --noEmit --pretty false`).
- No new ESLint regressions vs base branch.

## Out of scope

- Whole-codebase mega-scan in one shot — violates `/scan` skill rules and floods context.
- Pre-existing scan targets (cockpit tokens, yearly tax reports) — only re-scan if a Tier-S subject sweep flags drift in those areas.
