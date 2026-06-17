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
		const opsList: ProfitChartOperation[] = []
		if (input.parsedOperationsJson) {
			try {
				const ops = JSON.parse(
					input.parsedOperationsJson
				) as ProfitChartOperation[]
				for (const op of ops) {
					opsMap.set(op.profitOperationNumber, op)
					opsList.push(op)
				}
			} catch (parseErr) {
				if (!isFrameworkSignal(parseErr)) {
					console.error("Failed to parse operations JSON:", parseErr)
				}
				// Continue with empty map if parse fails
			}
		}

		const ENTRY_MATCH_TOLERANCE_MS = 60_000
		const matchOperationByWindow = (
			trade: typeof trades.$inferSelect
		): ProfitChartOperation | null => {
			if (!trade.entryDate) {
				return null
			}
			const tradeEntryMs = new Date(trade.entryDate).getTime()
			const tradeDirection = trade.direction
			const tradeAsset = trade.asset
			let best: { op: ProfitChartOperation; delta: number } | null = null
			for (const op of opsList) {
				if (op.normalizedAsset !== tradeAsset) {
					continue
				}
				if (op.direction !== tradeDirection) {
					continue
				}
				if (!op.entryDate) {
					continue
				}
				const opEntryMs = new Date(op.entryDate).getTime()
				const delta = Math.abs(opEntryMs - tradeEntryMs)
				if (delta > ENTRY_MATCH_TOLERANCE_MS) {
					continue
				}
				if (!best || delta < best.delta) {
					best = { op, delta }
				}
			}
			return best?.op ?? null
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

				// Load candles with 1-hour backward buffer for indicator-readout floor candle.
				let candles = null
				if (trade.entryDate && trade.exitDate && timeframe && asset) {
					const indicatorLookbackMs = 60 * 60 * 1000
					const fetchFrom = new Date(
						trade.entryDate.getTime() - indicatorLookbackMs
					)
					try {
						candles = await getCandleStore().fetchRange({
							assetId: asset.id,
							timeframeId: timeframe.id,
							from: fetchFrom,
							to: trade.exitDate,
							indicatorKeys: "*",
						})
					} catch (candleErr) {
						if (!isFrameworkSignal(candleErr)) {
							console.error("Failed to load candles:", candleErr)
						}
						candles = null
					}
				}

				// Build enrichment context
				const profitOp =
					opsMap.get(trade.profitOperationNumber ?? -1) ??
					matchOperationByWindow(trade)
				const ctx: EnrichmentContext = {
					candles,
					profitOperation: profitOp,
					hawksConfig: DEFAULT_HAWKS_CONFIG,
					brickSize5mPoints,
					pointValue: 1,
				}

				// Run dry run
				const dryRunResult = runDryRun(trade, ctx)

				// Flat baseline: trade column values. Pass cards and staleness check
				// read fields by key name (baseline['pnl'], etc.). Keys must match
				// what each pass writes to delta.fields.
				const num = (v: string | null) => (v == null ? null : Number(v))
				const baseline: Record<string, unknown> = {
					entryPrice: num(trade.entryPrice),
					exitPrice: num(trade.exitPrice),
					positionSize: num(trade.positionSize),
					pnl: num(trade.pnl),
					mfe: num(trade.mfe),
					mae: num(trade.mae),
					holdingMs:
						trade.entryDate && trade.exitDate
							? trade.exitDate.getTime() - trade.entryDate.getTime()
							: null,
					indicatorReadout: trade.indicatorReadout,
					setupRank: trade.setupRank,
					stopLoss: num(trade.stopLoss),
					takeProfit: num(trade.takeProfit),
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
