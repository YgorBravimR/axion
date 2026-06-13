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

## Mentor role

- **Status**: Needs product development and engeneering thinking
- **Idea**: Specific user role with specific information about a group of other accounts, new pages, new tables, where user can monitor it's pupils.
- **Source**: Ygor

## Ladder assistant — guided ladder configuration for `/plan/[year]`

- **Status**: Raw brainstorm. Needs product + design thinking before becoming a backlog item.
- **Not AI.** This is a pure-code, deterministic feature — Kelly math, σ-based caps, drawdown scaling, and Monte Carlo runs are all formulas that already exist in `risk-management-simulation.md`. No LLM is in the loop for numbers, insights, or recommendations. The word "assistant" here means "in-product helper UI", not "AI assistant". Keep this entry separate from the AI agent idea below.
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
  - **UX shape to brainstorm**: side drawer? inline annotations under each cell? coach-mark overlay? a "Run assistant" button that opens a wizard? V1 is a structured form-with-insights — no chat, no LLM. Conversational chat is explicitly out of scope for this idea; if we ever want that, it belongs to the AI agent idea below, not here.
  - **Insight copy is templated, not generated.** Sentences like "your T1 sits at 3.33% per R; given your trailing 90-day std this implies ~140% expected drawdown" are string templates filled by deterministic numbers — same pattern as the existing engine output. No LLM call to author the explanation either.
- **Hooks into existing stuff**:
  - [`yearly-plan-profiles.md`](riskManagement/yearly-plan-profiles.md) — preset definitions the assistant suggests from
  - [`risk-management-simulation.md`](riskManagement/risk-management-simulation.md) — Monte Carlo engine for live-consequences rendering
  - `tradeStats` / analytics endpoints — input data (measured EV, std, win rate, DD)
  - Disciplina metric — feeds the step-up eligibility insight
- **Why an idea, not a backlog item**: needs product call on which UX shape wins (structured-form-with-insights vs wizard vs drawer), whether the "give numbers" mode is on by default or opt-in, and whether the insights live in the editor drawer or in a separate "Assistant" page.
- **Promotion path**: pick UX shape → spec the insight catalog (which insights, when they fire, what they show) → spec the data contract (which stats the assistant reads, how often) → 1-2 backlog entries (the assistant panel + the insight-rules engine).
- **Source**: 2026-06-10 session — Ygor on grilling his own 2026 ladder values. Realization: presets cover new users; existing users with hand-picked ladders need help reasoning about whether their numbers are sane. The grill itself (drawdown scaling table, Kelly math, σ-based caps) is exactly the value an in-product assistant could deliver every time anyone opens the plan editor.

## Broker / Profit Pro integration — pull executed orders instead of hand-input

