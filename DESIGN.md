---
name: Axion
description: A trader's command center — journal, analyze, sharpen.
colors:
  bg-100: "#0F1014"
  bg-200: "#1A1C20"
  bg-300: "#272A2E"
  bg-400: "#363940"
  bg-stripe: "#141519"
  txt-100: "#EEF0F2"
  txt-200: "#A8ADB5"
  txt-300: "#787C84"
  txt-placeholder: "#5D6168"
  acc-100: "#C29D6A"
  acc-100-hover: "#D2AE7C"
  acc-100-light: "#9C7C4F"
  acc-200: "#7A8B96"
  acc-200-hover: "#8C9DA8"
  acc-200-light: "#5A6B76"
  fb-error: "#EF4444"
  fb-success: "#34D399"
  trade-buy: "#34D399"
  trade-sell: "#F87171"
  trade-warning: "#FBBF24"
  action-buy: "#5BB8D6"
  action-sell: "#FB923C"
  guide: "#A882FF"
typography:
  display:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.25rem + 1.5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.375rem, 1rem + 1.25vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 0.875rem + 0.75vw, 1.5rem)"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
    fontFeature: "tnum"
  label:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  caption:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  micro:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
    fontFeature: "tnum"
rounded:
  sm: "6px"
  md: "10px"
  lg: "12px"
  full: "9999px"
spacing:
  s-100: "4px"
  s-200: "8px"
  s-300: "12px"
  m-400: "16px"
  m-500: "20px"
  m-600: "24px"
  l-700: "32px"
  l-800: "48px"
  l-900: "64px"
components:
  button-primary:
    backgroundColor: "{colors.acc-100}"
    textColor: "#FFFFFF"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.acc-100-hover}"
    textColor: "#FFFFFF"
  button-secondary:
    backgroundColor: "{colors.bg-300}"
    textColor: "{colors.txt-100}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.bg-400}"
    textColor: "{colors.txt-100}"
  button-outline:
    backgroundColor: "{colors.bg-200}"
    textColor: "{colors.txt-100}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.txt-200}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-destructive:
    backgroundColor: "{colors.fb-error}"
    textColor: "#FFFFFF"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.bg-200}"
    textColor: "{colors.txt-100}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.bg-200}"
    textColor: "{colors.txt-100}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "16px"
  stat-block:
    backgroundColor: "{colors.bg-100}"
    textColor: "{colors.txt-100}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px"
  chip:
    backgroundColor: "{colors.bg-300}"
    textColor: "{colors.txt-200}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  chip-mono:
    backgroundColor: "{colors.bg-300}"
    textColor: "{colors.txt-200}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.txt-200}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-item-active:
    backgroundColor: "{colors.bg-300}"
    textColor: "{colors.txt-100}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: Axion

## 1. Overview

**Creative North Star: "Bronze Signal on Cool-Neutral Chrome"**

Axion is dark-first, low-chroma, and instrumental — a workspace built for solo day traders and mentorship students who sit in front of multiple monitors for six hours a day with capital on the line. The aesthetic is the inside of a cockpit at first light: cool-neutral near-black surfaces with a faint blue undertone, crisp silver-white text, and a single warm bronze accent that appears only where significance is earned. Density is welcome; visual clutter is not. The interface speaks with the confidence of a trained operator's tool — not the friendliness of a consumer app.

The whole identity hinges on one move: **the chrome is cool, the accent is warm**. `bg-100`/`bg-200`/`bg-300` sit at hue ~240° with chroma ~0.003 — perceptually neutral but with a faint cool undertone that pushes the canvas away from "cozy" and toward "instrument." The bronze accent (`#C29D6A`) reads as a _signal_ because every other surface around it is cool — temperature contrast is what makes a hero metric or a primary CTA actually pop. Tint the chrome warm and the bronze collapses into decoration. Tint a button cobalt and the cockpit becomes a bank app. The discipline is non-negotiable.

