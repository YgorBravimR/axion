# Impeccable sweep — Wave 5 Form Editors (rows #19-22)

**Date:** 2026-05-12
**Wave:** 5 / Form Editors
**Routes covered:**

- Row #19 — `src/app/[locale]/(app)/journal/new/page.tsx`
- Row #20 — `src/app/[locale]/(app)/journal/[id]/edit/page.tsx`
- Row #21 — `src/app/[locale]/(app)/playbook/new/page.tsx`
- Row #22 — `src/app/[locale]/(app)/playbook/[id]/edit/page.tsx`

Combined scan rationale: rows #19 and #20 both mount the shared `<TradeForm />` (with #19 also gating `<ScaledTradeForm />` behind premium); rows #21 and #22 share an almost-identical "basic info / rules / risk / conditions / scenarios" structure. Per Wave 4 precedent, one combined doc beats four siloed scans that would duplicate 80% of content.

---

## Phase 0 — Orchestrator inventory

| Row | Page                                                      | Mounts                                                                                                                                               |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| #19 | `journal/new/page.tsx` (62L, server)                      | `<NewTradeTabs />` → conditionally `<TradeForm />` or `<ScaledTradeForm />` (premium) + `<CsvImport />` / `<NotaImport />` / `<OcrImport />` per tab |
| #20 | `journal/[id]/edit/page.tsx` (53L, server)                | `<TradeForm />` directly (simple mode only)                                                                                                          |
| #21 | `playbook/new/page.tsx` (403L inline client)              | Inline form + `<ConditionPicker />` (premium) + `<ImageUpload />`                                                                                    |
| #22 | `playbook/[id]/edit/edit-strategy-form.tsx` (416L client) | Same as #21 + `<ScenarioSection />` (post-create only)                                                                                               |

CSV/Nota/OCR import widgets within `NewTradeTabs` are explicitly out-of-scope for this sweep — they belong to a later "ingestion" wave (CSV/OCR/Nota import flows have their own preview/match UX that deserves a dedicated scan).

---

## Phase 1a — Token-discipline scan (trade colors, bronze, verdict triad)

### Journal — `trade-form.tsx`

| Loc           | Element                                              | Treatment                                                                                     | Verdict                                                                                                                                                    |
| ------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L132-140      | `GRADE_COLORS` map (A/B/C/D/F rating buttons)        | `trade-buy` (A) → `trade-buy/70` (B) → `warning` (C) → `trade-sell/70` (D) → `trade-sell` (F) | **Verdict-as-P&L hijack.** Rating is an execution-quality verdict, not signed profit. Bronze-or-red here mimics P&L semantics.                             |
| L1378-1379    | `calculatedPnl` net P&L display                      | `text-trade-buy / text-trade-sell` based on `netPnl >= 0`                                     | **Correct.** Signed money magnitude.                                                                                                                       |
| L1499 / L1513 | `followedPlan` Yes/No toggle                         | `trade-buy` (Yes), `trade-sell` (No)                                                          | **Verdict-as-P&L hijack.** "Did I follow my plan?" is a discipline verdict, not profit polarity.                                                           |
| L1652         | Setup-tags pill (selected state)                     | `trade-buy`                                                                                   | **Category-as-P&L hijack.** Setup-type labels are categorical (e.g., "Breakout", "Pullback"), not signed profit.                                           |
| L1678         | Mistake-tags pill (selected state)                   | `warning`                                                                                     | **Correct.** Mistake = warning verdict slot in the triad.                                                                                                  |
| L1100, L1706  | setupRank pill (active) / general-tags pill (active) | `acc-100`                                                                                     | Bronze for active categorical selection. Conventional within this codebase (Linear-style "active = brand accent"). Documenting as canonical, not flagging. |
| L728 / L743   | Long/Short direction toggle                          | `action-buy` / `action-sell` (sky blue / orange)                                              | **Correct.** Directional action palette, distinct from P&L.                                                                                                |

### Journal — `scaled-trade-form.tsx`

