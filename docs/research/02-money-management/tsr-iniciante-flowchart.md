# TSR Iniciante — WIN Risk Management Flowchart

> **Plan:** Iniciante (FREE) | **Instrument:** WIN (Mini-Índice, R$0.20/pt/contract)
>
> **Limits:** Max 2 contracts | Daily Loss R$375 (TSR) / R$200 (ours) | Total Loss R$1,500 | Close 17:00
>
> **Our Config:** Max stop 200pt | T1 risk R$80 | Daily target **~R$220** (partial exit) | Cost R$0.60/ct/side

---

## Main Decision Flow

```mermaid
flowchart TD
    START(["TRADE 1 — 2 contracts<br/>Risk R$80 (200pt stop)"])
    START --> RESULT{"RESULT?"}

    RESULT -- "LOSS  (-R$80)" --> LOSS_ENTRY["Enter LOSS RECOVERY<br/>Drop to 1 contract"]
    RESULT -- "WIN  (~R$220<br/>partial exit)" --> CHECK

    LOSS_ENTRY --> T2

    subgraph LOSS_MODE ["LOSS RECOVERY (1 contract × 3 trades)"]
        direction TB
        T2["Trade 2 — 1 contract<br/>Risk R$40"]
        T2 --> T3["Trade 3 — 1 contract<br/>Risk R$40"]
        T3 --> T4["Trade 4 — 1 contract<br/>Risk R$40 (FINAL)"]
        T4 --> STOP_L@{ shape: dbl-circ, label: "STOP<br/>Day is over<br/>Max loss: R$200" }
    end

    CHECK{"Gain ≥ ~R$220?"}
    CHECK -- "YES" --> TARGET@{ shape: dbl-circ, label: "TARGET HIT<br/>Bank the day" }
    CHECK -- "NO (partial win)" --> DECIDE["Bank partial gain<br/>or 1 more selective trade"]
    DECIDE --> STOP_G@{ shape: dbl-circ, label: "STOP<br/>Protect gains" }

    style START fill:#1f6feb,stroke:#1f6feb,color:#fff
    style RESULT fill:#161b22,stroke:#f0883e,color:#f0883e
    style LOSS_ENTRY fill:#da3633,stroke:#da3633,color:#fff
    style T2 fill:#161b22,stroke:#f0883e,color:#f0883e
    style T3 fill:#161b22,stroke:#f0883e,color:#f0883e
    style T4 fill:#161b22,stroke:#f0883e,color:#f0883e
    style STOP_L fill:#da3633,stroke:#da3633,color:#fff
    style CHECK fill:#161b22,stroke:#f0883e,color:#f0883e
    style TARGET fill:#238636,stroke:#238636,color:#fff
    style DECIDE fill:#161b22,stroke:#58a6ff,color:#58a6ff
    style STOP_G fill:#da3633,stroke:#da3633,color:#fff
    style LOSS_MODE fill:#da363310,stroke:#da3633,color:#f85149
```

---

## Loss Recovery — Size Reduction (2 contracts → 1)

```mermaid
flowchart LR
    T1["Trade 1<br/><b>2 contracts</b><br/>R$80 risk<br/>(LOST)"] -- "÷2 contracts" --> T2["Trade 2<br/><b>1 contract</b><br/>R$40 risk"]
    T2 -- "floor (can't halve)" --> T3["Trade 3<br/><b>1 contract</b><br/>R$40 risk"]
    T3 -- "= T3" --> T4["Trade 4<br/><b>1 contract</b><br/>R$40 risk"]
    T4 --> SUM["MAX LOSS<br/>80+40+40+40<br/>= <b>R$200</b><br/>(53% of R$375 limit)"]

    style T1 fill:#da3633,stroke:#da3633,color:#fff
    style T2 fill:#161b22,stroke:#f0883e,color:#f0883e
    style T3 fill:#161b22,stroke:#f0883e,color:#f0883e
    style T4 fill:#161b22,stroke:#f0883e,color:#f0883e
    style SUM fill:#da363344,stroke:#f85149,color:#f85149
```

**Rules:**

- Execute **all 4 trades** regardless of intermediate wins/losses
- After Trade 4 completes: **STOP for the day, no exceptions**
- Worst case at 200pt = R$200 (53% of daily limit → **7 days to elimination**)
- **Minimum stop: 100 points** | **Maximum stop: 200 points** | **Maximum contracts: 2**

### Position Sizing per Trade (200pt stop)