The system explicitly rejects the saturated category lanes around it. The AI-tool reflex (violet / purple primary on near-black canvas) is forbidden by name. The fintech reflex (cobalt / royal blue / navy as primary) is forbidden by name — bronze is precisely chosen because cobalt is the obvious move and obvious moves erase identity. The Vercel/Shadcn neutral-template aesthetic is broken by the warm bronze accent itself: nothing in the template lane runs warm-accent-on-cool-near-black with this restraint. Slate steel (`acc-200` = `#7A8B96`) is the quiet secondary for non-compelling controls — same temperature family as the chrome, so it never competes with bronze for attention.

Motion serves orientation, never entertainment. Spacing is rhythmic, not monotone. Bold is reserved for major emphasis — most text lives in regular weight against tonal hierarchy. Numbers display in tabular-nums by default so columns of trade data align without per-cell font overrides. Every accent is a signal that must justify itself; if you cannot articulate why a specific surface needs `acc-100`, it does not get it.

**Key Characteristics:**

- **Dark-first** with a cool-neutral near-black canvas (`#0F1014`, hue ~240°, chroma ~0.003) — escapes both warm-cozy and pure-template aesthetics.
- **Bronze accent** (`#C29D6A`) for primary action, focus, key metric, lead chart series. Single warm note against cool chrome.
- **Slate steel secondary** (`#7A8B96`) for the rare cases primary isn't right but neutral chrome is too quiet — focus rings on secondary controls, chart legends, never compelling attention.
- **Tonal layering** (`bg-100` → `bg-200` → `bg-300` → `bg-400`) carries depth; shadows are restraint-by-default. Each step lifts lightness ≥4% for visible separation without borders.
- **Fluid typography** via `clamp()`; headings scale, body fixed for legibility.
- **Token-only spacing** (`s-100` → `l-900`); raw Tailwind spacing is forbidden.
- **Result colors separated from action colors** — green/red signal P&L; cyan/orange signal directional intent. They never share the same hue.

## 2. Colors: The Cockpit Palette

A cool-neutral near-black canvas, warm bronze for the single earned signal, slate steel for quiet secondary, and a strict semantic split between _result_ colors (P&L) and _action_ colors (intent).

### Primary

- **Bronze** (`#C29D6A` dark / `#8C6E40` light): the single warm note in an otherwise cool palette. Used for the primary CTA on a view (maximum one per screen), focus rings, the lead chart series, the rare hero metric. Hue ~70°, chroma ~0.06 — luminous enough to lift forward without saturating into "brassy," disciplined enough to never read as decorative. Hover state lightens to `#D2AE7C` (dark) for tactile lift; deeper variant `#9C7C4F` available for muted/disabled states.

### Secondary

- **Slate Steel** (`#7A8B96` dark / `#5A6B76` light): the quiet alternate for non-compelling controls. Sits in the same cool family as the chrome (hue ~210°, chroma ~0.04), so it never competes with bronze for attention. Used for: focus rings on secondary controls, chart axis colors, non-primary legend swatches, the "and one more" stat in a card that needs a hint of color but not an accent. Hover lightens to `#8C9DA8` (dark).

### Tertiary — Trade Result Colors

These represent **outcome**: profit, loss, win, lose. Visually distinct from action colors so the trader never confuses "this trade made money" with "this button is a buy."

- **Profit / Win** (`trade-buy` `#34D399`): positive P&L, winning trades, positive metric deltas, rule compliance ≥80%.
- **Loss / Lose** (`trade-sell` `#F87171`): negative P&L, losing trades, negative metric deltas, rule compliance <50%.
- **Warning** (`trade-warning` `#FBBF24`): mid-range compliance, caution states, partial fills.

### Tertiary — Action Direction Colors

These represent **intent**: buy/sell buttons, long/short positions. Hue-distinct from result colors so semantic role is unambiguous.

- **Long / Buy Action** (`action-buy` `#5BB8D6`): cyan-shifted blue. Sits at hue ~200° to avoid clashing with bronze (~70°) and to read as "directional intent" rather than "primary action."
- **Short / Sell Action** (`action-sell` `#FB923C`): warm orange. Hue (~30°) is close to bronze but the saturation (chroma ~0.16) is much higher, so it reads as "action direction" not "muted brand accent." Never paired adjacent to bronze without semantic context.

### Neutral

