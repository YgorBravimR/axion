import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { db } from "@/db/drizzle"
import { trades, strategies } from "@/db/schema"
import { eq, and, inArray, isNotNull, desc } from "drizzle-orm"
import type { DataSourceOption } from "@/types/monte-carlo"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const options: DataSourceOption[] = []

		const accountStrategies = await db.query.strategies.findMany({
			where: and(
				eq(strategies.userId, auth.userId),
				eq(strategies.isActive, true)
			),
			orderBy: [desc(strategies.name)],
		})

		for (const strategy of accountStrategies) {
			// eslint-disable-next-line no-await-in-loop -- trade count per strategy for data source options; small N, sequential acceptable
			const tradesCount = await db
				.select()
				.from(trades)
				.where(
					and(eq(trades.strategyId, strategy.id), isNotNull(trades.outcome))
				)
				.then((rows) => rows.length)

			options.push({
				type: "strategy",
				strategyId: strategy.id,
				label: strategy.name,
				description: strategy.description || undefined,
				tradesCount,
				disabled: tradesCount < 10,
				disabledReason:
					tradesCount < 10 ? "Minimum 10 trades required" : undefined,
			})
		}

		const allAccountTrades = await db
			.select()
			.from(trades)
			.where(
				and(eq(trades.accountId, auth.accountId), isNotNull(trades.outcome))
			)
			.then((rows) => rows.length)

		options.push({
			type: "all_strategies",
			label: "All Strategies",
			description: "Combines trades from all strategies in the current account",
			tradesCount: allAccountTrades,
			disabled: allAccountTrades < 10,
			disabledReason:
				allAccountTrades < 10 ? "Minimum 10 trades required" : undefined,
		})

		if (auth.showAllAccounts && auth.allAccountIds.length > 1) {
			const universalTrades = await db
				.select()
				.from(trades)
				.where(
					and(
						inArray(trades.accountId, auth.allAccountIds),
						isNotNull(trades.outcome)
					)
				)
				.then((rows) => rows.length)

			options.push({
				type: "universal",
				label: "All Accounts & Strategies",
				description: "Combines trades from all accounts and strategies",
				tradesCount: universalTrades,
				disabled: universalTrades < 10,
				disabledReason:
					universalTrades < 10 ? "Minimum 10 trades required" : undefined,
			})
		}

		return archSuccess("Data sources retrieved", options)
	} catch (error) {
		return archError(
			"Failed to retrieve data sources",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
