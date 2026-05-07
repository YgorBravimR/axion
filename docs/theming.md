# Axion — Theming System

> **Single source of truth: `src/app/globals.css`.**
> This doc describes the token *system*, *patterns*, and *authoring rules* — never the values.
> If you need a specific hex, px, or clamp formula, read `globals.css`.

## 1. Architecture

Tailwind CSS v4 `@theme` block defines every design token as a CSS custom property. Tokens generate utilities automatically (e.g. `--color-bg-100` → `bg-bg-100`, `--spacing-m-400` → `p-m-400`).

Two orthogonal switching axes, applied as attributes on `<html>` (or any wrapper):

| Attribute | Values | Default |
|---|---|---|
| `data-theme` | `dark` / `light` | `dark` |
| `data-brand` | `axion` / `bravo` / `midnight` / `retro` / `luxury` / `tsr` / `neon` / `lannister` / unset | unset (default palette) |

Combinations cascade: `[data-brand="axion"][data-theme="light"]` overrides `[data-brand="axion"]` overrides the base `@theme`.

## 2. Token Categories (names + roles only)

### Backgrounds — `--color-bg-*`

| Token | Role |
|---|---|
| `bg-100` | Primary canvas |
| `bg-200` | Cards / surfaces |
| `bg-300` | Borders / muted surfaces |
| `bg-400` | Extra elevation (default palette only) |
| `bg-stripe` | Zebra-stripe rows in tables |

### Text — `--color-txt-*`

| Token | Role |
|---|---|
| `txt-100` | Primary text |
| `txt-200` | Secondary / metadata |
| `txt-300` | Tertiary / muted labels |
| `txt-placeholder` | Form placeholders |

### Accents — `--color-acc-*`

| Token | Role |
|---|---|
| `acc-100` | Primary brand accent — primary buttons, focus rings |
| `acc-200` | Secondary accent — links, secondary actions |

### Feedback — `--color-fb-*`

`fb-error` (errors / destructive) and `fb-success` (success states).

### Trading semantic

| Token | Aliases | Role |
|---|---|---|
| `trade-buy` | `profit`, `win` | P&L positive, win indicator |
| `trade-sell` | `loss`, `lose` | P&L negative, loss indicator |
| `action-buy` | `long` | Long entry / buy action |
| `action-sell` | `short` | Short entry / sell action |
| `warning` | — | High-risk / mistake-tag alerts |
| `*-muted` | — | Soft-fill alpha variants |

> **Rule**: P&L colors (profit/loss) are perceptual results. Action colors (long/short) are directional. Keep them decoupled — a long position can be in profit or loss without conflating "buy" with "green".

### Brand scale — `--color-brand-*`

`brand-400` → `brand-500` → `brand-600` (light → mid → dark). Brand-marked surfaces and hover/active states on primary actions.

### Page guide — `--color-guide`

In-app guide / walkthrough marker. Each theme overrides it so it always pops against the active palette.

## 3. Spacing Scale

Token names: `s-100`, `s-200`, `s-300`, `m-400`, `m-500`, `m-600`, `l-700`, `l-800`, `l-900`. Use them as Tailwind utilities (`p-s-200`, `gap-m-400`).

> **Never** use the raw numeric scale (`p-2`, `gap-4`) — it bypasses theme overrides and drifts.

## 4. Typography

- **Body**: Public Sans (`--font-public-sans` → `--font-sans`).
- **Mono**: Geist Mono (`--font-geist-mono` → `--font-mono`) — for numerical data, prices, P&L, code.
- **Tabular numbers**: enforced globally on `body` via `font-variant-numeric: tabular-nums`. Don't add `font-mono` solely to align decimals.

### Fluid type tokens

`text-h1`, `text-h2`, `text-h3` scale with viewport (clamp-based). `text-body`, `text-small`, `text-tiny`, `text-micro` stay fixed for cross-screen readability.

> `text-h4` does **not** exist. `text-h4`, `s-400`, `rounded-m-200` are recurring Tailwind v4 footguns — they compile to nothing and silently break layouts. See `docs/scans/2026-05-07-cockpit-tokens.md`.

## 5. Breakpoints

Token names: `screen-xs`, `screen-sm`, `screen-md`, `screen-lg`, `screen-xl`, `screen-2xl`, plus `breakpoint-xs`. Use as Tailwind responsive prefixes (`md:flex`, `lg:grid-cols-3`).

## 6. Shadows

`shadow-small`, `shadow-medium`, `shadow-large`, `shadow-xl`, `shadow-inner`. Kept subtle by design — elevation in Axion comes from color contrast, not shadow weight.

## 7. Animation

| Token | Use |
|---|---|
| `animate-overlay-pulse-line` | Loading line pulse |
| `animate-overlay-fade-in` | Overlay enter |
| `animate-overlay-progress-shimmer` | Progress shimmer |
| `animate-overlay-fade-out` | Overlay exit |
| `animate-transition-scale-in` | Account/page enter |
| `animate-transition-text-up` | Text rise-in |
| `animate-transition-ring-pulse` | Focus ring pulse |
| `animate-transition-video-expand` | Splash video scale-up |
| `animate-transition-content-fade` | Content fade-out during transition |

### Reduced motion

A global `prefers-reduced-motion: reduce` rule kills all transitions and animations on `*, *::before, *::after`. Per-component motion overrides are unnecessary — the global guard already covers WCAG 2.3.3.

## 8. Brand Themes

Eight palettes shipped: _default_, `axion`, `bravo`, `midnight`, `retro`, `luxury`, `tsr`, `neon`, `lannister`. Every brand implements BOTH dark and light variants.

Add a new theme by copying the full pair `[data-brand="X"]` + `[data-brand="X"][data-theme="light"]` in `globals.css` and overriding every token in both blocks.

## 9. Custom Utilities

| Utility | Purpose |
|---|---|
| `bg-both-closed` | Diagonal split gradient for calendar days where both B3 + NYSE are closed |
| `scrollbar-none` | Hide scrollbar, keep scroll behaviour |
| `page-padding` | Fluid `clamp()`-based page padding |
| `animation-delay-100` / `animation-delay-200` | Staggered animation start |
| `will-change-transform-opacity` | GPU layer hint for the splash video scale |

Logo helper: `[data-axion-logo="invertable"]` is auto-inverted under `[data-theme="light"]`.

## 10. Authoring Rules

- **Always use tokens** — never raw hex/rgb/px in components or arbitrary Tailwind values (`bg-[#0c0e0f]`, `p-[12px]`).
- **Use the design spacing scale** — `p-s-200`, `gap-m-400`, never `p-2`, `gap-4`.
- **Validate token names** — Tailwind v4 silently drops invalid utilities. Watch for `rounded-m-200`, `s-400`, `text-h4`.
- **Light mode is mandatory** — verify every new component under both `data-theme="dark"` and `data-theme="light"`.
- **Trust the reduced-motion guard** — don't add per-component `motion-reduce:` overrides for the basic case.
- **Pair P&L vs action colours correctly** — green for profit, blue for buy direction, never crossed.
- **Don't duplicate values in docs** — if a number, hex, or clamp formula belongs anywhere, it's `globals.css`. Doc references the token *name*; reader looks up the value at the source.
