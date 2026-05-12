# Impeccable sweep — `/journal/[id]` (trade detail)

**Date**: 2026-05-12
**Page**: `src/app/[locale]/(app)/journal/[id]/page.tsx`
**Register**: product
**Theme decision**: dark-first (default surface for after-market review)
**Color strategy**: restrained — tinted neutrals carry the surface; `acc-100` reserved for chart leads + a single section anchor + focus rings; trade-buy/sell reserved for P&L magnitude only.

## Scene sentence

A solo TAT-mentorship trader at 4:55 p.m. ET, market closed, opens one of today's trades — a winning long NQ scalp — on a 27-inch monitor in dim afternoon light, scrolling from header → metrics → executions → notes to determine whether the win came from process or luck.

The view is _forensic_: the trader is not deciding what to do next. They are _judging themselves_. The interface must show structure (entry, risk, R achieved, rating, plan adherence) without congratulating the green P&L or condemning the red. Color must encode the axis being examined, not "good/bad."

## Surface inventory

| File                                                    | Role                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/app/[locale]/(app)/journal/[id]/page.tsx`          | Server component, full detail (header card, metrics grid, executions, R analysis, MFE/MAE, classification, journal notes) |
| `src/app/[locale]/(app)/journal/[id]/delete-button.tsx` | Inline two-step delete confirmation                                                                                       |
| `src/components/journal/trade-detail-layout.tsx`        | Chart ↔ details view switcher + unsaved-changes AlertDialog                                                               |
| `src/components/journal/trade-info-panel.tsx`           | Side panel inside chart view (tabs: stats / notes / executions)                                                           |
| `src/components/journal/trade-info-stats-tab.tsx`       | Stats tab — duplicates classification + rating + followed-plan logic from page.tsx                                        |
| `src/components/journal/trade-info-notes-tab.tsx`       | Notes editing form, rating roving-tabindex radio group                                                                    |
| `src/components/journal/trade-info-executions-tab.tsx`  | Executions list (correctly uses action-buy/sell)                                                                          |
| `src/components/journal/pnl-display.tsx`                | Currency P&L primitive (correctly uses trade-buy/sell)                                                                    |

## Phase 1a — Critique (UX + design laws)

### P0 — Severity / classification miscoded as P&L (`text-trade-buy/sell` overload)

| Where                              | Code                                                                                           | Problem                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx:171-175`                 | direction badge: `border-trade-buy/30 text-trade-buy` / `border-trade-sell/30 text-trade-sell` | Direction is _action_, not P&L. A long can lose; a short can win. The panel's `trade-info-stats-tab.tsx:93-97` correctly uses `action-buy/sell`. Page must match. |
| `page.tsx:259-267`                 | followedPlan=true: `bg-trade-buy/20 text-trade-buy`                                            | Plan adherence is a binary discipline signal, not a P&L magnitude. Should be neutral/info, not "win color."                                                       |
| `page.tsx:277-292`                 | rating badges A→F gradient: `bg-trade-buy/20 ... bg-trade-sell/20`                             | Rating is execution quality. Mixing it with P&L color implies "A trades = profitable trades," which is the precise lesson the journal is meant to _unteach_.      |
| `page.tsx:436-443`                 | setupTags: `bg-trade-buy/10 text-trade-buy`                                                    | Setup classification is metadata, not outcome.                                                                                                                    |
| `trade-info-stats-tab.tsx:251-261` | rating badges in side panel                                                                    | Same violation.                                                                                                                                                   |
| `trade-info-stats-tab.tsx:272-279` | followed-plan badge in side panel                                                              | Same violation.                                                                                                                                                   |
| `trade-info-stats-tab.tsx:303-310` | setupTags in panel                                                                             | Same violation.                                                                                                                                                   |
| `trade-info-notes-tab.tsx:25-31`   | `GRADE_COLORS` map used while editing the rating                                               | Same violation in the edit affordance — the trader is taught the wrong code when they pick a grade.                                                               |

### P1 — Bronze saturation (Earned-Bronze rule)

