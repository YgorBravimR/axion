# /equity-shield — impeccable sweep (Wave 3, row #15)

**Date:** 2026-05-12
**Route:** `/[locale]/(app)/equity-shield`
**Wave:** 3 — Modeling
**Cadence:** Phase 0 → 1a → 1b → themes → 2 → 3 → 4 → sign-off

---

## Phase 0 — Surface map

Orchestrator: `src/app/[locale]/(app)/equity-shield/page.tsx` → renders `<EquityShieldContent>` with `tradeYears` preloaded server-side. Premium-only (`requireRole("premium")`).

Widgets:

1. `equity-shield-content.tsx` — top-level orchestrator (header + MC banner + params + results)
2. `equity-shield-params.tsx` — date-range, year filter, computation params, run trigger
3. `mc-calibration-banner.tsx` — Monte-Carlo-driven param suggestions, dismissable
4. `equity-shield-stats.tsx` — top-row metric cards + 3-column method comparison (original/method1/method2)
5. `equity-shield-chart.tsx` — recharts area chart (rendered 3x: original/method1/method2) with sim/live zone shading + trailing DD-limit line + SMA overlay (method2) + comparison mode

---

## Phase 1a — Critique (UX)

### P1 — `equity-shield-chart.tsx` `strokeColor` variant map (category-as-P&L)

```tsx
const { strokeColor, gradientId, originalGradientId } = useMemo(
  () => ({
    strokeColor:
      variant === "original"
        ? "var(--color-acc-100)"
        : variant === "method1"
          ? "var(--color-trade-buy)"
          : "var(--color-acc-200)",
    ...
  }),
  [variant]
)
```

Same shape as row #13's `MODE_COLORS` and row #14's `statusDotColors`. Three **chart-method categories** mapped to {`acc-100`, `trade-buy`, `acc-200`}. `trade-buy` for the Method 1 line is wrong vocabulary — the method-1 equity curve isn't signed profit, it's _the curve under MDD Exercise rule_. The line can crash; coloring it green declares the method is profitable before the user reads the data.

Pragmatic fix this row: move method1 to `acc-100` and keep method2 on `acc-200`. The result is original-chart at bronze and method1-chart at bronze (two distinct charts; each only appears once on screen at a time per scroll), method2 at blue. This sacrifices cross-chart-glance method-hue differentiation in favor of a clean vocabulary. The deeper fix — categorical chart-palette tokens (`--chart-1`, `--chart-2`, `--chart-3`) — was already deferred for monte-carlo v2 and `optimize`; same backlog wedge.

### P1 — Sim zone ReferenceArea fill (category-as-P&L)

```tsx
<ReferenceArea
	x1={band.x1}
	x2={band.x2}
	fill="var(--color-trade-sell)"
	fillOpacity={0.06}
	strokeOpacity={0}
/>
```

The sim/live mode shading bands the "simulated portion" of the curve in red-tint. But "sim" is _not live data_ — it's the engine extrapolating forward — and "not live" isn't a loss, it's a data-provenance flag. The right vocabulary is a muted neutral: `txt-300` at ~8% opacity reads as "dimmer than live" without claiming danger.

Same wedge appears on the legend chip:

```tsx
<div className="bg-trade-sell h-2.5 w-4 rounded-sm opacity-20" />
```

→ `bg-txt-300 opacity-30`. The chip then matches the band.

### P1 — DD limit line (verdict, not signed loss)

```tsx
<Line
  type="monotone"
  dataKey="ddLimitLine"
  stroke="var(--color-trade-sell)"
  ...
/>
```

The trailing drawdown-limit dashed line is the **regulatory blow-up threshold** — if the curve crosses below, the account is busted. That's a verdict-error condition ("if you cross this, game over"), not a signed-money magnitude. Right vocabulary: `fb-error`. The legend chip below shares the wedge:

```tsx
<div className="border-trade-sell h-0 w-4 border-t border-dashed" />
```

→ `border-fb-error`. Maintains the cross-page verdict triad established in rows #13 + #14.

### P1 — `mc-calibration-banner.tsx` `confidenceColor` map (verdict-as-anchor)

```tsx
const confidenceColor: Record<ConfidenceLevel, string> = {
	robust: "text-trade-buy",
	moderate: "text-acc-100",
	weak: "text-trade-sell",
}
```

Third twin of row #13's `levelConfig` (`kelly-criterion-card`) and `insightConfig` (`strategy-analysis`). Three verdict tiers about Monte Carlo simulation confidence — painted with trade tokens + bronze. None is signed money; all three should move to the verdict triad:

| Level      | Now               | Better            |
| ---------- | ----------------- | ----------------- |
| `robust`   | `text-trade-buy`  | `text-fb-success` |
| `moderate` | `text-acc-100`    | `text-warning`    |
| `weak`     | `text-trade-sell` | `text-fb-error`   |

