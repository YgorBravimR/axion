# Impeccable sweep — Wave 8 Public (rows #29-30)

**Date:** 2026-05-12
**Wave:** 8 / Public
**Routes covered:**

- Row #29 — `src/app/[locale]/(public)/monitor/page.tsx`
- Row #30 — `src/app/[locale]/(public)/painel/page.tsx`

Combined doc: both routes mount the **identical** `<MarketMonitorContent />` widget with the identical wrapper. `/painel` is a PT-BR alias for `/monitor`. Separate scans would duplicate 100% of content.

---

## Phase 0 — Orchestrator inventory

`(public)/layout.tsx` is the shell — a single `<div className="bg-bg-100 min-h-dvh">` with no auth gate, no sidebar, no footer. Each route page is a 10-line server component that mounts the same client widget.

| Row | Page                              | Mounts                     | Client tree                                               |
| --- | --------------------------------- | -------------------------- | --------------------------------------------------------- |
| #29 | `(public)/monitor/page.tsx` (10L) | `<MarketMonitorContent />` | `src/components/market/market-monitor-content.tsx` (444L) |
| #30 | `(public)/painel/page.tsx` (10L)  | `<MarketMonitorContent />` | same as above                                             |

Sub-widgets imported by `MarketMonitorContent`:

- `HeroQuoteCard` — hero card grid above the fold
- `QuoteCard` (from `quote-row.tsx`) — tabular asset rows (default + B3-with-ADR layouts)
- `EconomicCalendar` — events table
- `MarketStatusPanel` — tabbed sidebar (status / calendar / links)
- `B3TradingCalendar` — month-grid holiday calendar nested inside `MarketStatusPanel`

Orphan: `auto-refresh-indicator.tsx` (128L) is declared but **never imported anywhere** — `MarketMonitorContent` inlines its own auto-refresh in the header. Flagging for backlog cleanup, not the sweep.

**Register call:** despite living under `(public)`, both pages are tooling for traders (price ticker, market open/closed, economic calendar). They are **product** register, not brand. The pre-flight register-note in the runbook anticipated this might be brand-marketing; it is not.

**Scene sentence:** _"Brazilian futures trader at 8:55 a.m. BRT on a 27-inch monitor, glancing at `/painel` in a side tab to see if B3 is open, what the ADR equivalent of PETR4 is doing, and whether today's CPI release is past."_

---

## Phase 1a — Token-discipline scan

### Trade-color hijacks — **5 instances, all the same pattern**

`grep -rn "text-trade-buy\|bg-trade-buy" src/components/market/` returns five hits that paint **market session state ("open")** as trade-color green. Market session state is not P&L — it's a temporal status. Verdict triad applies: `fb-success` / `warning` / `txt-300`.

| File                                | Line | Class            | Painting                                           |
| ----------------------------------- | ---- | ---------------- | -------------------------------------------------- |
| `market/market-monitor-content.tsx` | 278  | `bg-trade-buy`   | header status dot for "open" markets               |
| `market/market-monitor-content.tsx` | 290  | `text-trade-buy` | header status label "open"                         |
| `market/market-status-panel.tsx`    | 180  | `bg-trade-buy`   | sidebar status row dot for "open" markets          |
| `market/market-status-panel.tsx`    | 196  | `text-trade-buy` | sidebar status row label "open"                    |
| `market/auto-refresh-indicator.tsx` | 93   | `bg-trade-buy`   | polling-idle indicator (when not actively loading) |

All five fix as `text-trade-buy` → `text-fb-success` and `bg-trade-buy` → `bg-fb-success`. The "opening" sibling already uses `bg-warning` / `text-warning` correctly, and "closed" already uses `bg-txt-300/40` / `text-txt-300` — only "open" leaks into trade-color.

### Trade-color used correctly — keep as-is

- `hero-quote-card.tsx` L49-50: `quote.changePercent` painted `text-trade-buy/sell` based on `quote.change >= 0` — **canonical** trade-color use (signed monetary magnitude).
- `quote-row.tsx` L49-55: `ChangeBadge` "trade" scheme uses `bg-trade-buy-muted text-trade-buy` for `quote.change` — canonical.
- `quote-row.tsx` L93-96: ADR companion price uses `text-action-buy/sell` (action triad: sky/orange) — correct, ADR-vs-B3 directional contrast.