`acc-100` should appear at most twice in a single screen. Current count: **5+ concurrent surfaces**.

| Where                              | Use                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `page.tsx:368`                     | `<Target className="text-acc-100">` heading icon for "Risk/Reward Analysis" |
| `page.tsx:419`                     | `<TrendingUp className="text-acc-100">` heading icon for "Classification"   |
| `page.tsx:454-461`                 | every general tag chip is `bg-acc-100/10 text-acc-100`                      |
| `trade-detail-layout.tsx:145`      | chart-toggle button: `border-acc-100/40 text-acc-100 hover:bg-acc-100/10`   |
| `trade-info-stats-tab.tsx:321-328` | general tags in panel: same bronze chip                                     |

Decision: keep one anchored bronze on the page (the R-analysis Target icon — that IS the "key context metric"), demote the other four to neutral.

### P1 — Em-dash glyph as data placeholder

- `page.tsx:344` risk-amount fallback `"—"`. The design-laws em-dash ban is for prose punctuation, but using the U+2014 glyph as a "no data" placeholder is inconsistent with `TradeRow`'s hyphen `"-"`. Normalize to hyphen with `text-txt-300`.

### P1 — Decorative glyph read aloud

- `page.tsx:194` `<span>→</span>` between entry and exit dates — screen reader hears "right arrow." Mark `aria-hidden`.
- `page.tsx:189` `<Calendar className="h-4 w-4" />` — decorative, missing `aria-hidden`.

### P2 — Cards-everywhere rhythm

