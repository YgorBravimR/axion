# Yearly Plan — Risk Profiles (Conservativo / Moderado / Agressivo)

> Design for the `Plano Anual` profile system. Replaces the hand-picked
> capital ladder + caps in the current `plan/[year]` editor with three
> deterministic preset profiles, each driven by a single `f_target`
> parameter. Authored 2026-06-10 with Ygor after grilling the empirical
> backtest stats from Hawks Backtest 2026 (291 trades, Disciplina 100%).

---

## TL;DR

- **One user-facing parameter** per profile: `f_target` (target % per R).
- **5-tier capital ladder** with geometric doubling thresholds: 5k / 15k / 30k / 60k / 120k.
- **Tier value of 1R is stored in BRL**, not in contracts. Contracts derive per OCO from the weekly stop.
- **Three preset profiles** with concrete `f_target`: Conservativo (0.30%), Moderado (0.60%), Agressivo (**1.25%**, re-grilled 2026-06-10 against live data — see §11).
- **Caps in R**, identical across profiles: Daily ±3R/+5R · Weekly -6R/+10R · Monthly -10R/+25R.
- **Withdrawal**: 10% / 20% / 30% monthly by profile.
- **Reassessment**: event-driven (tier crossings with hysteresis) OR calendar-driven (monthly), user picks.
- **TSR prop-firm pass is a separate model** (constraint-optimized, not Kelly-optimized) — documented at end.

---

## 1. Background — why this design

The current `plan/[year]` editor exposes:

- Capital initial
- A 5-tier ladder where each tier is a hand-picked `(from_brl, oneR_brl)` pair
- Defaults for daily/weekly/monthly loss+win caps in R
- Default Assertividade % and Dias/semana

In the Ygor 2026 plan as set today:

| Tier | From      | 1R      | % per R |
| ---- | --------- | ------- | ------- |
| T1   | R$3.000   | R$100   | 3.33%   |
| T2   | R$7.500   | R$200   | 2.67%   |
| T3   | R$15.000  | R$300   | 2.00%   |
| T4   | R$30.000  | R$500   | 1.67%   |
| T5   | R$100.000 | R$1.000 | 1.00%   |

The 5 thresholds and 5 R-values are 10 free parameters picked by feel.
The %-per-R curve **decreases as capital grows** (anti-Kelly), and the T1
PISO value of 3.33% per R is in mathematical-ruin territory given the
observed backtest drawdown.

Empirical reality from Hawks Backtest 2026 (291 trades, Disciplina 100%):

| Stat                            | Value      |
| ------------------------------- | ---------- |
| Win rate (all trades, incl. BE) | 20.27%     |
| Loss rate                       | 42.96%     |
| Breakeven rate                  | 36.77%     |
| Avg win                         | +3.00R     |
| Avg loss                        | -1.00R     |
| **EV per trade**                | **+0.18R** |
| Std dev per trade               | 1.49R      |
| Max observed drawdown           | **53.3%**  |
| Profit factor                   | 1.42       |

Implicit BT sizing was ~1.26% per R (derived from R$20.8k P&L / 33R total
on a R$50k notional). At that sizing the system experienced a **53.3%
drawdown**. Drawdown scales roughly linearly with R% in long samples, so:

| 1R as % equity     | Projected max DD |
| ------------------ | ---------------- |
| 0.25%              | ~11%             |
| 0.50%              | ~21%             |
| 0.75%              | ~32%             |
| 1.00%              | ~42%             |
| 1.26% (BT)         | ~53% (observed)  |
| 1.67% (current T4) | ~70%             |
| 3.33% (current T1) | ~140% (ruin)     |

The current T1–T4 ladder is in the "guaranteed major drawdown" zone if
the edge regresses to the backtest mean. **The redesign cuts effective
R% to roughly half across the ladder** while keeping the operational
ladder structure (users don't size up/down every trade; they size at
checkpoints).

The Kelly fraction implied by `EV/Var = 0.18/2.22 = 8.0% per R-unit`.
That's full-Kelly territory and unsuitable for direct application
(sample-size estimation error alone justifies betting ≤ Kelly/4). All
three proposed profiles are fractional-Kelly: Agressivo ≈ Kelly/8,
Moderado ≈ Kelly/13, Conservativo ≈ Kelly/27.

