# Axion Design System

> **Authoritative design specification for AI agents and contributors.**
> Brand context, user personas, and design philosophy live in [`.impeccable.md`](./.impeccable.md).
> This document covers the **technical implementation** of the design system.

---

## 1. Visual Theme

**Dark-first, premium-minimal trading cockpit.**

| Attribute | Value |
|-----------|-------|
| Default theme | Dark (`bg-100: #0B0E11`) |
| Secondary theme | Light (`bg-100: #FAFAF9`) |
| Branded themes | 8 variants (bravo, midnight, retro, luxury, tsr, neon, lannister, axion) — each has dark + light |
| Theme switching | `data-theme="light"` on root element; `data-brand="<name>"` for branded themes |
| Signature accent | Violet plasma (`acc-100`) — primary actions, key metrics, focus rings |
| Heritage accent | Gold (`acc-200`) — Bravo-DNA anchor, reserved for rare significance |
| Personality | Linear/Raycast elegance meets Stripe data clarity |
| Anti-patterns | No gamification, no confetti, no AI-sparkle clichés, no generic SaaS blandness |

**Font stack:**
- **Body**: Public Sans (`--font-sans`) — clean, professional, excellent number legibility
- **Monospace**: Geist Mono (`--font-mono`) — numerical data, code blocks, strategy codes
- **Numeric rendering**: `font-variant-numeric: tabular-nums` globally for aligned columns

---

## 2. Color Palette & Roles

### Core UI Colors