- **Canvas** (`bg-100` `#0F1014`): page background. Cool-neutral near-black at hue ~240°, chroma ~0.003 — perceptually black but with a faint cool undertone that pushes the canvas away from "warm/cozy" and toward "cool instrument."
- **Surface** (`bg-200` `#1A1C20`): card and panel background. Lifts off canvas by ≥4% lightness, no shadow required.
- **Border / Muted** (`bg-300` `#272A2E`): borders, dividers, muted fills, recessed-stat backgrounds inside cards.
- **Elevated Surface** (`bg-400` `#363940`): hover-state surface for cards, button-secondary hover background, the fourth tonal step when three isn't enough.
- **Stripe** (`bg-stripe` `#141519`): alternating table-row background.
- **Text Primary** (`txt-100` `#EEF0F2`): default body, primary values, card titles.
- **Text Secondary** (`txt-200` `#A8ADB5`): labels, secondary info, default icon stroke.
- **Text Tertiary** (`txt-300` `#787C84`): captions, hints, table metadata, chart axis labels.
- **Placeholder** (`txt-placeholder` `#5D6168`): empty input states only.

### Feedback

- **Error** (`fb-error` `#EF4444`): form validation errors, destructive-action confirmation. Same family as `trade-sell` but more saturated — context disambiguates.
- **Success** (`fb-success` `#34D399`): form save confirmations, system-positive states. Same value as `trade-buy`; context disambiguates.

### Named Rules

**The Temperature-Contrast Rule.** Chrome is cool (hue ~240° on `bg-*` and `txt-*`); the primary accent is warm (hue ~70° bronze). That contrast is the system's signature. Tinting `bg-100`/`bg-200`/`bg-300` warm — toward bronze, toward sepia, toward "cozy" — destroys the signal. Tinting the accent cool — toward cobalt, toward navy — collapses identity into the fintech template lane. Both walls are load-bearing.

**The Result-vs-Action Wall.** Green and red are reserved for **outcome** (P&L, win/lose). Cyan and orange are reserved for **intent** (long/short, buy/sell action). Never paint a "Buy" button green because "buy is positive" — it conflates the trade with its result. Never paint a profit cell cyan. The semantic walls are load-bearing.

**The Earned-Bronze Rule.** If you cannot articulate why a specific surface needs the one warm accent in the system, it gets neutral tokens (`bg-300`, `txt-200`) instead. Maximum one primary-bronze CTA visible per viewport. Navigation active state was demoted from bronze to `bg-300 + txt-100` precisely because "you are here" is chrome, not signal. Tab active underline was demoted from bronze to `txt-100` for the same reason. Bronze is reserved for: the _one_ primary action on a view, focus rings, the lead chart series, occasional hero metrics, the brand mark.

**The Cool-Neutral-Chrome Rule.** The canvas is `#0F1014`, not `#000000`, not `#0a0a0a`, not warm-near-black `#0E0C0A`. The cool 240° undertone (chroma ~0.003) is what makes bronze register as a _signal_. Do not "fix" it back to warm. Do not "fix" it to pure-neutral. The cool undertone is the foundation the accent stands on.

## 3. Typography

**Display Font:** Public Sans (with `ui-sans-serif`, `system-ui`, `sans-serif` fallback).
**Body Font:** Public Sans (same family — single sans, no display/body split).
**Mono Font:** Geist Mono (with `ui-monospace`, `monospace` fallback).

**Character:** Public Sans is clean, professional, and excellent for number legibility — a humanist sans with tight apertures that holds up at small sizes. The pairing with Geist Mono carries one explicit hierarchical signal: prose is sans, numerical data is mono. Tabular numerals (`font-variant-numeric: tabular-nums`) are enabled globally on `body` so columns of trade P&L, prices, and R-multiples align without per-component overrides.

### Hierarchy

Headings scale fluidly via `clamp()` between mobile and desktop. Body and below stay fixed — readability under pressure beats fluid scaling at small sizes.

