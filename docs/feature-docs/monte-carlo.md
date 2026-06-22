# Monte Carlo

> Stress-test strategy win-rate + reward-risk ratio to see realistic drawdown outcomes and probability of ruin.

**Routes:** `/[locale]/monte-carlo`
**Server actions:** `monte-carlo.ts`
**Engines:** `src/lib/monte-carlo.ts` (V1), `src/lib/monte-carlo-v2.ts` (V2)
**Files:** `src/components/monte-carlo/**`

## Purpose

Take a strategy's measured edge and run it forward N times to see the distribution of outcomes. "Median wins" hides the cases where you blow up in the first 30 trades.

## What lives there

- Data source picker: single strategy, all strategies per account, or universal.
- **V1 (Edge Expectancy)** — win rate %, reward-risk ratio, # of trades, commission impact (% of 1R), # simulations.
- **V2 (Capital Expectancy)** — account balance, risk profile (named decision tree), daily/weekly/monthly limits.
- Distribution histogram (final R buckets).
- Equity curve sample paths.
- Drawdown chart.
- Kelly Criterion card.
- Metric cards (median, mean, best/worst, prob of profit, Sharpe).
- Strategy comparison panel.
- Per-run details (streaks, peak R).

## Inputs

V1: win rate, R-ratio, trade count, commission, simulation count.
V2: account balance, risk profile, daily/weekly/monthly caps.

## Outputs

- Median / mean / extremes final R.
- Max drawdown distribution.
- Probability of profit.
- Kelly recommendation.
- Per-run trade sequence.

## Cross-feature integrations

- **Journal** — historical win rate / R / commission are pulled as defaults.
- **Equity Shield** — "calibrate from MC" one-click prefill from MC worst case.
- **Risk Simulation** — complementary: MC tests strategy quality; RiskSim tests rules on real trades.
- **Settings → Risk Profiles** — V2 uses the named profile's tree.

## Where it fails

- **Small sample bias.** N < 30 trades → win rate estimate is noise. UI doesn't refuse to run.
- **R-ratio guesswork.** User overestimates → simulation says +40% CAGR → reality is −5%.
- **V1 vs V2 confusion.** Same screen, two engines with different inputs. No explainer of which to pick when.
- **Drawdown misread.** MC max drawdown is in R, not %. Doesn't include position sizing or margin calls. Users assume it's account drawdown.
- **No correlation modelling.** Assumes trades are IID. In reality, post-loss trades cluster (revenge) and post-win trades cluster (confidence). Tail risk is understated.
- **Commission impact is one number.** No tiering by lot size or asset.

## Power combos

1. **MC → Equity Shield calibration.** Run MC with current edge → take worst-case max DD → click "calibrate" → Equity Shield zones set automatically. One step from "I don't know my limits" to "the system enforces them".
2. **MC + Risk Sim sanity check.** MC says "median +20R over 100 trades" → Risk Sim replays your real trades with the same rules → if Risk Sim returns +5R, your live execution is bleeding 15R to discipline / slippage.
3. **Kelly sanity check.** MC suggests Kelly fraction → compare to Plan's risk % → if Kelly says 1% but Plan says 2%, you're overbet by definition; tighten Plan.
4. **MC + Plan EOY projection.** Plan projects linearly. MC projects probabilistically. Compare the two for the same monthly R target — if MC says median is half of Plan's target, the plan is unrealistic.
