# Backtest

> Test strategies on historical Renko / candle data before risking live capital. Modular plugin architecture: entry, stop, target, sizing modules mix freely.

**Routes:** `/[locale]/backtest`, `/backtest/optimize`
**Server actions:** `backtest.ts`, `renko-pipeline.ts`, `candle-query.ts`, `hawks-engine-lab-data.ts`, `hawks-stop-audit.ts`, `inspector-data.ts`
**Files:** `src/lib/backtest/**` (40+ files), `src/components/backtest/**`

## Purpose

Validate (or kill) a strategy before live trading. Hawks is the headline use case — quality gates, structural pivots, Renko brick mechanics — but the engine is modular enough to host non-Hawks strategies (ORB presets, DezK).

## What lives there

- **Main page** — config form, equity curve, trade log.
- **Optimize page** — parameter sweeps (heatmap + runs table).
- **Hawks panels** — quality drawer, tier breakdown, results panel.
- **Trade chart modal** — per-trade Renko/candle replay with markers.

## Inputs

- Instrument + date range.
- Preset (ORB, DezK, Hawks v0) or custom composition (entry, stop, target, sizing modules).
- Capital + risk % per trade.
- Hawks-specific: quality gates (indicator thresholds for AAA/AA/A/B tiers), structural pivot conditions (TOPO/FUNDO wick-based per CLAUDE.md rule 0a).

## Outputs

- Equity curve + drawdown overlay.
- Win rate, profit factor, avg R, Sharpe, max drawdown.
- Hawks quality breakdown (% per tier).
- Full trade log with R, wick extremes, indicator state at fire.
- Per-trade chart snapshot.

## Cross-feature integrations

- **Playbook** — presets mirror documented strategies.
- **Journal** — backtest equity vs live equity is the comparison.
- **Risk Simulation** — shares candle data; backtest params can prefill RiskSim.
- **Monte Carlo** — backtest win-rate/R go directly into MC.
- **Dev / Hawks Audit** — replays the same engine for diagnostic.

## Where it fails

- **Compute time at scale.** 500K+ candles → slow page. No background job queue.
- **Knob explosion.** Hawks alone has 30+ quality gates + HTF thresholds + Renko + VWAP/Keltner/SR. No "preset profile" (aggressive / balanced / conservative) to bundle them.
- **Overfitting risk.** Optimizer happily mines noise. No out-of-sample split prompted; user has to enforce.
- **Renko R-size convention is load-bearing.** `R<N>` stores brick number, not ticks. Must convert `(size − 1) × 5`. Misreading = wrong stops everywhere.
- **Wick-based pivot direction.** TOPO/FUNDO use `high > priorHigh` / `low < priorLow`, NOT close vs open. Mismatch with chart = misleading backtest.
- **No "why this entry fired" overlay on the chart.** Trade row has quality gates + indicator state, but they aren't highlighted on the chart at the fire bar.
- **No backtest vs live equity diff in one screen.** Power user has to screenshot both.
- **Hardcoded session anchors.** B3 hours embedded; international markets need code edits.

## Power combos

1. **Backtest → MC → Risk Sim → Plan.** Iterate strategy until backtest looks decent → feed win-rate/R into MC for drawdown envelope → Risk Sim shows what disciplined rules would have done on real trades → encode the winning rules as a risk profile in Plan.
2. **Hawks lab + Hawks audit.** Run backtest in `/backtest` → spot anomaly → open `/dev/hawks-audit` for the same date → trace cascade. Same engine, different lens.
3. **Optimize then walk forward.** Parameter sweep over Q1 → pick top-3 param sets → run them on Q2 (held out). If the ranking inverts, you found noise.
4. **Per-version backtest.** Each Playbook strategy version gets a backtest pinned to it. Detail page shows the backtest equity next to live equity — divergence is your slippage + discipline drag.