- **Display** (700 / `clamp(1.75rem, 1.25rem + 1.5vw, 3rem)` / 1.1 / -0.01em): page titles. Maximum one per page; usually omitted.
- **Headline** (600 / `clamp(1.375rem, 1rem + 1.25vw, 2.25rem)` / 1.2 / -0.005em): section headings.
- **Title** (600 / `clamp(1.125rem, 0.875rem + 0.75vw, 1.5rem)` / 1.3): card titles, subsection headings.
- **Body** (400 / 1rem / 1.5 / tabular-nums): default text. Cap body line length at 65–75ch.
- **Label** (500 / 0.875rem / 1.4): button text, interactive elements, secondary values, stat labels.
- **Caption** (400 / 0.75rem / 1.4): tooltips, table metadata, chart axis labels, captions.
- **Micro** (500 / 0.625rem / 1.3 / 0.02em): badges, fine print. Use sparingly.
- **Mono** (500 / 0.875rem / 1.4 / tabular-nums, Geist Mono): numerical data — P&L, prices, R-multiples, strategy codes.

### Named Rules

**The Tabular-Nums Default.** Every numeric value renders in tabular numerals, whether wrapped in `font-mono` or not. Mixed-width digits break column alignment in trade tables and metric cards. This is enforced globally on `body` and must never be overridden.

**The Bold-Is-Major-Emphasis Rule.** `font-bold` (700) is reserved for hero metrics, page titles, and major value callouts. Section headings use `font-semibold` (600). Body text and labels never bold. If everything is bold, nothing is.

**The Mono-for-Numbers Rule.** Numerical data displays in Geist Mono with the chip-mono pill styling (`bg-bg-300 text-txt-200`, small rounded). Strategy codes, R-multiples, and price levels never display in Public Sans — the alignment and digit-glance speed of mono is non-negotiable for traders.

## 4. Elevation

Axion uses **tonal layering as the primary depth strategy**, with shadows as a secondary tool reserved for state response (hover) and floating elements (menus, modals). At rest, surfaces are flat. Depth comes from `bg-100` → `bg-200` → `bg-300` → `bg-400` tonal contrast — four discrete altitude levels visible without any blur or drop-shadow, each step lifting lightness by ≥4%.

In light mode, the tonal gap between `bg-100` and `bg-200` narrows (stone-white gradient is subtler than cool-near-black gradient), so the shadow vocabulary takes on slightly more weight to compensate.

### Shadow Vocabulary

- **Small** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.1)`): subtle lift for tooltips and small popovers.
- **Medium** (`box-shadow: 0 4px 6px rgb(0 0 0 / 0.1), 0 2px 4px rgb(0 0 0 / 0.06)`): cards on hover — gives interactive feedback without committing to "floating."
- **Large** (`box-shadow: 0 10px 15px rgb(0 0 0 / 0.1), 0 4px 6px rgb(0 0 0 / 0.05)`): dropdown menus, popovers, context menus. Clearly detached.
- **Extra Large** (`box-shadow: 20px 25px rgb(0 0 0 / 0.1), 0 10px 10px rgb(0 0 0 / 0.04)`): modals and elevated panels — used sparingly.
- **Inner** (`box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05)`): recessed inputs — rarely needed because input backgrounds already use `bg-200`.

### Elevation Layers

| Layer            | z-index | Elements                          |
| ---------------- | ------- | --------------------------------- |
| Base             | 0       | Page content, cards at rest       |
| Overlay backdrop | 10      | Click-to-close invisible overlays |
| Dropdowns        | 20      | Context menus, popovers           |
| Modals           | 30+     | Dialog overlays                   |

### Named Rules

**The Flat-By-Default Rule.** Surfaces at rest carry no shadow. Borders (`border-bg-300`) define card edges. Shadows appear only as a _response_ to state — `:hover` for cards (lifts to `shadow-medium`), `:focus` for inputs (bronze ring), or as the _consequence of altitude_ for floating elements (menus, modals).

**The Tonal-Layer-First Rule.** When you need to convey "this content sits inside that content," reach for a tonal shift (`bg-100` inside a `bg-200` card) before reaching for an inset shadow or a border. The cool-neutral-near-black canvas was designed so tonal contrast does most depth work without ornament.

## 5. Components

Each component is a working primitive in the live system. Specifications below are normative — they reflect the actual implementations under `src/components/ui/`. Departures require explicit justification.

### Buttons

- **Shape:** moderately rounded (`rounded-md` = `10px`). Never sharp-edged (too brutalist), never pill-shaped except for `chip` (which is a different role).
- **Primary** (Bronze fill, `#C29D6A` bg / `#FFFFFF` text / `10px 16px` padding): single primary action per view. Hover lifts to `#D2AE7C`. Focus shows a 2px outer ring at `acc-100 / 0.3` alpha. Maximum one per viewport.
- **Secondary** (`bg-300` fill, `txt-100` text): neutral chrome alternate for the rare case where `outline` reads too quiet but bronze would over-signal. Hover lifts background to `bg-400`. Slate-steel `acc-200` is NOT a button fill — it's reserved for focus rings on secondary controls and chart legends.
- **Outline** (`bg-200` fill, `bg-300` border, `txt-100` text): the default non-primary action. Quiet, neutral, plays well next to a single Primary.
- **Ghost** (transparent fill, `txt-200` text, hover background `bg-300`): tertiary actions, toolbar buttons, in-card affordances. The most-used non-Primary variant.
- **Destructive** (`fb-error` fill, `#FFFFFF` text): delete, irreversible action. Always confirms via `AlertDialog`, never via `window.confirm()`.
- **Link** (transparent, `acc-100` text, `underline-offset-4` on hover): inline navigation. Bronze only — never slate, never neutral.

