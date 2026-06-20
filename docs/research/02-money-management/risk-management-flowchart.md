# Daily Trading Risk Management — Flowchart

> **Limits:** Per Trade R$500 | Daily R$1,000 | Weekly R$2,000 | Monthly R$7,500 | Hours 09:01–17:00
>
> **Execution Rules:** Minimum stop = 100 points | Maximum position = 20 contracts

---

## Main Decision Flow

```mermaid
flowchart TD
    START(["TRADE 1 — Risk R$500"])
    START --> RESULT{"RESULT?"}

    RESULT -- "LOSS  (-R$500)" --> LOSS_ENTRY["Enter LOSS RECOVERY mode"]
    RESULT -- "GAIN  (+R$500 x RR)" --> GAIN_ENTRY["Enter GAIN COMPOUNDING mode"]

    LOSS_ENTRY --> T2
    GAIN_ENTRY --> CHECK

    subgraph LOSS_MODE ["MODE A — LOSS RECOVERY"]
        direction TB
        T2["Trade 2 — Risk R$250<br/>(50% of Trade 1)"]
        T2 --> T3["Trade 3 — Risk R$125<br/>(50% of Trade 2)"]
        T3 --> T4["Trade 4 — Risk R$125<br/>(same as Trade 3, FINAL)"]
        T4 --> STOP_L@{ shape: dbl-circ, label: "STOP<br/>Day is over" }
    end

    subgraph GAIN_MODE ["MODE B — GAIN COMPOUNDING"]
        direction TB
        CHECK{"Accumulated<br/>gains >= R$1,500?"}
        CHECK -- "YES" --> TARGET@{ shape: dbl-circ, label: "TARGET HIT<br/>Stop trading" }
        CHECK -- "NO" --> CALC["Calculate next risk:<br/>30% of last trade's gain"]
        CALC --> NEXT["Next Trade — Risk = 30% of last gain"]
        NEXT --> NR{"Next trade<br/>result?"}
        NR -- "LOSS (-30% of last gain)" --> STOP_G@{ shape: dbl-circ, label: "STOP<br/>Keep remainder" }
        NR -- "GAIN (+risk x RR)" --> CHECK
    end

    style START fill:#1f6feb,stroke:#1f6feb,color:#fff
    style RESULT fill:#161b22,stroke:#f0883e,color:#f0883e
    style LOSS_ENTRY fill:#da3633,stroke:#da3633,color:#fff
    style GAIN_ENTRY fill:#238636,stroke:#238636,color:#fff
    style T2 fill:#161b22,stroke:#f0883e,color:#f0883e
    style T3 fill:#161b22,stroke:#f0883e,color:#f0883e
    style T4 fill:#161b22,stroke:#f0883e,color:#f0883e
    style STOP_L fill:#da3633,stroke:#da3633,color:#fff
    style CHECK fill:#161b22,stroke:#f0883e,color:#f0883e
    style CALC fill:#161b22,stroke:#58a6ff,color:#58a6ff
    style NEXT fill:#161b22,stroke:#238636,color:#3fb950
    style NR fill:#161b22,stroke:#f0883e,color:#f0883e
    style TARGET fill:#238636,stroke:#238636,color:#fff
    style STOP_G fill:#da3633,stroke:#da3633,color:#fff
    style LOSS_MODE fill:#da363310,stroke:#da3633,color:#f85149
    style GAIN_MODE fill:#23863610,stroke:#238636,color:#3fb950
```

---

## Loss Recovery — Size Reduction Sequence

```mermaid
flowchart LR
    T1["Trade 1<br/>R$500<br/>(LOST)"] -- "÷2" --> T2["Trade 2<br/>R$250"]
    T2 -- "÷2" --> T3["Trade 3<br/>R$125"]
    T3 -- "=T3" --> T4["Trade 4<br/>R$125"]
    T4 --> SUM["MAX LOSS<br/>500+250+125+125<br/>= R$1,000"]

    style T1 fill:#da3633,stroke:#da3633,color:#fff
    style T2 fill:#161b22,stroke:#f0883e,color:#f0883e
    style T3 fill:#161b22,stroke:#f0883e,color:#f0883e
    style T4 fill:#161b22,stroke:#f0883e,color:#f0883e
    style SUM fill:#da363344,stroke:#f85149,color:#f85149
```