Every section is wrapped in a `<Card>`: header, metrics-grid (a grid of 4 cards), executions section (separately cards itself), R analysis, MFE/MAE, classification, journal notes. Seven discrete card surfaces stacked vertically. Shared design laws: _"Cards are the lazy answer. Use them only when they're truly the best affordance. Nested cards are always wrong."_ The metrics grid is _4 cards inside a card-rhythm of cards_ — not nested literally, but visually flat in a sea of containers. Out of scope for this sweep (touches the page's whole architecture); flag for a future `distill` pass.

## Phase 1b — Audit (a11y, semantics, lint)

### P0 — Interactive nesting

- `page.tsx:203-213` `<Link><Button>...</Button></Link>` — an `<a>` wrapping a `<button>`. Invalid HTML; double interactive role. Should be `<Button asChild><Link>...</Link></Button>` or a plain styled `<Link>`. Project pattern from journal-list TradeRow: Link with rendered content, no nested Button.

### P1 — Redundant `tabIndex={0}` on focusable elements

- `trade-info-notes-tab.tsx:194, 215` — `tabIndex={0}` on `<button>` is redundant.
- `trade-info-notes-tab.tsx:271` — `tabIndex={0}` on the rating `<div role="radiogroup">` while children carry roving tabindex `0/-1`. The container `tabIndex={0}` causes a double tab stop. Remove it; the active radio child already takes focus.

### P1 — Followed-plan toggle pattern

- `trade-info-notes-tab.tsx:186-233` two `<button aria-pressed>` inside a `role="group"`. Defensible (mutually-exclusive toggle), but a `radiogroup` with `aria-checked` + roving tabindex would match the rating control's pattern below it. Out of scope; flag.

### P2 — Detail-page delete uses inline confirm, not AlertDialog

- `delete-button.tsx` mirrors `TradeRow` inline pattern: click → custom Yes/No buttons appear next to it. The detail-page deletion is permanent and high-context (the trader is _looking at_ the record they will destroy), so `AlertDialog` is more appropriate here than for the list row. Out of scope (CLAUDE.md only bans `window.confirm`, not the inline pattern), backlog.

### P2 — h-50 token drift

- `journal/[id]/page.tsx` shell uses no `h-50` Suspense fallback (server component, no Suspense), so this audit item from journal-list does not recur here.

## Phase 2 — System-level extracts

Three components are duplicated 1:1 between `page.tsx` and `trade-info-stats-tab.tsx`. After Phase 3 we will fix correctness in three places per change; extracting once means future drift is impossible.

| Component             | Surface                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `<TradeTag>`          | Classification chip: `kind: "setup" \| "mistake" \| "general"` — neutral surface for setup/general, warning for mistake.                 |
| `<RatingBadge>`       | Execution-rating chip: `grade: "A" \| "B" \| "C" \| "D" \| "F"` — severity ladder (neutral → warning → error), not trade-color gradient. |
| `<FollowedPlanBadge>` | Discipline chip: `followed: boolean` — neutral check for true, warning alert for false.                                                  |

Decision: extract to `src/components/journal/trade-badges.tsx` (single co-located file). Used by `page.tsx`, `trade-info-stats-tab.tsx`. The editing affordance in `trade-info-notes-tab.tsx` uses a different visual treatment (large buttons, not chips), so the `GRADE_COLORS` map there stays local but is rewritten to match the badge's severity ladder.

## Phase 3 — Per-page corrections

### `clarify`

- Risk-amount fallback `"—"` → `"-"` (hyphen, matches TradeRow). No copy change needed; preserves localization-free placeholder.

### `adapt`

- No layout changes — page already has `sm:` / `lg:` rhythm. Skip.

### `harden`

- Fix interactive nesting `<Link><Button>` → `<Button asChild><Link>` (or styled Link).
- Add `aria-hidden` to decorative `Calendar` icon and `→` separator.
- Drop redundant `tabIndex={0}` on `<button>` and on the rating `<div role="radiogroup">`.

### `distill`

- Reduce bronze surfaces from 5 to 2: keep Target icon on R-analysis; demote TrendingUp on Classification to `text-txt-300`; demote chart-toggle button to neutral outline (no bronze border/text); recolor general tags to neutral `bg-bg-300 text-txt-200`.

### `quieter`

- Direction badge: `text-trade-buy/sell` → `text-action-buy/sell` (match panel).
- followedPlan=true: neutral surface + check icon (drop trade-buy fill).
- Rating gradient: rewrite to severity ladder (A → neutral strong; B → neutral; C → warning; D → warning soft; F → error).
- Setup tags: drop trade-buy fill, use neutral `bg-bg-300 text-txt-200`.
- Mistake tags: keep warning (correct already).
- General tags: drop bronze, use neutral.

### `polish`

- Verify after refactor: lint 0, lint:strict 0, typecheck clean, manual smoke on win/loss/breakeven trade and on rating A through F.

## Phase 4 — Default skips (product register)

`overdrive`, `colorize`, `delight`, `animate`, `bolder`, `onboard`, `typeset`, `layout`, `optimize` — none required this sweep.

## Files touched (manifest)

- `src/components/journal/trade-badges.tsx` (new) — `<TradeTag>`, `<RatingBadge>`, `<FollowedPlanBadge>`.
- `src/components/journal/index.ts` — export the new badges.
- `src/app/[locale]/(app)/journal/[id]/page.tsx` — direction badge color; followed-plan badge; rating badge; setup/general tags; bronze pruning; `aria-hidden` on decorative icons/glyphs; Link/Button nesting.
- `src/components/journal/trade-info-stats-tab.tsx` — rating badge; followed-plan badge; setup/general tags via new components.
- `src/components/journal/trade-info-notes-tab.tsx` — rewrite `GRADE_COLORS` to severity ladder; drop redundant `tabIndex={0}` × 3.
- `src/components/journal/trade-detail-layout.tsx` — chart-toggle button neutral outline.
- (No i18n keys added — placeholder normalization is `"-"` literal.)

## Deferred (backlog candidates)

- Inline delete → `AlertDialog` on detail page (permanent action in high-context view).
- Followed-plan toggle in notes tab: convert from `aria-pressed` group to `radiogroup` for visual consistency with the rating control directly below it.
- Card-rhythm `distill` pass: the page is seven stacked cards. Consider flat section + Separator rhythm for at least 2 of them (MFE/MAE, Classification).

## Sign-off

3-commit slice: refactor → chore(extract) → docs.