### Cards

- **Corner Style:** `rounded-md` (`10px`).
- **Background:** `bg-200` (`#1A1C20`) lifts off the `bg-100` canvas by tonal differentiation alone — no shadow needed at rest.
- **Border:** `border-bg-300` (`#272A2E`) — provides edge definition in the absence of shadow.
- **Internal Padding:** scales responsively: `p-s-300` mobile (`12px`), `p-m-400` `sm:` (`16px`), `p-m-500` `lg:` (`20px`).
- **Hover:** `shadow-medium` and `border-bg-300/80` — subtle, interactive feedback only. No `transform: scale()` or `translateY` shifts.
- **Nesting:** internal recessed elements (stat blocks, code blocks) use `bg-100` to create a subtle inset effect. Cards never nest inside cards.

### Stat Block (signature component)

A recessed sub-card used inside Cards to display labeled metric values. Defines Axion's data-density language.

- **Shape:** `rounded-md`, centered alignment.
- **Background:** `bg-100` (recessed against parent `bg-200` Card).
- **Padding:** `p-s-300` (`12px`).
- **Label** (`text-tiny text-txt-300`): the metric name in tertiary text.
- **Value** (`text-body text-txt-100 font-bold mt-s-100`): the metric value in bold primary text. Numeric values inherit `tabular-nums` from `body`.
- Hero stat blocks may use `text-acc-100` for the value when the metric is itself the single primary signal of the card — maximum one bronze-highlighted stat per card.

### Inputs

- **Style:** `bg-200` fill, `border-bg-300` border, `rounded-md`, `text-txt-100` text, `text-txt-placeholder` placeholder.
- **Focus:** bronze ring (`ring-acc-100/30`) + `border-acc-100`. The focus ring is _always_ visible — never `outline-none` without a replacement.
- **Invalid:** `aria-invalid="true"` (string, never truthy JS value) shifts border to `fb-error`.
- **Disabled:** opacity drops to 0.5, cursor `not-allowed`.

### Chips

- **Style chip** (badge): `bg-bg-300` background, `text-txt-200`, `rounded-full`, `px-s-300 py-s-100` (`10px 4px`), `text-tiny`. For tags, status pills, filter markers.
- **Mono chip** (code pill): `bg-bg-300` background, `text-txt-200`, `rounded-sm`, `px-s-200 py-s-100` (`8px 2px`), `font-mono text-small`. For strategy codes, R-multiples, ticker symbols.

### Menus (Dropdown)

