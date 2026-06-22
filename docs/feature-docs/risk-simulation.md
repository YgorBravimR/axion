# Risk Simulation

> Replay historical trades with modified risk rules. "What if I'd taken 0.5R instead of 1R" — quantified.

**Routes:** `/[locale]/risk-simulation`
**Server actions:** `risk-simulation.ts`
**Engines:** `src/lib/risk-simulation.ts` (simple), `src/lib/risk-simulation-advanced.ts` (decision tree)
**Files:** `src/components/risk-simulation/**`

## Purpose

Hindsight made explicit. Backtest tells you if the strategy is good; Risk Sim tells you if your execution rules are good — by re-running your actual trades under different rules.

## What lives there

- Date range + asset filter.
- **Simple mode** — account balance, risk %, daily loss limit, daily profit target, max trades, consecutive loss cap, post-loss reduction, profit reinvestment.
- **Advanced mode** — balance + named decision tree.
- Prefill source: manual / monthly plan / saved risk profile.
- Original vs simulated equity curve overlay.
- Trade-by-trade comparison table.
- Summary deltas (P&L, drawdown, win rate).
- Per-trade decision trace ("skipped: daily loss limit hit", "sized down: post-loss reduction").
- Per-day breakdown.
- Skipped trades warning panel.

## Inputs

Risk params or named profile; date range; asset filter.

## Outputs

- Simulated equity curve.
- Trade-by-trade diff.
- Skipped trade list with reasons.

## Cross-feature integrations

- **Journal** — trades are the input.
- **Plan** — monthly params can prefill the form.
- **Settings → Risk Profiles** — advanced mode loads named tree.
- **Equity Shield** — shield rules can be layered into the sim.

## Where it fails

- **Hindsight bias baked in.** "I'd have done better with tighter stops" ignores slippage, decision latency, market context. RiskSim doesn't compensate.
- **Skipped trades easy to miss.** Banner is subtle; users see "simulated P&L > original P&L" without noticing that 40% of trades got skipped.
- **Decision-tree cascade is opaque.** Advanced mode can have dozens of nested rules; tracing why trade #47 got skipped takes 10 minutes.
- **P&L mismatch.** Original trades carry brokerage fees; simulated may strip them, inflating results.
- **No "what if I'd taken the skipped trades" reversal.** Sim drops them; can't ask "would I have made it back?"

## Power combos

1. **Backtest → Risk Sim → Profile → Plan.** Backtest validates the strategy; RiskSim validates the rules on top of it; encode the rules as a risk profile; assign to monthly Plan. Four-step pipeline from research to enforcement.
2. **Skipped-trades report card.** Look at skipped trades — if 50% would have been winners, your rules are too tight. If 80% would have been losers, your rules are saving you. Quantitative discipline tuning.
3. **Compare two profiles.** Run sim with Profile A vs Profile B over the same date range. Pick the one with better drawdown-adjusted P&L. The decision-trace tells you which rule made the difference.
4. **Sim + MC paired.** RiskSim shows what your rules did on real data; MC shows what they'd do on simulated draws. If MC and RiskSim disagree, your real data has correlation MC doesn't model — investigate.
