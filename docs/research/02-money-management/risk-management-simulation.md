# Trading Risk Management - Rules & Path Simulation

## 1. Strategy Rules (Extracted from Flowchart)

### Risk Limits

| Scope         | Max Loss    |
| ------------- | ----------- |
| Per Operation | R$ 500.00   |
| Daily         | R$ 1,000.00 |
| Weekly        | R$ 2,000.00 |
| Monthly       | R$ 7,500.00 |

### Execution Constraints

| Rule              | Value        |
| ----------------- | ------------ |
| Minimum Stop      | 100 points   |
| Maximum Contracts | 20 contracts |

### Operating Hours

09:01 to 17:00

### Position Sizing

The number of contracts per trade is derived from the risk amount and stop distance:

```
Contracts = Risk Amount / (Stop in points * Point Value per contract)
```

**Hard constraints apply after calculation:**

- If contracts > 20: **cap at 20** (actual risk will be lower than planned)
- If stop < 100 points: **widen stop to 100** and recalculate contracts

#### Example: WIN Mini-Index (R$0.20 per point per contract)

| Trade     | Risk                    | Stop 100pt                   | Stop 150pt | Stop 200pt | Stop 300pt |
| --------- | ----------------------- | ---------------------------- | ---------- | ---------- | ---------- |
| T1        | R$500                   | 25 -> **20 (capped)**        | 16         | 12         | 8          |
| T2        | R$250                   | 12                           | 8          | 6          | 4          |
| T3        | R$125                   | 6                            | 4          | 3          | 2          |
| T4        | R$125                   | 6                            | 4          | 3          | 2          |
| Gain mode | 30% of gains (variable) | depends on accumulated gains | —          | —          | —          |

**Note:** At 100-point stops, Trade 1 hits the 20-contract cap (effective risk R$400 instead of R$500). Gain-mode trades use 30% of accumulated gains as risk, so contract counts vary and are recalculated per trade.

### Two Operating Modes

The strategy operates in one of two modes depending on the outcome of the **first trade** of the day:

---

#### MODE A: Loss Recovery (First Trade = LOSS)

When the first trade loses, enter a **4-trade recovery sequence** with decreasing position sizes:

```
Trade 1: R$500 risk  (always LOSS - this triggers the mode)
Trade 2: R$250 risk  (50% of trade 1)
Trade 3: R$125 risk  (50% of trade 2)
Trade 4: R$125 risk  (same as trade 3 - FINAL, stop regardless of result)
```

**Key rule:** All 4 trades are executed regardless of intermediate results. After trade 4, the day is over for this sequence.

**Maximum loss:** 500 + 250 + 125 + 125 = **R$1,000** (matches daily limit exactly)

---

#### MODE B: Gain Compounding (First Trade = GAIN)

When the first trade wins, continue trading with **30% of accumulated gains as risk** until one of:

1. **Accumulated gains >= R$1,500** --> Stop (daily target hit)
2. **A LOSS occurs** --> Stop (you keep 70% of accumulated gains)

```
Trade 1: Risk R$500, WIN (+R$500 * RR)     --> accumulated = gain. Check target.
Trade 2: Risk = 30% of accumulated gains    --> WIN? add to accumulated. Check target.
Trade 3: Risk = 30% of NEW accumulated      --> WIN? add to accumulated. Check target.
...continues until LOSS or target reached
```

**On LOSS:** You lose only 30% of accumulated gains. The remaining 70% is yours for the day.

**The cycle repeats:** WIN --> update accumulated --> check target --> calculate 30% risk --> next trade.

---

## 2. Loss Recovery Mode - All 8 Paths

After the first trade (always LOSS at R$500), trades 2-4 each produce either a LOSS or GAIN. This creates **8 possible paths** (2^3 = 8):

| Path | Trade 2 | Trade 3 | Trade 4 | Pattern |
| ---- | ------- | ------- | ------- | ------- |
| 1    | LOSS    | LOSS    | LOSS    | L-L-L-L |
| 2    | LOSS    | LOSS    | GAIN    | L-L-L-G |
| 3    | LOSS    | GAIN    | LOSS    | L-L-G-L |
| 4    | LOSS    | GAIN    | GAIN    | L-L-G-G |
| 5    | GAIN    | LOSS    | LOSS    | L-G-L-L |
| 6    | GAIN    | LOSS    | GAIN    | L-G-L-G |
| 7    | GAIN    | GAIN    | LOSS    | L-G-G-L |
| 8    | GAIN    | GAIN    | GAIN    | L-G-G-G |

### Path Probability Formula