The `acc-100` on moderate is also the _bronze-as-verdict_ hijack — bronze is reserved for moments of significance + anchor metrics, not "middle-tier confidence". `warning` is the right vocabulary for caution.

### P1 — `equity-shield-stats.tsx` PassFailBadge + StatCard pass/fail variants

```tsx
const valueClass = cn(
	"...",
	variant === "positive" && "text-trade-buy",
	variant === "negative" && "text-trade-sell",
	variant === "pass" && "text-trade-buy", // verdict
	variant === "fail" && "text-trade-sell", // verdict
	variant === "default" && "text-txt-100"
)
```

`positive`/`negative` are signed-money variants (kept). But `pass`/`fail` are **verdicts** — would the account survive the prop-firm drawdown rule? That's a binary regulatory pass/fail, not a P&L sign. → `fb-success` / `fb-error`.

Same wedge in `PassFailBadge`:

```tsx
{
	wouldPass ? (
		<ShieldCheck className="text-trade-buy h-5 w-5" />
	) : (
		<ShieldX className="text-trade-sell h-5 w-5" />
	)
}
;<span className={cn("...", wouldPass ? "text-trade-buy" : "text-trade-sell")}>
	{wouldPass ? t("pass") : t("fail")}
</span>
```

→ `text-fb-success` / `text-fb-error`. The icons are also missing `aria-hidden` — covered in a11y audit below.

### P2 — Method 1 heading inherits chart hue (category-as-P&L)

```tsx
<h3 className="text-small text-trade-buy font-semibold">{t("method1")}</h3>
```

Heading inherits the strokeColor of method1's chart line. Once strokeColor moves to `acc-100`, even _that_ would be a bronze-splatter heading. The cleanest read: method headings stay neutral (`text-txt-100`), and the chart line below carries the visual identity. Method 2 heading is already `text-txt-100` ✓.

### P2 — `liveTrades` count painted trade-buy (count, not money)

```tsx
<span className="text-small text-trade-buy font-medium">
	{stats.method1.liveTrades}
</span>
```

