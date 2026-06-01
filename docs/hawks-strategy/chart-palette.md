# Hawks chart palette

Canonical color spec for every chart that visualizes Hawks bricks + indicators.
Source: user instruction, 2026-05-28. Applies to the dev sandbox
(`/dev/hawks-audit`) and any future Hawks visualization surface.

The palette uses Axion design tokens (`src/app/globals.css` → `@theme`). Never
hardcode raw hex values — read tokens via `getChartThemeColors()` and pass
the resolved string to Lightweight Charts.

---

## General — applies to every Hawks chart

| Concept                          | Token                             | Notes                                         |
| -------------------------------- | --------------------------------- | --------------------------------------------- |
| Brick UP body + wick             | `--color-trade-buy` (`#34d399`)   | already wired in `renko-pane.tsx:104-109`     |
| Brick DOWN body + wick           | `--color-trade-sell` (`#f87171`)  | already wired in `renko-pane.tsx:104-109`     |
| Long trade order (entry marker)  | `--color-action-buy` (`#5bb8d6`)  | dev inspector uses `markerColorMode="action"` |
| Short trade order (entry marker) | `--color-action-sell` (`#fb923c`) | dev inspector uses `markerColorMode="action"` |

Note: the **production** `HawksTripleScreenInspector` still uses
`trade-buy`/`trade-sell` for entry markers (colored by win/loss outcome). The
direction-based `action-*` palette is currently dev-only — promote to
production when ready.

---

## 5m chart

| Indicator key (JSONB) | Color                 | Notes                                                                         |
| --------------------- | --------------------- | ----------------------------------------------------------------------------- |
| `mme27_60m`           | Orange                | projected 60m EMA 27                                                          |
| `mme55_60m`           | Orange                | projected 60m EMA 55 (use a slightly darker / muted orange to differentiate)  |
| `mme27_15m`           | Gray                  | projected 15m EMA 27                                                          |
| `mme55_15m`           | Gray                  | projected 15m EMA 55 (darker gray)                                            |
| `keltner_sup_125`     | Yellow                | upper band 12.50                                                              |
| `keltner_inf_125`     | Yellow                | lower band 12.50                                                              |
| `keltner_sup_165`     | Yellow                | upper band 16.50 (lighter / dashed to differentiate)                          |
| `keltner_inf_165`     | Yellow                | lower band 16.50 (lighter / dashed)                                           |
| `vwap_d_5m`           | Teal — lighter shade  | Daily VWAP                                                                    |
| `vwap_s_5m`           | Teal — medium shade   | Weekly (Semanal) VWAP                                                         |
| `vwap_m_5m`           | Teal — darker shade   | Monthly (Mensal) VWAP                                                         |
| `macd`                | BRICK UP / BRICK DOWN | histogram in a sub-pane; positive bars = `trade-buy`, negative = `trade-sell` |
| `ajuste_d1`           | Cyan                  | previous-day settlement; horizontal step line                                 |
| `topos_fundos`        | White                 | confirmed pivot line (2-brick confirmation)                                   |
| `volume`              | —                     | not plotted                                                                   |
| `aggression_balance`  | —                     | not plotted                                                                   |
| `index_do_candle`     | —                     | not plotted (used internally as brick index)                                  |

---

## 15m and 60m chart

| Indicator key (JSONB)                 | Color                 | Notes                                                                 |
| ------------------------------------- | --------------------- | --------------------------------------------------------------------- |
| `mme27_15m` / `mme27_60m`             | Orange                | local-TF EMA 27                                                       |
| `mme55_15m` / `mme55_60m`             | Teal                  | local-TF EMA 55                                                       |
| `keltner_sup_125` / `keltner_inf_125` | Yellow                | bands 12.50                                                           |
| `keltner_sup_165` / `keltner_inf_165` | Yellow                | bands 16.50 (lighter / dashed)                                        |
| `macd`                                | BRICK UP / BRICK DOWN | histogram in a sub-pane                                               |
| `topos_fundos_p1`                     | White                 | 1-brick confirmation pivot (sensitive)                                |
| `topos_fundos_p2`                     | Gray                  | 2-brick confirmation pivot (slower / higher conviction)               |
| `ajuste_d1`                           | —                     | not plotted on 15m/60m (only present in 5m JSONB; not forward-filled) |
| `index_do_candle`                     | —                     | not plotted                                                           |

---

## Implementation locations

| File                                                            | What it owns                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/globals.css` (`@theme`)                                | token definitions — never change for chart-palette reasons alone                                                               |
| `src/lib/chart/theme-colors.ts`                                 | runtime resolver — extend here if a new token is needed                                                                        |
| `src/components/backtest/inspector/renko-pane.tsx`              | chart rendering; brick colors hardcoded against `theme.tradeBuy` / `theme.tradeSell`; markers driven by `markerColorMode` prop |
| `src/components/dev/hawks-audit-inspector.tsx`                  | dev sandbox; owns the per-key overlay config arrays `OVERLAYS_5M`, `OVERLAYS_15M`, `OVERLAYS_60M`                              |
| `src/components/backtest/inspector/triple-screen-inspector.tsx` | production trade-modal inspector; still uses a minimal EMA-only overlay set                                                    |
