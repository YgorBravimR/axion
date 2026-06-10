# Ideas — Pre-Commit Thinking Space

This file is for half-formed ideas, strategic seeds, and "we should think about X" notes that aren't yet commit-ready. Cheap to file, cheap to delete. The commit-ready slice lives in [`docs/backlog.md`](backlog.md).

## When something lives here vs. in the backlog

| Lives here (ideas)                                              | Lives in backlog                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| Missing a clear shape ("we should personalize each mode")       | Has a concrete shape ("add `trade_conditions` junction table") |
| Missing a rough effort estimate                                 | Has at least an XS / S / M / L / XL guess                      |
| Needs a product / design conversation first                     | Needs only a code change                                       |
| Could plausibly be deferred forever without anyone losing sleep | Has a clear next-shipping window or strategic ROI              |

## Promotion rule

When an idea earns its **What + Why + Effort + Priority + Source**, promote it to `backlog.md` and **delete it from this file in the same PR**. Don't double-list — the backlog is the single source of truth for committed work.

## Demotion is okay

If a backlog item turns out to be more speculative than it looked, demote it back here. The cost is one paste; the savings is a backlog that reads like a real shortlist.

---

## Onboarding integration with the zero-to-hero demo

- **Status**: needs product decisioning before it has a concrete shape.
- **Idea**: Use the demo-mode video (output of `e2e/journey/`) as the new-user walkthrough; embed the stage gallery in `docs/zero-to-hero.md`; nightly-publish the demo artifact to S3 / internal docs site so it's always fresh. The technical building blocks (chained journey suite, per-stage screenshots, video stitching) are already shipping; what's missing is the product framing — "is this the onboarding tour, or a separate sales asset?", "does it run in-app behind a `?demo=1` flag, or on the marketing site only?", "how does it interact with the empty-state guidance we already render?"
- **Why this is an idea, not a backlog item**: today there's no concrete UI surface to add to. The work is gated on a product call about where and how the demo gets surfaced.
- **Promotion path**: once product chooses a surface (in-app onboarding tour vs. external marketing asset vs. both), this fragments into 2-3 concrete backlog entries (artifact publishing pipeline, in-app embed, docs gallery integration).
- **Source**: `docs/design/zero-to-hero-e2e.md` §13 Phase 5; moved from backlog 2026-05-15 because it lacked a concrete shape.

## Assistant reviewer

- **Status**: Needs product development and engeneering thinking
- **Idea**: Implement more assisted reviews, maybe AI looking at numbers, comparing with benchmarks, preview of future, giving insights
- **Source**: Ygor

## Mentor role

- **Status**: Needs product development and engeneering thinking
- **Idea**: Specific user role with specific information about a group of other accounts, new pages, new tables, where user can monitor it's pupils.
- **Source**: Ygor

## Ladder assistant — guided ladder configuration for `/plan/[year]`

- **Status**: Raw brainstorm. Needs product + design thinking before becoming a backlog item.
- **Idea**: When a user creates or edits the capital ladder in `Plano Anual`, today they fill 5 hand-picked `(from_brl, oneR_brl)` pairs from feel. We should help them. The new `yearly-plan-profiles.md` doc gives the three presets (Conservativo / Moderado / Agressivo) — that solves the "I don't know where to start" problem. But once the user wants to deviate from a preset (Custom mode) or wants to understand WHY the presets are the way they are, the editor is a blank-form experience. A ladder assistant would:
  - **Suggest values** based on the user's actual stats: trailing-window EV per trade, std per trade, observed drawdown, win rate, biggest loss. From those, propose `f_target` candidates and the corresponding tier R-values.
  - **Show consequences live**: as the user drags an `f_target` slider or edits a tier row, render in-place: expected annual return (P10/P50/P90), expected max drawdown, fractional-Kelly multiplier, probability of account-up-after-12-months. Numbers come from the existing Monte Carlo engine (`risk-simulation/`).
  - **Insights without dictating**: surface contextual warnings the way a copilot would — "your T1 sits at 3.33% per R; given your trailing 90-day std this implies ~140% expected drawdown" — without forcing a change.
  - **Compare to peers / benchmarks**: how this ladder compares to TSR's perda-diária limits if user is funded; how it compares to Conservativo/Moderado/Agressivo presets; how it compares to the user's previous year's ladder (drift tracking).
  - **Question the inputs**: "your Assertividade is set to 50% but measured over last 90 days is 32.1% — use measured?"; "the ladder assumes monthly recapitalization but you've withdrawn weekly the last 3 months — model that instead?".
  - **Two flavors to brainstorm**:
    1. **Numbers given** — assistant fills the table directly (one-click "apply suggestion"); user adjusts or accepts.
    2. **Insights only** — assistant never edits the form, only renders side-panel commentary as the user edits. User keeps full agency over numbers.
       Probably want both modes (toggle).
  - **Source-of-truth question to settle**: where does the "edge stats" come from? Trailing N trades on currently-active account? All accounts merged? User picks a basket? Default should be "current account, trailing 90 days, with N ≥ 50 trades, else show warning".
  - **UX shape to brainstorm**: side drawer? inline annotations under each cell? coach-mark overlay? a "Run assistant" button that opens a wizard? Conversational chat ("I have R$50k, moderate appetite, what should my ladder look like?")? The chat option fits naturally if we later route through an LLM, but for V1 a structured form-with-insights is probably faster to ship and safer.
  - **AI-vs-deterministic split**: most insights are deterministic (Kelly math, drawdown scaling, σ-based caps — all formulas already in `risk-management-simulation.md`). Only the natural-language explanations might call an LLM. Avoid LLM for the _numbers_ themselves; only for the _explanation_ of them. Keeps the recommendations auditable.
