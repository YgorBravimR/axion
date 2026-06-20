# Market Theory Research — Index

Deep research dossier on the three market-reading frameworks most-used by Brazilian retail and prop traders on B3. Each document covers **history, core theory, global application, and B3-specific application** with inline source citations.

Generated 2026-06-16. ~17,900 words total across three documents.

---

## The three documents

| #   | Theory                                           | File                                                     | Words  | One-line summary                                                                                                             |
| --- | ------------------------------------------------ | -------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Auction Market Theory (AMT) / Market Profile** | [`auction-market-theory.md`](./auction-market-theory.md) | ~5,000 | Markets as continuous two-way auctions seeking fair value; descriptive framework (Steidlmayer, CBOT, 1982).                  |
| 2   | **Smart Money Concept (SMC)**                    | [`smart-money-concept.md`](./smart-money-concept.md)     | ~5,800 | Institutions hunt retail liquidity; trade structure shifts, order blocks, FVGs (Wyckoff → ICT, 2010s).                       |
| 3   | **Order Flow Theory**                            | [`order-flow-theory.md`](./order-flow-theory.md)         | ~7,100 | Read aggression vs absorption on the live tape and footprint to anticipate the next move (Livermore → Bookmap, 1900s–today). |

---

## How they differ — at a glance

| Dimension                      | AMT / Market Profile               | Smart Money Concept               | Order Flow                           |
| ------------------------------ | ---------------------------------- | --------------------------------- | ------------------------------------ |
| **Era of origin**              | 1982 (CBOT pits)                   | 1900s Wyckoff → 2010s ICT         | 1890s tape reading → 2000s footprint |
| **Primary input**              | Time + price + volume distribution | Price action + structure          | Live trades + book + delta           |
| **Time horizon**               | Day to multi-week composite        | Multi-timeframe (1m–weekly)       | Intra-minute to hourly               |
| **Predictive or descriptive?** | Mostly descriptive                 | Claims predictive                 | Reactive / probabilistic             |
| **Key artifact**               | TPO chart, Value Area, POC         | Order Block, FVG, BOS/CHoCH       | Footprint, delta, DOM heatmap        |
| **Dominant market**            | CME futures, B3 indices            | Forex, crypto, indices            | CME, Eurex, B3 mini-futures          |
| **Dominant tooling**           | Sierra Chart, ATAS, Profit Pro     | TradingView, MT5                  | Bookmap, ATAS, Profit Pro            |
| **Brazilian uptake**           | High (TAT, Hawks, B3 prop firms)   | High (retail YouTube wave 2020+)  | Highest among Brazilian prop firms   |
| **Academic standing**          | Moderate (microstructure overlap)  | Low (no peer-reviewed validation) | High (microstructure literature)     |
| **Common critique**            | Hindsight bias in profile reading  | "Anything can be an OB"           | Cost of data, HFT noise              |

---

## How they relate — the integration map

These three frameworks are **not mutually exclusive**. The most rigorous Brazilian prop desks combine them:

```
                  ┌────────────────────────────────┐
                  │   AMT (context / location)     │
                  │   "Where are we in the auction?"│
                  └──────────────┬─────────────────┘
                                 │
                                 │ Defines: VPOC, VAH/VAL, IB,
                                 │ acceptance/rejection, day type
                                 ▼
        ┌────────────────────────────────────────────────────┐
        │     Order Flow (confirmation / execution)          │
        │     "Is the auction actually trading the level?"   │
        │                                                    │
        │     Inputs: delta, footprint, absorption, DOM      │
        └──────────────────────┬─────────────────────────────┘
                               │
                               │ Confirms: rejection at VPOC,
                               │ exhaustion at IB extreme, etc.
                               ▼
        ┌────────────────────────────────────────────────────┐
        │     SMC (narrative / framing — optional)           │
        │     "Did the move sweep liquidity & shift structure?"│
        │                                                    │
        │     Useful when: clean structure visible on HTF    │
        │     Skip when: noisy chop, no clear liquidity pool │
        └────────────────────────────────────────────────────┘
```

**Brazilian prop-firm consensus** (Hawks, TAT, Tradeshow, Mesa Pro): AMT + Order Flow is the canonical stack. SMC is treated as either (a) a useful framing for HTF bias when structure is clean, or (b) repackaged Wyckoff with retail-influencer baggage — depending on who you ask.

---

## B3-specific synthesis

All three frameworks were created outside Brazil. Each requires adaptation for B3.

### What's distinctive about B3