| Loc           | Element                                 | Treatment                                      | Verdict                                                                                                                                         |
| ------------- | --------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| L777-785      | Position status display ("open" branch) | `text-trade-buy` for `status === "open"`       | **Verdict-as-P&L hijack.** Position status (open/partial/closed) is categorical state, not signed profit. "Open" = "running", not "profitable". |
| L831-833      | `netPnl` display                        | `text-trade-buy / sell` based on `netPnl >= 0` | **Correct.** Signed money magnitude.                                                                                                            |
| L1074 / L1088 | `followedPlan` Yes/No toggle            | `trade-buy` (Yes), `trade-sell` (No)           | **Verdict-as-P&L hijack** (same as `trade-form.tsx`).                                                                                           |
| L1135         | Setup-tags pill (selected)              | `trade-buy`                                    | **Category-as-P&L hijack** (same as `trade-form.tsx`).                                                                                          |
| L1160         | Mistake-tags pill (selected)            | `warning`                                      | **Correct.**                                                                                                                                    |
| L1186         | General-tags pill (selected)            | `acc-100`                                      | Conventional. Not flagging.                                                                                                                     |

### Journal — `new-trade-tabs.tsx`

| Loc                   | Element                                              | Treatment             | Verdict                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L83, L103, L120, L137 | Active-tab indicator (`border-acc-100 text-acc-100`) | Bronze for active tab | **Borderline but accepting.** Only one tab is active at a time; bronze never proliferates. Mirrors Linear/Raycast active-tab convention. Documenting as canonical tab-active treatment. |

### Playbook — `playbook/new/page.tsx` & `playbook/[id]/edit/edit-strategy-form.tsx`

No trade-color or bronze hijacks in form bodies. Both forms use neutral form-control treatments throughout. Clean.

---

## Phase 1b — Accessibility scan

### Decorative icons missing `aria-hidden`

**`trade-form.tsx`:**

- L732 `<ArrowUpRight />` (long direction icon, parent button has `aria-label`)
- L747 `<ArrowDownRight />` (short direction icon, parent button has `aria-label`)
- L771, L1203, L1325 `<Info />` (tooltip triggers — Info is decorative; the tooltip content carries the message)
- L1613 `<ImageIcon />` (decorative label icon for "Trade Screenshot")
- L1726 `<Plus />` (decorative icon on `<Button>` with text label "Create tag")
- L1772 `<Save />` (decorative icon on submit `<Button>` with text label)

**`scaled-trade-form.tsx`:**

- L572 `<ArrowUpRight />` (long direction icon, parent has `aria-label`)
- L587 `<ArrowDownRight />` (short direction icon, parent has `aria-label`)
- L600 `<Info />` (tooltip trigger)
- L661, L715 `<Plus />` (decorative on `<Button>` with text)
- L1226 `<Loader2 />` (spinner inside loading state of submit `<Button>` with text)
- L1231 `<Save />` (decorative on submit `<Button>` with text)

**`new-trade-tabs.tsx`:**

- L90 `<FileText />`, L92 `<Layers />`, L109 `<Upload />`, L126 `<FileStack />`, L143 `<ImageIcon />` (all decorative — tab buttons have visible text labels and `role="tab"`)

**`playbook/new/page.tsx`:**

- L350 `<Filter />` (decorative section-header icon for "Trading Conditions")
- L365 `<ImageIcon />` (decorative section-header icon for "Scenarios")

**`playbook/[id]/edit/edit-strategy-form.tsx`:**

- L362 `<Filter />` (same)
- L377 `<ImageIcon />` (same)

### Tab-panel association (new-trade-tabs.tsx)

`role="tab"` + `aria-selected` are present; `aria-controls` pointing to a panel id is missing. Deferring — adding `aria-controls` requires giving each tabpanel a stable id and the four panels currently share one wrapper `<div role="tabpanel">`. Backlog candidate, not a Phase 3 fix.

---

## Themes

