/**
 * Hawks circuit breaker — max 3 trades per day per account.
 *
 * Pedro's rule: "no quarto trade você devolve, no quinto pega operacional".
 * When Hawk's Mode is active, attempting a fourth entry on the same day is
 * blocked (or warned) by this guard.
 *
 * @see docs/hawks-mode-research.md § 5
 */

import { and, eq, gte, lt } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { isHawksModeActive } from "@/lib/hawks/deactivate-mode"

const HAWKS_MAX_DAILY_TRADES = 3

const dayBoundaries = (date: Date) => {
	const start = new Date(date)
	start.setHours(0, 0, 0, 0)
	const end = new Date(start)
	end.setDate(end.getDate() + 1)
	return { start, end }
}

interface CircuitBreakerState {
	hawksActive: boolean
	tradeCount: number
	limit: number
	exceeded: boolean
}

const getHawksCircuitBreakerState = async ({
	accountId,
	date = new Date(),
}: {
	accountId: string
	date?: Date
}): Promise<CircuitBreakerState> => {
	const hawksActive = await isHawksModeActive(accountId)

	if (!hawksActive) {
		return {
			hawksActive: false,
			tradeCount: 0,
			limit: HAWKS_MAX_DAILY_TRADES,
			exceeded: false,
		}
	}

	const { start, end } = dayBoundaries(date)
	const dayTrades = await db.query.trades.findMany({
		where: and(
			eq(trades.accountId, accountId),
			gte(trades.entryDate, start),
			lt(trades.entryDate, end)
		),
	})

	const tradeCount = dayTrades.length

	return {
		hawksActive: true,
		tradeCount,
		limit: HAWKS_MAX_DAILY_TRADES,
		exceeded: tradeCount >= HAWKS_MAX_DAILY_TRADES,
	}
}

export { getHawksCircuitBreakerState, HAWKS_MAX_DAILY_TRADES }
export type { CircuitBreakerState }
