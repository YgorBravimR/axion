/**
 * Tool: `get_user_trade_aggregates`
 *
 * Aggregate trade stats over a window with optional filters. Scoped to the
 * active account; never accepts userId/accountId. Money fields in the DB are
 * stored as decimal strings (text columns) — parse before summing.
 *
 * Returns a compact cohort summary the agent can narrate ("of 14 SHORT
 * trades on EURUSD this quarter, 4 won, 10 lost; avg R -0.4"). Sample size
 * is part of the return so the agent can refuse to narrate at n < 10
 * (Coach archetype rule).
 */
import { and, eq, gte, lte } from "drizzle-orm"
import { z } from "zod"
import { requireAuth } from "@/app/actions/auth"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"

const inputSchema = z.object({
	windowDays: z.number().int().min(1).max(365).default(90),
	direction: z.enum(["long", "short"]).optional(),
	asset: z.string().optional(),
})

type Input = z.infer<typeof inputSchema>

interface Output {
	totalTrades: number
	wins: number
	losses: number
	breakevens: number
	winRate: number
	totalPnlCents: number
	avgRMultiple: number | null
	avgMfeR: number | null
	avgMaeR: number | null
	windowDays: number
	filters: { direction: string | null; asset: string | null }
}

const parseDecimalOrZero = (raw: string | null | undefined): number => {
	if (raw === null || raw === undefined) {
		return 0
	}
	const n = Number(raw)
	return Number.isFinite(n) ? n : 0
}

const parseDecimalOrNull = (raw: string | null | undefined): number | null => {
	if (raw === null || raw === undefined) {
		return null
	}
	const n = Number(raw)
	return Number.isFinite(n) ? n : null
}

const average = (values: number[]): number | null => {
	if (values.length === 0) {
		return null
	}
	const sum = values.reduce((acc, v) => acc + v, 0)
	return sum / values.length
}

const getUserTradeAggregates = async (rawInput: Input): Promise<Output> => {
	const input = inputSchema.parse(rawInput)
	const { accountId } = await requireAuth()

	const since = new Date()
	since.setUTCDate(since.getUTCDate() - input.windowDays)
	const until = new Date()

	const conds = [
		eq(trades.accountId, accountId),
		gte(trades.entryDate, since),
		lte(trades.entryDate, until),
	]
	if (input.direction) {
		conds.push(eq(trades.direction, input.direction))
	}
	if (input.asset) {
		conds.push(eq(trades.asset, input.asset))
	}

	const rows = await db
		.select({
			outcome: trades.outcome,
			pnl: trades.pnl,
			realizedRMultiple: trades.realizedRMultiple,
			mfeR: trades.mfeR,
			maeR: trades.maeR,
		})
		.from(trades)
		.where(and(...conds))

	let wins = 0
	let losses = 0
	let breakevens = 0
	let totalPnlCents = 0
	const rMultiples: number[] = []
	const mfeRs: number[] = []
	const maeRs: number[] = []

	for (const row of rows) {
		if (row.outcome === "win") {
			wins += 1
		} else if (row.outcome === "loss") {
			losses += 1
		} else if (row.outcome === "breakeven") {
			breakevens += 1
		}
		totalPnlCents += parseDecimalOrZero(row.pnl)
		const r = parseDecimalOrNull(row.realizedRMultiple)
		if (r !== null) {
			rMultiples.push(r)
		}
		const mfe = parseDecimalOrNull(row.mfeR)
		if (mfe !== null) {
			mfeRs.push(mfe)
		}
		const mae = parseDecimalOrNull(row.maeR)
		if (mae !== null) {
			maeRs.push(mae)
		}
	}

	const totalTrades = rows.length
	const winRate = totalTrades === 0 ? 0 : (wins / totalTrades) * 100

	return {
		totalTrades,
		wins,
		losses,
		breakevens,
		winRate,
		totalPnlCents: Math.round(totalPnlCents),
		avgRMultiple: average(rMultiples),
		avgMfeR: average(mfeRs),
		avgMaeR: average(maeRs),
		windowDays: input.windowDays,
		filters: {
			direction: input.direction ?? null,
			asset: input.asset ?? null,
		},
	}
}

export { getUserTradeAggregates, inputSchema }
export type { Input, Output }