For a given Win Rate (WR), the probability of each path depends on which trades are wins (W) vs losses (L) in trades 2-4:

```
P(path) = WR^(number of wins in trades 2-4) * (1-WR)^(number of losses in trades 2-4)
```

### Path Result Formula

For a given Reward:Risk ratio (RR), each trade produces:

- **LOSS:** -trade_size
- **GAIN:** +trade_size \* RR

```
Result = -500 + Σ(trade_i outcome)
```

Where trade sizes are: [500, 250, 125, 125] and trade 1 is always LOSS.

---

## 3. Gain Compounding Mode - Path Analysis

**Rule:** After the first WIN, each subsequent trade risks **30% of accumulated gains**. On a loss, you keep the remaining 70%.

### How It Works Step by Step

```
accumulated = first_win_amount          (R$500 * RR)
LOOP:
  if accumulated >= 1500 → STOP (target hit)
  risk = 0.30 * accumulated
  take trade:
    WIN  → accumulated += risk * RR     (gains grow)
    LOSS → accumulated -= risk          (lose 30%, keep 70%)
           STOP
```

### Gain Mode Walkthrough: R:R 1:1.5

| Step   | Accumulated | Risk (30%) | If WIN (+risk\*1.5) | If LOSS (keep 70%) |
| ------ | ----------- | ---------- | ------------------- | ------------------ |
| T1 WIN | R$750       | —          | —                   | —                  |
| T2     | R$750       | R$225      | acc = R$1,087.50    | keep R$525         |
| T3     | R$1,087.50  | R$326.25   | acc = R$1,576.88    | keep R$761.25      |

Target hit after 3 consecutive wins (+R$1,577). On loss at any step, you still walk away positive.

### Gain Mode Walkthrough: R:R 1:1

| Step   | Accumulated | Risk (30%) | If WIN (+risk\*1) | If LOSS (keep 70%) |
| ------ | ----------- | ---------- | ----------------- | ------------------ |
| T1 WIN | R$500       | —          | —                 | —                  |
| T2     | R$500       | R$150      | acc = R$650       | keep R$350         |
| T3     | R$650       | R$195      | acc = R$845       | keep R$455         |
| T4     | R$845       | R$253.50   | acc = R$1,098.50  | keep R$591.50      |
| T5     | R$1,098.50  | R$329.55   | acc = R$1,428.05  | keep R$768.95      |
| T6     | R$1,428.05  | R$428.42   | acc = R$1,856.47  | keep R$999.63      |

Target hit after 6 consecutive wins (+R$1,856). Needs more wins but risk is always controlled.

### Wins to Target by R:R

| R:R   | 1st Win | Wins to Target | P(Target) at 65% WR | P(Target) at 45% WR |
| ----- | ------- | -------------- | ------------------- | ------------------- |
| 1:4   | R$2,000 | 1 (instant)    | 65.0%               | 45.0%               |
| 1:3   | R$1,500 | 1 (instant)    | 65.0%               | 45.0%               |
| 1:1.5 | R$750   | 3              | 42.3%               | 9.1%                |
| 1:1   | R$500   | 6              | 7.5%                | 0.8%                |
| 1:0.8 | R$400   | 8              | 2.3%                | 0.2%                |
| 1:0.5 | R$250   | 14             | 0.1%                | ~0%                 |
| 1:0.3 | R$150   | 25+            | ~0%                 | ~0%                 |

### Key Safety Property

**You can never lose your entire day's gains in gain mode.** A loss only takes 30% of accumulated gains. Even the worst-case gain-mode outcome (1 WIN then immediate LOSS) leaves you with 70% of your first win:

```
Worst gain-mode outcome = first_win * 0.70 = R$500 * RR * 0.70
```

| R:R   | First Win | Worst Gain-Mode Outcome (1W, 1L) |
| ----- | --------- | -------------------------------- |
| 1:4   | R$2,000   | +R$2,000 (target hit, no T2)     |
| 1:3   | R$1,500   | +R$1,500 (target hit, no T2)     |
| 1:1.5 | R$750     | +R$525                           |
| 1:1   | R$500     | +R$350                           |
| 1:0.8 | R$400     | +R$280                           |
| 1:0.5 | R$250     | +R$175                           |
| 1:0.3 | R$150     | +R$105                           |

---

## 4. Full Simulation - 9 Strategy Profiles

---

### PROFILE 1: WR 65% + R:R 1:1.5 (Good - Consistent)

**Per-trade:** Win = R$750 | Loss = R$500 | PF = 2.79

#### Loss Recovery Paths

