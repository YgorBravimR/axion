# /impeccable sweep — playbook detail (`/playbook/[id]`)

**Date:** 2026-05-12
**Wave / row:** 1 — Daily cockpit, row #6
**Register:** product (app UI)
**Scope:** `/playbook/[id]` route and the support components it renders inline (`condition-tier-display`, `scenario-section`, `strategy-detail-guide`). The edit form (`/playbook/[id]/edit`) is row #20; the condition picker on that form is out of scope.

---

## Preflight — scene

Same trader from the list sweep, now drilled in: it's 8:23 a.m. ET, eight minutes before the open, and they've clicked into the highest-conviction strategy from `/playbook` to re-read its conditions, target R, and entry/exit rules before the bell. The page is reference material under pressure — it must read calmly, surface the tier hierarchy without colour-shouting, and leave the user with one clear answer: _"yes, this setup is alive today; here is what I need to see to take it."_

---

## Phase 1a — critique

### P0 — compliance ladder using trade colours (again)

`src/app/[locale]/(app)/playbook/[id]/page.tsx:64-69` duplicates the exact compliance-colour pattern just retired on the list sweep. Same fix: adopt `getComplianceTone()` from `src/lib/compliance.ts`.

### P0 — Final R / Max Risk icons trade-coloured

- Line 176: `<TrendingUp text-trade-buy h-6 w-6 />` on the Final R card. Final R is the **target** of the strategy, not a winning P&L outcome.
- Line 189: `<TrendingDown text-trade-sell h-6 w-6 />` on Max Risk Per Trade. Max Risk is a **configured constraint**, not an actual loss.

Demote both to `text-txt-300` so the icon is wayfinding only. Same shape we applied to the list page; this is the larger 6×6 variant.

### P0 — condition category palette uses trade-buy for `price_action`

`src/components/playbook/condition-tier-display.tsx:19` paints every `price_action` condition badge with `border-trade-buy/40 bg-trade-buy/10 text-trade-buy`. Condition categories (indicator / price_action / market_context / custom) are **parallel categories**, not outcomes. Green here implies "good signal" — a semantic the user will read against P&L magnitude elsewhere on the page.

Recolour to a neutral that doesn't borrow P&L semantics. `market_context` keeps `warning` (external news/context often implies caution — semantically coherent); `indicator` and `price_action` use dim neutrals; `custom` stays neutral.

### P0 — tier legend backwards on the bronze anchor

The legend at the top of the conditions display reads:

- A = mandatory → `text-trade-buy` (green: "good")
- AA = +tier_2 → `text-acc-100` (bronze: "premium")
- AAA = +tier_3 → `text-warning` (amber: "caution")

But the conceptual ladder is **stacking confirmations** — AAA is the apex (most criteria met). Bronze on AA and warning on AAA inverts the meaning. Rewrite:

- A → neutral (baseline tier)
- AA → neutral, brighter (stronger tier)
- AAA → `text-acc-100` (earned-bronze on the apex, the one bronze use in the legend)

This also removes the trade-buy collision on the mandatory tier.

### P1 — BarChart3 bronze stays as the page's single anchor

`page.tsx:84` paints `<BarChart3 text-acc-100 />` on the Performance section heading. This page has no compliance donut to carry the bronze anchor, so the performance-stats heading is the natural place. **Keep** — but verify no other bronze leaks elsewhere on the page (audit below confirms it doesn't).

### P2 — uniform card stack (repeat)

The page renders 7+ sibling cards (Performance, Risk Settings, Rules, Conditions, Scenarios, Notes, Screenshot), all with identical `border-bg-300 bg-bg-200 p-... rounded-lg border` chrome. Same anti-pattern flagged on `/playbook` — already captured in the existing backlog distill entry; extending its scope to the detail page rather than adding a separate item.

---

## Phase 1b — audit

### P1 — decorative icons missing `aria-hidden`

On `page.tsx`: `BarChart3`, `Target`, `TrendingUp`, `TrendingDown`, `CheckCircle`, `XCircle`, `FileText`, `Filter`, `ImageIcon`.
On `condition-tier-display.tsx`: the tier `TierIcon` (`Shield` / `ShieldCheck` / `ShieldPlus`).

All decorative; add `aria-hidden="true"` consistently.

### P2 — hardcoded `$` in inline `formatCurrency`

`page.tsx:27-33` defines a tiny `formatCurrency` helper with hardcoded `$` prefix. Already covered by the existing backlog item _"Currency formatting — account-aware compact formatters"_; no fix here.

### P2 — semantically correct trade-colour usages to KEEP

To document what we deliberately did **not** change so the next agent doesn't over-correct:

- `pnlColor` (`page.tsx:71`) — total P&L magnitude. Trade-buy/trade-sell is the canonical token.
- `avgR` colouring (`page.tsx:124`) — R-multiple of average outcome. Same.
- `CheckCircle text-trade-buy` for win count, `XCircle text-trade-sell` for loss count (`page.tsx:149,155`) — counts of canonical outcomes. Same.

These stay as-is.

---

## Phase 2 — system-level extracts

Helper already extracted in the sibling sweep (`src/lib/compliance.ts`). This sweep is a consumer-only refactor.

---

## Phase 3 — corrections (this slice)

Files touched:

1. `src/app/[locale]/(app)/playbook/[id]/page.tsx` — adopt `getComplianceTone`, demote Target R / Max Risk icons, aria-hidden pass.
2. `src/components/playbook/condition-tier-display.tsx` — recolour `getCategoryColor`, rebalance tier legend (bronze migrates from AA to AAA as the apex anchor), aria-hidden on tier icons.

---

## Phase 4 — register check (product)

Reference material in a pre-open context. The page does not need motion, decoration, or onboarding flourishes. Tier hierarchy should communicate _stacked confirmations_ at a glance; the colour ladder should reinforce that, not borrow semantics from the P&L domain.
