# Axion — Design System

## Audience & Voice

Axion serves two primary cohorts with a shared job-to-be-done:

- **Solo day traders (~60%)** — journal trades, review performance metrics, build discipline independently.
- **Mentorship students (~40%)** — track progress against specific strategies and frameworks (e.g. TAT mentorship).

**Shared JTBD**: transform raw trade data into actionable self-awareness — understanding _why_ something happened, and _what to do differently tomorrow_.

**Context of use** — agents must keep all three in mind:

- **Before market open**: prepare (review playbooks, check command center).
- **During trading**: log executions with zero friction.
- **After market close**: journal, reflect, analyze.

The tool must serve all three modes — slow/contemplative _and_ fast/in-the-moment — without compromise.

**Brand personality**: Precise. Confident. Elite.

- **Precise**: every pixel, data point, interaction is intentional. No decoration for decoration's sake.
- **Confident**: clear hierarchy, decisive typography, no hand-holding via excessive tooltips or hedging copy.
- **Elite**: professional-grade cockpit feel. Gold accents signal premium craftsmanship, not flashiness. Built for the top 1% of disciplined traders.

**Emotional target**: opening Axion before market open should feel like sitting in a cockpit before takeoff — **readiness/control** ("I have everything I need") plus **competitive edge** ("I'm sharper than yesterday"). Not a meditation app. Not a video game.

---

## Brand Identity & Visual Tone

**Product:** Axion — premium trading journal for Brazilian/international traders.
**Company:** Bravo (parent). **Tagline:** "Your trading source of truth"
**Name origin:** "axiom" (fundamental truth) + axion (physics particle). "Ax" is central to brand identity.