1. **Verdict-as-P&L hijack** is the dominant pattern across both forms — appears 5 times across `trade-form.tsx` and `scaled-trade-form.tsx`. The hijack consistently paints binary/categorical verdict state (rating, followed-plan, position-status, setup-tag selection) with trade-buy/sell. Fix lives in the project's pattern catalog: verdict states use `fb-success / fb-error / warning`, never trade colors.
2. **Decorative icon a11y** is the long tail. Form-editor pages are the heaviest icon users in the app (form fields, tooltip triggers, button affordances, section headers), and the consistent miss is `aria-hidden` on icons inside elements that already have a visible text label or parent `aria-label`. WCAG AA compliant via `aria-hidden`.
3. **Playbook forms are clean otherwise.** Zero token-discipline issues — only the four section-header icon a11y gaps. This is a useful signal that the playbook surface area has been more deliberately stewarded than the journal forms.

---

## Phase 3 — Edits applied

### `src/components/journal/trade-form.tsx`

1. **L134-140 `GRADE_COLORS`** — verdict-as-P&L → verdict triad:
   - A: `trade-buy` → `fb-success`
   - B: `trade-buy/70` → `fb-success/70`
   - C: `warning` (unchanged)
   - D: `trade-sell/70` → `fb-error/70`
   - F: `trade-sell` → `fb-error`
2. **L1499 / L1513 `followedPlan`** — verdict-as-P&L → verdict triad:
   - Yes: `trade-buy` → `fb-success`
   - No: `trade-sell` → `fb-error`
3. **L1652 setup-tags pill** — category-as-P&L → verdict-good:
   - Selected: `trade-buy` → `fb-success`
4. **A11y:** added `aria-hidden="true"` to L732, L747, L771, L1203, L1325, L1613, L1726, L1772.

### `src/components/journal/scaled-trade-form.tsx`

1. **L777-785 position status** — verdict-as-P&L → neutral. `text-trade-buy` (open branch) → `text-acc-100` (active state anchor: "this position is still live"). Closed stays `txt-100`; partial stays `warning`.
2. **L1074 / L1088 followedPlan** — verdict-as-P&L → verdict triad (same fix as `trade-form.tsx`).
3. **L1135 setup-tags pill** — category-as-P&L → verdict-good (same fix).
4. **A11y:** added `aria-hidden="true"` to L572, L587, L600, L661, L715, L1226, L1231.

### `src/components/journal/new-trade-tabs.tsx`

A11y: added `aria-hidden="true"` to L90 `<FileText />`, L92 `<Layers />`, L109 `<Upload />`, L126 `<FileStack />`, L143 `<ImageIcon />`.

### `src/app/[locale]/(app)/playbook/new/page.tsx`

A11y: added `aria-hidden="true"` to L350 `<Filter />`, L365 `<ImageIcon />`.

### `src/app/[locale]/(app)/playbook/[id]/edit/edit-strategy-form.tsx`

A11y: added `aria-hidden="true"` to L362 `<Filter />`, L377 `<ImageIcon />`.

---

## Phase 4 — Deferred to backlog

- **Tab-panel `aria-controls` wiring in `new-trade-tabs.tsx`.** Each conditional panel needs a stable id and the wrapper currently shares one `<div role="tabpanel">` across all tab states. Refactor to one panel per tab with explicit `id` + `aria-controls` mapping. Scoped as a separate a11y task — out of scope for token-discipline sweep.
- **Document verdict-triad mapping for 5-point rating scales in DESIGN.md.** The Wave 5 GRADE_COLORS fix establishes the canonical A→F mapping (`fb-success → fb-success/70 → warning → fb-error/70 → fb-error`). Document this so future rating UIs reach for the same scale.
- **Document tab-active treatment in DESIGN.md.** `border-acc-100 text-acc-100` for the active tab is conventional and not a hijack; the project should canonicalize this to prevent future "should this be acc-100 or fb-success?" debates.

---

## Sign-off

- `pnpm lint` — clean (0 errors)
- `pnpm exec tsc --noEmit` — clean
- Runbook rows #19, #20, #21, #22 marked done
- Backlog updated with 3 items above