| Path    | T1   | T2   | T3      | T4      | **Result**      | Prob   |
| ------- | ---- | ---- | ------- | ------- | --------------- | ------ |
| L-L-L-L | -500 | -250 | -125    | -125    | **-R$1,000.00** | 4.29%  |
| L-L-L-G | -500 | -250 | -125    | +187.50 | **-R$687.50**   | 7.96%  |
| L-L-G-L | -500 | -250 | +187.50 | -125    | **-R$687.50**   | 7.96%  |
| L-L-G-G | -500 | -250 | +187.50 | +187.50 | **-R$375.00**   | 14.79% |
| L-G-L-L | -500 | +375 | -125    | -125    | **-R$375.00**   | 7.96%  |
| L-G-L-G | -500 | +375 | -125    | +187.50 | **-R$62.50**    | 14.79% |
| L-G-G-L | -500 | +375 | +187.50 | -125    | **-R$62.50**    | 14.79% |
| L-G-G-G | -500 | +375 | +187.50 | +187.50 | **+R$250.00**   | 27.46% |

**E[Loss Mode] = -R$187.50**

#### Gain Compounding Paths (30% risk rule, need 3 wins for target)

| Path        | Accumulated | Risk     | Result                   | Probability |
| ----------- | ----------- | -------- | ------------------------ | ----------- |
| 1W, 1L      | R$750       | R$225    | keep 70% = **+R$525**    | 35.00%      |
| 2W, 1L      | R$1,087.50  | R$326.25 | keep 70% = **+R$761.25** | 22.75%      |
| 3W (target) | R$1,576.88  | —        | **+R$1,576.88**          | 42.25%      |

**E[Gain Mode] = 0.35(525) + 0.2275(761.25) + 0.4225(1576.88) = +R$1,022.76**

#### Daily Expected Value

```
E[day] = 0.65 * R$1,022.76 + 0.35 * (-R$187.50) = +R$599.17
Monthly (22 days): +R$13,182
```

---

### PROFILE 2: WR 45% + R:R 1:3 (Good - Trend Following)

**Per-trade:** Win = R$1,500 | Loss = R$500 | PF = 2.45

#### Loss Recovery Paths

| Path    | T1   | T2   | T3   | T4   | **Result**      | Prob   |
| ------- | ---- | ---- | ---- | ---- | --------------- | ------ |
| L-L-L-L | -500 | -250 | -125 | -125 | **-R$1,000.00** | 16.64% |
| L-L-L-G | -500 | -250 | -125 | +375 | **-R$500.00**   | 13.61% |
| L-L-G-L | -500 | -250 | +375 | -125 | **-R$500.00**   | 13.61% |
| L-L-G-G | -500 | -250 | +375 | +375 | **R$0.00**      | 11.14% |
| L-G-L-L | -500 | +750 | -125 | -125 | **R$0.00**      | 13.61% |
| L-G-L-G | -500 | +750 | -125 | +375 | **+R$500.00**   | 11.14% |
| L-G-G-L | -500 | +750 | +375 | -125 | **+R$500.00**   | 11.14% |
| L-G-G-G | -500 | +750 | +375 | +375 | **+R$1,000.00** | 9.11%  |

**E[Loss Mode] = -R$100.00**

#### Gain Compounding Paths (1 win hits target immediately!)

| Path        | Result          | Probability |
| ----------- | --------------- | ----------- |
| 1W (target) | **+R$1,500.00** | 100%        |

With R:R of 1:3, a single win yields R$1,500 >= target. Day is done immediately.

**E[Gain Mode] = +R$1,500.00**

#### Daily Expected Value

```
E[day] = 0.45 * R$1,500 + 0.55 * (-R$100) = +R$620.00
Monthly (22 days): +R$13,640
```

---

### PROFILE 3: WR 35% + R:R 1:4 (Good - Breakout/Momentum)

**Per-trade:** Win = R$2,000 | Loss = R$500 | PF = 2.15

#### Loss Recovery Paths

| Path    | T1   | T2     | T3   | T4   | **Result**      | Prob   |
| ------- | ---- | ------ | ---- | ---- | --------------- | ------ |
| L-L-L-L | -500 | -250   | -125 | -125 | **-R$1,000.00** | 27.46% |
| L-L-L-G | -500 | -250   | -125 | +500 | **-R$375.00**   | 14.79% |
| L-L-G-L | -500 | -250   | +500 | -125 | **-R$375.00**   | 14.79% |
| L-L-G-G | -500 | -250   | +500 | +500 | **+R$250.00**   | 7.96%  |
| L-G-L-L | -500 | +1,000 | -125 | -125 | **+R$250.00**   | 14.79% |
| L-G-L-G | -500 | +1,000 | -125 | +500 | **+R$875.00**   | 7.96%  |
| L-G-G-L | -500 | +1,000 | +500 | -125 | **+R$875.00**   | 7.96%  |
| L-G-G-G | -500 | +1,000 | +500 | +500 | **+R$1,500.00** | 4.29%  |