**Rules:**

- Execute **all 4 trades** regardless of intermediate wins/losses
- After Trade 4 completes: **STOP for the day, no exceptions**
- Worst case = daily limit hit exactly (R$1,000)
- **Minimum stop: 100 points** — never use a stop smaller than this
- **Maximum position: 20 contracts** — never exceed this regardless of risk budget

### Position Sizing per Trade

```
Contracts = Risk Amount / (Stop in points * Point Value per contract)
```

| Trade | Risk  | Stop 100pt (R$0.20/pt) | Stop 150pt (R$0.20/pt) | Stop 200pt (R$0.20/pt) | Hard Cap |
| ----- | ----- | ---------------------- | ---------------------- | ---------------------- | -------- |
| T1    | R$500 | 25 -> **20 (capped)**  | 16                     | 12                     | 20 max   |
| T2    | R$250 | 12                     | 8                      | 6                      | 20 max   |
| T3    | R$125 | 6                      | 4                      | 3                      | 20 max   |
| T4    | R$125 | 6                      | 4                      | 3                      | 20 max   |

_Example above uses WIN mini-index (R$0.20 per point per contract). Adjust point value for your instrument._

> **If calculated contracts exceed 20: use 20 contracts and accept reduced risk.**
> **If stop < 100 points: widen stop to 100 points and reduce contracts.**

---

## Loss Recovery — All 8 Possible Paths (R:R 1:1.5, WR 65%)

```mermaid
flowchart TD
    L1["<b>TRADE 1: LOSS</b><br/>-R$500"]
    L1 --> T2{"<b>TRADE 2</b><br/>Risk R$250"}

    T2 -- "LOSS -R$250" --> T3A{"<b>TRADE 3</b><br/>Risk R$125"}
    T2 -- "GAIN +R$375" --> T3B{"<b>TRADE 3</b><br/>Risk R$125"}

    T3A -- "LOSS -R$125" --> T4A{"<b>TRADE 4</b><br/>Risk R$125"}
    T3A -- "GAIN +R$187" --> T4B{"<b>TRADE 4</b><br/>Risk R$125"}
    T3B -- "LOSS -R$125" --> T4C{"<b>TRADE 4</b><br/>Risk R$125"}
    T3B -- "GAIN +R$187" --> T4D{"<b>TRADE 4</b><br/>Risk R$125"}

    T4A -- "LOSS" --> R1
    T4A -- "GAIN" --> R2
    T4B -- "LOSS" --> R3
    T4B -- "GAIN" --> R4
    T4C -- "LOSS" --> R5
    T4C -- "GAIN" --> R6
    T4D -- "LOSS" --> R7
    T4D -- "GAIN" --> R8

    R1["<b>-R$1,000</b><br/>L-L-L-L<br/>P = 4.3%"]
    R2["<b>-R$687</b><br/>L-L-L-G<br/>P = 8.0%"]
    R3["<b>-R$687</b><br/>L-L-G-L<br/>P = 8.0%"]
    R4["<b>-R$375</b><br/>L-L-G-G<br/>P = 14.8%"]
    R5["<b>-R$375</b><br/>L-G-L-L<br/>P = 8.0%"]
    R6["<b>-R$62</b><br/>L-G-L-G<br/>P = 14.8%"]
    R7["<b>-R$62</b><br/>L-G-G-L<br/>P = 14.8%"]
    R8["<b>+R$250</b><br/>L-G-G-G<br/>P = 27.5%"]

    %% ── Styles ──

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

    %% Results — gradient from worst (dark red) to best (green)
    style R1 fill:#b91c1c,stroke:#fca5a5,color:#fff,stroke-width:3px
    style R2 fill:#991b1b,stroke:#f87171,color:#fff,stroke-width:2px
    style R3 fill:#991b1b,stroke:#f87171,color:#fff,stroke-width:2px
    style R4 fill:#7f1d1d,stroke:#ef4444,color:#fca5a5,stroke-width:2px
    style R5 fill:#7f1d1d,stroke:#ef4444,color:#fca5a5,stroke-width:2px
    style R6 fill:#713f12,stroke:#f59e0b,color:#fde68a,stroke-width:2px
    style R7 fill:#713f12,stroke:#f59e0b,color:#fde68a,stroke-width:2px
    style R8 fill:#166534,stroke:#4ade80,color:#fff,stroke-width:3px

    linkStyle 0,1,3,5,7,9,11,13 stroke:#f85149,stroke-width:2px
    linkStyle 2,4,6,8,10,12,14 stroke:#3fb950,stroke-width:2px
```