| Token | Dark | Light | Role |
|-------|------|-------|------|
| `bg-100` | `rgb(11 14 17)` | `rgb(250 250 249)` | Page background |
| `bg-200` | `rgb(21 25 33)` | `rgb(245 245 244)` | Card/surface background |
| `bg-300` | `rgb(43 47 54)` | `rgb(231 229 228)` | Borders, dividers, muted fills |
| `bg-stripe` | `rgb(26 31 38)` | `rgb(240 240 238)` | Alternating table row |
| `txt-100` | `rgb(240 242 245)` | `rgb(41 37 36)` | Primary text |
| `txt-200` | `rgb(170 180 195)` | `rgb(87 83 78)` | Secondary text, labels |
| `txt-300` | `rgb(140 150 165)` | `rgb(120 113 108)` | Tertiary text, hints, captions |
| `txt-placeholder` | `rgb(80 86 95)` | — | Input placeholder |
| `acc-100` | `rgb(139 92 246)` (#8B5CF6) | `rgb(124 58 237)` (#7C3AED) | **Violet plasma** — primary accent, CTAs, focus rings, key metrics |
| `acc-200` | `rgb(212 175 55)` (#D4AF37) | `rgb(184 148 31)` (#B8941F) | **Gold heritage** — Bravo-DNA anchor, secondary CTAs, rare significance |
| `fb-error` | `rgb(204 85 85)` | `rgb(220 38 38)` | Error states |
| `fb-success` | `rgb(52 211 153)` | `rgb(5 150 105)` | Success states |

### Trading Colors (Result Visualization)

These represent **outcomes** — profit/loss, win/lose.

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `trade-buy` | `rgb(0 255 150)` | `rgb(0 180 100)` | Profit, winning trades, positive metrics |
| `trade-sell` | `rgb(128 128 255)` | `rgb(100 100 220)` | Loss, losing trades, negative metrics |
| `warning` | `rgb(252 213 53)` | `rgb(220 180 20)` | Warnings, mid-range compliance |
| `trade-buy-muted` | `0 255 150 / 0.2` | `0 180 100 / 0.15` | Muted profit background |
| `trade-sell-muted` | `128 128 255 / 0.2` | `100 100 220 / 0.15` | Muted loss background |

### Action Colors (Directional Actions)

These represent **intent** — buy/sell buttons, long/short positions. Visually distinct from result colors.

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `action-buy` | `rgb(100 180 255)` | `rgb(70 150 225)` | Buy action, long position indicator |
| `action-sell` | `rgb(255 140 100)` | `rgb(225 110 70)` | Sell action, short position indicator |
| `action-buy-muted` | `100 180 255 / 0.2` | `70 150 225 / 0.15` | Muted buy background |
| `action-sell-muted` | `255 140 100 / 0.2` | `225 110 70 / 0.15` | Muted sell background |

### Semantic Aliases

| Alias | Maps to | Context |
|-------|---------|---------|
| `profit` / `win` | `trade-buy` | Result visualization |
| `loss` / `lose` | `trade-sell` | Result visualization |
| `long` | `action-buy` | Directional indicator |
| `short` | `action-sell` | Directional indicator |

### Special Colors

| Token | Value | Usage |
|-------|-------|-------|
| `guide` | `rgb(168 130 255)` (dark) / `rgb(120 80 220)` (light) | Page guide overlays |
| `brand-400/500/600` | Gold scale | Brand identity elements |

### Accent Discipline Rules

> **Violet plasma (`acc-100`) is the primary brand signature.**
>
> Valid uses: primary CTA buttons, key metric highlights (total P&L, win rate), navigation active states, focus rings, links, the logo mark.
>
> Invalid uses: every icon, every heading, decorative borders without purpose, status badges, section icons.
>
> Guideline: violet should feel decisive, not spammed. If every card has a violet halo behind every icon, the signal is dead. Icons in content sections use `txt-200` or `txt-300` by default.

> **Gold heritage (`acc-200`) is rare and earned.**
>
> Valid uses: secondary CTAs in heritage-significant flows (premium gating, account-level brand moments), the Bravo-brand mark, rare hero metrics.
>
> Invalid uses: every secondary button, tooltip borders, decorative dividers, every numeric KPI, generic icon strokes.
>
> Guideline: gold should feel earned. If you can't articulate why a particular surface needs heritage weight, use neutral tokens (`bg-bg-300`, `text-txt-200`) instead. Most non-primary buttons should be `outline` or `ghost`, not `secondary`.

---

## 3. Typography Rules

### Scale

All headings use fluid `clamp()` scaling for graceful mobile → desktop transitions. Body and below are fixed for readability.

| Token | Size | Tailwind class | Usage |
|-------|------|----------------|-------|
| `h1` | `clamp(1.75rem, 1.25rem + 1.5vw, 3rem)` | `text-h1` | Page titles (rare — one per page max) |
| `h2` | `clamp(1.375rem, 1rem + 1.25vw, 2.25rem)` | `text-h2` | Section headings |
| `h3` | `clamp(1.125rem, 0.875rem + 0.75vw, 1.5rem)` | `text-h3` | Card titles, subsections |
| `body` | `1rem` (16px) | `text-body` | Default body text |
| `small` | `0.875rem` (14px) | `text-small` | Secondary labels, stat labels |
| `tiny` | `0.75rem` (12px) | `text-tiny` | Captions, tooltips, metadata |
| `micro` | `0.625rem` (10px) | `text-micro` | Badges, fine print (use sparingly) |

### Weight Hierarchy

| Weight | Usage |
|--------|-------|
| `font-bold` (700) | Key metrics, card titles, primary values |
| `font-semibold` (600) | Section headings, important labels |
| `font-medium` (500) | Interactive elements, secondary values |
| Normal (400) | Body text, descriptions |

### Rules

- **Bold is reserved for major emphasis.** Not every label or heading needs bold.
- Numerical data (P&L, prices, R-multiples) use `font-mono` for alignment.
- Strategy codes display in `font-mono` with `bg-bg-300 text-txt-200` pill styling.
- Never mix `text-h*` and `text-body/small/tiny` within the same visual level of a card.

---

## 4. Component Stylings

### Cards

```
Container: border-bg-300 bg-bg-200 rounded-lg border
Padding:   p-s-300 sm:p-m-400 lg:p-m-500
Hover:     hover:shadow-md hover:border-bg-300/80 transition-shadow
```

Cards are the primary content container. They use `bg-200` to lift off the `bg-100` page background, with `bg-300` borders. Internal stat blocks use `bg-100` to create a subtle recessed effect.

### Stat Blocks (inside cards)

```
Container: bg-bg-100 p-s-300 rounded-lg text-center
Label:     text-tiny text-txt-300
Value:     text-body text-txt-100 font-bold mt-s-100
```

### Buttons

| Variant | Style | Use when |
|---------|-------|----------|
| `default` (Primary) | `bg-acc-100 text-bg-100` — violet fill, dark text | Primary action on screen (max 1 per view) |
| `secondary` | `bg-acc-200 text-bg-100` — gold heritage fill | Heritage moment only (premium gate, brand surface). Rare. |
| `outline` | `border-bg-300 bg-bg-200 text-txt-100` — neutral outlined | Default non-primary action |
| `ghost` | `bg-transparent text-txt-200 hover:bg-bg-300` — no fill | Tertiary, toolbar, in-card actions |
| `destructive` | `bg-fb-error text-bg-100` — error fill | Delete, irreversible action |
| `link` | `text-acc-100 underline-offset-4 hover:underline` — violet link | Inline navigation |

### Inputs

```
Border:      border-bg-300
Background:  bg-bg-200
Focus:       ring-acc-100/30 + border-acc-100 (violet focus ring)
Placeholder: text-txt-placeholder
Invalid:     aria-invalid="true" (use boolean, never truthy values)
```

### Progress Bars

```
Track:    bg-bg-300 h-2 rounded-full overflow-hidden
Fill:     h-full rounded-full transition-[width]
Colors:   bg-trade-buy (>=80%) | bg-warning (>=50%) | bg-trade-sell (<50%)
ARIA:     role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}
```

### Menus (Dropdown)

```
Container: border-bg-300 bg-bg-100 rounded-lg border shadow-lg py-1
Item:      px-s-300 py-s-200 text-small text-txt-200 hover:bg-bg-200
ARIA:      role="menu" on container, role="menuitem" + tabIndex={-1} on items
Keyboard:  Escape closes, ArrowUp/ArrowDown navigates, auto-focus first item on open
Backdrop:  fixed inset-0 z-10 (invisible click-to-close overlay)
```

### Charts (Recharts)

```
Container:   ChartContainer wrapper (handles ResponsiveContainer sizing)
Grid:        strokeDasharray="3 3" stroke="var(--color-bg-300)" vertical={false}
Axes:        fontSize: 11, fill: "var(--color-txt-300)", no tickLine, no axisLine
Animation:   isAnimationActive={false} (Recharts ignores prefers-reduced-motion)
Tooltip:     border-bg-300 bg-bg-100 rounded-lg border shadow-lg p-s-300
Gradients:   Linear gradient fills from 20% opacity to 0% opacity
ARIA:        role="img" aria-label={title} on container
```

### Tooltips (Chart)

```
Container: border-bg-300 bg-bg-100 p-s-300 rounded-lg border shadow-lg
Title:     text-tiny text-txt-300
Value:     text-small text-txt-100 font-medium
P&L:       text-tiny text-trade-buy (positive) | text-trade-sell (negative)
```

---

## 5. Layout Principles

### Spacing Scale

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `s-100` | 4px | `gap-s-100`, `p-s-100` | Tight spacing — between icon and label, between badge items |
| `s-200` | 8px | `gap-s-200`, `p-s-200` | Small spacing — between related elements, menu item padding |
| `s-300` | 12px | `gap-s-300`, `p-s-300` | Default internal padding, grid gaps |
| `m-400` | 16px | `gap-m-400`, `p-m-400` | Standard component padding, section gaps |
| `m-500` | 20px | `gap-m-500`, `p-m-500` | Comfortable padding for larger surfaces |
| `m-600` | 24px | `gap-m-600`, `p-m-600` | Section separations |
| `l-700` | 32px | `gap-l-700`, `p-l-700` | Major section breaks |
| `l-800` | 48px | `gap-l-800`, `p-l-800` | Page-level vertical rhythm |
| `l-900` | 64px | `gap-l-900`, `p-l-900` | Hero sections, major landmarks |

### Token Usage Rules

- **Always use design tokens** for spacing — never raw Tailwind values (`gap-4`, `p-2`, etc.)
- Pattern: `p-s-300 sm:p-m-400 lg:p-m-500` for responsive card padding
- Grids: `gap-s-200 sm:gap-s-300` for stat grids, `gap-m-400` between legend items

### Page Padding

```css
.page-padding {
  padding: clamp(var(--spacing-m-400), 3vw, var(--spacing-m-600));
}
```

Fluid padding that scales with viewport width. Use this on main content areas.

### Content Width

- Maximum page width: `max-w-screen-2xl` (1536px) — never use arbitrary `max-w-[1600px]`
- Always prefer Tailwind breakpoint-based max-widths over arbitrary values

### Grid Patterns

| Pattern | Usage |
|---------|-------|
| `grid grid-cols-2 sm:grid-cols-4` | Stat blocks in cards |
| `grid grid-cols-1 sm:grid-cols-2` | Two-column highlight cards |
| `flex flex-col sm:flex-row` | Responsive horizontal layouts |

### Visual Hierarchy

1. Card surfaces (`bg-200`) sit on page background (`bg-100`)
2. Recessed elements (`bg-100`) sit inside cards for depth
3. Borders use `bg-300` exclusively — never raw gray values
4. Whitespace > borders for separation. Use borders only at card and section boundaries.

---

## 6. Depth & Elevation

### Shadow Scale

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-small` | `0 1px 2px rgb(0 0 0 / 0.1)` | Subtle lift — tooltips, small popups |
| `shadow-medium` | `0 4px 6px rgb(0 0 0 / 0.1), 0 2px 4px rgb(0 0 0 / 0.06)` | Cards on hover |
| `shadow-large` | `0 10px 15px rgb(0 0 0 / 0.1), 0 4px 6px rgb(0 0 0 / 0.05)` | Dropdown menus, modals |
| `shadow-xl` | `20px 25px rgb(0 0 0 / 0.1), 0 10px 10px rgb(0 0 0 / 0.04)` | Elevated panels |
| `shadow-inner` | `inset 0 2px 4px 0 rgb(0 0 0 / 0.05)` | Recessed inputs |

### Elevation Layers

| Layer | z-index | Elements |
|-------|---------|----------|
| Base | 0 | Page content, cards |
| Overlay backdrop | 10 | Click-to-close invisible overlays |
| Dropdowns | 20 | Context menus, popovers |
| Modals | 30+ | Dialog overlays |

### Depth Strategy

The dark theme creates depth primarily through **color differentiation** (`bg-100` → `bg-200` → `bg-300`) rather than shadows. Shadows become more important in light mode where surface color differences are subtler.

- Cards at rest: no shadow (border provides edge definition)
- Cards on hover: `shadow-md` for interactive feedback
- Floating elements (menus, tooltips): `shadow-lg` for clear separation

---

## 7. Do's and Don'ts

### Colors

| Do | Don't |
|----|-------|
| Use `acc-100` (violet) only for primary CTAs, focus, key metrics | Paint every icon violet or gold |
| Use `txt-200` / `txt-300` for section icons | Halo every icon with `acc-100/10` |
| Reserve `acc-200` (gold) for heritage-weight moments | Use gold for borders, tooltips, every secondary button |
| Use `trade-buy` / `trade-sell` for P&L values | Use generic green/red — use the semantic tokens |
| Separate result colors (trade-*) from action colors (action-*) | Use `trade-buy` for a "buy" button |
| Use `bg-300` for borders | Use arbitrary gray values like `border-gray-700` |

### Spacing

| Do | Don't |
|----|-------|
| Use design tokens: `gap-s-300`, `p-m-400` | Use raw Tailwind: `gap-3`, `p-4` |
| Scale responsively: `p-s-300 sm:p-m-400` | Use a single fixed padding everywhere |
| Use `max-w-screen-2xl` for page width | Use arbitrary max widths: `max-w-[1600px]` |

### Typography

| Do | Don't |
|----|-------|
| Use `font-mono` for numerical data | Display prices in the sans-serif font |
| Reserve `font-bold` for key metrics | Bold every label and heading |
| Use `text-tiny` for captions and metadata | Use `text-micro` as default small text |

### Components

| Do | Don't |
|----|-------|
| Add `role="progressbar"` with full ARIA to progress bars | Skip accessibility attributes |
| Add `role="menu"` + keyboard nav to dropdown menus | Use `<div>` menus without ARIA |
| Set `isAnimationActive={false}` on all Recharts components | Rely on Recharts respecting `prefers-reduced-motion` |
| Use `aria-invalid="true"` (string) or `undefined` | Pass truthy JS values to `aria-invalid` |
| Export at end of file: `export { Component }` | Use `export default` or inline exports |

### Architecture

| Do | Don't |
|----|-------|
| Return `{ status: "success" | "error" }` from server actions | Return `{ success: boolean }` |
| Keep client components minimal (pure rendering) | Do data fetching/transformation in client components |
| Use `useCallback` for handler functions passed as props | Create new function references every render |
| Use `useMemo` for computed values in JSX | Call `.find()` or `.filter()` inline in JSX |
| Remove dead code entirely | Comment out unused code or keep unused imports |

### Accent Audit Checklist

When reviewing a page, count visible accent elements at once:

**Violet (`acc-100`):**
- 0-3: Good — primary CTA, focus state, key metric
- 4-6: Audit — likely some demotable to `txt-200`
- 7+: **Audit required** — demote decorative uses

**Gold (`acc-200`):**
- 0-1: Good — heritage moment present or absent
- 2: Audit — second occurrence must justify itself
- 3+: **Audit required** — gold is bleeding into chrome

---

## 8. Responsive Behavior

### Breakpoints

| Token | Width | Tailwind prefix | Usage |
|-------|-------|----------------|-------|
| `xs` | 480px | `xs:` | Small phones → slightly larger phones |
| `sm` | 640px | `sm:` | Phones → tablets. Most responsive changes start here. |
| `md` | 768px | `md:` | Tablets → small laptops |
| `lg` | 1024px | `lg:` | Laptops → desktops. Full layout typically available. |
| `xl` | 1280px | `xl:` | Large desktops |
| `2xl` | 1536px | `2xl:` | Ultra-wide monitors. Max content width. |

### Responsive Patterns

**Card padding escalation:**
```
p-s-300 sm:p-m-400 lg:p-m-500
```

**Grid column expansion:**
```
grid-cols-2 sm:grid-cols-4          (stat blocks)
grid-cols-1 sm:grid-cols-2          (highlight cards)
flex-col sm:flex-row                (stacked → horizontal)
```

**Chart height scaling:**
```
h-[250px] sm:h-[300px] lg:h-[350px]
```

**Typography response:** Handled automatically by `clamp()` — no breakpoint classes needed for headings.

### Mobile Considerations

- Horizontal scrollable areas use `.scrollbar-none` to hide scrollbar while preserving scroll functionality
- Dropdown menus use `max-w-[calc(100vw-2rem)]` to prevent overflow
- X-axis in charts switches from trade numbers to dates in comparison mode to fit narrow viewports
- Touch targets: minimum 44x44px for interactive elements (buttons use `h-8 w-8` minimum, which is 32px — acceptable for secondary actions with adequate spacing)

---

## 9. Agent Prompt Guide

### For AI Agents Building Axion Features

When generating UI code for Axion, follow these rules:

**Setup:**
1. Read `globals.css` for all available design tokens
2. Read `.impeccable.md` for brand context and design philosophy
3. Read this file (`DESIGN.md`) for technical specifications

**Color selection:**
- Page backgrounds: `bg-bg-100`
- Card surfaces: `bg-bg-200`
- Borders/dividers: `border-bg-300` or `bg-bg-300`
- Primary text: `text-txt-100`
- Secondary text: `text-txt-200`
- Captions/hints: `text-txt-300`
- Primary accent — violet (use sparingly): `text-acc-100` or `bg-acc-100`
- Heritage accent — gold (rare): `text-acc-200` or `bg-acc-200`
- Positive values: `text-trade-buy`
- Negative values: `text-trade-sell`
- Buy/sell actions: `text-action-buy` / `text-action-sell`

**Spacing — always use tokens:**
```
gap-s-100  gap-s-200  gap-s-300
gap-m-400  gap-m-500  gap-m-600
gap-l-700  gap-l-800  gap-l-900
```
Same prefix pattern for `p-`, `m-`, `mt-`, `mb-`, `px-`, `py-`, etc.

**Never use:** `gap-1`, `gap-2`, `p-4`, `mt-3`, `mb-6` or any raw Tailwind spacing.

**Typography:**
```
text-h1    → page titles
text-h2    → section headings
text-h3    → card titles
text-body  → default text
text-small → labels, secondary info
text-tiny  → captions, tooltips
text-micro → badges (rare)
```

**Component template — Card with stats:**
```tsx
<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
  <h3 className="text-small text-txt-100 font-semibold">{title}</h3>
  <div className="mt-s-300 gap-s-200 grid grid-cols-2 sm:grid-cols-4">
    <div className="bg-bg-100 p-s-300 rounded-lg text-center">
      <p className="text-tiny text-txt-300">{label}</p>
      <p className="text-body text-txt-100 mt-s-100 font-bold">{value}</p>
    </div>
  </div>
</div>
```

**Accessibility checklist:**
- [ ] Interactive elements have `aria-label` when text isn't visible
- [ ] Dropdown menus use `role="menu"` / `role="menuitem"` with keyboard navigation
- [ ] Progress bars use `role="progressbar"` with `aria-valuenow/min/max`
- [ ] Charts use `role="img"` with `aria-label={title}` on container
- [ ] Recharts components have `isAnimationActive={false}`
- [ ] Form inputs use `aria-invalid="true"` (string) or `undefined`, never truthy JS values
- [ ] All animations respect `prefers-reduced-motion`

**Code patterns:**
- Arrow functions only: `const Component = () => { ... }`
- Export at end: `export { Component }`
- No default exports
- `import type` for type-only imports
- Server actions return `{ status: "success" | "error", data?, message? }`
- Handlers use `useCallback`, computed values use `useMemo`
- No `any` types except for third-party library gaps

**Before submitting:**
1. Count violet (`acc-100`) elements — max 3-6 visible at once; demote decorative uses
2. Count gold (`acc-200`) elements — max 1-2 visible at once; gold is heritage, not chrome
3. Verify no emoji glyphs used as UI affordance (no 😍😊😐😞😢, no ✨ "AI" sparkles)
4. Verify all spacing uses design tokens, not raw values
5. Check ARIA attributes on interactive elements
6. Ensure `isAnimationActive={false}` on every Recharts component
7. Confirm exports are at end of file, no default exports