1. **Single venue, central counterparty.** No fragmentation. The book IS the market. Better for order flow than US equities, where flow is spread across 16+ venues.
2. **Opening auction (`leilão de abertura`) at 09:45/10:00 and closing auction (`leilão de fechamento`) at 17:55.** These create discontinuities — initial balance, VPOC migration, and FVGs all need to handle these breakpoints.
3. **Strong US correlation.** WIN tracks ES, WDO tracks DXY. HTF bias for any of the three frameworks must reference the US session.
4. **Mini-contract dominance.** WIN (1/5 of full index) and WDO (1/10 of full dollar) are the retail-accessible flow instruments. Tick density is lower than ES/NQ — flow reads as noisier.
5. **Overnight illiquidity.** B3 closes 18:00–09:45 local; the overnight gap is structural. Liquidity-sweep narratives (SMC) and CVD reset logic (Order Flow) need to handle the gap.
6. **HFT penetration since 2014** (CME's GTS engine adopted by B3). Same flow-gaming dynamics as CME but at lower notional.
7. **Expiration days** (3rd Wednesday for index, last day of month for dollar) create structural pivot distortions that affect SMC's HH/HL counting.

### B3 tooling stack (canonical)

| Layer                         | Tool                                       | Why                                                              |
| ----------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| Charts + TPO + Volume Profile | **Profit Pro / Ultra (Nelogica)**          | Dominant. ~80%+ of Brazilian retail and prop.                    |
| Footprint + DOM               | **Profit Pro** or **ATAS for B3**          | Profit's footprint is solid; ATAS for heavier flow work.         |
| Heatmap                       | **Bookmap** (limited B3 support)           | Some Brazilian brokers offer Bookmap; coverage thinner than CME. |
| SMC indicators                | **TradingView** with LuxAlgo/BTMM          | Used by retail SMC traders; rare in prop.                        |
| Execution                     | **Profit's boletador** (DOM ladder)        | Industry standard for scalping WIN/WDO.                          |
| Data feed                     | **UMDF / MD3** via Nelogica or proprietary | CEPA-grade; the de facto retail feed.                            |

### Brazilian terminology — quick lookup

| English                       | Português                                             |
| ----------------------------- | ----------------------------------------------------- |
| Order flow                    | Fluxo (de ordens)                                     |
| Aggression / aggressive order | Agressão                                              |
| Absorption                    | Absorção                                              |
| Exhaustion                    | Esgotamento                                           |
| Order book                    | Livro de ofertas                                      |
| DOM / ladder                  | Boletador                                             |
| Trades / Time & Sales         | Negócios / Tape                                       |
| Iceberg                       | Iceberg (same)                                        |
| Value Area                    | Área de valor                                         |
| Point of Control (POC)        | Ponto de controle                                     |
| Volume POC (VPOC)             | VPOC / Ponto de volume                                |
| Initial Balance               | Balança inicial / IB                                  |
| Acceptance / rejection        | Aceitação / rejeição                                  |
| Break of Structure (BOS)      | Quebra de estrutura                                   |
| Change of Character (CHoCH)   | Mudança de caráter                                    |
| Order Block (OB)              | Bloco de ordens                                       |
| Fair Value Gap (FVG)          | Lacuna de valor justo / Ineficiência                  |
| Liquidity sweep               | Varredura de liquidez                                 |
| Killzone                      | Zona (rarely translated; usually adapted to B3 hours) |
| Inducement                    | Indução                                               |
| Stop hunt                     | Caça aos stops                                        |
| Opening auction               | Leilão de abertura                                    |
| Closing auction               | Leilão de fechamento                                  |
| Expiration day                | Dia de vencimento                                     |

---

## Recommended reading order

If approaching cold:

1. **Order Flow first** — it's the most concrete, measurable, and academically grounded. You learn what's actually happening on the tape.
2. **AMT second** — it gives you the structural context where flow happens (value, acceptance, rejection).
3. **SMC last** — read it skeptically. Useful framing for HTF bias when structure is clean; treat as a heuristic, not a system.

If approaching as an experienced trader: read in any order; cross-reference where they conflict.

---

## Brazilian educator landscape — quick map

| Educator / community                                 | Framework focus           | Notes                                                                                                       |
| ---------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **TAT (Trader At Work)**                             | Order Flow + AMT          | Strongest fluxo + profile integration. Stack includes 10K (DezK), VWAP 10h/11h30, leitura de fluxo, travas. |
| **Hawks Trading**                                    | Order Flow + Renko + AMT  | Prop firm. Structural pivots, Renko brick math, fluxo.                                                      |
| **Tradeshow / Mesa Proprietária**                    | Order Flow                | Prop-style fluxo.                                                                                           |
| **Stormer (Alexandre Wolwacz)**                      | Swing / setups            | More technical / fundamentals; light on flow.                                                               |
| **André Antunes (Trader Esportivo)**                 | Scalping + flow           | Brazilian flow popularizer.                                                                                 |
| **Pikabu Trader / Trader Profissional / HMC Trader** | SMC                       | Brazilian SMC YouTube wave, ~2020+.                                                                         |
| **Bo Williams**                                      | AMT skeptic, classical TA | Critical voice on Brazilian retail trends.                                                                  |

---

## Document map

- [Auction Market Theory →](./auction-market-theory.md)
- [Smart Money Concept →](./smart-money-concept.md)
- [Order Flow Theory →](./order-flow-theory.md)