### Absolute ban — **side-stripe borders**

`hero-quote-card.tsx` L27-28:

```tsx
;(!isClosed && !isZero && isPositive && "border-l-2 border-l-trade-buy",
	!isClosed && !isZero && !isPositive && "border-l-2 border-l-trade-sell")
```

This is the [side-stripe border absolute ban](../../.claude/skills/impeccable/SKILL.md). 2px colored left-border as accent on a card. Per the ban: _"Never intentional. Rewrite with full borders, background tints, leading numbers/icons, or nothing."_

The signal (positive vs negative direction) is **already conveyed** by the colored `changePercent` text immediately to the right. The stripe is pure decoration redundant with the percent's color. Fix: delete the stripe rows entirely.

Second known recidivism after the Wave 4 plan-card stripe — flag the pattern in the wave themes.

### Bronze (`acc-100`) usage

`grep -n "acc-100" src/components/market/` returns 6 hits, all valid:

- `market-monitor-content.tsx` L226: loading-state Activity icon (signal moment — page warming up).
- `market-monitor-content.tsx` L243, L377, L432: refresh CTAs + active tab + empty-state refresh button — all primary-action surfaces.
- `market-status-panel.tsx` L140: active tab — same active-state convention.

Earned-bronze rule honored. No drift.

---

## Phase 1b — Accessibility scan

### Decorative icons missing `aria-hidden` — 8 sites

**`src/components/market/market-monitor-content.tsx`**

- L226 `<Activity />` — loading-state decoration above "loading…" text
- L246 `<RefreshCw />` — inside error-state refresh button (parent has `aria-label`)
- L319 `<RefreshCw />` — header refresh icon-button (parent has `aria-label`)
- L424 `<Activity />` — empty-state decoration above "no quotes" text
- L435 `<RefreshCw />` — empty-state refresh button (parent has `aria-label`)

**`src/components/market/auto-refresh-indicator.tsx`**

- L118 `<RefreshCw />` — refresh button (parent has `aria-label`); also has conditional `animate-spin` already wrapped in `motion-reduce:animate-none`. _(Orphan component, but fixing defensively.)_

**`src/components/market/b3-trading-calendar.tsx`**

- L134 `<ChevronLeft />` — previous-month icon-button (parent has `aria-label`)
- L148 `<ChevronRight />` — next-month icon-button (parent has `aria-label`)

### Already compliant

`market-monitor-content.tsx` already wires `aria-hidden` on the header status-dot (L283), the right-side fade gradient (L343), and the flag emoji span. `hero-quote-card.tsx`, `quote-row.tsx` already mark the flag emoji `aria-hidden`. `market-status-panel.tsx` already marks status dots and the external-link icon (`<ExternalLink />` L232) `aria-hidden`. `economic-calendar.tsx` already marks the impact dot `aria-hidden`. `b3-trading-calendar.tsx` already marks the legend swatches `aria-hidden`. Tablist has full ARIA wiring (`role="tab"`, `aria-selected`, `aria-controls`, roving `tabIndex`) — best ARIA on a tablist seen in the project.

### Semantics observations

- The hero quote scroll-strip is `role="list"` / `role="listitem"` — correct, prevents the horizontal scroller from being announced as flat siblings.
- The quote tabbed panel uses `role="tablist"` + `tabIndex={0}` on the container and `tabIndex={activeTab === id ? 0 : -1}` on each tab — perfect roving-tabindex pattern.
- The market status rows use `role="status"` + `aria-label` synthesizing label + state — clean for screen readers.

---

## Themes

