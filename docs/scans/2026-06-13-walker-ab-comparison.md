# Hawks v0.9 Walker — A/B vs v0.8 Baseline

Range: **2026-03-02 → 2026-05-29**, match window ±2
Candles: 8082, catalog entries: 291

## Reproduction summary

| Metric                      | Baseline (stateless) | Walker (stateful) |     Δ |
| --------------------------- | -------------------: | ----------------: | ----: |
| EXACT (brick + dir)         |                    2 |                 3 |    +1 |
| NEAR (±2, same dir)         |                  164 |               189 |   +25 |
| MISS                        |                  125 |                99 |   -26 |
| Reproduction rate           |                57.0% |             66.0% | 8.9pp |
| EXTRAS (engine off-catalog) |                  213 |               323 |  +110 |

## PnL & outcome

| Metric             |       Baseline |         Walker |            Δ |
| ------------------ | -------------: | -------------: | -----------: |
| Trade count        |            379 |            515 |         +136 |
| Wins / Losses / BE | 65 / 167 / 147 | 75 / 261 / 179 |            — |
| Win rate           |          17.2% |          14.6% |       -2.6pp |
| Net PnL            |      R$ 782.89 |   R$ -2,867.48 | R$ -3,650.37 |
| Gross wins         |    R$ 9,211.20 |   R$ 10,387.49 |            — |
| Gross losses       |    R$ 8,428.31 |   R$ 13,254.97 |            — |
| Profit factor      |           1.09 |           0.78 |            — |

## Walker-only trades

Trades present in walker variant but absent in baseline (i.e. the new behavior the v0.9 walker enables):

- Count: **154**
- Wins / Losses / BE: **14 / 99 / 41**
- Win rate on this slice: **9.1%**
- Net PnL on this slice: **R$ -3,303.22**

### Sample (first 15 walker-only trades, with catalog context)

| Day        | Brick | Dir   |     Entry |      Exit | Result | Catalog same-day same-dir?                                                            |
| ---------- | ----: | ----- | --------: | --------: | ------ | ------------------------------------------------------------------------------------- |
| 2026-03-02 |    79 | short | 194825.07 | 195085.41 | LOSS   | T?@21, T?@28, T?@58, T?@100, T?@148                                                   |
| 2026-03-02 |    84 | short | 194952.74 | 194171.66 | WIN    | T?@21, T?@28, T?@58, T?@100, T?@148                                                   |
| 2026-03-02 |   116 | short | 194697.40 | 194957.74 | LOSS   | T?@21, T?@28, T?@58, T?@100, T?@148                                                   |
| 2026-03-02 |   186 | long  | 196357.12 | 196096.78 | LOSS   | (none)                                                                                |
| 2026-03-02 |   191 | long  | 196229.45 | 196229.45 | BE     | (none)                                                                                |
| 2026-03-02 |   196 | long  | 196357.12 | 196484.79 | WIN    | (none)                                                                                |
| 2026-03-03 |   228 | short | 188952.23 | 189212.59 | LOSS   | T?@42, T?@59, T?@88, T?@102, T?@104, T?@127, T?@138, T?@156, T?@162, T?@176, T?@227\* |
| 2026-03-03 |   240 | short | 189207.58 | 189467.92 | LOSS   | T?@42, T?@59, T?@88, T?@102, T?@104, T?@127, T?@138, T?@156, T?@162, T?@176, T?@227   |
| 2026-03-04 |    65 | long  | 193037.69 | 192777.35 | LOSS   | T?@64\*                                                                               |
| 2026-03-04 |    76 | long  | 192144.00 | 191883.64 | LOSS   | T?@64                                                                                 |
| 2026-03-04 |    81 | long  | 192271.67 | 192011.33 | LOSS   | T?@64                                                                                 |
| 2026-03-04 |   117 | short | 190611.95 | 190611.95 | BE     | T?@99                                                                                 |
| 2026-03-04 |   123 | short | 190611.95 | 190872.29 | LOSS   | T?@99                                                                                 |
| 2026-03-04 |   128 | short | 190994.96 | 190994.96 | BE     | T?@99                                                                                 |
| 2026-03-04 |   133 | short | 190867.29 | 190867.29 | BE     | T?@99                                                                                 |

