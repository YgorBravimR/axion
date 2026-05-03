// src/lib/aggregation/period-rollup.ts

import type { PeriodResult } from "@/types/integration"

interface TradeFact {
  id: string
  asset: string
  pnlCents: number
  commissionCents?: number
  feesCents?: number
  points?: number
  entryDate: Date
}

interface RollupOptions {
  year: number
  month?: number
  isoWeek?: number
}

/**
 * Extracts a local-calendar day key (YYYY-MM-DD) from a Date.
 *
 * Uses `getFullYear` / `getMonth` / `getDate` so the result reflects the
 * host's local timezone rather than UTC. This prevents a trade entered at
 * e.g. 23:00 BRT (UTC-3) from rolling over into the next UTC day.
 */
const localDayKey = (d: Date): string => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Rolls up a pre-filtered array of trade facts into a `PeriodResult`.
 *
 * ### Monetary totals
 * - `netCents` — sum of `pnlCents` across all trades (commissions/fees
 *   already deducted by the data layer before this function is called)
 * - `grossCents` — net P&L with costs recovered: `pnlCents + commissionCents
 *   + feesCents` per trade. Losing trades still produce a negative gross
 *   (sign preserved — costs don't flip a loss positive). BR convention:
 *   `Total Bruto = Total Líquido + Corretagem + Emolumentos + ISS`.
 *
 * ### Day counting
 * Trades are bucketed by local calendar date (see `localDayKey`). A day is
 * counted as a **gain day** when the sum of `pnlCents` for that day > 0, a
 * **loss day** when < 0. Breakeven days (net = 0) are excluded from
 * `gainDays`, `lossDays`, AND `tradingDays`. This matches the test contract
 * in which a single trade with `pnlCents = 0` produces all three as 0.
 *
 * ### Caller responsibilities
 * This function is **pure** — it performs no DB queries and applies no date
 * filtering. The caller (Task 0.6 period-queries) is responsible for
 * fetching the correct trades for the requested period before calling here.
 *
 * @param trades - Pre-filtered array of trade facts for the target period
 * @param _opts  - Caller context (year/month/isoWeek); reserved for future
 *   validation or per-period adjustments, unused in the current impl
 * @returns Aggregated `PeriodResult` for the supplied trades
 */
const rollupTrades = (trades: TradeFact[], _opts: RollupOptions): PeriodResult => {
  let grossCents = 0
  let netCents = 0
  let totalPoints = 0

  // Day-level net P&L accumulation — used for gain/loss day classification
  const dayNetCents = new Map<string, number>()

  for (const trade of trades) {
    // gross recovers costs from net pnl: gross = pnl + commission + fees.
    // Losing trades have negative gross (still net + costs, sign preserved).
    // BR convention: Total Bruto = Total Líquido + Corretagem + Emolumentos + ISS.
    grossCents += trade.pnlCents + (trade.commissionCents ?? 0) + (trade.feesCents ?? 0)
    netCents += trade.pnlCents
    totalPoints += trade.points ?? 0

    const dayKey = localDayKey(trade.entryDate)
    dayNetCents.set(dayKey, (dayNetCents.get(dayKey) ?? 0) + trade.pnlCents)
  }

  const gainDays = new Set<string>()
  const lossDays = new Set<string>()
  const allDays = new Set<string>()

  for (const [dayKey, dayNet] of dayNetCents) {
    if (dayNet > 0) {
      gainDays.add(dayKey)
      allDays.add(dayKey)
    } else if (dayNet < 0) {
      lossDays.add(dayKey)
      allDays.add(dayKey)
    }
    // breakeven day (dayNet === 0) intentionally excluded from all sets
  }

  return {
    grossCents,
    netCents,
    points: totalPoints,
    tradingDays: allDays.size,
    gainDays: gainDays.size,
    lossDays: lossDays.size,
  }
}

export { rollupTrades }
export type { RollupOptions, TradeFact }