**Personality:** Scientific, precise, truth-seeking | Premium, quiet confidence | Minimalist, geometric, modern | Cold/sharp (contrasts Bravo's warm gold). Think: Bloomberg terminal meets luxury Swiss watch.

**NOT:** aggressive/military | playful/startup-bubbly | crypto/Web3 | generic SaaS rounded-corners

### Color Palette

All assets: ONLY these colors. No gradients unless specified. Live tokens in `src/app/globals.css` under `[data-brand="axion"]` (dark) and `[data-brand="axion"][data-theme="light"]`; see `docs/theming.md`.

| Role                    | Color         | Hex     | Usage                                                    |
| ----------------------- | ------------- | ------- | -------------------------------------------------------- |
| Violet Plasma (primary) | Deep violet   | #8B5CF6 | Primary mark, interactive elements                       |
| Violet Deep             | Darker violet | #7C3AED | Hover states, depth                                      |
| Violet Glow             | Light violet  | #A78BFA | Highlights, glows, accents                               |
| Bravo Gold (heritage)   | Metallic gold | #D4AF37 | Secondary accent, "by Bravo" elements                    |
| Background Dark         | Near-black    | #0C0E0F | Primary dark bg (`--color-bg-100`)                       |
| Surface Dark            | Dark slate    | #171A1D | Card/surface bg (`--color-bg-200`)                       |
| Border Dark             | Navy edge     | #252A33 | Subtle borders                                           |
| Text Primary            | Crisp white   | #EFF1F4 | Primary text on dark (`--color-txt-100`)                 |
| Text Muted              | Silver gray   | #A5AFBE | Secondary text (`--color-txt-200`); #7A8592 for tertiary |
| Pure White              | White         | #FFFFFF | Wordmark on dark                                         |
| Pure Black              | Black         | #000000 | Wordmark on light                                        |

### Light Mode

| Role         | Hex     | Token             |
| ------------ | ------- | ----------------- |
| Background   | #F5F4F2 | `--color-bg-100`  |
| Surface      | #E6E3DD | `--color-bg-200`  |
| Border       | #CFCBC4 | `--color-bg-300`  |
| Text Primary | #1A1818 | `--color-txt-100` |
| Text Muted   | #4A4744 | `--color-txt-200` |
| Violet       | #7C3AED | `--color-acc-100` |
| Gold         | #B8941F | `--color-acc-200` |

### Logo Mark — "The Ax"

Mark built around "Ax" (first two letters). NOT standalone "X" (conflicts with Twitter/X).

**Primary:** A+X ligature — A and X share common stroke; right leg of A = left leg of X. Typographic monogram, geometric precision. Not an illustration — an engineered letterform.

**Alternates:** (1) Abstract axe head — minimal geometric blade, no handle, tilted parallelogram with sharp vertex. (2) Minimal axe silhouette — ultra-simplified side profile, one continuous outline. (3) Angular A with strike — A with crossbar extending like axe blade. (4) AX negative space — blade formed by negative space between two forms.

**Requirements:** Flat vector, single color, no gradients/shadows/3D | Geometric/angular, no curves | Legible at 16×16px | Premium at 512×512px | Swiss design influence | Must NOT resemble Twitter/X

**Variations:** Violet (#8B5CF6) | White | Black | Mark on near-black (#08090A) square (app icon)
**Sizes:** SVG, 512/192/64/32/16px PNG

### Typography & Wordmark

**Font:** Clean geometric sans-serif (Inter/Public Sans/DM Sans/Eurostile) | Medium–semi-bold | Tracking 0.15–0.2em | All uppercase: A X I O N | No serifs, no rounded terminals.

**AX integration:** If A+X ligature: first two letters ARE the mark, flowing into "ION". If abstract mark: standalone mark left, wordmark spells "AXION" full.

**Variations needed:** White on transparent (PRIMARY) | Black on transparent | Violet (#8B5CF6) | Gold (#D4AF37)

### Full Lockup

Horizontal: mark left, wordmark right, vertically centered. Clear space between = width of "I" in AXION.

**Variations:** Violet mark + white wordmark on transparent (PRIMARY dark) | Violet + black (PRIMARY light) | All white | All black

**Sizes:** Collapsed sidebar: mark only (32×32) | Expanded sidebar: ~140×40 | Hero: ~300×80

### App Icon / Favicon

Near-black (#08090A) rounded-square bg | Violet mark centered (~55–60% of icon area) | Optional: very subtle violet glow (max 8% opacity).

**Variations:** Square rounded — 1024/512/192px | Circle 256px | Favicon 32px (transparent, white mark) | Favicon 16px | PWA 192/512px

### "Powered by Bravo" Badge

Footer badge. **Options:** (A) "by" muted gray + "BRAVO" gold spaced uppercase | (B) Small 4-point diamond star gold + "BRAVO" gold.

**Variations:** Gold on transparent (dark bgs) | Dark gray on transparent (light bgs) | 50% opacity muted variant

### Social / OG Image

1200×630px | Near-black (#08090A) bg | Subtle dot grid at max 5% opacity | Center: full lockup (~40% width) | Below: tagline in muted gray (#8C96A5) | Bottom-right: "by Bravo" badge gold | Generous negative space.

### Brand Pattern (Optional, Low Priority)

Thin intersecting lines referencing chart grids + Ax geometry, OR dot grid. White at 3–5% opacity on transparent. Seamless tile, ~40–60px grid spacing, 1px line weight.

**Deliver:** 200×200px tile | Tiled preview on dark 1200×800 | Tiled preview on light

### Style Rules

**DO:** Geometric/angular | Flat colors | Generous negative space | Precise/intentional | Engineered look (Dieter Rams, Swiss, Scandinavian)

**DON'T:** 3D/shadows/bevels | Rounded shapes | Literal trading imagery | Gradients in mark/wordmark | >2 colors per asset | Twitter/X resemblance | Cursive/script typefaces

### Bravo Relationship

**Bravo brand:** Geometric gold lion mark | Gold (#D4AF37) primary | Navy slate bgs | Uppercase "B R A V O" wordmark in gold.

**Shared:** Same construction language (geometric, angular, precision) | Wide uppercase wordmarks | Premium tier, negative space | Gold appears as heritage accent (never primary) in Axion.

**Differs:** Bravo = warm (gold); Axion = cold (violet) | Bravo = illustrative mark; Axion = typographic/abstract | Bravo = authoritative; Axion = scientific/precise.

---

## Design Principles

These are non-negotiable constraints on every UI decision.

1. **Signal over noise** — every element must earn its place. Prefer whitespace and hierarchy over borders and dividers. Data density is welcome; visual clutter is not.

2. **Confidence through clarity** — decisive typography, strong contrast, clear hierarchy. **Bold is reserved for major emphasis only.** Let the data speak.

3. **Gold is earned, not spent** — `acc-100` is the brand signature. Use sparingly for primary actions, key metrics, moments of significance. When everything is gold, nothing is.

4. **Motion serves function** — animations orient (page transitions, state changes), they don't entertain. Every animation has a purpose: confirm, reveal hierarchy, smooth a transition. Respect `prefers-reduced-motion`. No gratuitous movement.

5. **Professional-grade resilience** — must work under pressure: live market hours, varying screen sizes, large datasets. Graceful loading, robust error handling, WCAG AA defaults are non-negotiable.

### Aesthetic Direction

**Tone**: minimal, fast, keyboard-driven elegance with polished data visualization. Dark-first; metallic gold is the signature accent.

**References we aspire to**:

- **Linear / Raycast** — elegance through restraint, keyboard-first, fast transitions, clean surfaces.
- **Stripe Dashboard** — best-in-class data viz hierarchy, warm polish that never feels sterile.

**Anti-references — what Axion must NOT be**:

- **Robinhood / gamified apps** — no confetti, no achievement badges, no dopamine loops. Trading is serious work; celebrate consistency, not individual wins.
- **Generic SaaS dashboards** — no cookie-cutter blue/gray admin panels. The navy + gold palette exists for a reason.

**Theme**: dark mode is default and primary. Light mode is supported but secondary. Both use the established system with gold (`acc-100`), blue (`acc-200`), and semantic trading colors (green profit / violet-blue loss for results; sky blue / orange for directional actions).

**Typography**: Public Sans for body (clean, professional, excellent number legibility), Geist Mono for numerical data. Fluid clamp-based sizing scales gracefully from mobile to desktop. All values in `src/app/globals.css`.

### Accessibility Requirements

- **WCAG AA baseline** for contrast, keyboard navigation, screen reader support.
- **`prefers-reduced-motion`** — every animation must respect it. Focus-heavy trading work means motion is a distraction, not a delight.
- Semantic HTML, proper ARIA labels, focus management across all interactive components.
- See `docs/gotchas.md` → "Accessibility" for known footguns (hover-only controls, banned raw primitives).

### Style Essentials

- **Colors**: use only the custom palette in `src/app/globals.css`. If a needed color doesn't exist, add it there — never inline a hex.
- **Icons**: `lucide-react` only, colored with custom theme tokens.
- **Tailwind tokens**: v4 only. No arbitrary values (`text-[28px]`, `rounded-[12px]`). See `docs/gotchas.md` for the catalog.

---

## Token Vocabulary

For the complete token reference (specific hex values, clamp formulas, spacing scales), see **`docs/theming.md`** and `src/app/globals.css`. This section names the high-level categories:

### Backgrounds — `--color-bg-*`

- `bg-100` — Primary canvas
- `bg-200` — Cards / surfaces
- `bg-300` — Borders / muted surfaces
- `bg-400` — Extra elevation (default palette only)
- `bg-stripe` — Zebra-stripe rows in tables

### Text — `--color-txt-*`

- `txt-100` — Primary text
- `txt-200` — Secondary / metadata
- `txt-300` — Tertiary / muted labels
- `txt-placeholder` — Form placeholders

### Accents — `--color-acc-*`

- `acc-100` — Primary brand accent — primary buttons, focus rings (violet in Axion)
- `acc-200` — Secondary accent — links, secondary actions (gold in Axion)

### Feedback — `--color-fb-*`

- `fb-error` — Errors, destructive actions, invalid states
- `fb-success` — Success states, confirmed operations

### Trading Semantic

- `trade-buy` — P&L positive, profit result
- `trade-sell` — P&L negative, loss result
- `action-buy` / `long` — Long entry / buy direction
- `action-sell` / `short` — Short entry / sell direction
- `warning` — High-risk / mistake-tag alerts
- `*-muted` — Soft-fill alpha variants

**Rule**: P&L colors (profit/loss) are perceptual results. Action colors (long/short) are directional. Keep them decoupled — a long position can be in profit or loss without conflating "buy" with "green".

---

## Canonical Patterns

### Gauge Verdict Palette

Target-vs-actual gauges apply a 4-zone palette based on the magnitude of `(actual / target)`:

- `negative (< 0)` → `text-fb-error` / `bg-fb-error/10`
- `behind (≥ 0, < 50% of target)` → `text-txt-100` / `bg-bg-300`
- `onTrack (≥ 50%, < 100% of target)` → `text-warning` / `bg-warning/10`
- `ahead (≥ 100%)` → `text-fb-success` / `bg-fb-success/10`

Canonical implementation: `src/components/fractal-plan/target-actual-gauge.tsx`.

**Anti-pattern to avoid**: reaching for `acc-100` (brand violet) for "on track" — violet is the brand accent, not a verdict color.

### Rating Verdict Palette (5-Point Scales)

Letter-grade and 5-point rating UIs map to the verdict triad with two intensity stops:

- `A` → `text-fb-success`
- `B` → `text-fb-success/70`
- `C` → `text-warning`
- `D` → `text-fb-error/70`
- `F` → `text-fb-error`

Canonical implementation: `src/components/journal/scaled-trade-form.tsx` `GRADE_COLORS`.

**Anti-pattern to avoid**: painting A=green via `text-trade-buy` and F=red via `text-trade-sell`. Trade colors are reserved for signed P&L magnitude — rating grades are verdict, not money.

### Tab-Active Treatment

Active tab indicator across the app: `border-acc-100 text-acc-100` (border-bottom on the active tab + matching text color). Inactive tabs render at `text-txt-300` and pick up `text-txt-100` on hover.

Canonical implementations: `src/components/journal/new-trade-tabs.tsx`, AnimatedTabs primitive, journal tabs.

**Why violet, not verdict-green**: only one tab is active at a time — the pattern signals selection, not approval. Mirrors Linear/Raycast active-tab convention. Reaching for `fb-success` ("active = good") is incorrect.

### Operation-Outcome Verdict Mapping

Async-action result banners (export complete, recompute month done, bulk import finished, etc.) use the verdict triad:

- Success → `text-fb-success` + `CheckCircle` icon
- Error/failure → `text-fb-error` + `XCircle` icon
- Partial/warning → `text-warning` + `AlertCircle` icon

Canonical implementations: `src/components/settings/recalculate-button.tsx`, `src/components/settings/recalculate-pnl-button.tsx`.

**Anti-pattern to avoid**: signalling "operation succeeded" via `text-trade-buy` and "operation failed" via `text-trade-sell`. Trade colors are reserved for signed monetary magnitude.

### Auth Surface as Canonical Verdict-Triad Example

The auth surface is the reference implementation for verdict-triad discipline: zero `trade-buy`/`trade-sell` hijacks, every status state resolves through `fb-success` (confirmed/verified), `fb-error` (invalid input), or unused warning slot. When in doubt about how to color a status indicator, read these files first:

- `src/components/auth/login-form.tsx`
- `src/components/auth/register-form.tsx`
- `src/components/auth/verify-email-form.tsx`
- `src/components/auth/forgot-password-form.tsx`

### Status Colors vs. Magnitude Colors

Any status indicator whose semantic domain is **not signed monetary magnitude** reaches for the verdict triad (`fb-success` / `fb-error` / `warning` / `txt-300`). `trade-buy` / `trade-sell` are reserved for the signed magnitude itself.

Common hijack patterns to catch in review:

- **Verdict-as-P&L** — letter grades, pass/fail outcomes painted with trade colors. (Waves 1-5.)
- **Category-as-P&L** — rank, position, or tier in a sorted list painted with trade colors. (Wave 6.)
- **Temporal-state-as-P&L** — market session open, broker-connection up, data-feed healthy painted with `trade-buy` green. (Wave 8.)

Future variants — session timers, broker-connection state, data-feed health, recovery-mode indicators — all face the same temptation. Default to verdict; reach for trade colors only when the value being rendered IS the signed P&L.

### No Side-Stripe Borders

Side-stripe borders (a 2-4px colored vertical bar on the left/right edge of a card) are an **absolute ban**. They were caught in Wave 4 (plan cards) and again in Wave 8 (`hero-quote-card.tsx`).

**Why the pattern keeps recurring**: it borrows visual vocabulary from Linear/Raycast. But those products use side stripes for **selection state** ("this row is selected"), not for **directional/sentiment cues** ("this metric went up").

**What to do instead**: if the value needs a directional cue, color the value itself (e.g. `changePercent` rendered in `trade-buy` for positive). The colored text already conveys direction — the stripe is redundant chrome.

Anti-example: `src/components/public/hero-quote-card.tsx` before its Wave 8 fix had a side-stripe in `trade-buy`/`trade-sell` echoing the already-colored `changePercent` value. The stripe added zero information.