- **Status**: ✅ **Superseded by the two-phase journaling plan.** Full spec locked at [`docs/plans/two-phase-journaling-with-enrichment.md`](plans/two-phase-journaling-with-enrichment.md); backlog entry filed in [`docs/backlog.md`](backlog.md) under "Journaling Workflow → Two-phase journaling". Boletas (`test.csv`) parsing dropped from scope (SL is deterministic per OCO rule, profitONE doesn't export boletas, trader never moves stop). The remainder of this entry is kept for historical context — the V2 plan in the doc is what's actually being built.
- **Status (original)**: Raw brainstorm. Needs an honest feasibility pass before it gets a shape.
- **Idea**: Today Ygor hand-enters every trade into Axion (or imports a CSV he exported from Profit Pro). The next step is to remove that step: connect Axion to the source of truth (broker — Genial / XP — or the platform sitting on top, Profit Pro) and pull executed orders automatically. Goal: zero manual entry for trades Axion is supposed to learn from.
- **Where the data could come from (in order of likely viability)**:
  1. **Profit Pro export / API** — Nelogica's Profit Pro is the platform layer. If Profit exposes an export endpoint or a local file the desktop app writes (e.g. a SQLite, a CSV in `%AppData%`, a TCP feed), a local agent could read it and POST to Axion. Need to check: does Profit Pro expose orders programmatically, or only via the UI's "exportar boletas" button? Nelogica has historically been closed; this is the riskiest assumption in the whole idea.
  2. **Broker direct (Genial / XP)** — neither exposes a public retail-trader API for executed-order history that Axion can call from a server. Genial has B3 connectivity via Nelogica's stack; XP has a "Open Investments" API but it's account-statement level, not order-level, and requires OAuth via XP's portal. Both = months of partner negotiation, not a weekend project.
  3. **B3 / CEI (now `b3.com.br/investidor`)** — official statement of executed orders, but T+1 latency and no order-level metadata (no entry/exit pairing, no stop, no target). Useful for **reconciliation** ("did Axion's view of my month match B3's?") not for live journaling.
  4. **Profit Pro screen-scrape / OCR via a local agent** — desperate fallback. Don't.
- **Honest take Arch is pushing back on (read this before you fall in love with the idea)**:
  - The 80% case isn't "pull from broker", it's **"import the CSV Profit Pro already exports"**. Profit's "Exportar boletas" button gives you executed orders with timestamps, prices, sides, qty. If Axion had a one-click CSV importer for that format, the manual-entry pain probably drops 90% — without any API integration. Build that first. Then evaluate whether the remaining 10% is worth the months of broker-partner work.
  - "Pull executed orders" is not the hard part. **Pairing them into round-trip trades** (entry brick + exit brick + intent + stop level + target) is the hard part, and the broker doesn't have that data — only Axion (or Profit) does. So even a perfect broker API would leave you with a feed of fills, not a feed of trades. You'd still need a pairing layer that infers the trade structure from the fills, OR you keep hand-tagging post-import. Honest question: how much value does Axion lose if it gets the fills auto-imported but you still have to add intent / stop / target by hand?
  - One-trader scope is a feature, not a limit. Don't overbuild — a per-user "upload my Profit CSV" route that does 80% of the work for you today is shippable in a day. Broker API is a multi-month side-quest.
- **Likely concrete shape if pursued V1 (CSV-first)**: New page `/settings/import` → upload Profit Pro "Boletas" CSV → preview parsed rows → pair fills into trades using `(asset, day, side-flip)` heuristic → user confirms/adjusts → write to `trades` table. Idempotent: same CSV uploaded twice produces zero new rows. Tags (entry tier, gate state, etc.) stay hand-entered post-import, or auto-derived if Axion's Hawks engine can resolve them from the brick stream for that day.
- **Open questions to settle before promotion**:
  1. Does Ygor already export Profit boletas CSVs today? If yes, share one — schema discovery first.
  2. How does pairing work for **scaled / split entries** (two fills going in at different prices for the same trade)? Profit's CSV groups them or splits them?
  3. After CSV import, how does the trade marry up to Axion's brick-by-brick view of the same day? `entry_time → nearest brick close` is probably the answer, same logic as the Hawks importer already uses.
  4. Stop/target/intent: hand-tag post-import, or auto-derive from Axion's autonomous engine retroactively?
- **Promotion path**: settle the open questions → likely splits into (a) "Profit CSV importer V1" backlog entry (S/M effort, P1 if this becomes the next focus), (b) "Boletas → round-trip pairing heuristic" backlog entry (M, P2), and (c) "Broker API integration" idea that stays here until there's a real partner conversation with Nelogica or XP.
- **Source**: 2026-06-12 session — Ygor brainstorm "make data less inputed and more automatic; we're using Profit Pro connected with Genial / XP, we should have a way to pull executed orders".

## In-platform AI agent — trading + Axion expert (insights, backtest analysis, reviews, playbooks)

- **Status**: Raw brainstorm. Needs hard scoping before it becomes anything.
- **Scope note (2026-06-12 merge)**: this entry absorbs the earlier "Assistant reviewer" idea ("AI looking at numbers, comparing with benchmarks, preview of future, giving insights"). That was the analysis-and-review half of the same agent — folded in here so we don't track or build it twice. The Ladder assistant above stays separate and is explicitly **not AI** (pure deterministic code over the Monte Carlo engine).
- **Idea**: Embed an LLM-backed agent inside Axion that is (a) **expert in the Axion product** (knows the data model, surfaces, recipes, the Hawks methodology, the catalog, the ladder, the journal schema), and (b) **expert in Ygor's trading** (fed by his actual trade history, tag distributions, day breakdowns, backtest runs, OCO weeks, calculations). The agent's job:
  - **Assisted reviews** — look at user numbers, compare against benchmarks (presets, prior periods, peer cohorts later), preview future trajectories, surface insights ("your Tier 4 trades have a 3× higher BE-stop rate on NR4 days — want to test gating those out?"). This is the absorbed "Assistant reviewer" scope.
  - **Backtest analysis** — go deeper than the static dashboard on any backtest run: pattern detection across days, parameter-sensitivity commentary, "what's the weakest assumption in this recipe?".
  - **Conversational optimization** — "what if we tighten the wave-2 retracement on Wednesdays only?" → agent calls the existing optimize sweep with the proposed tweak, reports back.
  - **Playbook authoring** — draft text + parameters for a new playbook entry from a conversation about what worked.
- **Likely shape if pursued (this is sketch, not commitment)**:
  - **Knowledge ingestion**: pre-built RAG over Axion's docs (`docs/`), the user's trade history (`trades` table per-user), backtest runs (`backtest_runs`), OCO weeks (`oco_weeks`), tag dimensions, Hawks autonomous catalog. Update incrementally on writes.
  - **Tools the agent can call**: read trades by date range, query tag distribution, fetch a specific backtest run's metrics, run a new backtest with a tweaked recipe (already exists as a server action), run an optimize sweep (already exists), open the inspector at a specific trade, write a new draft playbook entry. Tool-call architecture, not "ask LLM and parse the answer".
  - **Surfaces**: (a) global chat drawer accessible anywhere, contextual to the current page; (b) per-feature "ask about this" buttons (on a backtest run, on a day in the journal, on a tier slice in tier analytics); (c) optional inline annotations ("the LLM noticed X about this run") rendered next to high-signal numbers — opt-in, not by default.
  - **Auditability**: every recommendation the agent makes must be traceable to (a) the data it read and (b) the formula / deterministic step that produced the number. The LLM never invents a number; it explains a number that came from the engine. Hard rule, otherwise this becomes a hallucination factory pointed at money decisions.
  - **Privacy**: user trade data never leaves the user. Per-user vector store / per-user prompt context. No cross-user training, no aggregated leakage. Hard rule.
- **Where Arch is pushing back (read this before falling in love with the idea)**:
  - "Generalist AI inside the trading app" is the most-hyped category in fintech right now and 90% of it is glorified prompt-templates over historical CSVs that ChatGPT could already do. **Axion's edge is the data + the methodology, not the LLM.** If the agent's value isn't tightly bound to data Axion uniquely has (your bricks, your Hawks state machine, your tag dimensions, your tier analytics, your catalog parity tests) — i.e. things ChatGPT can't see without uploading every CSV — there's no moat and minimal value.
  - The hardest part isn't building the LLM agent. It's **deciding what insights are correct enough to ship**. The financial cost of a wrong "the LLM thinks you should…" is real. You probably want a phase-1 where the LLM only ever **explains** numbers the engine already computed, never **recommends** parameter changes. Phase 2 (recommendations) only after phase 1 has built trust + a feedback loop where every recommendation is logged and you can A/B which recommendations panned out.
  - Cost / latency is real. Even with caching, every "what about this backtest" call burns a few cents and a second of latency. If the agent is everywhere by default, the cost stacks. Plan for: caching, per-user budgets, latency budgets, fallback to deterministic insights when LLM is down.
  - Single-user scope (today) is a strength, not a limit. Build the agent against **your own data** as the only user. Personality emerges from your real questions. Generalize later only if the abstractions hold; don't pre-architect for multi-tenancy.
- **Open questions to settle before promotion**:
  1. Phase 1 = **explainer only** (LLM annotates engine output, never invents numbers, never recommends parameter changes) or already phase 2 = **conversational optimizer** (LLM proposes recipes, runs sweeps, reports back)? Hard recommendation: phase 1 first, by a wide margin.
  2. Surface — global drawer, per-feature buttons, inline annotations, or all three? Probably one to start (global drawer with page-aware context).
  3. Underlying LLM — Anthropic SDK direct (you have the patterns from `claude-api` skill), OpenAI, or a swap-friendly abstraction? Voting Anthropic direct — single-tenant simplicity, prompt-cache is huge, you're already in the ecosystem.
  4. Boundary with the Ladder assistant: the Ladder assistant is deterministic code and must stay that way (auditable money math). This agent can _reference_ a ladder ("your T1 looks tight given last 90 days") but never _edits_ the ladder — that's the deterministic editor's job. Settle the boundary before either surface ships so we don't end up with an LLM writing into the plan table.
- **Promotion path**: pick phase scope → pick one surface → spec the tool catalog (which engine functions the agent can call) → spec the insight grammar (what an "insight" object looks like) → split into 2–4 backlog entries (LLM client + tool registry + first surface + audit log).
- **Source**: 2026-06-12 session — Ygor brainstorm "integration of AI on platform, agent expert in our software and expert in trading (fed by our data and studies), help me have better insights of trades, analyze better backtesting data, optimized strategies, even create playbooks". Merged with the older "Assistant reviewer" entry (originally filed by Ygor — "AI looking at numbers, comparing with benchmarks, preview of future, giving insights") on 2026-06-12. Companion idea to the broker-integration one filed above.

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