_Asterisk_ = catalog entry within ±2 bricks of the walker-only trade (likely a near-miss the baseline blocked).

### All walker-only trades, grouped by day

- **2026-03-02** — 6 trade(s), W/L/BE = 2/3/1, day PnL R$ 25.54
  - brick 79 short entry 194825.07 exit 195085.41 (LOSS, R$ -52.07, stop)
  - brick 84 short entry 194952.74 exit 194171.66 (WIN , R$ 156.22, target1)
  - brick 116 short entry 194697.40 exit 194957.74 (LOSS, R$ -52.07, stop)
  - brick 186 long entry 196357.12 exit 196096.78 (LOSS, R$ -52.07, stop)
  - brick 191 long entry 196229.45 exit 196229.45 (BE , R$ 0.00, breakeven_stop)
  - brick 196 long entry 196357.12 exit 196484.79 (WIN , R$ 25.53, eod)
- **2026-03-03** — 2 trade(s), W/L/BE = 0/2/0, day PnL R$ -104.14
  - brick 228 short entry 188952.23 exit 189212.59 (LOSS, R$ -52.07, stop)
  - brick 240 short entry 189207.58 exit 189467.92 (LOSS, R$ -52.07, stop)
- **2026-03-04** — 9 trade(s), W/L/BE = 1/5/3, day PnL R$ -158.21
  - brick 65 long entry 193037.69 exit 192777.35 (LOSS, R$ -52.07, stop)
  - brick 76 long entry 192144.00 exit 191883.64 (LOSS, R$ -52.07, stop)
  - brick 81 long entry 192271.67 exit 192011.33 (LOSS, R$ -52.07, stop)
  - brick 117 short entry 190611.95 exit 190611.95 (BE , R$ -0.00, breakeven_stop)
  - brick 123 short entry 190611.95 exit 190872.29 (LOSS, R$ -52.07, stop)
  - brick 128 short entry 190994.96 exit 190994.96 (BE , R$ -0.00, breakeven_stop)
  - brick 133 short entry 190867.29 exit 190867.29 (BE , R$ -0.00, breakeven_stop)
  - brick 139 short entry 190611.95 exit 190872.29 (LOSS, R$ -52.07, stop)
  - brick 174 long entry 192399.34 exit 192910.02 (WIN , R$ 102.14, eod)
- **2026-03-05** — 8 trade(s), W/L/BE = 1/5/2, day PnL R$ -183.75
  - brick 12 short entry 190611.95 exit 190611.95 (BE , R$ -0.00, breakeven_stop)
  - brick 18 short entry 190484.28 exit 190744.62 (LOSS, R$ -52.07, stop)
  - brick 23 short entry 190611.95 exit 190872.29 (LOSS, R$ -52.07, stop)
  - brick 55 short entry 191122.63 exit 191382.97 (LOSS, R$ -52.07, stop)
  - brick 63 short entry 190867.29 exit 191127.63 (LOSS, R$ -52.07, stop)
  - brick 81 short entry 190867.29 exit 190867.29 (BE , R$ -0.00, breakeven_stop)
  - brick 291 short entry 187292.52 exit 187552.86 (LOSS, R$ -52.07, stop)
  - brick 299 short entry 187803.20 exit 187420.19 (WIN , R$ 76.60, eod)
- **2026-03-06** — 3 trade(s), W/L/BE = 0/3/0, day PnL R$ -156.21
  - brick 42 short entry 186271.16 exit 186531.50 (LOSS, R$ -52.07, stop)
  - brick 188 short entry 185505.13 exit 185765.47 (LOSS, R$ -52.07, stop)
  - brick 243 short entry 185632.80 exit 185893.14 (LOSS, R$ -52.07, stop)
- **2026-03-17** — 4 trade(s), W/L/BE = 0/2/2, day PnL R$ -132.73
  - brick 56 long entry 188584.54 exit 188252.72 (LOSS, R$ -66.36, stop)
  - brick 66 long entry 187930.87 exit 187599.03 (LOSS, R$ -66.37, stop)
  - brick 89 long entry 187113.78 exit 187113.78 (BE , R$ 0.00, breakeven_stop)
  - brick 110 short entry 186133.27 exit 186133.27 (BE , R$ -0.00, breakeven_stop)