```
Contracts = Risk Amount / (Stop × R$0.20)
```

| Trade | Contracts | Risk |   Gain at R:R ~2:1    |  Cost  |
| ----- | :-------: | :--: | :-------------------: | :----: |
| T1    |   **2**   | R$80 | ~R$220 (partial exit) | R$2.40 |
| T2    |   **1**   | R$40 |         ~R$80         | R$1.20 |
| T3    |   **1**   | R$40 |         ~R$80         | R$1.20 |
| T4    |   **1**   | R$40 |         ~R$80         | R$1.20 |

### Position Sizing at Other Stops

| Stop   | T1 (2ct) | T2–T4 (1ct) | Max Daily Loss | Days to Elimination |
| ------ | :------: | :---------: | :------------: | :-----------------: |
| 120 pt |   R$48   |    R$24     |     R$120      |         12          |
| 150 pt |   R$60   |    R$30     |     R$150      |         10          |
| 180 pt |   R$72   |    R$36     |     R$180      |          8          |
| 200 pt | **R$80** |  **R$40**   |   **R$200**    |        **7**        |

---

## Loss Recovery — All 8 Paths (200pt, recovery R:R ~2:1, WR 45%)

```mermaid
flowchart TD
    L1["<b>TRADE 1: LOSS</b><br/>2 contracts, -R$80"]
    L1 --> T2{"<b>TRADE 2</b><br/>1ct, risk R$40"}

    T2 -- "LOSS -R$40" --> T3A{"<b>TRADE 3</b><br/>1ct, risk R$40"}
    T2 -- "GAIN +R$80" --> T3B{"<b>TRADE 3</b><br/>1ct, risk R$40"}

    T3A -- "LOSS -R$40" --> T4A{"<b>TRADE 4</b><br/>1ct, risk R$40"}
    T3A -- "GAIN +R$80" --> T4B{"<b>TRADE 4</b><br/>1ct, risk R$40"}
    T3B -- "LOSS -R$40" --> T4C{"<b>TRADE 4</b><br/>1ct, risk R$40"}
    T3B -- "GAIN +R$80" --> T4D{"<b>TRADE 4</b><br/>1ct, risk R$40"}

    T4A -- "LOSS" --> R1
    T4A -- "GAIN" --> R2
    T4B -- "LOSS" --> R3
    T4B -- "GAIN" --> R4
    T4C -- "LOSS" --> R5
    T4C -- "GAIN" --> R6
    T4D -- "LOSS" --> R7
    T4D -- "GAIN" --> R8

    R1["<b>-R$200</b><br/>L-L-L-L<br/>P = 16.6%"]
    R2["<b>-R$80</b><br/>L-L-L-G<br/>P = 13.6%"]
    R3["<b>-R$80</b><br/>L-L-G-L<br/>P = 13.6%"]
    R4["<b>+R$40</b><br/>L-L-G-G<br/>P = 11.1%"]
    R5["<b>-R$80</b><br/>L-G-L-L<br/>P = 13.6%"]
    R6["<b>+R$40</b><br/>L-G-L-G<br/>P = 11.1%"]
    R7["<b>+R$40</b><br/>L-G-G-L<br/>P = 11.1%"]
    R8["<b>+R$160</b><br/>L-G-G-G<br/>P = 9.1%"]

    %% Root
    style L1 fill:#da3633,stroke:#fff,color:#fff,stroke-width:2px

    %% Decision diamonds
    style T2 fill:#1c2128,stroke:#f0883e,color:#f0883e,stroke-width:2px
    style T3A fill:#1c2128,stroke:#f0883e,color:#f0883e,stroke-width:2px
    style T3B fill:#1c2128,stroke:#f0883e,color:#f0883e,stroke-width:2px
    style T4A fill:#1c2128,stroke:#f0883e,color:#f0883e,stroke-width:2px
    style T4B fill:#1c2128,stroke:#f0883e,color:#f0883e,stroke-width:2px
    style T4C fill:#1c2128,stroke:#f0883e,color:#f0883e,stroke-width:2px
    style T4D fill:#1c2128,stroke:#f0883e,color:#f0883e,stroke-width:2px

    %% Results
    style R1 fill:#b91c1c,stroke:#fca5a5,color:#fff,stroke-width:3px
    style R2 fill:#7f1d1d,stroke:#ef4444,color:#fca5a5,stroke-width:2px
    style R3 fill:#7f1d1d,stroke:#ef4444,color:#fca5a5,stroke-width:2px
    style R4 fill:#166534,stroke:#4ade80,color:#fff,stroke-width:2px
    style R5 fill:#7f1d1d,stroke:#ef4444,color:#fca5a5,stroke-width:2px
    style R6 fill:#166534,stroke:#4ade80,color:#fff,stroke-width:2px
    style R7 fill:#166534,stroke:#4ade80,color:#fff,stroke-width:2px
    style R8 fill:#166534,stroke:#4ade80,color:#fff,stroke-width:3px

    linkStyle 0,1,3,5,7,9,11,13 stroke:#f85149,stroke-width:2px
    linkStyle 2,4,6,8,10,12,14 stroke:#3fb950,stroke-width:2px
```