> **Reading the tree:** Follow any path from top to bottom. Each branch is a LOSS (left, red) or GAIN (right, green).
> The bottom boxes show: **day result**, path pattern, and probability at 65% WR.
>
> - Only **path 8** (27.5%) ends positive (+R$250)
> - Paths 6-7 (29.6% combined) are near-breakeven (-R$62)
> - Path 1 (4.3%) is the worst case: daily limit hit (-R$1,000)
> - **Expected value of loss mode = -R$187.50**

---

## Gain Compounding — Paths by R:R (risk = 30% of last trade's gain)

Each subsequent trade after the first WIN risks **30% of the previous trade's gain**. On a loss you lose only that risk and keep the rest.

```mermaid
flowchart LR
    subgraph RR4 ["R:R 1:4 — 1st win = R$2,000"]
        A1["1 WIN<br/>gain R$2,000"] --> A1T["TARGET<br/>+R$2,000"]
    end

    subgraph RR3 ["R:R 1:3 — 1st win = R$1,500"]
        B1["1 WIN<br/>gain R$1,500"] --> B1T["TARGET<br/>+R$1,500"]
    end

    subgraph RR2 ["R:R 1:2 — 2 wins to target"]
        C1["1W: +R$1,000<br/>acc = R$1,000"] -- "risk R$300<br/>(30% of R$1,000)" --> C2{"T2"}
        C2 -- "LOSS" --> C2L["keep +R$700"]
        C2 -- "WIN +R$600" --> C2W["TARGET<br/>+R$1,600"]
    end

    style A1T fill:#238636,stroke:#238636,color:#fff
    style B1T fill:#238636,stroke:#238636,color:#fff
    style C2W fill:#238636,stroke:#238636,color:#fff
    style C2L fill:#f0883e,stroke:#f0883e,color:#fff
```

> **Key benefit of 30% rule:** You only risk 30% of the last win. Even on a compounding loss, you keep most of your gains.
>
> Higher R:R = fewer wins needed. At R:R ≥ 1:3, a single win hits the daily target immediately.
> At R:R 1:2, two wins does it. **Below R:R ~1:1.6, compounding alone cannot reach R$1,500** — gains converge to a ceiling.

---

## Quick Reference

```
TRADE 1 LOST?                          TRADE 1 WON?
─────────────                          ─────────────
1. Trade 2 at R$250                    1. Gains >= R$1,500? → STOP (target)
2. Trade 3 at R$125                    2. No? Next risk = 30% of last trade's gain
3. Trade 4 at R$125                    3. Lost? → STOP (keep 70% of gains)
4. STOP. Day over. No exceptions.      4. Won? → Back to step 1

ALWAYS CHECK BEFORE EVERY TRADE:
─────────────────────────────────
- Stop >= 100 points?      If not → widen stop, reduce contracts
- Contracts <= 20?          If not → cap at 20, accept less risk
- Within operating hours?   09:01–17:00 only
```