- **Hooks into existing stuff**:
  - [`yearly-plan-profiles.md`](riskManagement/yearly-plan-profiles.md) — preset definitions the assistant suggests from
  - [`risk-management-simulation.md`](riskManagement/risk-management-simulation.md) — Monte Carlo engine for live-consequences rendering
  - `tradeStats` / analytics endpoints — input data (measured EV, std, win rate, DD)
  - Disciplina metric — feeds the step-up eligibility insight
- **Why an idea, not a backlog item**: needs product call on which UX shape wins (chat vs structured-form-with-insights vs both), whether the "give numbers" mode is on by default or opt-in, and whether the insights live in the editor drawer or in a separate "Assistant" page. Also needs an honest "how much does this overlap with the Assistant reviewer idea below" check — both are LLM-adjacent assistant features and might share infrastructure.
- **Promotion path**: pick UX shape → spec the insight catalog (which insights, when they fire, what they show) → spec the data contract (which stats the assistant reads, how often) → 1-2 backlog entries (the assistant panel + the insight-rules engine).
- **Source**: 2026-06-10 session — Ygor on grilling his own 2026 ladder values. Realization: presets cover new users; existing users with hand-picked ladders need help reasoning about whether their numbers are sane. The grill itself (drawdown scaling table, Kelly math, σ-based caps) is exactly the value an in-product assistant could deliver every time anyone opens the plan editor.

## Connect Backtest ↔ Optimize (carry recipe + range across surfaces)

- **Status**: Shape clear, awaiting product call on which direction is primary.
- **Idea**: Today the two surfaces share code (presets, sections, engine, types) but the user has no programmatic handoff — a recipe tuned on `/backtest` cannot be carried to `/backtest/optimize` for sweep refinement, and a specific run from `/backtest/optimize` cannot be reopened on `/backtest` for trade-level / brick-level inspection. The path is manual re-entry: pick preset again, retype every field.
  Two complementary bridges, both reuse the same URL-param contract (one serializer, two consumers):
  - **Bridge A — "Optimize this" on `/backtest`.** Serialize current `recipe` + `dateRange` + `selectedSourceIndex` into URL params, navigate to `/backtest/optimize?seed=…&from=…&to=…&asset=…`. OPTIMIZE hydrates on mount, auto-derives `leafSelections` from the recipe baseline (the existing `deriveInitialSelections(HAWKS_LEAVES, recipe)` already does this), lands on the parameters step.
  - **Bridge C — "Open in Backtest" on each OPTIMIZE run row.** Each `OptimizationRun` already carries its full recipe. Reverse of A: pop `/backtest?seed=…` so the user can inspect the run's full trades table, equity, and brick-level chart that OPTIMIZE doesn't surface.
  - **Bonus — Bridge D — hero presets visible in Backtest.** Today frozen hero presets (`axion:optimize:heroPresets`) only appear in OPTIMIZE's preset dropdown. Backtest reads `[...orbPresets, ...hawksPresets]` directly. Have Backtest call the same `useHeroPresets()` hook and merge in for parity.
- **Why an idea, not a backlog item**: needs product call on which bridge is primary (forward / backward / both at once), and whether the param payload should be base64-encoded JSON or a tighter schema. Schema-versioning convention matches the localStorage stores (bump on shape change).
- **Promotion path**: once primary direction is picked, this becomes 1–2 backlog entries (the URL-contract module + the two button placements).
- **Source**: 2026-05-30 session — identified after completing the OPTIMIZE funnel (PRs 1–4). User asked "what connects Backtest and Optimize now?" and the honest answer was: shared code, zero programmatic handoff.