**E[Loss Mode] = -R$125.00**

#### Gain Compounding Paths (1 win hits target immediately!)

| Path        | Result          | Probability |
| ----------- | --------------- | ----------- |
| 1W (target) | **+R$2,000.00** | 100%        |

**E[Gain Mode] = +R$2,000.00**

#### Daily Expected Value

```
E[day] = 0.35 * R$2,000 + 0.65 * (-R$125) = +R$618.75
Monthly (22 days): +R$13,613
```

---

### PROFILE 4: WR 75% + R:R 1:1 (Good - Scalper)

**Per-trade:** Win = R$500 | Loss = R$500 | PF = 3.00

#### Loss Recovery Paths

| Path    | T1   | T2   | T3   | T4   | **Result**      | Prob   |
| ------- | ---- | ---- | ---- | ---- | --------------- | ------ |
| L-L-L-L | -500 | -250 | -125 | -125 | **-R$1,000.00** | 1.56%  |
| L-L-L-G | -500 | -250 | -125 | +125 | **-R$750.00**   | 4.69%  |
| L-L-G-L | -500 | -250 | +125 | -125 | **-R$750.00**   | 4.69%  |
| L-L-G-G | -500 | -250 | +125 | +125 | **-R$500.00**   | 14.06% |
| L-G-L-L | -500 | +250 | -125 | -125 | **-R$500.00**   | 4.69%  |
| L-G-L-G | -500 | +250 | -125 | +125 | **-R$250.00**   | 14.06% |
| L-G-G-L | -500 | +250 | +125 | -125 | **-R$250.00**   | 14.06% |
| L-G-G-G | -500 | +250 | +125 | +125 | **R$0.00**      | 42.19% |

**E[Loss Mode] = -R$250.00**

#### Gain Compounding Paths (30% risk rule, need 6 wins for target)

| Step      | Accumulated | Risk (30%) | If WIN       | If LOSS (keep 70%) | P(stop here) |
| --------- | ----------- | ---------- | ------------ | ------------------ | ------------ |
| T1 W      | R$500       | —          | —            | —                  | —            |
| T2        | R$500       | R$150      | acc=R$650    | **+R$350**         | 25.00%       |
| T3        | R$650       | R$195      | acc=R$845    | **+R$455**         | 18.75%       |
| T4        | R$845       | R$253.50   | acc=R$1,099  | **+R$592**         | 14.06%       |
| T5        | R$1,099     | R$329.55   | acc=R$1,428  | **+R$769**         | 10.55%       |
| T6        | R$1,428     | R$428.42   | acc=R$1,857  | **+R$1,000**       | 7.91%        |
| 6W target | —           | —          | **+R$1,857** | —                  | 23.73%       |

**E[Gain Mode] = 0.25(350) + 0.1875(455) + 0.1406(592) + 0.1055(769) + 0.0791(1000) + 0.2373(1857) = +R$791.60**

#### Daily Expected Value

```
E[day] = 0.75 * R$791.60 + 0.25 * (-R$250) = +R$531.20
Monthly (22 days): +R$11,686
```

---

### PROFILE 5: WR 50% + R:R 1:1 (Borderline - Breakeven)

**Per-trade:** Win = R$500 | Loss = R$500 | PF = 1.00

#### Loss Recovery Paths

| Path    | T1   | T2   | T3   | T4   | **Result**      | Prob   |
| ------- | ---- | ---- | ---- | ---- | --------------- | ------ |
| L-L-L-L | -500 | -250 | -125 | -125 | **-R$1,000.00** | 12.50% |
| L-L-L-G | -500 | -250 | -125 | +125 | **-R$750.00**   | 12.50% |
| L-L-G-L | -500 | -250 | +125 | -125 | **-R$750.00**   | 12.50% |
| L-L-G-G | -500 | -250 | +125 | +125 | **-R$500.00**   | 12.50% |
| L-G-L-L | -500 | +250 | -125 | -125 | **-R$500.00**   | 12.50% |
| L-G-L-G | -500 | +250 | -125 | +125 | **-R$250.00**   | 12.50% |
| L-G-G-L | -500 | +250 | +125 | -125 | **-R$250.00**   | 12.50% |
| L-G-G-G | -500 | +250 | +125 | +125 | **R$0.00**      | 12.50% |

**E[Loss Mode] = -R$500.00**