---

## 2. Ladder structure

### 2.1 Tier thresholds (identical across all profiles)

Geometric doubling pattern. Each tier represents a "milestone" of growth.

| Tier   | Capital range    | Meaning                |
| ------ | ---------------- | ---------------------- |
| **T0** | < R$5.000        | **STOP** trading       |
| T1     | R$5.000–15.000   | Recovery / new account |
| T2     | R$15.000–30.000  | Doubled the floor      |
| T3     | R$30.000–60.000  | Proven                 |
| T4     | R$60.000–120.000 | Compounding            |
| T5     | R$120.000+       | Mature                 |

Rationale for the floor:

- Below R$5k, edge sample is too small to risk and the absolute dollar
  amounts are too small to overcome operational costs (corretagem,
  platform fees). At R$5k with even Conservativo 0.3% sizing, 1R = R$15
  — below 1-contract granularity for WIN (R$42) and WDO (R$40).
- Below floor: no trading. Account holder must deposit fresh capital or
  accept the experiment failed.

### 2.2 Tier 1R values (BRL, not contracts)

```
target_1R_brl = f_target × tier_floor
```

| Tier | Capital from | 🟢 Conservativo (0.30%) | 🟡 Moderado (0.60%) | 🔴 Agressivo (1.25%) |
| ---- | ------------ | ----------------------- | ------------------- | -------------------- |
| T1   | R$5.000      | **R$15**                | **R$30**            | **R$62**             |
| T2   | R$15.000     | **R$45**                | **R$90**            | **R$188**            |
| T3   | R$30.000     | **R$90**                | **R$180**           | **R$375**            |
| T4   | R$60.000     | **R$180**               | **R$360**           | **R$750**            |
| T5   | R$120.000    | **R$360**               | **R$720**           | **R$1.500**          |

Effective % per R drifts within each tier: highest at tier floor (= the
target), lower as capital approaches next-tier floor. This produces the
intuitively-correct behavior of being slightly more conservative near
the top of a tier (about to step up) than at the bottom (just stepped
up).

### 2.3 Contract derivation (per OCO period)

The ladder stores BRL. Contracts derive mechanically from the active
OCO stop per asset:

```
contracts = round( target_1R_brl / (stop_pts × tick_value) )

WIN tick_value = R$0,20 / pt
WDO tick_value = R$10,00 / pt
```

Recalc trigger: every OCO publish event (weekly in current Hawks
cadence). Display in plan UI:

```
Tier T3 (capital R$45k · Moderado · target 1R = R$180)
This week's OCO:
  WIN  · stop 210 pts · 4 contracts · realized 1R = R$168 (-7% vs target)
  WDO  · stop 4,0 pts · 4 contracts · realized 1R = R$160 (-11% vs target)
```

Show both the derived contract count AND the realized 1R-vs-target drift
so the trader sees rounding effects. If `|drift| > 15%`, surface a soft
warning ("consider switching asset or skipping this OCO period").

### 2.4 Edge case — derived contracts < 1

At low tiers + tight stops, target_1R_brl may fall below 1-contract
minimum (R$40-42). Handling by profile:

| Profile      | Rule when derived < 1 contract                      |
| ------------ | --------------------------------------------------- |
| Conservativo | **SKIP** the trade — account too small for target   |
| Moderado     | **Round to 1 contract** if derived ≥ 0,5; else skip |
| Agressivo    | **Round to 1 contract** always                      |

Consequence: at T1 and most of T2, all profiles converge to "1 contract
or skip" because contract granularity dominates. Real differentiation
kicks in at T3+ where multiple contracts are feasible.

This is mathematically correct: small accounts have effectively no
choice but the most conservative effective sizing.

---

## 3. Caps (in R, identical across profiles)

The 1.49R std-per-trade combined with 4 trades/day implies a daily P&L
distribution with mean +0.71R and std ≈ 2.98R. The current Daily -2R
loss cap triggers within ~1σ — i.e. ~25% of days are forced-stopped by
normal variance, not real failure. Proposed caps reduce false stops
while still bounding catastrophic days:

