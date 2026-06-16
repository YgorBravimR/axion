import { randomUUID } from "crypto"
import { addHours } from "date-fns"
import { and, between, eq, inArray } from "drizzle-orm"
import { db } from "@/db/drizzle"
import {
	trades,
	assets,
	timeframes,
	tradeEnrichmentSnapshots,
} from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { isFrameworkSignal } from "@/lib/error-utils"
import { resolveBrickSize5mPoints } from "@/lib/enrichment/brick-size-resolver"
import { runDryRun } from "@/lib/enrichment/run-dry-run"
import {
	ENRICHMENT_ENGINE_VERSION,
	DRAFT_TTL_HOURS,
} from "@/lib/enrichment/constants"
import { DEFAULT_HAWKS_CONFIG } from "@/lib/enrichment/hawks-config"
import { getCandleStore } from "@/lib/candle-store"
import type { ActionResponse } from "@/types"
import type {
	StartDryRunInput,
	StartDryRunOutput,
} from "@/app/actions/enrichment.types"
import type { ProfitChartOperation } from "@/lib/csv-parser"
import type { EnrichmentContext } from "@/lib/enrichment/types"

const startDryRunImpl = async (
	input: StartDryRunInput
): Promise<ActionResponse<StartDryRunOutput>> => {
	try {
		const authContext = await requireAuth()
		const runId = randomUUID()

		// Parse operations JSON if provided
		const opsMap = new Map<number, ProfitChartOperation>()
		if (input.parsedOperationsJson) {
			try {
				const ops = JSON.parse(
					input.parsedOperationsJson
				) as ProfitChartOperation[]
				for (const op of ops) {
					opsMap.set(op.profitOperationNumber, op)
				}
			} catch (parseErr) {
				if (!isFrameworkSignal(parseErr)) {
					console.error("Failed to parse operations JSON:", parseErr)
				}
				// Continue with empty map if parse fails
			}
		}

		// Query trades for this account in the date range with pending/partial status
		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const tradesToEnrich = await db.query.trades.findMany({
			where: and(
				accountCondition,
				between(trades.entryDate, input.dateFrom, input.dateTo),
				inArray(trades.enrichmentStatus, ["pending", "partial"]),
				eq(trades.isArchived, false)
			),
		})

		// Look up timeframe for candle loading (prefer hawk_5m_win, fallback to any)
		const timeframe = await db.query.timeframes.findFirst({
			where: eq(timeframes.code, "hawk_5m_win"),
		})

		if (!timeframe && tradesToEnrich.length > 0) {
			console.warn(
				"No hawk_5m_win timeframe found; candles will be unavailable"
			)
		}

		// Process trades in parallel instead of sequentially
		const snapshotPromises = tradesToEnrich.map(async (trade) => {
			try {
				// Look up asset by symbol
				const asset = await db.query.assets.findFirst({
					where: eq(assets.symbol, trade.asset),
				})

				let brickSize5mPoints: number | null = null
				if (asset) {
					brickSize5mPoints = await resolveBrickSize5mPoints(
						asset.id,
						trade.entryDate
					)
				}

				// Load candles if both dates present and timeframe exists
				let candles = null
				if (trade.entryDate && trade.exitDate && timeframe && asset) {
					try {
						candles = await getCandleStore().fetchRange({
							assetId: asset.id,
							timeframeId: timeframe.id,
							from: trade.entryDate,
							to: trade.exitDate,
							indicatorKeys: [],
						})
					} catch (candleErr) {
						if (!isFrameworkSignal(candleErr)) {
							console.error("Failed to load candles:", candleErr)
						}
						candles = null
					}
				}

				// Build enrichment context
				const profitOp = opsMap.get(trade.profitOperationNumber ?? -1) ?? null
				const ctx: EnrichmentContext = {
					candles,
					profitOperation: profitOp,
					hawksConfig: DEFAULT_HAWKS_CONFIG,
					brickSize5mPoints,
					pointValue: 1, // Default point value; asset-specific values would come from asset lookup
				}

				// Run dry run
				const dryRunResult = runDryRun(trade, ctx)

				// Capture baseline: current values of fields that will be enriched
				const baseline = {
					stopLoss: trade.stopLoss,
					takeProfit: trade.takeProfit,
					entry: trade.entryPrice,
					exit: trade.exitPrice,
					pnl: trade.pnl,
					outcome: trade.outcome,
					realizedRMultiple: trade.realizedRMultiple,
				}

				// Insert snapshot
				const snapshot = await db
					.insert(tradeEnrichmentSnapshots)
					.values({
						tradeId: trade.id,
						version: (trade.enrichmentVersion ?? 0) + 1,
						dryRunOutput: {
							result: dryRunResult,
							baseline,
						} as unknown as Record<string, unknown>,
						acceptedFields: null,
						rejectedFields: null,
						enrichmentEngineVersion: ENRICHMENT_ENGINE_VERSION,
						candleDataLoadedAt: new Date(),
						status: "draft",
						runId: runId as unknown as string,
						expiresAt: addHours(new Date(), DRAFT_TTL_HOURS),
					})
					.returning({ id: tradeEnrichmentSnapshots.id })

				return snapshot[0]?.id ?? null
			} catch (tradeErr) {
				if (!isFrameworkSignal(tradeErr)) {
					console.error(`Failed to process trade ${trade.id}:`, tradeErr)
				}
				// Return null on individual failure, continue with next trade
				return null
			}
		})

		const snapshotResults = await Promise.all(snapshotPromises)
		const snapshotIds = snapshotResults.filter(
			(id): id is string => id !== null
		)

		return {
			status: "success",
			message: `Dry run started: ${tradesToEnrich.length} trades processed`,
			data: {
				runId,
				tradeCount: tradesToEnrich.length,
				snapshotIds,
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error starting dry run:", error)
		}
		return {
			status: "error",
			message: "Failed to start dry run",
		}
	}
}

export { startDryRunImpl }