- **2026-03-18** — 3 trade(s), W/L/BE = 0/2/1, day PnL R$ -132.74
  - brick 51 short entry 185969.85 exit 186301.69 (LOSS, R$ -66.37, stop)
  - brick 74 short entry 185806.44 exit 185806.44 (BE , R$ -0.00, breakeven_stop)
  - brick 81 short entry 185969.85 exit 186301.69 (LOSS, R$ -66.37, stop)
- **2026-03-19** — 4 trade(s), W/L/BE = 0/4/0, day PnL R$ -265.46
  - brick 70 short entry 183028.33 exit 183360.15 (LOSS, R$ -66.36, stop)
  - brick 81 short entry 183845.42 exit 184177.26 (LOSS, R$ -66.37, stop)
  - brick 154 long entry 186786.94 exit 186455.12 (LOSS, R$ -66.36, stop)
  - brick 159 long entry 186296.69 exit 185964.85 (LOSS, R$ -66.37, stop)
- **2026-03-24** — 3 trade(s), W/L/BE = 0/2/1, day PnL R$ -136.82
  - brick 83 long entry 187231.24 exit 186889.18 (LOSS, R$ -68.41, stop)
  - brick 93 long entry 186557.14 exit 186215.08 (LOSS, R$ -68.41, stop)
  - brick 100 long entry 186725.66 exit 186725.66 (BE , R$ 0.00, breakeven_stop)
- **2026-03-25** — 8 trade(s), W/L/BE = 1/5/2, day PnL R$ -136.81
  - brick 35 long entry 189759.11 exit 189759.11 (BE , R$ 0.00, breakeven_stop)
  - brick 45 long entry 190096.16 exit 189754.12 (LOSS, R$ -68.41, stop)
  - brick 50 long entry 189927.64 exit 190953.82 (WIN , R$ 205.24, target1)
  - brick 92 long entry 190601.74 exit 190601.74 (BE , R$ 0.00, breakeven_stop)
  - brick 100 long entry 190938.79 exit 190596.73 (LOSS, R$ -68.41, stop)
  - brick 105 long entry 191107.31 exit 190765.27 (LOSS, R$ -68.41, stop)
  - brick 110 long entry 191275.84 exit 190933.78 (LOSS, R$ -68.41, stop)
  - brick 119 long entry 190770.26 exit 190428.22 (LOSS, R$ -68.41, stop)
- **2026-03-26** — 2 trade(s), W/L/BE = 0/2/0, day PnL R$ -136.82
  - brick 137 long entry 189422.06 exit 189080.02 (LOSS, R$ -68.41, stop)
  - brick 142 long entry 189253.54 exit 188911.48 (LOSS, R$ -68.41, stop)
- **2026-03-27** — 5 trade(s), W/L/BE = 1/2/2, day PnL R$ -35.70
  - brick 54 short entry 187568.29 exit 187910.33 (LOSS, R$ -68.41, stop)
  - brick 60 short entry 188242.39 exit 188242.39 (BE , R$ -0.00, breakeven_stop)
  - brick 67 short entry 188073.86 exit 188415.92 (LOSS, R$ -68.41, stop)
  - brick 72 short entry 187568.29 exit 187568.29 (BE , R$ -0.00, breakeven_stop)
  - brick 80 short entry 186894.19 exit 186388.61 (WIN , R$ 101.12, eod)
- **2026-03-30** — 3 trade(s), W/L/BE = 0/0/3, day PnL R$ 0.00
  - brick 2 short entry 186460.11 exit 186460.11 (BE , R$ -0.00, breakeven_stop)
  - brick 47 long entry 187604.03 exit 187604.03 (BE , R$ 0.00, breakeven_stop)
  - brick 71 long entry 188911.38 exit 188911.38 (BE , R$ 0.00, breakeven_stop)
- **2026-03-31** — 1 trade(s), W/L/BE = 0/0/1, day PnL R$ 0.00
  - brick 80 long entry 189728.47 exit 189728.47 (BE , R$ 0.00, breakeven_stop)