#### Gain Compounding Paths (30% risk rule, need 6 wins — same structure as Profile 4)

| Step      | Accumulated | Risk (30%) | If LOSS (keep 70%) | P(stop here) |
| --------- | ----------- | ---------- | ------------------ | ------------ |
| T2        | R$500       | R$150      | **+R$350**         | 50.00%       |
| T3        | R$650       | R$195      | **+R$455**         | 25.00%       |
| T4        | R$845       | R$253.50   | **+R$592**         | 12.50%       |
| T5        | R$1,099     | R$329.55   | **+R$769**         | 6.25%        |
| T6        | R$1,428     | R$428.42   | **+R$1,000**       | 3.13%        |
| 6W target | —           | —          | **+R$1,857**       | 3.13%        |

**E[Gain Mode] = 0.50(350) + 0.25(455) + 0.125(592) + 0.0625(769) + 0.0313(1000) + 0.0313(1857) = +R$447.70**

#### Daily Expected Value

```
E[day] = 0.50 * R$447.70 + 0.50 * (-R$500) = -R$26.15
Monthly (22 days): -R$575
```

**Now clearly negative.** The 30% rule is safer but can't manufacture an edge where none exists.

---

### PROFILE 6: WR 60% + R:R 1:0.8 (Borderline - Fragile Edge)

**Per-trade:** Win = R$400 | Loss = R$500 | PF = 1.20

#### Loss Recovery Paths

| Path    | T1   | T2   | T3   | T4   | **Result**      | Prob   |
| ------- | ---- | ---- | ---- | ---- | --------------- | ------ |
| L-L-L-L | -500 | -250 | -125 | -125 | **-R$1,000.00** | 6.40%  |
| L-L-L-G | -500 | -250 | -125 | +100 | **-R$775.00**   | 9.60%  |
| L-L-G-L | -500 | -250 | +100 | -125 | **-R$775.00**   | 9.60%  |
| L-L-G-G | -500 | -250 | +100 | +100 | **-R$550.00**   | 14.40% |
| L-G-L-L | -500 | +200 | -125 | -125 | **-R$550.00**   | 9.60%  |
| L-G-L-G | -500 | +200 | -125 | +100 | **-R$325.00**   | 14.40% |
| L-G-G-L | -500 | +200 | +100 | -125 | **-R$325.00**   | 14.40% |
| L-G-G-G | -500 | +200 | +100 | +100 | **-R$100.00**   | 21.60% |

**E[Loss Mode] = -R$460.00**

_Note: Every single path in loss mode is negative. Even the best case (L-G-G-G) still loses R$100._

#### Gain Compounding Paths (30% risk rule, need 8 wins for target)

Growth per win: accumulated _ (1 + 0.30 _ 0.8) = accumulated \* 1.24

| Step      | Accumulated | Risk (30%) | If LOSS (keep 70%) | P(stop here) |
| --------- | ----------- | ---------- | ------------------ | ------------ |
| T1 W      | R$400       | —          | —                  | —            |
| T2        | R$400       | R$120      | **+R$280**         | 40.00%       |
| T3        | R$496       | R$149      | **+R$347**         | 24.00%       |
| T4        | R$615       | R$185      | **+R$431**         | 14.40%       |
| T5        | R$763       | R$229      | **+R$534**         | 8.64%        |
| T6        | R$946       | R$284      | **+R$662**         | 5.18%        |
| T7        | R$1,173     | R$352      | **+R$821**         | 3.11%        |
| T8        | R$1,454     | R$436      | **+R$1,018**       | 1.87%        |
| 8W target | R$1,803     | —          | **+R$1,803**       | 2.80%        |

**Every outcome in gain mode is positive** — the 30% rule means you always keep 70% of gains on a loss.

**E[Gain Mode] = +R$432.78**

#### Daily Expected Value

```
E[day] = 0.60 * R$432.78 + 0.40 * (-R$460) = +R$75.67
Monthly (22 days): +R$1,665
```

**Fragile.** Thin edge, needs 8 consecutive wins for target (2.8% chance). One bad week wipes the month.

---

### PROFILE 7: WR 80% + R:R 1:0.3 (Bad - Illusory Win Rate)

**Per-trade:** Win = R$150 | Loss = R$500 | PF = 1.20

_Note: The per-trade expectancy is technically positive (+R$20), but the management system exposes how fragile this is._

#### Loss Recovery Paths

