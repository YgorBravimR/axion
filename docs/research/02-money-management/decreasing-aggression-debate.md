# Decreasing-Aggression Strategy — Debate & Parking Lot

> **Status**: Parked 2026-06-10. Aggressive profile stays at FLAT 1.25% per R
> (see [yearly-plan-profiles.md §11](./yearly-plan-profiles.md#11-aggressive-re-grill-against-live-data-2026-06-10)).
> Revisit when live n ≥ 50 (≈ 1–2 months of trading, including replay-mode reps).
>
> Author: Ygor + Arch grill session 2026-06-10, after the n=22 live re-grill
> that lifted Aggressive from 1.00% → 1.25%.

---

## TL;DR

**Question raised by Ygor**: Should the Aggressive profile front-load risk
(higher % per R at low tiers, decreasing toward higher tiers)? "Be more
aggressive when there's less to lose."

**Outcome**: NO. Flat 1.25% per R across all tiers is preserved.

**Why**: After grilling, Ygor's actual objective is **highest probability of
reaching R$50k**, not fastest path. Front-loaded aggression optimizes the
opposite objective (fastest path / lottery upside). It is mathematically
inconsistent with the stated goal. The conversation is documented here for
revisit after more data accumulates.

---

## 1. The proposal

Make the ladder look like:

```
T1 (R$5k)   → 2.5% per R (or higher)
T2 (R$15k)  → 2.0%
T3 (R$30k)  → 1.5%
T4 (R$60k)  → 1.0%
T5 (R$120k) → 0.75%
```

Rationale offered: "less to lose early, more to protect later."

This is structurally the **same shape as the current hand-picked ladder**
that the design doc explicitly rejected at §1:

```
T1 R$3.000  → 3.33% per R    (the ladder we're replacing)
T2 R$7.500  → 2.67%
T3 R$15.000 → 2.00%
T4 R$30.000 → 1.67%
T5 R$100.000→ 1.00%
```

The redesign moved to FLAT % per R precisely because the anti-Kelly shape
above was characterized as "mathematical-ruin territory" (3.33% T1 implies
~140% theoretical drawdown given backtest variance 1.49R).

So before answering "should we declining-aggression?", honest framing
forces the question: are we re-deriving the thing we just rejected?

---

## 2. Theory pool — what supports declining-aggression?

Three serious threads in the literature touch this pattern. Each gets a
different verdict.

### 2.1 Anti-Markov / "house money" framing (Thaler & Johnson 1990)

**Argument**: Capital you're already up on is "the casino's money" —
losing it stings less than losing principal. Therefore risk more when
ahead. (Or in the inverse Ygor proposed: risk more when capital is small
because losses are absolutely small.)

**Verdict**: **Descriptive, not prescriptive.** This is one of the most-
documented cognitive biases in trading. Thaler and Johnson named it; every
subsequent paper that cites it calls it an error. Acting on it is acting
on a bias instead of correcting for it.

Reference: Thaler & Johnson, _Gambling with the House Money and Trying to
Break Even_, Management Science 1990.

### 2.2 Utility-curve flattening (Bernoulli → Kelly → Kahneman)

**Argument**: Marginal utility of an extra R$1 is higher at R$5k than at
R$500k. So maybe sizing should also change.

**Verdict**: **No.** Kelly's framework already accounts for this. If your
utility function is logarithmic (Kelly's assumption), full-Kelly is
optimal regardless of current capital — flat fraction is optimal. If
you're more risk-averse than log (Kelly/2, Kelly/4, etc.), you bet a
fixed fraction OF Kelly — still flat. **No utility theory generates
declining-% as optimal under constant edge.**

Reference: Kelly, _A New Interpretation of Information Rate_, Bell System
Technical Journal 1956; MacLean, Thorp & Ziemba (eds.), _The Kelly Capital
Growth Investment Criterion_, 2011.

### 2.3 Sequence-of-returns risk (Bengen 1994; CTA fund mgmt)

**Argument**: The _order_ of wins and losses matters when you're
withdrawing or have a path constraint. A big drawdown early is more
recoverable than late-career.

**Verdict**: **Real concept, and it's the ONLY honest theoretical basis
for declining-aggression. BUT it argues for declining-aggression at
LATER tiers, not earlier.** Bengen's 4% retirement rule and CTA-fund
late-stage risk management both say: protect mature-capital, accept
lower upside there, smooth the path when permanent loss matters most.

Reference: Bengen, _Determining Withdrawal Rates Using Historical Data_,
Journal of Financial Planning 1994; Schwager, _Market Wizards_ CTA
interviews on late-career risk management.

**Crucial direction-flip**: sequence-of-returns supports declining
_late_ (T5 < T1). Ygor's proposal flips that (T1 > T5) and reverses the
rationale from "survival" to "lottery ticket." The math is mirror-image
but the meaning is opposite.

---

## 3. The actual math — what declining-aggression buys

For geometric growth with constant edge `EV` and variance `Var`:

```
E[log(1 + f·EV)]   per trade
```

Halving `f` over time (declining-aggression of either flavor):

| Outcome metric                   | vs flat-%                        | Reason                                                  |
| -------------------------------- | -------------------------------- | ------------------------------------------------------- |
| Median terminal wealth           | **LOWER**                        | Compounded less in both small-account AND large-account |
| P10 / left-tail terminal wealth  | **HIGHER**                       | Avoided the big late-stage drawdown                     |
| P90 / right-tail terminal wealth | **LOWER**                        | Capped your upside                                      |
| Sharpe of the path               | **HIGHER**                       | Smoother equity curve                                   |
| Path-survival probability        | depends on direction (see below) |                                                         |

Path-survival math is where the two directions split.

### 3.1 Declining-late (T1 high → T5 low) — "Bengen direction"

- Boost mid-path; protect late.
- Path-survival rises ONLY if late-stage R% was already over Kelly/2.
- For our case (Kelly/8 vs BT, Kelly/18 vs live): declining-late
  reduces upside without meaningful survival gain. The flat 1.25% is
  already well inside fractional-Kelly.
- **Verdict**: marginal at best for our edge characteristics.

### 3.2 Declining-early (T1 high → T5 low) — Ygor's proposal

- Boost early; smooth late.
- "Smooth late" is irrelevant because path-survival is dominated by
  the EARLIEST drawdown (you can't recover from T0 without external
  topup).
- "Boost early" multiplies path-failure probability by approximately
  the % uplift ratio. Going from 1.25% to 2.5% at T1 roughly doubles
  the probability of hitting T0 in year 1.
- **Verdict**: lower path-survival, lower median, higher P90, lower P10.
  Optimizes for the right-tail lottery outcome at the cost of the
  modal outcome. Coherent for someone seeking lottery returns. Not
  coherent for someone seeking "highest probability of reaching R$50k."

---

## 4. Quantitative anchors (Hawks Backtest 2026 + live)

Using EV = +0.18R (backtest) or +0.52R (live n=22), std = 1.5R, and
linear DD-vs-R% scaling:

| Scheme                                 | Approx max DD | P(survive 12mo from R$5k) | Median terminal | P10 terminal |
| -------------------------------------- | ------------- | ------------------------- | --------------- | ------------ |
| Flat 1.00% (old Aggressive)            | ~42%          | ~70%                      | R$7.0k          | R$3.5k       |
| **Flat 1.25% (current Aggressive)**    | **~52%**      | **~55%**                  | **R$7.4k**      | **R$3.0k**   |
| Declining-late (T1 1.25 → T5 0.75)     | ~52% peak     | ~55%                      | R$7.2k          | R$3.1k       |
| **Declining-early (T1 2.5 → T5 0.75)** | **~95%**      | **~25%**                  | **R$8.5k**      | **R$0.5k**   |
| Full-Kelly live (22.5%)                | ~100% (ruin)  | ~5%                       | R$25k or R$0    | R$0          |

**The declining-early proposal cuts path-survival by more than half
relative to the current flat 1.25%, while raising median by ~15%.** That's
the variance-for-return trade. For "highest probability of reaching R$50k"
it is unambiguously the wrong direction.

(These are first-pass analytical estimates. Real numbers require Monte
Carlo on `risk-management-simulation.md`. The relative ranking is robust;
absolute magnitudes need MC validation.)

---

## 5. The Carver constraint (relevant external benchmark)

Carver, _Advanced Futures Trading Strategies_ (2023), proposes a hard
design constraint: position sizing must produce a path that survives
**~2× the worst historical observed drawdown** without ruin.

Applied to our case:

- Backtest worst observed DD = 53.3%
- Carver design floor: survive ~100% theoretical DD without hitting T0
- Implied max R% per trade ≈ **0.6%** (≈ Moderado, not Aggressive)

The current flat 1.25% Aggressive is **already over Carver's constraint**.
That's been explicitly accepted as a principal override (see
yearly-plan-profiles §11.5). Going higher at T1 stacks override on
override.

---

## 6. The two questions that decided this

### 6.1 "Is this thought through, or is it loss-aversion asymmetry talking?"

R$5k feels like "play money"; R$100k will feel like "real money." That's
loss-aversion asymmetry — a known cognitive bias. Acting on it as a
strategy without correcting is the textbook trap.

**Ygor's answer**: implicit acknowledgment that the framing is
psychological, not mathematical.

### 6.2 "Are you optimizing for fastest path to R$50k, or highest probability of reaching it?"

- **Fastest path** → front-loaded aggression has a coherent design;
  optimize for E[time-to-50k] subject to ruin probability.
- **Highest probability of reaching** → flat or declining-late wins;
  optimize for P(reach 50k before hitting T0).

**Ygor's answer**: **highest probability of reaching it.** Once stated
explicitly, front-loaded aggression is mathematically the wrong tool.

---

## 7. What we're parking and why

Decision: **Keep the flat 1.25% Aggressive ladder as-is.**

Reasons to park rather than close:

1. **Sample size is still thin (n=22).** The whole reason this debate
   even has legs is the live EV jump (+0.18R BT → +0.52R live). If the
   live edge is real and persists, the Kelly numerator changes and the
   conversation re-opens with more weight.

2. **Ygor is starting replay-mode trading** to thicken the dataset
   faster than live-only cadence allows. Once n ≥ 50–100, EV and std
   have real confidence intervals and full-Kelly is no longer a
   guesstimate ±0.6R.

3. **The declining-late variant is genuinely defensible if late-stage
   capital becomes meaningful.** Once Ygor crosses R$30k (T3+), the
   sequence-of-returns argument for trimming late-stage R% has real
   theoretical weight. That conversation is worth having THEN.

---

## 8. Revisit triggers

Re-open this debate when ANY of the following hits:

- **n ≥ 50 live + replay trades combined** with rolling-30d EV stable
  (within ±0.15R of current point estimate)
- **Capital crosses T3 floor (R$30k)** — late-stage protection
  argument becomes practically relevant
- **A drawdown ≥ 25% occurs** — recalibrates appetite empirically,
  often more usefully than theoretical math
- **One full quarter (12+ weeks) of live data with disciplina ≥ 90%**

At that point: re-run the EV/Var math, redo the path-survival numbers
in §4, and decide whether to:

- (a) keep flat 1.25%
- (b) move to declining-late (T1 1.25% → T5 0.75%) for late-stage
  protection
- (c) re-grill Aggressive further if live EV justifies it (toward
  Moderado-Carver-compatible 0.60%?)

---

## 9. Open questions to answer with more data

These weren't answerable at n=22 but should become answerable at n=100+:

- **Is the live hit-rate (52.9%) genuinely higher than backtest (32.1%)
  or is it a small-n streak?** If real, where does the lift come from
  — better entries, better OCO, regime change?
- **Is the variance behavior stable?** Live std 1.52R ≈ backtest 1.49R
  at n=22. Does it hold at n=100? Anomalies (spikes) would change Kelly
  denominator materially.
- **Does Disciplina hold up under live pressure?** Backtest had 100%
  Disciplina by construction. Live Disciplina is the unknown that most
  affects whether ANY of the ladder math survives contact with
  practice.
- **What's the actual worst observed live drawdown?** This becomes the
  Carver-style design constraint at re-visit.

---

## 10. References

- [`yearly-plan-profiles.md §11`](./yearly-plan-profiles.md#11-aggressive-re-grill-against-live-data-2026-06-10)
  — the override that prompted this debate
- [`kelly-fractional-flowchart.md`](./kelly-fractional-flowchart.md)
  — Kelly methodology
- [`risk-management-simulation.md`](./risk-management-simulation.md)
  — Monte Carlo engine for path-survival simulation (use to validate
  §4 numbers when re-opening)
- [Vault — Risk MM Mastersheet](../../../../../ygorbravim/vault/wiki/_shared/risk-money-management-mastersheet.md)
  — full intellectual lineage including Bengen, Thaler, Carver, Kelly
- Thaler & Johnson 1990 — _Gambling with the House Money_
- Bengen 1994 — _Determining Withdrawal Rates Using Historical Data_
- Carver 2023 — _Advanced Futures Trading Strategies_ (on Ygor's kanban,
  Tier S)
- MacLean, Thorp & Ziemba (eds.) 2011 — _The Kelly Capital Growth
  Investment Criterion_