1. **A new hijack pattern: temporal-state-as-P&L.** Waves 1-7 catalogued verdict-as-P&L (operation outcomes painted as money) and category-as-P&L (booleans painted as money). Wave 8 adds the third: **market session state painted as money** ("open" → trade-buy green). The mental short-circuit is the same ("good-thing → green"), but the semantic domain has shifted again. The fix is the same: reach for the verdict triad. Catalogue this so future trader-status surfaces (broker connection status, data-feed health, etc.) don't repeat it.
2. **Side-stripe borders are the most recurrent absolute ban.** Second appearance after the Wave 4 plan-card stripe. Always the same shape: a 2px colored stripe redundant with adjacent typography color. The pattern keeps recurring because it looks "Linear-ish" — but Linear uses stripes for **selected state**, not directional value. Worth a sharper note in DESIGN.md.
3. **The trader-tools surface is the cleanest a11y in the project after auth.** Wave 8 misses only 8 icons; all are mechanical `aria-hidden`. The tablist ARIA wiring is exemplary — should be cited as the canonical pattern when DESIGN.md gets a "tablist" entry.
4. **`/painel` is `/monitor` in Portuguese.** Two route files mounting the same widget is a working but accidental localization pattern. Better solved via a `next-intl` URL alias / redirect, not via a duplicate page file.

---

## Phase 3 — Edits applied

### Token-discipline (verdict triad applied to session-state)

**`src/components/market/market-monitor-content.tsx`**

- L278 `bg-trade-buy` → `bg-fb-success`
- L290 `text-trade-buy` → `text-fb-success`

**`src/components/market/market-status-panel.tsx`**

- L180 `bg-trade-buy` → `bg-fb-success`
- L196 `text-trade-buy` → `text-fb-success`

**`src/components/market/auto-refresh-indicator.tsx`**

- L93 `bg-trade-buy` → `bg-fb-success`

### Absolute-ban removal (side-stripe borders)

**`src/components/market/hero-quote-card.tsx`**

- L27-28: delete both `border-l-2 border-l-trade-buy/sell` rows. The colored `changePercent` text already conveys direction.

### A11y (aria-hidden on decorative icons)

**`src/components/market/market-monitor-content.tsx`** — 5 icons:

- L226 `<Activity />`, L246 `<RefreshCw />`, L319 `<RefreshCw />`, L424 `<Activity />`, L435 `<RefreshCw />` → +`aria-hidden="true"` each

**`src/components/market/auto-refresh-indicator.tsx`** — 1 icon:

- L118 `<RefreshCw />` → +`aria-hidden="true"`

**`src/components/market/b3-trading-calendar.tsx`** — 2 icons:

- L134 `<ChevronLeft />`, L148 `<ChevronRight />` → +`aria-hidden="true"` each

---

## Phase 4 — Deferred to backlog

- **Catalogue the verdict-triad rule for non-monetary status states in DESIGN.md.** Three hijack flavors now documented across the sweep: verdict-as-P&L, category-as-P&L, and (new in Wave 8) temporal-state-as-P&L. A single DESIGN.md paragraph should preempt the next recurrence: _"Any status indicator whose semantic domain is not signed monetary magnitude reaches for the verdict triad (`fb-success` / `fb-error` / `warning` / `txt-300`). `trade-buy` / `trade-sell` are reserved for the magnitude itself."_
- **Add the "no side-stripe" rule to DESIGN.md with a worked example.** Second recidivism in the sweep. The reason it keeps recurring is the Linear/Raycast vocabulary it borrows from — but those products use stripes for selection, not direction. Worth a 3-line note with the hero-card before/after.
- **Delete or wire `src/components/market/auto-refresh-indicator.tsx`.** 128-line component, zero imports. Either restore it as the canonical refresh-indicator (replace the inline header version in `market-monitor-content.tsx`) or delete it. Carrying two implementations invites silent drift.
- **Consolidate `/monitor` and `/painel` via locale routing.** Two route files mounting the same widget. Use `next-intl` URL aliases / pathname routing so `/painel` redirects (or rewrites) to `/monitor` instead of duplicating the page file. Same pattern likely applicable to other PT-BR routes if any exist.

---

## Sign-off

- `pnpm lint` — clean (0 errors)
- `pnpm exec tsc --noEmit` — clean
- Runbook rows #29-30 marked done — **runbook complete (30/30)**
- Backlog updated with 4 items above
