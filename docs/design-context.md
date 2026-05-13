# Design Context

Agent-facing summary of who Axion serves, what it must feel like, and the non-negotiable design principles. For visual identity / brand-level detail, see **[`docs/axion-design-brief.md`](axion-design-brief.md)**. For token values (colors, spacing, typography), see **[`docs/theming.md`](theming.md)** and `src/app/globals.css`.

---

## Users

Axion serves two primary cohorts with a shared job-to-be-done:

- **Solo day traders (~60%)** — journal trades, review performance metrics, build discipline independently.
- **Mentorship students (~40%)** — track progress against specific strategies and frameworks (e.g. TAT mentorship).

**Shared JTBD**: transform raw trade data into actionable self-awareness — understanding _why_ something happened, and _what to do differently tomorrow_.

**Context of use** — agents must keep all three in mind:

- **Before market open**: prepare (review playbooks, check command center).
- **During trading**: log executions with zero friction.
- **After market close**: journal, reflect, analyze.

The tool must serve all three modes — slow/contemplative _and_ fast/in-the-moment — without compromise.

---

## Brand personality

**Precise. Confident. Elite.**

- **Precise**: every pixel, data point, interaction is intentional. No decoration for decoration's sake.
- **Confident**: clear hierarchy, decisive typography, no hand-holding via excessive tooltips or hedging copy.
- **Elite**: professional-grade cockpit feel. Gold accents signal premium craftsmanship, not flashiness. Built for the top 1% of disciplined traders.

**Emotional target**: opening Axion before market open should feel like sitting in a cockpit before takeoff — **readiness/control** ("I have everything I need") plus **competitive edge** ("I'm sharper than yesterday"). Not a meditation app. Not a video game.

---

## Aesthetic direction

**Tone**: minimal, fast, keyboard-driven elegance with polished data visualization. Dark-first; metallic gold is the signature accent.

**References we aspire to**:

- **Linear / Raycast** — elegance through restraint, keyboard-first, fast transitions, clean surfaces.
- **Stripe Dashboard** — best-in-class data viz hierarchy, warm polish that never feels sterile.

**Anti-references — what Axion must NOT be**:

- **Robinhood / gamified apps** — no confetti, no achievement badges, no dopamine loops. Trading is serious work; celebrate consistency, not individual wins.
- **Generic SaaS dashboards** — no cookie-cutter blue/gray admin panels. The navy + gold palette exists for a reason.

**Theme**: dark mode is default and primary. Light mode is supported but secondary. Both use the established system with gold (`acc-100`), blue (`acc-200`), and semantic trading colors (green profit / violet-blue loss for results; sky blue / orange for directional actions).

**Typography**: Public Sans for body (clean, professional, excellent number legibility), Geist Mono for numerical data. Fluid clamp-based sizing scales gracefully from mobile to desktop. All values in `src/app/globals.css`.

---

## Design principles (non-negotiable)

1. **Signal over noise** — every element must earn its place. Prefer whitespace and hierarchy over borders and dividers. Data density is welcome; visual clutter is not.

2. **Confidence through clarity** — decisive typography, strong contrast, clear hierarchy. **Bold is reserved for major emphasis only.** Let the data speak.

3. **Gold is earned, not spent** — `acc-100` is the brand signature. Use sparingly for primary actions, key metrics, moments of significance. When everything is gold, nothing is.

4. **Motion serves function** — animations orient (page transitions, state changes), they don't entertain. Every animation has a purpose: confirm, reveal hierarchy, smooth a transition. Respect `prefers-reduced-motion`. No gratuitous movement.

5. **Professional-grade resilience** — must work under pressure: live market hours, varying screen sizes, large datasets. Graceful loading, robust error handling, WCAG AA defaults are non-negotiable.

---

## Style essentials

- **Colors**: use only the custom palette in `src/app/globals.css`. If a needed color doesn't exist, add it there — never inline a hex.
- **Icons**: `lucide-react` only, colored with custom theme tokens.
- **Tailwind tokens**: v4 only. No arbitrary values (`text-[28px]`, `rounded-[12px]`). See `docs/gotchas.md` for the catalog.

---

## Accessibility requirements

- **WCAG AA baseline** for contrast, keyboard navigation, screen reader support.
- **`prefers-reduced-motion`** — every animation must respect it. Focus-heavy trading work means motion is a distraction, not a delight.
- Semantic HTML, proper ARIA labels, focus management across all interactive components.
- See `docs/gotchas.md` → "Accessibility" for known footguns (hover-only controls, banned raw primitives).