| Path    | T1   | T2   | T3     | T4     | **Result**      | Prob   |
| ------- | ---- | ---- | ------ | ------ | --------------- | ------ |
| L-L-L-L | -500 | -250 | -125   | -125   | **-R$1,000.00** | 0.80%  |
| L-L-L-G | -500 | -250 | -125   | +37.50 | **-R$837.50**   | 3.20%  |
| L-L-G-L | -500 | -250 | +37.50 | -125   | **-R$837.50**   | 3.20%  |
| L-L-G-G | -500 | -250 | +37.50 | +37.50 | **-R$675.00**   | 12.80% |
| L-G-L-L | -500 | +75  | -125   | -125   | **-R$675.00**   | 3.20%  |
| L-G-L-G | -500 | +75  | -125   | +37.50 | **-R$512.50**   | 12.80% |
| L-G-G-L | -500 | +75  | +37.50 | -125   | **-R$512.50**   | 12.80% |
| L-G-G-G | -500 | +75  | +37.50 | +37.50 | **-R$350.00**   | 51.20% |

**E[Loss Mode] = -R$480.00**

_Every single path is a loss. Even the "best" case (3 wins) still loses R$350. The tiny R:R means wins cannot offset the initial R$500 loss._

#### Gain Compounding Paths (30% risk rule, need ~27 wins for target!)

Growth per win: accumulated _ (1 + 0.30 _ 0.3) = accumulated \* **1.09**

With R:R 0.3, gains compound at only 9% per win. Starting from R$150, reaching R$1,500 requires approximately **27 consecutive wins** (P = 0.80^26 = 0.24%).

| Step       | If LOSS (keep 70%) | P(stop here) |
| ---------- | ------------------ | ------------ |
| 1W, 1L     | **+R$105**         | 20.00%       |
| 2W, 1L     | **+R$114**         | 16.00%       |
| 5W, 1L     | **+R$153**         | 6.55%        |
| 10W, 1L    | **+R$235**         | 2.15%        |
| 20W, 1L    | **+R$556**         | 0.23%        |
| 27W target | **+R$1,537**       | 0.24%        |

**With 30% rule, every outcome is at least +R$105** — no more net losses in gain mode. But growth is painfully slow: after 10 consecutive wins you've only accumulated R$336.

**E[Gain Mode] = +R$163.72**

#### Daily Expected Value

```
E[day] = 0.80 * R$163.72 + 0.20 * (-R$480) = +R$34.98
Monthly (22 days): +R$770
```

**Essentially dead money.** Technically positive, but fees erase it. The 30% rule protects you from net losses in gain mode (unlike fixed R$500 risk), but can't fix the core problem: R:R 1:0.3 grows too slowly to ever reach target.

---

### PROFILE 8: WR 35% + R:R 1:1 (Bad - No Edge)

**Per-trade:** Win = R$500 | Loss = R$500 | PF = 0.54

#### Loss Recovery Paths

| Path    | T1   | T2   | T3   | T4   | **Result**      | Prob   |
| ------- | ---- | ---- | ---- | ---- | --------------- | ------ |
| L-L-L-L | -500 | -250 | -125 | -125 | **-R$1,000.00** | 27.46% |
| L-L-L-G | -500 | -250 | -125 | +125 | **-R$750.00**   | 14.79% |
| L-L-G-L | -500 | -250 | +125 | -125 | **-R$750.00**   | 14.79% |
| L-L-G-G | -500 | -250 | +125 | +125 | **-R$500.00**   | 7.96%  |
| L-G-L-L | -500 | +250 | -125 | -125 | **-R$500.00**   | 14.79% |
| L-G-L-G | -500 | +250 | -125 | +125 | **-R$250.00**   | 7.96%  |
| L-G-G-L | -500 | +250 | +125 | -125 | **-R$250.00**   | 7.96%  |
| L-G-G-G | -500 | +250 | +125 | +125 | **R$0.00**      | 4.29%  |

**E[Loss Mode] = -R$650.00**

_Worst loss mode of all profiles. 27.46% chance of maximum -R$1,000 loss. Only 4.29% chance of breaking even._

#### Gain Compounding Paths (30% risk rule, need 6 wins — same structure as Profile 4)

| Step      | Accumulated | Risk (30%) | If LOSS (keep 70%) | P(stop here) |
| --------- | ----------- | ---------- | ------------------ | ------------ |
| T2        | R$500       | R$150      | **+R$350**         | 65.00%       |
| T3        | R$650       | R$195      | **+R$455**         | 22.75%       |
| T4        | R$845       | R$253.50   | **+R$592**         | 7.96%        |
| T5        | R$1,099     | R$329.55   | **+R$769**         | 2.79%        |
| T6        | R$1,428     | R$428.42   | **+R$1,000**       | 0.98%        |
| 6W target | —           | —          | **+R$1,857**       | 0.53%        |

