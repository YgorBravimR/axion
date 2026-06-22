# Equity Shield

> Drawdown protection. Auto-reduces position size as equity dips, scales back as it recovers.

**Routes:** `/[locale]/equity-shield`
**Server actions:** `equity-shield.ts`
**Engine:** `src/lib/equity-shield.ts`
**Files:** `src/components/equity-shield/**`

## Purpose

Encode "stop bleeding before you bleed out" as a rule, not a feeling. Three zones: live (full risk), sim (reduced), suspended (zero).

## What lives there

- Equity curve with zone colouring (live / sim / suspended).
- **Method 1: MDD Exercise** — MDD multiplier (default 1.3×), recovery % threshold, optional SMA.
- **Method 2: SMA Crossover** — SMA period (default 10).
- **MC Calibration** — one-click prefill from a recent MC worst-case drawdown.
- Current zone status + size multiplier.

## Inputs

- Initial balance, prop-firm DD limit.
- Method choice + parameters.

## Outputs

- Zone assignment per equity point.
- Current size multiplier (e.g. 0.5R in sim zone).
- Transition events.

## Cross-feature integrations

- **Journal** — live trades feed the equity series.
- **Monte Carlo** — calibration source.
- **Plan** — capital ladder informs DD limit thresholds.
- **Command Center** — daily loss limit enforced at trade creation references the shield's current zone.

## Where it fails

- **Whipsaws.** SMA crossover flips zones on noise; trader oscillates between sim and live within a week.
- **Over-conservative.** 1.3× MDD multiplier triggers shield on a one-time blip that wasn't a real drawdown.
- **Suggestion, not enforcement.** Shield says "use 0.5R" — the journal entry form doesn't auto-cap position size. Honor system.
- **Equity curve mirrors P&L only.** Capital events ignored. Shield zones can be wrong when you deposit/withdraw.
- **No "why am I in sim zone" explainer.** Status says zone; doesn't show which rule fired.

## Power combos

1. **MC → Shield → Journal.** MC worst-case → Shield calibrate → live trades feed back → shield re-evaluates each day. Closed loop, minimal user input.
2. **Shield + Plan + Risk Sim.** Define Plan risk %. Run Risk Sim with shield rules. If Sim shows shield triggered 3 times in Q1, decide whether to soften the trigger or tighten Plan.
3. **Shield as the prop-firm tripwire.** Set DD limit at prop firm threshold − 10% buffer. Shield's "suspended" zone fires before the firm's actual DD limit, giving the trader days of warning.
