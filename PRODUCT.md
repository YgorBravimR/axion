# Product

> **This file provides strategic context: who Axion is for, what it is, and the principles that guide every design decision.**
> For technical implementation specs (tokens, component styles, spacing, responsive behavior), see [`DESIGN.md`](./DESIGN.md).

## Register

product

## Users

Axion serves primarily **solo day traders** (~60%) who journal trades, review performance metrics, and build discipline independently. A significant secondary audience (~40%) consists of **trading mentorship students** (e.g., TAT mentorship program) who use Axion to track progress against the specific strategies and frameworks taught in their program.

Both share a common job-to-be-done: **transform raw trade data into actionable self-awareness** — understanding not just what happened, but why, and what to do differently tomorrow.

The user's context spans three modes, and the tool must serve all three without friction:

- **Pre-market**: reviewing playbooks, checking the command center, setting intent for the session
- **Live**: logging executions and observations as trades fire
- **Post-market**: journaling, analyzing results, identifying patterns, tagging behavior

These are not casual users. They sit in front of multiple monitors with capital on the line, and they came to trading to do hard work, not to be entertained.

## Product Purpose

Axion is a **trading journal and trader's command center** — the workspace where serious day traders prepare, execute, and review.

Success is measured in changed behavior: a trader closes their week, opens Axion, and sees with clarity what their patterns actually were — not what they remember. The tool's job is to make those patterns undeniable, so the trader can make tomorrow's decisions from data rather than feeling.

Axion is explicitly **not** a signal service, not an "AI picks your trades" wrapper, not a copy-trading platform, and not a community/social product. It does not tell users what to buy. It sharpens their ability to judge their own work.

## Brand Personality

**Precise. Confident. Elite.**

- **Precise** — Every pixel, every data point, every interaction is intentional. No waste. No decoration for decoration's sake.
- **Confident** — The interface speaks with authority. Clear hierarchy, decisive typography, no hedging with hand-holding tooltips or "are you sure?" friction at every step.
- **Elite** — A professional-grade cockpit feel. Built for the top 1% of disciplined traders. Restraint over flash. The premium signal is craftsmanship, not ornamentation.

**Voice**: spare, declarative, technical when accuracy demands it. Never cheerful filler. Never aspirational marketing-speak inside the app.

**Emotional target**: when a trader opens Axion before the open, they should feel a blend of **readiness/control** ("I have everything I need, I'm prepared") and **competitive edge** ("I'm sharper than yesterday, let's go"). A cockpit before takeoff — not a meditation app, not a video game, not an AI assistant offering to do the work for them.

**Aesthetic lane** (high-level direction; specifics live in DESIGN.md): dark-first, keyboard-driven, restrained-luxury. Linear/Raycast for chrome discipline, Stripe for data clarity. **The chrome is cool-neutral; the accent is warm bronze.** That temperature contrast is the whole identity — bronze (`acc-100` = `#C29D6A`) reads as a _signal_ because it sits on top of a deliberately cool, hue-restrained `bg`/`txt` stack, never as a default surface tint. Slate steel (`acc-200` = `#7A8B96`) is the quiet secondary for non-compelling controls.

## Anti-references

What Axion must NOT be:

- **Robinhood / gamified trading apps** — No confetti, no achievement badges, no streak counters, no emoji mood pickers, no dopamine-loop patterns. Trading is serious work. The app celebrates discipline and consistency, never individual wins. A green day is not a party.

- **Generic SaaS dashboards** — No cookie-cutter admin panels with corporate blue/gray blandness. No untouched Shadcn defaults. No "modern dashboard" template energy. Axion has an identity; surfaces that feel interchangeable with any other B2B tool have failed.

- **Generic AI-startup wrappers** — No sparkle (✨) icons on every "AI" feature, no "AI-powered, coming soon" placeholder cards, no Sparkles iconography painted across surfaces. If a feature is AI-driven, the work should speak for itself. No copilot panels, no chat-as-UI by reflex.