65% of gain-mode entries stop with +R$350 (still positive with 30% rule). Only 0.53% reach target.

**E[Gain Mode] = +R$419.08**

#### Daily Expected Value

```
E[day] = 0.35 * R$419.08 + 0.65 * (-R$650) = -R$275.82
Monthly (22 days): -R$6,068
```

**Still hits monthly risk limit.** The 30% rule makes gain mode always positive, but 65% loss rate makes loss mode dominate.

---

### PROFILE 9: WR 55% + R:R 1:0.5 (Bad - Slow Bleed)

**Per-trade:** Win = R$250 | Loss = R$500 | PF = 0.61

#### Loss Recovery Paths

| Path    | T1   | T2   | T3     | T4     | **Result**      | Prob   |
| ------- | ---- | ---- | ------ | ------ | --------------- | ------ |
| L-L-L-L | -500 | -250 | -125   | -125   | **-R$1,000.00** | 9.11%  |
| L-L-L-G | -500 | -250 | -125   | +62.50 | **-R$812.50**   | 11.14% |
| L-L-G-L | -500 | -250 | +62.50 | -125   | **-R$812.50**   | 11.14% |
| L-L-G-G | -500 | -250 | +62.50 | +62.50 | **-R$625.00**   | 13.61% |
| L-G-L-L | -500 | +125 | -125   | -125   | **-R$625.00**   | 11.14% |
| L-G-L-G | -500 | +125 | -125   | +62.50 | **-R$437.50**   | 13.61% |
| L-G-G-L | -500 | +125 | +62.50 | -125   | **-R$437.50**   | 13.61% |
| L-G-G-G | -500 | +125 | +62.50 | +62.50 | **-R$250.00**   | 16.64% |

**E[Loss Mode] = -R$587.50**

_Every single path is a loss. Best case still loses R$250._

#### Gain Compounding Paths (30% risk rule, need ~14 wins for target)

Growth per win: accumulated _ (1 + 0.30 _ 0.5) = accumulated \* **1.15**

Starting from R$250, reaching R$1,500 requires ~13 additional wins (P = 0.55^13 = 0.04%).

| Step       | If LOSS (keep 70%) | P(stop here) |
| ---------- | ------------------ | ------------ |
| 1W, 1L     | **+R$175**         | 45.00%       |
| 2W, 1L     | **+R$201**         | 24.75%       |
| 3W, 1L     | **+R$232**         | 13.61%       |
| 5W, 1L     | **+R$306**         | 4.12%        |
| 10W, 1L    | **+R$617**         | 0.34%        |
| 14W target | **+R$1,523**       | 0.04%        |

**With 30% rule: all outcomes are positive** (minimum +R$175). But target is nearly unreachable — 45% of entries stop at first loss with just +R$175.

**E[Gain Mode] = +R$213.72**

#### Daily Expected Value

```
E[day] = 0.55 * R$213.72 + 0.45 * (-R$587.50) = -R$146.83
Monthly (22 days): -R$3,230
```

**Still bleeding, but slower.** The 30% rule improved gain mode significantly (all outcomes positive vs. 45% net-loss before), but the negative-expectancy loss mode still dominates.

---

## 5. Summary Comparison

_Gain mode uses 30% of accumulated gains as risk per subsequent trade._

| #   | WR  | R:R   | Category   | E[Gain Mode] | E[Loss Mode] | **Daily E**   | Monthly E (22d) | Verdict            |
| --- | --- | ----- | ---------- | ------------ | ------------ | ------------- | --------------- | ------------------ |
| 2   | 45% | 1:3   | Good       | +R$1,500.00  | -R$100.00    | **+R$620.00** | +R$13,640       | Instant target     |
| 3   | 35% | 1:4   | Good       | +R$2,000.00  | -R$125.00    | **+R$618.75** | +R$13,613       | Huge wins          |
| 1   | 65% | 1:1.5 | Good       | +R$1,022.76  | -R$187.50    | **+R$599.17** | +R$13,182       | Very stable        |
| 4   | 75% | 1:1   | Good       | +R$791.60    | -R$250.00    | **+R$531.20** | +R$11,686       | Consistent         |
| 6   | 60% | 1:0.8 | Borderline | +R$432.78    | -R$460.00    | **+R$75.67**  | +R$1,665        | Thin edge          |
| 7   | 80% | 1:0.3 | Bad        | +R$163.72    | -R$480.00    | **+R$34.98**  | +R$770          | Dead money         |
| 5   | 50% | 1:1   | Borderline | +R$447.70    | -R$500.00    | **-R$26.15**  | -R$575          | Breakeven illusion |
| 9   | 55% | 1:0.5 | Bad        | +R$213.72    | -R$587.50    | **-R$146.83** | -R$3,230        | Slow bleed         |
| 8   | 35% | 1:1   | Bad        | +R$419.08    | -R$650.00    | **-R$275.82** | -R$6,068        | Capital destroyer  |

