# /impeccable sweep — playbook list (`/playbook`)

**Date:** 2026-05-12
**Wave / row:** 1 — Daily cockpit, row #5
**Register:** product (app UI)
**Scope:** `/playbook` route only. Strategy detail (`/playbook/[id]`) is row #6, separate sweep.

---

## Preflight — scene

A TAT-mentorship trader at 8:15 a.m. ET, pre-open, sitting at a 27-inch monitor in a dimly lit home office, opens `/playbook` to refresh the day's setup priorities. They glance at the compliance donut to check whether yesterday's discipline held, scan the strategy grid for the highest-conviction setup, and click into one card to revisit its conditions before market open. The page must answer two questions in under five seconds: _"am I drifting on discipline?"_ and _"which playbook am I trading first?"_

---

## Phase 1a — critique

### P0 — trade-color leaking into compliance everywhere

The compliance ladder uses `text-trade-buy` / `text-trade-sell` / `bg-trade-buy` / `bg-trade-sell` in four places. Compliance is **discipline / process**, not P&L magnitude. Same anti-pattern we just retired on the journal-detail sweep — green wins / red losses must not double as discipline cues.

Offending surfaces in this sweep:

- `src/components/playbook/strategy-card.tsx:75-78` — `complianceColor` ladder
- `src/components/playbook/strategy-card.tsx:240,243` — compliance progress-bar fill
- `src/components/playbook/compliance-dashboard.tsx:38-41` — `complianceColor` ladder
- `src/components/playbook/compliance-dashboard.tsx:85-90` — donut stroke (`var(--color-trade-buy)` / `var(--color-trade-sell)`)
- `src/components/playbook/compliance-dashboard.tsx:126,132,139,143` — followed/deviated stacked bar segments and label colors
- `src/components/playbook/compliance-dashboard.tsx:156-165` — "Best compliance" highlight card (full block + icon + label)

**Correct ladder** (matches the rating-grade pattern from journal-detail):

- ≥ 80% → `text-txt-100` + `bg-bg-300` accent (excellence is _neutral with poise_; gold ring only on the donut)
- 50–79% → `text-warning` + `bg-warning/...` (drift, but recoverable)
- < 50% → `text-fb-error` + `bg-fb-error/...` (red zone — discipline failure)

The donut keeps a single `acc-100` ring as the "earned-bronze" anchor for the headline metric (one bronze use on the whole page).

### P1 — bronze is spent, not earned

Every `StrategyCard` paints its header icon with `bg-acc-100/20 text-acc-100`. A grid of 10 strategies = 10 bronze chips before the user has done anything. Per the earned-bronze rule, gold must be reserved for moments of significance, not used as a default branded chrome.

Demote to `bg-bg-300 text-txt-200` and reserve bronze for the compliance donut centre (the page's single headline metric).

### P2 — repeated card chrome

Both the compliance overview and the strategy grid live inside the same `border-bg-300 bg-bg-200 p-... rounded-lg border` wrapper. With ~6+ strategy cards inside the second wrapper, the page reads as nested cards (shared design law: "nested cards are always wrong"). Deferred — not blocking — but flagged in backlog for a distill pass.

### P3 — Target R / Max Risk badges trade-coloured

`strategy-card.tsx:255` paints `TrendingUp text-trade-buy` for the "target R" badge; `:266` paints `TrendingDown text-trade-sell` for "max risk". Target R is a planning parameter (the strategy's goal), not a winning P&L; Max Risk is a configured constraint, not a loss. Demote both to `text-txt-300` so the icon serves wayfinding only.

---

## Phase 1b — audit

### P1 — `<Link><Button>` nesting in `playbook-content.tsx`

Lines 99-104 and 119-124 nest `<Button>` inside `<Link>`. The project pattern is `<Button asChild><Link>...</Link></Button>` so the rendered element is a single anchor with button styling. Fix both spots.

### P2 — decorative icons missing `aria-hidden`

Across the three files: `Plus`, `Target`, `Edit`, `Trash2`, `Eye`, `TrendingUp`, `TrendingDown`, `Filter`, `ImageIcon`, `CheckCircle`, `XCircle`, `AlertTriangle`. None of these convey meaning beyond their adjacent text labels; add `aria-hidden="true"` consistently.

### P3 — custom dropdown should be Radix `DropdownMenu`

`strategy-card.tsx:109-181` rolls a custom dropdown with manual focus management (`menuRef`, `menuButtonRef`, arrow-key handlers, escape close). The project ships `@/components/ui/dropdown-menu` (Radix). Migrating gets us correct focus trapping, portal rendering, and outside-click handling for free. **Deferred** — out of scope for a colour sweep. Tracked in backlog.

---

## Phase 2 — system-level extracts

### `src/lib/compliance.ts` — single source of truth for the compliance ladder

The compliance colour ladder is duplicated three times in this sweep (`strategy-card.tsx`, `compliance-dashboard.tsx`) and a fourth time on the detail page (`/playbook/[id]/page.tsx`, row #6 — picked up in the next sweep). Extract:

```ts
type ComplianceTone = {
  text: string       // text-* token
  bg: string         // bg-*  token (low-opacity surface)
  border: string     // border-* token
  ringStroke: string // SVG stroke var(--color-*)
  fill: string       // bg-*  solid token (for filled bars)
}

const getComplianceTone = (percent: number): ComplianceTone => { ... }
```

Both pages adopt the same helper. Future colour shifts land in one file; visual drift becomes impossible.

---

## Phase 3 — corrections (this slice)

Files touched:

1. **NEW** `src/lib/compliance.ts` — `getComplianceTone()` helper.
2. `src/components/playbook/strategy-card.tsx` — adopt helper; demote bronze icon-chip; aria-hidden pass; Target R / Max Risk icons → neutral; remove unused `ColoredValue` trade colouring if needed.
3. `src/components/playbook/compliance-dashboard.tsx` — adopt helper; SVG donut stroke via helper; "Best compliance" card uses neutral ladder; aria-hidden pass.
4. `src/components/playbook/playbook-content.tsx` — `<Button asChild>` wrap on both Link/Button pairs; aria-hidden on `Plus`.

Deferred to backlog:

- Radix `DropdownMenu` migration for `StrategyCard`.
- Nested-card distill pass on `/playbook`.
- (Already tracked) Account-aware compact currency formatter — keeps hardcoded `"R$"` for now.

---

## Phase 4 — register check (product)

Product register: app UI serving the trader's pre-market scan. Default-skip motion, decorative animation, and any non-functional flourishes. The compliance donut is the single signal-of-the-day; everything else is wayfinding.
