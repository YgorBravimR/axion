# Hawks Mode

> Specialised ritual: daily bias confirmation, trade cap, screen checks, coaching cascade.

**Routes:** surfaces inside Command Center, Journal, Dashboard. Toggle in Settings.
**Server actions:** `hawks-mode.ts`, `hawks-bias.ts`, `hawks-coaching.ts`, `hawks-renko.ts`, `hawks-isolation-data.ts`, `hawks-engine-lab-data.ts`, `hawks-stop-audit.ts`, `hawks-audit-debug.ts`

## Purpose

Force the trader through a fixed ritual before each session: confirm bias direction, check the four screens (Renko60, MACD, EMA stack, VWAP, ajuste), cap to 3 trades per day, surface coaching the next morning.

## What lives there

- **Daily bias form** (in CC) — bullish/bearish/neutral + screen checkboxes + Portuguese notes.
- **Daily ordinal counter** (in CC + Journal) — increments per Hawks-approved trade; gates entry at cap.
- **Coaching insights** (Dashboard) — 90-day win rate by bias, suggested next action.
- **Mode toggle** (Settings) — `startHawksMode` / `stopHawksMode` (atomic mode switch per account).
- **Strategy methodology field** — Playbook strategies tagged `methodology === "hawks"` get the Hawks discipline panel.

## Inputs

- `tradingDay`, `bias`, screen flags, optional notes.
- Mode start/stop.

## Outputs

- `dailyHawksBias` row.
- `accountModes` row (activate/deactivate).
- `hawksDailyOrdinal` per `(accountId, tradingDay)`.

## Cross-feature integrations

- **Command Center** — bias form, daily-ordinal badge, breaker references Hawks state.
- **Journal** — `checkHawksCascade` blocks entry if bias missing or cap hit.
- **Dashboard** — coaching card uses `getHawksCoachingInsights(90)`.
- **Backtest / Dev Hawks Audit** — replays the cascade.
- **Renko R-size convention** (CLAUDE.md rule 0) — `R<N>` → `(N − 1) × 5` points. Hawks math everywhere depends on this.
- **Structural pivots** (CLAUDE.md rule 0a) — wick-based, not close/open.

## Where it fails

- **Bias missing → soft alert, not hard block.** The CC alert is dismissible. Journal blocks the trade, but only after the user has filled out the form.
- **Daily cap is per-account, not per-strategy.** Three Hawks trades and a non-Hawks trade share the same counter — by design, but confusing.
- **Coaching window is fixed 90d.** Not configurable.
- **No retroactive bias edit.** Once `tradingDay` rolls, you can't fix a wrongly-set bias for an old day.
- **Mode switch is silent.** Activating Hawks doesn't show a tour of what just changed in the UI.
- **R-math footgun.** Every Hawks computation must convert R-number to points; mistakes have shipped repeatedly (see CLAUDE.md rule 0).

## Power combos

1. **Bias → trade → coaching.** Confirm bias → trade Hawks → next morning's coaching tells you whether that bias direction wins over 90 days. Tomorrow's bias is informed by the data.
2. **Hawks strategy + Hawks Audit (dev).** Backtest a Hawks strategy → spot a weird trade → open `/dev/hawks-audit` for that date → see the cascade decisions step by step. Same engine, two surfaces.
3. **Hawks + Plan + Playbook compliance.** Plan monthly view shows Hawks discipline %; Playbook detail breaks it down per screen; bias data is the input. Fix the weakest screen at the source.
4. **Cap as forcing function.** 3 trades/day cap → if you over-trade, the trades after #3 are rejected → forces you to wait for the best setups.