- **The saturated AI-tool color palette** — The current ChatGPT / Claude / Cursor / generic-LLM-wrapper aesthetic anchors on violet, purple, lavender, and indigo as primary. **Violet/purple as a primary brand color is forbidden** — it cues "vibe-coded AI app" the moment a trader lands. Axion's primary accent must read as disciplined, instrumental, and earned, not as a category cue for AI tooling.

- **The cobalt-fintech reflex** — Saturated cobalt / royal blue / navy as the primary accent is the second-order trap for "serious finance product." It reads as Bloomberg-template, every-bank-app, every-broker-dashboard. Axion is **not** that. The locked accent is warm bronze (`#C29D6A`) precisely because cobalt is the obvious move and obvious moves erase identity.

- **Warm chrome / single-temperature surfaces** — The bronze accent only works because the chrome around it is cool-neutral. Tinting `bg-100`/`bg-200`/`bg-300` warm (toward bronze, toward sepia, toward "cozy") collapses the temperature contrast that makes bronze _signal_. If every surface is warm, bronze becomes decoration. Chrome stays cool; bronze stays earned.

- **"AI answers everything" products** — Axion does not promise easy. The product is built for hard workers and real profit seekers, not for users hoping a tool will hand them outcomes. Copy, affordances, and visual hierarchy never imply shortcuts, automation of judgment, or "we'll figure it out for you." The trader does the work; Axion makes the work visible.

## Design Principles

1. **Signal over noise** — Every element must earn its place. If it doesn't help the trader make a better decision, remove it. Whitespace and hierarchy beat borders and dividers. Data density is welcome; visual clutter is not.

2. **Confidence through clarity** — Decisive typography, strong contrast, clear visual hierarchy. The trader never hunts for information. Bold is reserved for major emphasis only; if everything is bold, nothing is. Let the data speak.

3. **Earned, not given** — Axion is a tool for people who came to work. UX never implies shortcuts the product doesn't provide. No "magic" framing, no "let AI handle this" affordances, no gamified rewards for showing up. Insights are surfaced because the trader logged the data; nothing is conjured for them. The interface respects that the user is here to do something hard.

4. **Accents are signals, not chrome** — Brand accents (`acc-100` bronze primary, `acc-200` slate-steel secondary) are deployed sparingly, for moments of real significance: the single primary action on a view, a hero metric, a focus state, the chart's lead series. If every card has a glowing accent halo, the signal is dead. Bronze in particular is the cockpit's _one_ warm note against a cool-neutral chrome — its presence must always be justifiable, and it must never bleed into background tints, dividers, or default text. Earned, not given.

5. **Motion serves function** — Animations orient the user (page transitions, state changes), they don't entertain. Every motion has a purpose: confirm an action, reveal hierarchy, smooth a transition. No gratuitous movement. `prefers-reduced-motion` is always respected — focus-heavy trading work treats stray motion as a distraction, not a delight.

6. **Professional-grade resilience** — The interface must work under pressure: during live market hours, on varying screen sizes, with large datasets, on slow networks, in error states. Graceful loading, robust error handling, and accessible defaults are non-negotiable, not nice-to-haves.

## Accessibility & Inclusion

- **WCAG AA compliance** as the baseline for all contrast ratios, keyboard navigation, and screen reader support. AAA where it doesn't cost the aesthetic.
- **Reduced motion**: every animation honors `prefers-reduced-motion`. Critical for focus-heavy trading work where unnecessary motion competes for cognitive load.
- **Keyboard-first**: every primary action reachable without a mouse. Trading sessions are keyboard-heavy; Axion should not force a context switch to the pointer for routine actions.
- **Semantic HTML, proper ARIA, focus management** on all interactive components. Custom components (menus, dialogs, charts) carry the same a11y weight as native controls.
- **Color-blind safety**: never rely on color alone to convey result (P&L, win/loss, status). Always pair color with iconography, position, or numeric sign.