| Cap          | Current | Proposed | Why                                                                    |
| ------------ | ------- | -------- | ---------------------------------------------------------------------- |
| Daily loss   | -2R     | **-3R**  | ~1σ → ~10% trigger rate (saner); still bounds bad days                 |
| Daily win    | +3R     | **+5R**  | Wider; captures genuine green days, fewer "leave money on table" stops |
| Weekly loss  | -4R     | **-6R**  | Allows one full bad day + variance                                     |
| Weekly win   | +6R     | **+10R** | Don't strangle a great week                                            |
| Monthly loss | -8R     | **-10R** | ~1σ of monthly P&L; less false-positive                                |
| Monthly win  | +15R    | **+25R** | Don't cap right tail                                                   |

These caps are **stop-trading triggers**, not just reporting targets:
hitting daily loss = no more trades today; hitting weekly loss = no
more trades this week; hitting monthly loss = no more trades this
month (and force step-DOWN of tier — see §4.2).

Win caps function as **profit-lock triggers**: hit daily/weekly/monthly
win cap = stop trading for that period (lock the gain).

---

## 4. Reassessment rules

Two operating modes — user picks one in profile settings.

### 4.1 Mode A — Event-driven (recommended for personal account)

**Step DOWN (de-risk) — immediate, no hysteresis:**

- On every trade entry: if `current_capital < current_tier_floor`,
  step down immediately
- After hitting monthly loss cap: force step down 1 tier regardless of
  capital (psychological reset; lost month is a regime signal)
- After 3 consecutive losing weeks: force step down 1 tier

**Step UP (size-up) — hysteresis required:**

ALL of the following must hold:

- `capital > next_tier_floor` for 2 consecutive weeks (not just one peak day)
- No monthly loss cap hit in the last 30 days
- Disciplina ≥ 95% in the last 30 days (Axion metric already tracked)

If any condition fails, stay at current tier.

### 4.2 Mode B — Calendar-driven (recommended for prop firm)

- On the 1st of each month: evaluate `(capital, last-30d performance,
current tier)` and set tier for the month
- No mid-month tier changes EXCEPT forced step-DOWN on monthly cap hit
- OCO publishes weekly → contracts recompute within current month's tier

### 4.3 OCO recalculation (independent of tier reassessment)

Whenever the OCO publishes new stops (typically weekly), contracts
recompute for the **current tier** with the **new stop_pts**:

```
on OCO publish:
  for asset in [WIN, WDO, ...]:
    contracts[asset] = round( current_tier.target_1R_brl /
                              (asset.stop_pts × asset.tick_value) )
    apply min-contract rule per profile
    display realized 1R + drift vs target
```

---

## 5. Withdrawal rules

Applied to **net profit after IR** (day-trade IR = 20% in Brazil), not
to gross.

| Profile      | Monthly withdrawal | Rationale                          |
| ------------ | ------------------ | ---------------------------------- |
| Conservativo | **10%**            | Compounding is the point           |
| Moderado     | **20%**            | Lifestyle + growth balance         |
| Agressivo    | **30%**            | Maximize income now, slower growth |

If a month is net negative: withdrawal = 0 (don't withdraw from drawdown
buffer).

---

## 6. Expected outcomes per profile

Analytical estimates based on the 291-trade Hawks Backtest 2026 stats.
**Monte Carlo simulation should be run before going live** — these are
first-pass numerical anchors.

| Metric                         | 🟢 Conservativo | 🟡 Moderado | 🔴 Agressivo                               |
| ------------------------------ | --------------- | ----------- | ------------------------------------------ |
| f_target (% per R)             | 0.30%           | 0.60%       | **1.25%**                                  |
| Fractional Kelly multiplier    | ~Kelly/27       | ~Kelly/13   | **~Kelly/6** vs BT · **~Kelly/18** vs live |
| Expected annual return (gross) | **~+11%**       | **~+22%**   | **~+47%**                                  |
| Expected max drawdown          | **~13%**        | **~27%**    | **~55%**                                   |
| P(account up after 12 months)  | ~90%            | ~80%        | ~55%                                       |
| Withdrawal/month               | 10%             | 20%         | 30%                                        |
| Annual after withdrawals       | ~+8%            | ~+15%       | ~+27%                                      |