> **Reading the tree:** Follow any path top to bottom. Left/red = LOSS, right/green = GAIN.
>
> - **4 of 8 paths end positive** (+R$40 to +R$160) — 42.4% combined probability
> - **3 paths are moderate losses** (-R$80 each) — 40.8% combined
> - **Only 1 path hits full daily loss** (-R$200) — 16.6% probability
> - **E[Loss Mode] = -R$38** — average cost of entering recovery. Manageable.

---

## Gain Mode — One Trade to Target

Unlike the base system (3 consecutive wins needed), here **1 winning T1 trade ≈ daily target**.

```mermaid
flowchart LR
    subgraph WIN_DAY ["T1 WIN — partial exit on 2 contracts"]
        direction LR
        T1["<b>T1 WIN</b><br/>2ct, partial exit<br/><b>+~R$220</b>"]
        T1 --> HIT["TARGET<br/><b>Bank the day</b>"]
    end

    subgraph PARTIAL ["T1 partial win — runner stopped at breakeven"]
        direction LR
        P1["<b>T1 partial</b><br/>only 1st target hit<br/>+R$50–80"]
        P1 --> OPT{"Take another<br/>trade?"}
        OPT -- "NO" --> BANK["Bank R$50–80"]
        OPT -- "YES (selective)" --> T2P["1 more trade<br/>(protect gains)"]
    end

    style T1 fill:#238636,stroke:#238636,color:#fff
    style HIT fill:#238636,stroke:#238636,color:#fff
    style P1 fill:#161b22,stroke:#f59e0b,color:#fde68a
    style OPT fill:#161b22,stroke:#f0883e,color:#f0883e
    style BANK fill:#161b22,stroke:#58a6ff,color:#58a6ff
    style T2P fill:#161b22,stroke:#238636,color:#3fb950
```

> **No compounding, no 30% rule, no multi-win sequences.** One setup, one partial exit, one target.
> If runner fails (partial win R$50–80), banking the gain is often the right call.

---

## Gain by Stop Distance (T1 partial exit, ~R$220 max gain)

```mermaid
flowchart LR
    subgraph STOPS ["Effective R:R by stop distance"]
        direction TB
        S120["120pt stop<br/>R$48 risk<br/>R:R <b>4.6:1</b>"]
        S150["150pt stop<br/>R$60 risk<br/>R:R <b>3.7:1</b>"]
        S200["200pt stop<br/>R$80 risk<br/>R:R <b>2.75:1</b>"]
    end

    style S120 fill:#238636,stroke:#238636,color:#fff
    style S150 fill:#161b22,stroke:#238636,color:#3fb950
    style S200 fill:#161b22,stroke:#f0883e,color:#f0883e
```

> **Tighter stops = better R:R.** The partial exit gain (~R$220) is based on target distances, not stop size.
> At 150pt: R:R 3.7:1. At 200pt (worst case): still 2.75:1. Both are excellent.

---

## Evaluation Roadmap — 30 Days to R$1,500

