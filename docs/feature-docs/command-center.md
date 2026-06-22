# Command Center

> The pre-market plan + live session dashboard. The single highest-traffic surface in Axion: this is where the trader's day starts and ends.

**Routes:** `/[locale]/command-center` (defaults to today, accepts `?date=YYYY-MM-DD`)
**Server actions:** `command-center.ts`, `live-trading-status.ts`, `hawks-mode.ts`, `hawks-bias.ts`, `equity-shield.ts`
**Files:** `src/app/[locale]/(app)/command-center/{page.tsx,command-center-tabs.tsx,command-center-content.tsx}`

---

## Purpose

Give the trader one screen where they can (a) write down the plan before the bell, (b) follow live status during the session, (c) confirm bias/screens (Hawks), and (d) write the post-mortem after the close — all gated by a circuit breaker that resolves what risk is allowed today.

## What lives there

Three tabs:

1. **Command** — the workhorse.
   - **Pre-market notes** and **Post-market notes** (free-text editors, side-by-side, premium).
   - **Circuit breaker panel** — current `oneRCents`, recommended risk per trade, daily loss cap, max trades. Pulls from the fractal-plan resolver and active risk profile.
   - **Daily checklist** — user-defined items (e.g. "checked calendar", "set alerts", "no news"). Completion % per day.
   - **Asset rules** — per-asset trading permissions for today (premium).
   - **Daily P&L summary** — count, P&L, win rate, streak.
   - **Hawks bias form** (Hawks-only) — bullish/bearish/neutral + screen checkboxes (Renko60, MACD, EMA stack, VWAP, ajuste).
   - **Quick-add FAB** — bottom-right shortcut to journal entry with asset/timeframe pre-filled.
2. **Monitor** — market monitor (lazy-loaded).
3. **Calculator** — position calculator (risk, contracts, entry/exit levels).

## Inputs

- `date` URL param (defaults to today; past dates render read-only).
- Pre/post market notes (text).
- Daily checklist items (CRUD).
- Asset rules per session.
- Hawks bias + screen flags (one row per `tradingDay`).
- Implicit: the active account, active risk profile, and account mode (Hawks/default).

## Outputs

- `getTodayCompletions()` → checklist progress per day.
- `getCircuitBreakerStatus()` → max risk per trade, daily loss cap, max trades. **This is the gate every journal entry hits.**
- `getDailySummary()` → today's P&L, count, win rate.
- `getLiveTradingStatus()` → current R drawn, remaining R budget, decision-tree stage.
- `dailyHawksBias` row (Hawks).
- Post/pre market notes saved per (`accountId`, `date`).

## Cross-feature integrations

- **Plan** — the resolver reads the active monthly risk profile and outputs `oneRCents` and limits that the breaker enforces.
- **Journal** — trade entry calls `checkHawksCascade()` which reads the bias row and the daily ordinal. No bias → trade gated. Daily ordinal ≥ cap → trade gated.
- **Equity Shield** — the daily loss limit is enforced by `equity-shield.ts` at trade creation.
- **Dashboard** — pulls today's command-center stats for the greeting screen.
- **Hawks Audit** (dev) — replays the same cascade so devs can reproduce decisions.

## Where it fails

- **No active account → 404 redirect.** First-run users who skip account creation crash here.
- **No risk profile linked → circuit breaker shows null.** UI renders but doesn't gate anything; trader can over-risk and not know.
- **Email unverified → 401 redirect.** Surprising mid-session.
- **Hawks bias missing on `isToday` → soft alert.** The page still renders, so it's possible to scroll past the alert and try to trade, then get bounced at the journal.
- **Time-travel is read-only without warning copy.** Loading `?date=2026-06-18` lets you read but editing controls disable silently. New users think the page is broken.
- **Pre/post market notes are premium.** Free users see grayed-out shells with no clear "upgrade" CTA.
- **Asset rules are premium.** Same problem.
- **Checklist is per-account, not per-strategy.** A trader running two strategies on the same account can't have two parallel checklists.
- **Calculator tab is generic** — doesn't read the active strategy's R-target or the day's circuit breaker. Power users have to retype values they already saved elsewhere.
- **Live trading status doesn't update in real time** — it's a server-rendered snapshot. The trader needs to refresh to see updated R drawn.

## Power combos

1. **Plan-resolver → breaker → journal gate.** Set the monthly risk profile to a tighter tier on Sunday → Monday's breaker shows the new caps → every trade you log gets blocked at the right limit. End of week, Plan compliance trend shows how often the breaker actually saved you.
2. **Hawks ritual chain.** Confirm bias (CC) → daily ordinal increments per Hawks-approved trade (Journal) → Dashboard's Hawks coaching card summarises win rate by bias at 90d → next morning's bias is informed by that data. Skipping any link breaks the loop.
3. **Same-day replay.** Trade live → file post-market notes referencing specific trade IDs → open Analytics filtered to today → screenshot the dashboard for a study buddy with the notes context attached. The CC is the only place that holds both the plan and the reflection on one screen.
4. **Checklist as habit forcing function.** Items like "verified macro calendar" or "no trades in first 5 min" — completion % per week becomes a hard KPI in the Sunday review. Pair with Plan compliance trend to see whether checklist discipline correlates with P&L.