The current plan's projected +398% annual ending (R$50k → R$248k) is
fantasy under the actual backtest stats. Even Agressivo profile maps to
roughly +22-38% gross / year. Replace fantasy projections with
P10/P50/P90 Monte Carlo bands.

---

## 7. JSON config shape (for `riskManagementProfiles` table or new table)

```json
{
	"schema_version": 1,
	"profile_id": "yearly_plan_moderado",
	"name": "Moderado",
	"f_target_pct": 0.6,
	// NOTE: agressivo preset uses f_target_pct: 1.25 (was 1.00 until 2026-06-10 — see §11)
	"kelly_fraction_estimate": "Kelly/13",
	"tier_thresholds_brl": [5000, 15000, 30000, 60000, 120000],
	"target_1R_brl_by_tier": [30, 90, 180, 360, 720],
	"min_contract_rule": "round_if_half",
	"reassessment_mode": "event_driven",
	"hysteresis": {
		"step_up_weeks_required": 2,
		"step_up_blocked_after_monthly_loss_days": 30,
		"step_up_min_disciplina_pct": 95,
		"step_down_force_on_monthly_cap": true,
		"step_down_force_on_consecutive_losing_weeks": 3
	},
	"caps_R": {
		"daily": { "loss": -3, "win": 5 },
		"weekly": { "loss": -6, "win": 10 },
		"monthly": { "loss": -10, "win": 25 }
	},
	"withdrawal": {
		"frequency": "monthly",
		"pct_of_net_profit_after_ir": 20,
		"skip_on_negative_month": true
	},
	"assertividade_pct_measured": 32.1,
	"assertividade_pct_used": "measured",
	"ir_day_trade_pct": 20
}
```

Three preset records seeded (`yearly_plan_conservativo`,
`yearly_plan_moderado`, `yearly_plan_agressivo`), each with the
corresponding `f_target_pct`, `target_1R_brl_by_tier`,
`min_contract_rule`, and `withdrawal.pct` values from the tables above.

User override capability: any field can be overridden per-year-plan
without losing the link to the source preset (track `derived_from_preset`

- `overrides_applied` array).

---

## 8. UI changes

### 8.1 Plan editor (`/plan/[year]` right-side drawer)

Replace the current free-form "Capital ladder" table with:

1. **Profile selector** — single dropdown: Conservativo / Moderado /
   Agressivo / Custom. Picking a preset auto-fills all fields below.
2. **Reassessment mode toggle** — Event-driven / Calendar-driven.
3. **Capital initial** — kept as-is.
4. **f_target %** — visible but read-only when a preset is selected;
   editable in Custom mode.
5. **Tier ladder** — auto-populated from `target_1R_brl_by_tier`; read-only when preset, editable in Custom.
6. **Caps in R** — read-only when preset, editable in Custom.
7. **Withdrawal %** — read-only when preset, editable in Custom.

### 8.2 Live "current tier + contracts" panel (new)

Above the monthly grid, show:

```
Current tier: T3 · Moderado · target 1R = R$180

Active OCO (week of YYYY-MM-DD):
  WIN  · stop 210 pts · 4 contracts · realized 1R = R$168 (-7%)
  WDO  · stop 4,0 pts · 4 contracts · realized 1R = R$160 (-11%)

Hysteresis status:
  Capital R$45.230 is 50.4% into tier T3 (R$30k–60k)
  Next step-up requires capital > R$60.000 for 2 consecutive weeks
  + no monthly cap hit in last 30 days (✓ 0 hit)
  + Disciplina ≥ 95% (✓ current 100.0%)
```

### 8.3 Step-up / step-down notification

On reassessment-eligible events, show a banner:

```
You've been above tier T4 floor (R$60.000) for 2 consecutive weeks.
Eligibility checks:
  ✓ Capital condition (2 consecutive weeks above floor)
  ✓ No monthly loss cap hit in last 30 days
  ✓ Disciplina ≥ 95% (current 98.2%)
[ Step up to T4 ]   [ Stay at T3 ]
```