```mermaid
flowchart TD
    START2(["START EVALUATION<br/>Budget: R$1,500 | 30 days | Min 10 traded"])
    START2 --> DAY{"Trading Day"}

    DAY --> WIN_DAY["WIN DAY<br/>+~R$220<br/>(1 winning T1 trade)"]
    DAY --> LOSS_DAY["LOSS DAY<br/>-R$80 to -R$200<br/>(recovery mode)"]
    DAY --> FLAT_DAY["FLAT / NO TRADE<br/>R$0 (saves budget)"]

    WIN_DAY --> PROGRESS["Add ~R$220 to total<br/>(well under R$750 cap)"]
    LOSS_DAY --> BUDGET["Subtract from R$1,500 budget<br/>(avg loss ~R$38 in recovery)"]
    FLAT_DAY --> WAIT["Still counts as traded day<br/>if at least 1 trade taken"]

    PROGRESS --> META{"Total ≥ R$1,500<br/>AND ≥ 10 days?"}
    BUDGET --> ELIM{"Total loss<br/>≥ R$1,500?"}

    META -- "YES" --> PASS["PASSED<br/>Submit for approval"]
    META -- "NO" --> DAY
    ELIM -- "YES" --> FAIL["ELIMINATED<br/>Try again after 30 days"]
    ELIM -- "NO" --> DAY

    PASS --> CONSISTENCY{"Consistency check:<br/>Hit meta in < 6 days?"}
    CONSISTENCY -- "NO" --> APPROVED@{ shape: dbl-circ, label: "APPROVED" }
    CONSISTENCY -- "YES" --> CONT["Must trade to 10 days<br/>Avg result ≥ 50% of<br/>previous daily avg"]
    CONT --> APPROVED

    style START2 fill:#1f6feb,stroke:#1f6feb,color:#fff
    style DAY fill:#161b22,stroke:#f0883e,color:#f0883e
    style WIN_DAY fill:#238636,stroke:#238636,color:#fff
    style LOSS_DAY fill:#da3633,stroke:#da3633,color:#fff
    style FLAT_DAY fill:#161b22,stroke:#58a6ff,color:#58a6ff
    style PROGRESS fill:#23863644,stroke:#238636,color:#3fb950
    style BUDGET fill:#da363344,stroke:#da3633,color:#f85149
    style WAIT fill:#161b22,stroke:#8b949e,color:#8b949e
    style META fill:#161b22,stroke:#f0883e,color:#f0883e
    style ELIM fill:#161b22,stroke:#f0883e,color:#f0883e
    style PASS fill:#238636,stroke:#238636,color:#fff
    style FAIL fill:#da3633,stroke:#da3633,color:#fff
    style CONSISTENCY fill:#161b22,stroke:#f0883e,color:#f0883e
    style CONT fill:#161b22,stroke:#58a6ff,color:#58a6ff
    style APPROVED fill:#238636,stroke:#238636,color:#fff
```

> **Realistic path to pass (200pt stop, Approach A):**
>
> - ~9 winning days × R$220 avg = R$1,980
> - ~5 losing days × R$100 avg = -R$500
> - Net ≈ **+R$1,480** → borderline, need 1 more good day or smaller losses
> - At 55%+ WR: ~13 trading days to pass
> - Budget consumed on losses: R$500 of R$1,500 → **67% budget remaining**

---

## Quick Reference

```
═══════════════════════════════════════════════════
  TSR INICIANTE — WIN — DECISION FLOWCHART
═══════════════════════════════════════════════════

  BEFORE MARKET OPEN
  ──────────────────
  □ Daily loss budget: R$200 (4 levels, within R$375)
  □ Remaining total budget: R$1,500 - losses so far
  □ Plan: 2 contracts on T1, 1 contract on recovery

  TRADE 1 (2 contracts, max 200pt stop)
  ──────────────────────────────────────
  WIN (~R$220 partial exit) → STOP, bank the day
  PARTIAL WIN (R$50–80) → bank it or 1 more trade
  LOSS (-R$80) → RECOVERY MODE

  LOSS RECOVERY (1 contract × 3 trades)
  ──────────────────────────────────────
  T2: 1 contract, R$40 risk          Max daily loss:
  T3: 1 contract, R$40 risk          R$80+40+40+40
  T4: 1 contract, FINAL              = R$200
  STOP. Day over.

  BEFORE EVERY TRADE:
  ─────────────────────────────────
  □ Stop >= 100 points?
  □ Stop <= 200 points?
  □ Contracts <= 2?
  □ Still within daily loss limit?
  □ Before 17:00?

  KEY NUMBERS AT 200pt STOP
  ─────────────────────────
  T1 risk:           R$80 (2 contracts)
  T1 gain:           ~R$220 (partial exit)
  Recovery risk:     R$40 (1 contract)
  Recovery gain:     ~R$80 (at R:R 2:1)
  Max daily loss:    R$200 (4 levels)
  Days to elim:      7 worst-case
  Daily target:      ~R$220 (1 winning T1)
  Cost per trade:    R$2.40 (2ct) / R$1.20 (1ct)

═══════════════════════════════════════════════════
```