- **Container:** `border-bg-300`, `bg-bg-100` (NOT `bg-200` — popovers detach from the surface plane), `rounded-md`, `shadow-large`, `py-s-100` (4px vertical).
- **Item:** `px-s-300 py-s-200` (`12px 8px`), `text-small`, `text-txt-200`, hover background `bg-bg-200`.
- **ARIA:** `role="menu"` on container, `role="menuitem"` + `tabIndex={-1}` on items. Escape closes. ArrowUp/ArrowDown navigates. First item auto-focuses on open.
- **Backdrop:** `fixed inset-0 z-10` invisible click-to-close overlay.

### Navigation

- **Item style:** `nav-item` — transparent background, `text-txt-200`, `rounded-md`, `px-s-300 py-s-200`. Hover: `bg-bg-300`.
- **Active state:** `bg-bg-300` background, `text-txt-100`. **No bronze.** "You are here" is chrome, not signal — bronze active state was demoted on purpose so the one bronze element on screen can be the actual primary action, not the navigation breadcrumb.
- **Tab active underline:** `after:bg-txt-100` (NOT bronze). Same logic — tab state is chrome.
- **Typography:** `text-label` (500 / 0.875rem).
- **Mobile:** horizontal scrollable list with `scrollbar-none` utility hides the scrollbar while preserving scroll.

### Progress Bars

- **Track:** `bg-bg-300`, `h-2`, `rounded-full`.
- **Fill:** `rounded-full`, `transition-[width]` (motion-safe).
- **Fill color** maps to rule-compliance bands: `bg-trade-buy` for ≥80%, `bg-trade-warning` for ≥50%, `bg-trade-sell` for <50%.
- **ARIA:** `role="progressbar"`, `aria-valuenow`, `aria-valuemin={0}`, `aria-valuemax={100}`.

### Charts (Recharts)

- **Container:** `ChartContainer` wrapper handling `ResponsiveContainer` sizing. `role="img"`, `aria-label={title}`.
- **Grid:** `strokeDasharray="3 3"`, stroke `var(--color-bg-300)`, `vertical={false}`.
- **Axes:** fontSize 11, fill `var(--color-txt-300)`, no `tickLine`, no `axisLine`.
- **Tooltip surface:** `border-bg-300`, `bg-bg-100`, `rounded-md`, `shadow-large`, `p-s-300`.
- **Lead series:** the _first_ series in a comparison chart uses `acc-100` (bronze). Additional series rotate through neutral / slate-steel / cyan-shifted blues to avoid muddle with the result-color wall (green/red are reserved for P&L).
- **Gradient fills:** linear from 20% alpha to 0% alpha of the source color.
- **Motion:** **`isAnimationActive={false}` on every Recharts component.** Recharts does not respect `prefers-reduced-motion`; this enforcement is at the component layer.

### Named Rules

**The One-Primary Rule.** Maximum one `button-primary` (bronze fill) per viewport. If you have two primary actions on a screen, one is not actually primary — promote one, demote the other to `outline`.

**The Recharts-Motion-Lock Rule.** Every Recharts component receives `isAnimationActive={false}` without exception. The library ignores `prefers-reduced-motion`, so enforcement happens at the component prop layer, not the CSS layer.

**The aria-invalid-String Rule.** `aria-invalid` only accepts the string `"true"` or `undefined`. Passing a truthy JS value (`aria-invalid={errors.length > 0}`) coerces to string `"true"` or `"false"` and breaks AT support unpredictably. The pattern is `aria-invalid={hasError ? "true" : undefined}`.

## 6. Do's and Don'ts

### Do:

- **Do** use `acc-100` (Bronze) only for: the single primary action on a view, focus rings, the lead chart series, occasional hero metrics, brand mark surfaces, inline links. Audit any view with more than 3–4 visible bronze elements.
- **Do** use `acc-200` (Slate Steel) only when neutral chrome is too quiet but bronze would over-signal — focus rings on secondary controls, chart axes, the second series in a paired comparison.
- **Do** use design tokens for spacing — `gap-s-300`, `p-m-400`, `mt-l-700`. Pattern: `p-s-300 sm:p-m-400 lg:p-m-500` for responsive card padding.
- **Do** use `bg-300` for borders and dividers. Never `border-gray-700` or any raw Tailwind gray.
- **Do** display numerical data in Geist Mono (`font-mono`) — P&L, prices, R-multiples, strategy codes, tickers.
- **Do** reserve `font-bold` for hero metrics, card titles, and primary values.
- **Do** set `isAnimationActive={false}` on every Recharts component.
- **Do** use `aria-invalid="true"` (string) or `undefined` on form inputs — never truthy JS values.
- **Do** confirm destructive actions via `AlertDialog` (`src/components/ui/alert-dialog.tsx`).
- **Do** pair color signals with iconography, sign, or position so color-blind users get the same affordance.
- **Do** keep the chrome cool-neutral — `bg-100` is `#0F1014` (hue ~240°, chroma ~0.003), the _foundation the bronze stands on_. Do not retune toward warm.