User confirms the step-up (don't auto-apply). Step-DOWN is auto-applied
with a notification, no confirmation.

---

## 9. TSR prop-firm pass — separate model

Prop firm evaluation is a **constraint optimization** (30-day pass/fail
with hard rules), not a Kelly optimization. Different math; doesn't
share a ladder with personal capital. Documented separately for
completeness.

### 9.1 TSR Master constraints (from [`tsr-rules-reference.md`](./tsr-rules-reference.md))

- Meta Aprovação: R$7.000 net in 30 days
- Perda Diária: R$1.750 (hard stop)
- Perda Total: R$14.000 (immediate disqualification)
- Consistência: no single day > R$3.500 (50% of Meta) counts toward Meta
- Minimum 10 trading days; once Meta reached, must continue to 10 days
  with average ≥ 50% of pre-Meta average

### 9.2 Recommended sizing for Master pass

| Parameter        | Value         | Math                                                             |
| ---------------- | ------------- | ---------------------------------------------------------------- |
| 1R (fixed BRL)   | **R$400–500** | Daily cap 3R = R$1,200–1,500 leaves R$250+ cushion below R$1,750 |
| Daily loss cap   | -3R           | 70–85% of firm Perda Diária (Steenbarger-style cushion)          |
| Daily win cap    | +5R           | Below Consistência R$3,500 cap (5R × R$500 = R$2,500 < R$3,500)  |
| Weekly loss cap  | -7R           | 25% of Perda Total                                               |
| Monthly loss cap | -20R          | 71% of Perda Total — stop eval before firm DQ                    |
| Withdrawal       | 0%            | Passing eval, not living from this                               |

Optional: **lower 1R to R$400 to raise P(pass)** — variance drops harder
than EV. Counterintuitive but correct: betting smaller in a fixed
budget improves survivor probability more than it lowers expected gain.

### 9.3 Expected pass math (Master)

- EV per trade = +0.18R × R$500 = +R$90
- 4 trades/day × 22 days = 88 trades → expected +R$7,920 (~Meta)
- Std per month = R$500 × 1.49 × √88 = R$6,985
- 1σ band: +R$935 to +R$14,905
- P(meet Meta in 30 days) ≈ 40–55% (rough; Monte Carlo needed)
- P(hit Perda Total) ≈ 5–10%

Multiple eval attempts (allowed within 6 months for platform cost only)
compound the success probability. P(pass in 3 attempts) ≈ 80%.

---

## 10. Implementation checklist

- [ ] Schema: add `yearly_plan_profile_id` FK on yearly plan row;
      either reuse `riskManagementProfiles` table or new
      `yearlyPlanProfiles` table (recommend new — different domain)
- [ ] Seed 3 preset profiles (`yearly_plan_conservativo`,
      `yearly_plan_moderado`, `yearly_plan_agressivo`) with values from
      §2.2, §3, §5
- [ ] Plan editor UI: profile selector + hysteresis status panel + live
      contract derivation panel (§8)
- [ ] Tier-crossing logic + hysteresis evaluator (server-side hook,
      runs on equity update events)
- [ ] OCO recalculation hook: on OCO publish, derive contracts per
      asset for current tier; persist `derived_contracts_by_asset` so
      the trader can see what to enter
- [ ] Monte Carlo simulation in `risk-simulation/` panel using the
      profile params and the actual trade R-distribution from the
      active account; show P10/P50/P90 ending capital + max DD over a
      1-year horizon (12,000 trade-path simulations recommended)
- [ ] Replace Assertividade default of 50% with measured rate from
      `tradeStats` over the trailing window (last 90 days or all
      trades, configurable)
- [ ] Add Disciplina monitor that affects step-up eligibility (already
      tracked; just expose it to the plan engine)

---

## 11. Open questions / future work

- **Should consecutive-losing-weeks force-step-down be 2 or 3?** Need
  Monte Carlo to compare false-positive rate (forced step down then
  market reverts) vs missed-protection rate.
- **Should the f_target curve be flat across tiers (single fraction)
  or slightly increasing (Kelly-pure)?** Current proposal keeps it
  flat (operationally simpler); a slight ramp-up at T4/T5 once edge
  proven would be more Kelly-pure but adds another parameter.
- **Cross-asset sizing**: current proposal applies same `target_1R_brl`
  to WIN and WDO. If trader runs both simultaneously, simultaneous
  risk is 2 × target_1R. Should there be a portfolio-level cap?
- **Tier rollback on regime change**: should there be an explicit
  "regime change detected" force-step-down rule? E.g., if 30-day rolling
  EV per trade drops below a threshold, force step down regardless of
  capital or caps.
- **Aggressive auto step-down on streak**: currently 3 consecutive
  losing weeks. Should it be 2 weeks for Conservativo (more sensitive
  protection) and 4 weeks for Agressivo (more tolerance)?

---

## 11. Aggressive re-grill against live data (2026-06-10)

> **Status**: Aggressive `f_target` lifted from 1.00% → 1.25% per R on
> 2026-06-10 by principal override (Ygor) after grilling. Override is
> documented because the live sample size at the time of the change is
> below the level at which the analysis assistant would have recommended
> the lift on its own. See "Risk acknowledgement" subsection below.

### 11.1 Why this section exists

The original Aggressive (1.00% per R) was calibrated against the
**Hawks Backtest 2026** stats (n=291, EV +0.18R, std 1.49R, observed
max DD 53.3%). On 2026-06-10, 8 live trading days had completed (Jun 1
→ Jun 10) producing n=22 live trades on Hawk T2 Live. The live numbers
came in materially better than the backtest and Ygor asked to update
Aggressive accordingly.

### 11.2 Live stats (verified from `trades` table, not eyeballed)

Source: `GET /api/arch/analytics/stats?accountId=911ade51-...` on
2026-06-10, plus per-trade `realizedRMultiple` aggregation.

| Stat                       | Live (n=22, 8d) | Backtest (n=291, 60d) | Δ       |
| -------------------------- | --------------- | --------------------- | ------- |
| EV per trade (all)         | **+0.520R**     | +0.18R                | +0.34R  |
| Std dev per trade          | **1.519R**      | 1.49R                 | ≈ flat  |
| Sharpe per-trade           | **0.343**       | 0.121                 | 2.8×    |
| Hit rate (signed, excl BE) | **52.9%**       | 32.1%                 | +20.8pp |
| Avg win                    | **+2.06R**      | +3.00R                | -0.94R  |
| Avg loss                   | **-0.59R**      | -1.00R                | +0.41R  |
| 95% CI on EV               | **±0.635R**     | ±0.171R               | 3.7×    |

The avg-win compression (+2.06R live vs +3.00R BT) is consistent with
the W23/W24 OCO trail rule cutting runners before full 3R target on
several trades (Jun 5 #14, Jun 10 #21). Avg loss compression
(-0.59R vs -1.00R) reflects that 4 of the 5 "BE" trades technically
posted as small losses (-0.02R to -0.40R) rather than full stop-outs.

### 11.3 Kelly math, two versions

```
full_Kelly_per_R = EV / Var
Var = std² per trade
```

| Source      | EV   | Var (R²) | Full Kelly | Quarter Kelly | Kelly/6 | Kelly/8         | Kelly/18  |
| ----------- | ---- | -------- | ---------- | ------------- | ------- | --------------- | --------- |
| Backtest    | 0.18 | 2.22     | 8.1%       | 2.0%          | 1.35%   | **1.00%** (old) | 0.45%     |
| Live (n=22) | 0.52 | 2.31     | 22.5%      | 5.6%          | 3.75%   | 2.81%           | **1.25%** |

The 1.25% target sits at Kelly/6 against backtest (vs Kelly/8 before)
and at Kelly/18 against live data. The asymmetric framing is
intentional: it lifts toward the live data but treats the backtest as
the stable prior, not a thing to be discarded after 22 trades.

### 11.4 Drawdown implications

DD scales roughly linearly with R% and with √n in long samples (the
backtest's 53.3% DD at 1.26% per R is the empirical anchor):

| 1R as % equity            | Projected max DD | Account at 30%-DD floor | Result                                        |
| ------------------------- | ---------------- | ----------------------- | --------------------------------------------- |
| 1.00% (old Aggressive)    | ~42%             | T-floor at 70% of peak  | Capital R$5k → trough R$2.9k (T0)             |
| 1.25% (new Aggressive)    | ~52%             | T-floor at 60% of peak  | Capital R$5k → trough R$2.4k (T0, force-stop) |
| 1.26% (backtest realized) | 53.3% (observed) | —                       | —                                             |

A 52% expected DD on a R$5k starting account drops trough capital
**below the T0 floor (R$5k)**. The ladder's own stop-trading rule
would force-pause the account in that scenario — that's correct
behavior, but it means a fresh-start Aggressive user has a real
probability of triggering a stop in the first 6–12 months.

For an established T3+ account (R$30k+ capital), the 52% DD trough
lands at R$14.4k = below T2 floor (R$15k) → forced step-down to T1.
Mechanical, recoverable, but ugly.

### 11.5 The honest risk acknowledgement (override audit trail)

**What the data DOES support at n=22:**

- Edge is positive with high confidence (point EV +0.52R, lower 95%
  bound -0.115R is still well above ruinous loss-rate).
- Std is consistent with backtest (1.52R vs 1.49R) → variance behaviour
  not changing.
- Hit rate jump (+20.8pp) is statistically meaningful but small-n
  inflated; long-run hit rate likely lower.

**What the data does NOT support at n=22:**

- That EV is stably above +0.30R (lower 95% bound is essentially zero).
- That the live numbers will persist across regime changes (8 days
  doesn't span Fed days, end-of-quarter, vol-spike events).
- That worst-case streak observed (2L in a row, Jun 5) reflects worst-
  case streak ahead. Backtest had 5–7L runs.

**The analysis assistant's recommended position before override**:
keep Aggressive at 1.00%, add a §11 unlock gate (n≥50, 30d-rolling
EV≥0.30R, std≤2.0R, no DD>30%), promote automatically when gate passes.

**Why Ygor overrode**: deliberate principal call to size into observed
strength. Documented here for accountability.

### 11.6 Reversal triggers (added 2026-06-10 as part of the override)

If ANY of the following hold on a rolling 30-day window after the
override, **Aggressive `f_target` reverts to 1.00%** mechanically:

- 30-day rolling EV drops below **+0.20R**
- 30-day rolling std rises above **2.5R**
- Live drawdown exceeds **35%** of peak capital
- 5 consecutive losing weeks
- Disciplina drops below 90%

Reversal is automatic, no discretion. Ladder editor should display
both the current `f_target` and the rolling-30d-EV side-by-side so the
gap to reversal is always visible.

### 11.7 Reassessment cadence post-override

| n live trades | Action                                                          |
| ------------- | --------------------------------------------------------------- |
| n < 50        | Monitor weekly. Reversal triggers active.                       |
| 50 ≤ n < 100  | Compute fresh EV/Var. Re-evaluate `f_target` formally.          |
| n ≥ 100       | Backtest "+ live" combined dataset becomes the canonical input. |

If at n=100 the combined dataset shows EV between +0.15R and +0.30R
(i.e. live regressed toward backtest mean), revert Aggressive to
1.00%. If EV stays ≥ +0.40R combined, the 1.25% is validated and
stays.

---

## 12. References

- Hawks Backtest 2026 — 291 trades, 100% Disciplina, +0.18R per trade
  EV, 53.3% max DD (source: ygor@axion.com `Hawks Backtest 2026` account)
- [`tsr-rules-reference.md`](./tsr-rules-reference.md) — TSR evaluation
  rule constraints
- [`kelly-fractional-flowchart.md`](./kelly-fractional-flowchart.md) —
  Kelly methodology reference
- [`fixed-fractional-flowchart.md`](./fixed-fractional-flowchart.md) —
  Fixed-fractional Tharp methodology (this design is a sampled
  fixed-fractional with tier hysteresis)
- [Vault — Risk MM Mastersheet](../../../../../ygorbravim/vault/wiki/_shared/risk-money-management-mastersheet.md)
  — full intellectual lineage (Bernoulli → Markowitz → Kelly → Thorp →
  Wilder → Turtles → Vince → Tharp → Carver → Lopez de Prado → Taleb),
  six schools of thought, Hawks-specific mapping
