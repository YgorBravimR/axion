// src/types/integration.ts

/**
 * The canonical shape for any rolled-up trading period (week / month / year).
 * Every feature that reads aggregated P&L works with this type.
 * All monetary values are in BRL cents (integers).
 */
interface PeriodResult {
  grossCents: number
  netCents: number
  points: number
  tradingDays: number
  gainDays: number
  lossDays: number
}

/**
 * A planning target for a period — three views of the same goal.
 * All monetary values are in BRL cents.
 */
interface MetaTarget {
  grossCents: number
  netCents: number
  points: number
}

/**
 * A single capital movement event on an account.
 * Used by Annual Reporting, Equity Shield, Monte Carlo, and Yearly Plan.
 */
interface CapitalEvent {
  id: string
  eventType: "deposit" | "withdrawal"
  amountCents: number
  eventDate: string  // ISO date "YYYY-MM-DD"
  notes?: string
}

/**
 * Snapshot of account capital at a point in time.
 * balanceCents is the computed running total; events is the ordered history.
 */
interface CapitalSnapshot {
  balanceCents: number
  events: CapitalEvent[]
}

export type { PeriodResult, MetaTarget, CapitalSnapshot, CapitalEvent }