### Don't:

- **Don't** use violet, purple, lavender, or indigo as a primary brand color. Quoting PRODUCT.md: _"the saturated AI-tool color palette … violet/purple as a primary brand color is forbidden."_
- **Don't** use cobalt, royal blue, or navy as a primary brand color. Quoting PRODUCT.md: _"The cobalt-fintech reflex … Bloomberg-template, every-bank-app, every-broker-dashboard. Axion is not that."_ Bronze is the locked accent precisely because cobalt is the obvious move.
- **Don't** tint `bg-100`/`bg-200`/`bg-300` warm (toward bronze, toward sepia, toward "cozy"). Warm chrome collapses the temperature contrast that makes bronze signal. The cool 240° undertone is load-bearing.
- **Don't** ship the Vercel/Shadcn cool-neutral-without-an-accent template aesthetic. The bronze accent IS the differentiation — strip it and Axion becomes another template.
- **Don't** use bright neon greens, cyans, or magentas as primary or chrome accents. Neon greens/cyans belong in `trade-*` semantic role only; magenta is not in the palette.
- **Don't** halo every icon with `bg-acc-100/10`. Section icons default to `text-txt-200` or `text-txt-300`. Bronze is signal, not chrome.
- **Don't** paint a "Buy" button green or a "Sell" button red. Result colors (green/red) and action colors (cyan/orange) live in different semantic worlds.
- **Don't** paint navigation active state or tab active underline bronze. "You are here" is chrome — `bg-300 + txt-100` for nav, `after:bg-txt-100` for tabs. Demotions are intentional.
- **Don't** ship sparkle (✨) icons on "AI" features, "AI-powered, coming soon" placeholder cards, or copilot panels by reflex. Quoting PRODUCT.md: _"If a feature is AI-driven, the work should speak for itself."_
- **Don't** ship confetti, achievement badges, streak counters, or emoji mood pickers. Quoting PRODUCT.md: _"Trading is serious work. The app celebrates discipline and consistency, never individual wins. A green day is not a party."_
- **Don't** use raw Tailwind spacing values (`gap-4`, `p-2`, `mt-6`). Use the token scale (`gap-s-300`, `p-m-400`, `mt-m-600`).
- **Don't** use arbitrary Tailwind values (`text-[28px]`, `rounded-[12px]`, `max-w-[1600px]`). Use `text-h*`, `rounded-md/lg`, `max-w-screen-2xl`.
- **Don't** use side-stripe borders (`border-l-4`, `border-r-4` colored stripes on cards/alerts). Universal slop signal.
- **Don't** use `background-clip: text` gradient text. Universal slop signal.
- **Don't** use glassmorphism (`backdrop-blur` + translucent fill) decoratively. Rare and purposeful, or nothing.
- **Don't** use `window.confirm()`, `window.alert()`, or `confirm()`. Use the project's `AlertDialog` primitive.
- **Don't** use raw `<table>`, `<a href>`, `<input type="checkbox">`, or `<img>` in non-UI-primitive code. Use the project's UI components and `next/link` / `next/image`.
- **Don't** ship `.forEach()`. Use `for...of`, `.map()`, or `.reduce()`.
- **Don't** use default exports. Always `export { Component }` at end of file.
- **Don't** bold every label and heading. `font-bold` is reserved for major emphasis.
- **Don't** rely on color alone for any semantic state (P&L sign, validity, win/loss). Always pair color with iconography, sign, or position.
