# Risk Management — Reference Library

This folder holds the canonical reference docs for Axion's risk-management
profiles, methodology research, and the WIN-specific TSR adaptation. Each
file is self-contained — read this index to find the one you need.

## Profile flowcharts (decision trees for each sizing methodology)

These six docs describe the position-sizing methodologies Axion supports as
risk profiles. Each is structured as a decision tree (when to size up, when
to cut, when to stop trading). Source-of-truth for the JSON shape stored on
the `riskManagementProfiles` table.

| File                                                               | Methodology                        | Best for                                                           |
| ------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| [`risk-management-flowchart.md`](./risk-management-flowchart.md)   | Daily trading — generic baseline   | Default starting profile; daily-stop + per-trade R model           |
| [`fixed-fractional-flowchart.md`](./fixed-fractional-flowchart.md) | Fixed Fractional (Van Tharp)       | Constant % of equity per trade — most common retail starting point |
| [`fixed-ratio-flowchart.md`](./fixed-ratio-flowchart.md)           | Fixed Ratio (Ralph Vince)          | Scale up size as cumulative profit crosses fixed deltas            |
| [`kelly-fractional-flowchart.md`](./kelly-fractional-flowchart.md) | Kelly Fractional (Kelly / Shannon) | Edge-aware sizing; needs reliable win-rate + payoff estimates      |
| [`r-multiples-flowchart.md`](./r-multiples-flowchart.md)           | R-Multiples (Van Tharp / Williams) | Risk-unit-first framework; pair with any other sizing method       |
| [`institutional-flowchart.md`](./institutional-flowchart.md)       | Institutional (CTA / quant funds)  | Volatility-targeting + portfolio-margin model                      |

## TSR-specific (Brazilian WIN / WDO playbook)

[TSR](https://institucional.tradersclub.com.br/) is the Brazilian trading
school whose methodology Axion's "Iniciante" mode is calibrated against.
These three docs cover the local-market adaptation.

| File                                                                   | What's in it                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`tsr-iniciante-flowchart.md`](./tsr-iniciante-flowchart.md)           | Beginner-mode WIN sizing flowchart — daily-stop, per-trade R, escalation |
| [`tsr-iniciante-win-adaptation.md`](./tsr-iniciante-win-adaptation.md) | WIN-specific overrides on top of TSR Iniciante baseline                  |
| [`tsr-rules-reference.md`](./tsr-rules-reference.md)                   | Quick-reference card of TSR's discrete rules                             |

## Yearly Plan profiles (preset risk profiles for `/plan/[year]` editor)

| File                                                   | What's in it                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`yearly-plan-profiles.md`](./yearly-plan-profiles.md) | Conservativo / Moderado / Agressivo preset profiles. Single-parameter `f_target` design; tier ladder stores BRL targets (not contracts); contracts derive per OCO from current stop. Hysteresis rules, caps, withdrawal %, JSON shape, UI/schema changes. Includes TSR prop-firm pass model as separate constraint-optimized profile. |

## Research / methodology

| File                                                               | What's in it                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`risk-management-simulation.md`](./risk-management-simulation.md) | Path-simulation methodology + worked numerical examples across multiple sizing methods             |
| [`conversation.md`](./conversation.md)                             | Original R-calculation discussion thread — anti-martingale vs fixed-R, theory + practitioner takes |

## Where these are consumed in code

- **`src/db/schema.ts`** — `riskManagementProfiles` table stores the JSON tree
- **`src/types/risk-profile.ts`** — TypeScript shape (mirrors flowchart node structure)
- **`src/db/seed-risk-profiles.ts`** — seeds the six default profiles per the flowcharts above
- **`src/components/risk-simulation/`** — UI that runs the path simulations described in `risk-management-simulation.md`