(Same pattern at line 259 for method2's `liveTrades`.) Count, not signed money. → `text-txt-100`.

### P2 — Tooltip mode badge (category-as-P&L)

```tsx
<p
	className={`text-tiny mt-s-100 ${data.mode === "live" ? "text-trade-buy" : "text-txt-300"}`}
>
	{data.mode === "live" ? t("modeLive") : t("modeSim")}
</p>
```

"Live" data isn't a profit; "sim" isn't a loss. The label itself ("Live" / "Sim") is the message. → `text-txt-100` for live, keep `text-txt-300` for sim. The mode-as-verdict already gets handled by the zone-shading on the chart background — the tooltip badge just labels it.

### P2 — `equity-shield-params.tsx` `preview.notEnoughTrades` (verdict)

```tsx
{
	!preview.hasEnoughTrades && preview.totalTrades > 0 && (
		<p className="text-tiny text-trade-sell mt-s-100">
			{t("preview.notEnoughTrades")}
		</p>
	)
}
```

"Not enough trades to run analysis" is a soft form-feedback warning, not a loss. → `text-warning`. (`fb-error` would be a hard error like "no data".)

### P2 — Tooltip `originalAccountEquity` text-acc-100 (defensible — flag only)

```tsx
<p className="text-small text-acc-100 font-medium">
  {t("tooltipOriginal", { value: ... })}
</p>
```

In comparison mode (toggle "Live Only" ON), the tooltip shows both original (reference) and managed (focus). Bronze on the original looks like an inversion of row #14's anchor convention (focus = `acc-100`, reference = `acc-200`). But on /equity-shield the _whole page narrative_ is "the original baseline is the thing the methods are protecting against" — the original is the **anchor reference** here, not the comparison subject. Defensible. **No edit this row** — flag in case a future cross-page convention forces alignment.

### P2 — A11y: aria-hidden gaps

- `equity-shield-content.tsx` `Shield` icon (header) — missing `aria-hidden`
- `equity-shield-stats.tsx` `ShieldCheck` + `ShieldX` icons — missing `aria-hidden`
- `equity-shield-params.tsx` `Info` + `Play` icons — missing `aria-hidden`
- `mc-calibration-banner.tsx` `Dices` + `X` (close) + `Check` icons — missing `aria-hidden`

`X` is the close-button icon; the button has `aria-label={t("clear")}` already, so the icon itself is decorative.

---

## Phase 1b — Audit (technical)

### Tokens — no invalid tokens detected

All scanned files use legal v4 tokens.

### Lint — clean baseline

Post row-#14 commit: `pnpm lint` and `pnpm exec tsc --noEmit` are green.

### Reduced-motion

`isAnimationActive={false}` on all chart areas — chart re-render doesn't animate. No `prefers-reduced-motion` gap.

### Hooks order

`equity-shield-content.tsx` and chart components keep hook calls before any early return. ✓

---

## Phase 1 themes

1. **Wave 3's three systemic patterns converge on a single page**:
   - Category-as-P&L: `strokeColor` map (method1 = `trade-buy`), sim-zone fill (`trade-sell`), legend sim chip, method 1 heading, tooltip mode badge.
   - Verdict-as-anchor: `PassFailBadge`, `StatCard.pass/fail`, `confidenceColor` map (all three tiers including bronze-as-moderate).
   - DD limit line as `trade-sell`: regulatory threshold painted as signed loss — should be `fb-error`.
2. **The verdict triad (`fb-success` / `fb-error` / `warning` / `txt-300`) is now the canonical Wave 3 fix recipe** — applied four times across rows #13-15.
3. **Categorical chart palette deferred again**. Same wedge as `optimize` (row #12) and `monte-carlo` v2 (row #13). With /equity-shield being the _third_ surface needing genuine multi-line categorical colors (and not getting them), the next add of `--chart-N` tokens has clear ROI — three callers waiting.

---

## Phase 2 — Extracted

No new abstractions warranted. The `confidenceColor`/`strokeColor` maps stay local to their widgets — promoting to globals before the categorical-chart-palette decision lands would be over-engineering.

---

## Phase 3 — Corrections

Applied in this PR:

1. **`equity-shield-chart.tsx`**:
   - `strokeColor` variant map: method1 `var(--color-trade-buy)` → `var(--color-acc-100)`. (method2 keeps `acc-200`, original keeps `acc-100`.)
   - Sim-zone `ReferenceArea` fill: `var(--color-trade-sell)` @ 0.06 → `var(--color-txt-300)` @ 0.08.
   - DD limit `Line` stroke: `var(--color-trade-sell)` → `var(--color-fb-error)`.
   - Legend sim-zone chip: `bg-trade-sell ... opacity-20` → `bg-txt-300 ... opacity-30`.
   - Legend DD-limit chip: `border-trade-sell` → `border-fb-error`.
   - Tooltip mode badge: live arm `text-trade-buy` → `text-txt-100`; sim arm `text-txt-300` (kept).

2. **`equity-shield-stats.tsx`**:
   - `StatCard.valueClass`: `pass` arm `text-trade-buy` → `text-fb-success`; `fail` arm `text-trade-sell` → `text-fb-error`. (`positive`/`negative` kept on trade tokens — signed money.)
   - `PassFailBadge` `ShieldCheck` `text-trade-buy` → `text-fb-success` + `aria-hidden="true"`; `ShieldX` `text-trade-sell` → `text-fb-error` + `aria-hidden="true"`.
   - `PassFailBadge` verdict label `text-trade-buy`/`text-trade-sell` → `text-fb-success`/`text-fb-error`.
   - Method 1 heading: `text-trade-buy` → `text-txt-100`.
   - `liveTrades` counts (method1 + method2): `text-trade-buy` → `text-txt-100` (2 sites).

3. **`mc-calibration-banner.tsx`**:
   - `confidenceColor` map: `robust` `text-trade-buy` → `text-fb-success`; `moderate` `text-acc-100` → `text-warning`; `weak` `text-trade-sell` → `text-fb-error`.
   - `Dices` (header) + `X` (close) + `Check` (applied state) icons: `aria-hidden="true"`.

4. **`equity-shield-params.tsx`**:
   - `preview.notEnoughTrades` paragraph: `text-trade-sell` → `text-warning`.
   - `Info` (tip) + `Play` (run button) icons: `aria-hidden="true"`.

5. **`equity-shield-content.tsx`**:
   - Header `Shield` icon: `aria-hidden="true"`.

---

## Phase 4 — Enhancement (deferred)

- **Categorical chart palette tokens (`--chart-1` ... `--chart-N`)**: third-strike issue. /equity-shield, /monte-carlo v2, and /backtest/optimize all need 3+ distinct categorical hues for multi-line charts and currently shoehorn them through trade tokens + bronze + literal hex. Promote tokens in `globals.css` + a `getChartColor(index)` helper. ROI is now high (three callers).
- **`StatCard` variant API consolidation**: today `positive`/`negative` map to trade colors (signed money — correct) and `pass`/`fail` (post-sweep) map to `fb-success`/`fb-error`. Two semantically-distinct color families on a single variant union is a foot-gun. Split into `signedVariant: "positive" | "negative" | null` + `verdictVariant: "pass" | "fail" | null`, or wrap the verdict-state into a separate component.

---

## Sign-off

- Phase 0: ✓ 5-widget surface map
- Phase 1a: ✓ 9 critique items (5 P1, 4 P2)
- Phase 1b: ✓ a11y audit (6 aria-hidden adds queued)
- Phase 2: ✓ no extractions
- Phase 3: ✓ 5 widget edits queued (this PR)
- Phase 4: ✓ 2 follow-ups to backlog