- **2026-04-01** — 4 trade(s), W/L/BE = 1/2/1, day PnL R$ 66.37
  - brick 56 long entry 192996.83 exit 192665.01 (LOSS, R$ -66.36, stop)
  - brick 61 long entry 192506.58 exit 192174.74 (LOSS, R$ -66.37, stop)
  - brick 66 long entry 192670.00 exit 193665.52 (WIN , R$ 199.10, target1)
  - brick 98 long entry 192996.83 exit 192996.83 (BE , R$ 0.00, breakeven_stop)
- **2026-04-02** — 3 trade(s), W/L/BE = 1/2/0, day PnL R$ -2.00
  - brick 130 long entry 192506.58 exit 192174.74 (LOSS, R$ -66.37, stop)
  - brick 135 long entry 192670.00 exit 192338.16 (LOSS, R$ -66.37, stop)
  - brick 140 long entry 192179.74 exit 192833.42 (WIN , R$ 130.74, eod)
- **2026-04-06** — 7 trade(s), W/L/BE = 0/5/2, day PnL R$ -321.62
  - brick 22 long entry 193298.14 exit 192976.50 (LOSS, R$ -64.33, stop)
  - brick 28 long entry 192981.51 exit 192659.89 (LOSS, R$ -64.32, stop)
  - brick 72 long entry 193139.82 exit 192818.20 (LOSS, R$ -64.32, stop)
  - brick 103 long entry 193456.45 exit 193134.83 (LOSS, R$ -64.32, stop)
  - brick 111 long entry 193139.82 exit 193139.82 (BE , R$ 0.00, breakeven_stop)
  - brick 118 long entry 193298.14 exit 192976.50 (LOSS, R$ -64.33, stop)
  - brick 126 long entry 192981.51 exit 192981.51 (BE , R$ 0.00, breakeven_stop)
- **2026-04-08** — 4 trade(s), W/L/BE = 0/3/1, day PnL R$ -192.96
  - brick 108 long entry 196306.05 exit 195984.43 (LOSS, R$ -64.32, stop)
  - brick 130 long entry 197255.92 exit 196934.30 (LOSS, R$ -64.32, stop)
  - brick 136 long entry 196939.30 exit 196617.68 (LOSS, R$ -64.32, stop)
  - brick 141 long entry 196780.99 exit 196780.99 (BE , R$ 0.00, breakeven_stop)
- **2026-04-13** — 2 trade(s), W/L/BE = 0/1/1, day PnL R$ -56.16
  - brick 22 long entry 201034.96 exit 201034.96 (BE , R$ 0.00, breakeven_stop)
  - brick 45 long entry 201172.85 exit 200892.07 (LOSS, R$ -56.16, stop)
- **2026-04-20** — 3 trade(s), W/L/BE = 0/3/0, day PnL R$ -141.00
  - brick 66 short entry 200215.00 exit 200450.00 (LOSS, R$ -47.00, stop)
  - brick 75 short entry 200100.00 exit 200335.00 (LOSS, R$ -47.00, stop)
  - brick 89 short entry 200100.00 exit 200335.00 (LOSS, R$ -47.00, stop)
- **2026-04-22** — 2 trade(s), W/L/BE = 1/0/1, day PnL R$ 141.00
  - brick 49 short entry 199410.00 exit 199410.00 (BE , R$ -0.00, breakeven_stop)
  - brick 55 short entry 199410.00 exit 198705.00 (WIN , R$ 141.00, target1)
- **2026-04-24** — 2 trade(s), W/L/BE = 1/1/0, day PnL R$ 94.00
  - brick 50 short entry 194350.00 exit 194585.00 (LOSS, R$ -47.00, stop)
  - brick 55 short entry 194235.00 exit 193530.00 (WIN , R$ 141.00, target1)
- **2026-05-05** — 5 trade(s), W/L/BE = 0/4/1, day PnL R$ -156.00
  - brick 48 short entry 188860.00 exit 189055.00 (LOSS, R$ -39.00, stop)
  - brick 78 short entry 188670.00 exit 188865.00 (LOSS, R$ -39.00, stop)
  - brick 86 short entry 189050.00 exit 189245.00 (LOSS, R$ -39.00, stop)
  - brick 96 short entry 189050.00 exit 189050.00 (BE , R$ -0.00, breakeven_stop)
  - brick 106 short entry 188860.00 exit 189055.00 (LOSS, R$ -39.00, stop)