---

## 6. Risk Limit Impact Analysis

### Days Until Weekly Limit (R$2,000)

Worst case per day = -R$1,000 (all 4 losses in recovery mode).

| Profile | Worst Day | Days to Weekly Limit | Days to Monthly Limit |
| ------- | --------- | -------------------- | --------------------- |
| All     | -R$1,000  | 2 days               | 7.5 days              |

But expected days to hit limits differ by profile:

| Profile        | Avg Loss Days | Expected Weekly Drawdown | Weeks to Monthly Limit |
| -------------- | ------------- | ------------------------ | ---------------------- |
| 1 (65%, 1:1.5) | -R$187.50     | ~10.7 loss-days needed   | Unlikely to hit        |
| 8 (35%, 1:1)   | -R$650.00     | ~3.1 loss-days needed    | ~2.4 weeks             |
| 9 (55%, 1:0.5) | -R$587.50     | ~3.4 loss-days needed    | ~2.6 weeks             |

---

## 7. Key Takeaways

### Does the Management System Make Sense?

**Yes, the core design is sound:**

1. **Anti-Martingale on losses** (500 -> 250 -> 125 -> 125): Reducing size after losses is the mathematically correct approach. Traditional martingale (doubling after losses) leads to ruin. This does the opposite.

2. **Maximum daily loss is hard-capped** at R$1,000 (500+250+125+125), which matches the stated daily limit exactly. Good design.

3. **Asymmetric daily R:R**: Max daily loss = R$1,000, daily gain target = R$1,500. This creates a built-in 1:1.5 risk-reward at the day level.

4. **30% risk in gain mode**: You only risk 30% of accumulated gains per subsequent trade. On a loss, you keep 70%. This means gain mode can never produce a net-negative day — the worst case is keeping 70% of your first win.

5. **Stop-on-first-loss in gain mode**: Protects accumulated intraday gains from being given back.

### Critical Insights from the Simulation

1. **The management system cannot save a bad strategy.** Profiles 8 and 9 lose money regardless of the protective rules. No amount of position sizing fixes negative per-trade expectancy.

2. **The 30% risk rule is a game-changer for gain mode.** Unlike flat R$500 risk, you can never lose more than 30% of accumulated gains — every gain-mode outcome is positive. This eliminates the old problem where gain mode could produce net losses.

3. **High R:R strategies (2, 3) benefit enormously** because a single WIN can hit the daily target immediately. No need for compounding at all — one trade and you're done.

4. **With the 30% rule, high R:R now clearly dominates.** Profiles 2 and 3 top the rankings because they hit target in 1 trade. Profile 1 (1:1.5) needs 3 wins, Profile 4 (1:1) needs 6 wins — the 30% rule slows compounding compared to flat risk but adds safety.

5. **Profile 7 is essentially dead money.** With R:R 1:0.3, accumulated gains grow at only 9% per win. Target requires ~27 consecutive wins (P = 0.24%). Daily E of +R$35 is wiped by any fees.

6. **The borderline zone (Profiles 5-6) is death by a thousand cuts.** The edge is too small to survive real-world friction (fees, slippage, missed fills, emotional errors).

### Execution Constraints Impact

The **minimum stop of 100 points** and **maximum of 20 contracts** create practical boundaries:

1. **At tight stops (100pt):** Trade 1 and gain-mode trades are capped at 20 contracts, which may reduce effective risk below R$500. The system still works — the cap just acts as an additional safety layer.

2. **At wider stops (200pt+):** Contract counts naturally stay well under 20. The constraint is non-binding. Risk amounts are fully utilized.

3. **Loss recovery trades (T2-T4):** With smaller risk amounts (R$250, R$125), these trades naturally use fewer contracts and are unlikely to hit the 20-contract cap at any reasonable stop distance.

4. **The 100-point minimum stop prevents over-leveraging.** Without this floor, a 20-point stop at R$500 risk would require 125 contracts — absurd and dangerous. The floor ensures position sizes remain sensible.

### Minimum Viable Strategy for This Management System

For this risk management framework to be meaningfully profitable:

- **PF must be above ~1.5** (theoretical, before costs)
- **The product WR \* (1 + RR) must be significantly above 1.0**
- **Aim for E[day] > +R$300** to have meaningful buffer against costs and bad variance