- **2026-05-06** — 3 trade(s), W/L/BE = 0/2/1, day PnL R$ -78.00
  - brick 101 long entry 191140.00 exit 190945.00 (LOSS, R$ -39.00, stop)
  - brick 112 long entry 191235.00 exit 191040.00 (LOSS, R$ -39.00, stop)
  - brick 169 short entry 190475.00 exit 190475.00 (BE , R$ -0.00, breakeven_stop)
- **2026-05-08** — 2 trade(s), W/L/BE = 0/2/0, day PnL R$ -78.00
  - brick 149 short entry 187245.00 exit 187440.00 (LOSS, R$ -39.00, stop)
  - brick 155 short entry 187055.00 exit 187250.00 (LOSS, R$ -39.00, stop)
- **2026-05-11** — 3 trade(s), W/L/BE = 0/3/0, day PnL R$ -123.00
  - brick 64 short entry 186400.00 exit 186605.00 (LOSS, R$ -41.00, stop)
  - brick 69 short entry 186500.00 exit 186705.00 (LOSS, R$ -41.00, stop)
  - brick 74 short entry 186600.00 exit 186805.00 (LOSS, R$ -41.00, stop)
- **2026-05-12** — 1 trade(s), W/L/BE = 0/1/0, day PnL R$ -41.00
  - brick 170 short entry 183700.00 exit 183905.00 (LOSS, R$ -41.00, stop)
- **2026-05-13** — 5 trade(s), W/L/BE = 1/4/0, day PnL R$ -41.00
  - brick 59 short entry 181900.00 exit 182105.00 (LOSS, R$ -41.00, stop)
  - brick 66 short entry 182200.00 exit 182405.00 (LOSS, R$ -41.00, stop)
  - brick 71 short entry 182300.00 exit 182505.00 (LOSS, R$ -41.00, stop)
  - brick 79 short entry 182500.00 exit 181885.00 (WIN , R$ 123.00, target1)
  - brick 105 short entry 180500.00 exit 180705.00 (LOSS, R$ -41.00, stop)
- **2026-05-14** — 3 trade(s), W/L/BE = 0/0/3, day PnL R$ 0.00
  - brick 57 short entry 180500.00 exit 180500.00 (BE , R$ -0.00, breakeven_stop)
  - brick 71 short entry 180300.00 exit 180300.00 (BE , R$ -0.00, breakeven_stop)
  - brick 84 short entry 180200.00 exit 180200.00 (BE , R$ -0.00, breakeven_stop)
- **2026-05-15** — 5 trade(s), W/L/BE = 0/4/1, day PnL R$ -164.00
  - brick 132 short entry 178600.00 exit 178600.00 (BE , R$ -0.00, breakeven_stop)
  - brick 144 short entry 178200.00 exit 178405.00 (LOSS, R$ -41.00, stop)
  - brick 149 short entry 178300.00 exit 178505.00 (LOSS, R$ -41.00, stop)
  - brick 154 short entry 178400.00 exit 178605.00 (LOSS, R$ -41.00, stop)
  - brick 180 short entry 178600.00 exit 178805.00 (LOSS, R$ -41.00, stop)
- **2026-05-18** — 9 trade(s), W/L/BE = 2/6/1, day PnL R$ 0.00
  - brick 89 short entry 178500.00 exit 178705.00 (LOSS, R$ -41.00, stop)
  - brick 94 short entry 178600.00 exit 177985.00 (WIN , R$ 123.00, target1)
  - brick 107 short entry 178300.00 exit 178505.00 (LOSS, R$ -41.00, stop)
  - brick 114 short entry 178400.00 exit 178605.00 (LOSS, R$ -41.00, stop)
  - brick 124 short entry 178600.00 exit 178805.00 (LOSS, R$ -41.00, stop)
  - brick 132 short entry 178600.00 exit 177985.00 (WIN , R$ 123.00, target1)
  - brick 140 short entry 177800.00 exit 177800.00 (BE , R$ -0.00, breakeven_stop)
  - brick 152 short entry 178200.00 exit 178405.00 (LOSS, R$ -41.00, stop)
  - brick 159 short entry 178100.00 exit 178305.00 (LOSS, R$ -41.00, stop)
- **2026-05-19** — 2 trade(s), W/L/BE = 1/1/0, day PnL R$ 82.00
  - brick 84 short entry 177000.00 exit 177205.00 (LOSS, R$ -41.00, stop)
  - brick 144 short entry 176800.00 exit 176185.00 (WIN , R$ 123.00, target1)
- **2026-05-20** — 4 trade(s), W/L/BE = 0/3/1, day PnL R$ -123.00
  - brick 16 short entry 176600.00 exit 176805.00 (LOSS, R$ -41.00, stop)
  - brick 109 long entry 179000.00 exit 178795.00 (LOSS, R$ -41.00, stop)
  - brick 115 long entry 178800.00 exit 178595.00 (LOSS, R$ -41.00, stop)
  - brick 120 long entry 178700.00 exit 178700.00 (BE , R$ 0.00, breakeven_stop)
- **2026-05-21** — 9 trade(s), W/L/BE = 0/4/5, day PnL R$ -164.00
  - brick 32 short entry 177700.00 exit 177700.00 (BE , R$ -0.00, breakeven_stop)
  - brick 40 short entry 177900.00 exit 178105.00 (LOSS, R$ -41.00, stop)
  - brick 47 short entry 178000.00 exit 178000.00 (BE , R$ -0.00, breakeven_stop)
  - brick 52 short entry 177900.00 exit 177900.00 (BE , R$ -0.00, breakeven_stop)
  - brick 66 short entry 177900.00 exit 178105.00 (LOSS, R$ -41.00, stop)
  - brick 72 short entry 178100.00 exit 178305.00 (LOSS, R$ -41.00, stop)
  - brick 91 short entry 178000.00 exit 178000.00 (BE , R$ -0.00, breakeven_stop)
  - brick 100 short entry 177900.00 exit 178105.00 (LOSS, R$ -41.00, stop)
  - brick 105 short entry 178200.00 exit 178200.00 (BE , R$ -0.00, breakeven_stop)
- **2026-05-22** — 1 trade(s), W/L/BE = 0/1/0, day PnL R$ -41.00
  - brick 122 short entry 177800.00 exit 178005.00 (LOSS, R$ -41.00, stop)
- **2026-05-25** — 3 trade(s), W/L/BE = 0/1/2, day PnL R$ -41.00
  - brick 54 long entry 178900.00 exit 178695.00 (LOSS, R$ -41.00, stop)
  - brick 70 short entry 178400.00 exit 178400.00 (BE , R$ -0.00, breakeven_stop)
  - brick 86 short entry 178200.00 exit 178200.00 (BE , R$ -0.00, breakeven_stop)
- **2026-05-26** — 2 trade(s), W/L/BE = 0/1/1, day PnL R$ -41.00
  - brick 14 long entry 178800.00 exit 178800.00 (BE , R$ 0.00, breakeven_stop)
  - brick 69 short entry 178000.00 exit 178205.00 (LOSS, R$ -41.00, stop)
- **2026-05-27** — 4 trade(s), W/L/BE = 0/4/0, day PnL R$ -164.00
  - brick 7 short entry 177200.00 exit 177405.00 (LOSS, R$ -41.00, stop)
  - brick 106 long entry 178600.00 exit 178395.00 (LOSS, R$ -41.00, stop)
  - brick 141 long entry 178900.00 exit 178695.00 (LOSS, R$ -41.00, stop)
  - brick 146 long entry 178600.00 exit 178395.00 (LOSS, R$ -41.00, stop)
- **2026-05-28** — 5 trade(s), W/L/BE = 0/4/1, day PnL R$ -164.00
  - brick 43 short entry 177300.00 exit 177505.00 (LOSS, R$ -41.00, stop)
  - brick 93 short entry 176700.00 exit 176905.00 (LOSS, R$ -41.00, stop)
  - brick 98 short entry 176800.00 exit 176800.00 (BE , R$ -0.00, breakeven_stop)
  - brick 104 short entry 176600.00 exit 176805.00 (LOSS, R$ -41.00, stop)
  - brick 154 short entry 176800.00 exit 177005.00 (LOSS, R$ -41.00, stop)
