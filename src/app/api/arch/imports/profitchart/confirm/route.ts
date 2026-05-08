import type { NextRequest } from "next/server"
import { archAuth } from "../../../_lib/auth"
import { archSuccess, archError } from "../../../_lib/helpers"
import { ARCH_PROFITCHART_CACHE } from "../route"
import { createArchTrade } from "../../../_lib/trade-create"
import type { ArchCreateTradeBody } from "../../../_lib/trade-create"
import type { FormattedTrade } from "../../../_lib/helpers"
import type { ProfitChartProcessedTrade } from "../../../_lib/profitchart-validate"

interface ProfitChartEdit {
	strategy?: string
	strategyId?: string
	timeframe?: string
	timeframeId?: string
	tags?: string[]
	tagIds?: string[]
	preTradeThoughts?: string
	postTradeReflection?: string
	lessonLearned?: string
	disciplineNotes?: string
	followedPlan?: boolean
	stopLoss?: number
	takeProfit?: number
	setupRank?: "A" | "AA" | "AAA" | null
	rating?: "A" | "B" | "C" | "D" | "F" | null
	screenshotUrl?: string | null
	screenshotS3Key?: string | null
}

interface ProfitChartConfirmBody {
	importId: string
	accountId?: string
	edits?: Record<string, ProfitChartEdit>
	skip?: string[]
	only?: string[]
}

interface ConfirmRowError {
	rowId: string
	rowNumber: number
	code: string
	detail: string
}

/**
 * Convert a validated ProfitChart row + edits into the arch create-trade body.
 * Edits override original CSV-parsed values where provided. ID-based references
 * (strategyId, timeframeId, tagIds) are resolved against the cache's lookup
 * data — names attached via the resolved entity get sent to createArchTrade,
 * which already performs fuzzy name resolution downstream.
 */
const buildCreateBody = (
	row: ProfitChartProcessedTrade,
	edit: ProfitChartEdit | undefined,
	idMaps: {
		strategyIdToName: Map<string, string>
		timeframeIdToName: Map<string, string>
		tagIdToName: Map<string, string>
	}
): ArchCreateTradeBody => {
	const original = row.originalData
	const assetSymbol = row.assetConfig?.symbol ?? original.normalizedAsset

	let strategy = edit?.strategy ?? original.strategyCode
	if (!strategy && edit?.strategyId) {
		strategy = idMaps.strategyIdToName.get(edit.strategyId)
	}

	let timeframe = edit?.timeframe ?? original.timeframeCode
	if (!timeframe && edit?.timeframeId) {
		timeframe = idMaps.timeframeIdToName.get(edit.timeframeId)
	}

	let tags = edit?.tags ?? original.tagNames
	if ((!tags || tags.length === 0) && edit?.tagIds?.length) {
		tags = edit.tagIds
			.map((id) => idMaps.tagIdToName.get(id))
			.filter((name): name is string => !!name)
	}

	const stopLoss = edit?.stopLoss ?? original.stopLoss ?? undefined
	const takeProfit = edit?.takeProfit ?? original.takeProfit ?? undefined
	const followedPlan = edit?.followedPlan ?? original.followedPlan ?? undefined

	const body: ArchCreateTradeBody = {
		asset: assetSymbol,
		direction: original.direction,
		entryDate: original.entryDate,
		entryPrice: Number(original.entryPrice),
		positionSize: Number(original.positionSize),
	}

	if (original.exitDate) {
		body.exitDate = original.exitDate
	}
	if (original.exitPrice !== undefined && original.exitPrice !== null) {
		body.exitPrice = Number(original.exitPrice)
	}
	if (stopLoss !== undefined && stopLoss !== null) {
		body.stopLoss = Number(stopLoss)
	}
	if (takeProfit !== undefined && takeProfit !== null) {
		body.takeProfit = Number(takeProfit)
	}
	if (strategy) {
		body.strategy = strategy
	}
	if (timeframe) {
		body.timeframe = timeframe
	}
	if (tags && tags.length > 0) {
		body.tags = tags
	}
	const preTradeThoughts =
		edit?.preTradeThoughts ?? original.preTradeThoughts ?? undefined
	if (preTradeThoughts) {
		body.preTradeThoughts = preTradeThoughts
	}
	const postTradeReflection =
		edit?.postTradeReflection ?? original.postTradeReflection ?? undefined
	if (postTradeReflection) {
		body.postTradeReflection = postTradeReflection
	}
	const lessonLearned =
		edit?.lessonLearned ?? original.lessonLearned ?? undefined
	if (lessonLearned) {
		body.lessonLearned = lessonLearned
	}
	const disciplineNotes =
		edit?.disciplineNotes ?? original.disciplineNotes ?? undefined
	if (disciplineNotes) {
		body.disciplineNotes = disciplineNotes
	}
	if (followedPlan !== undefined) {
		body.followedPlan = followedPlan
	}
	if (edit?.setupRank !== undefined) {
		body.setupRank = edit.setupRank
	}
	if (edit?.rating !== undefined) {
		body.rating = edit.rating
	}
	if (edit?.screenshotUrl !== undefined) {
		body.screenshotUrl = edit.screenshotUrl
	}
	if (edit?.screenshotS3Key !== undefined) {
		body.screenshotS3Key = edit.screenshotS3Key
	}

	return body
}

/**
 * POST /api/arch/imports/profitchart/confirm
 *
 * Commits a previously-previewed ProfitChart import. Auto-skipped rows
 * (unknown asset, duplicate hash) are never committed regardless of input.
 * For everything else, behavior is:
 *
 *   - `only` whitelist: commit just those row IDs (still excludes auto-skipped).
 *   - `skip` blacklist: commit all valid|warning rows except these.
 *   - default: commit all valid|warning rows.
 *
 * `edits` lets the caller override per-row strategy/timeframe/tags/notes/risk
 * fields, mirroring the in-app preview UI's edit controls.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = (await request.json()) as ProfitChartConfirmBody
		if (!body.importId) {
			return archError("Missing required field: importId", [
				{ code: "MISSING_FIELDS", detail: "Required: importId" },
			])
		}

		const cached = ARCH_PROFITCHART_CACHE.get(body.importId)
		if (!cached) {
			return archError(
				"Import preview expired or not found",
				[
					{
						code: "PREVIEW_NOT_FOUND",
						detail:
							"Re-run /api/arch/imports/profitchart to obtain a fresh importId",
					},
				],
				404
			)
		}

		if (cached.userId !== auth.userId) {
			return archError(
				"Import preview belongs to a different user",
				[{ code: "FORBIDDEN", detail: "Preview ownership mismatch" }],
				403
			)
		}

		const accountId = body.accountId ?? cached.accountId
		const accountAllowed = auth.showAllAccounts
			? auth.allAccountIds.includes(accountId)
			: accountId === auth.accountId
		if (!accountAllowed) {
			return archError(
				"Account not accessible",
				[
					{
						code: "FORBIDDEN_ACCOUNT",
						detail: "accountId is not owned by the authenticated user",
					},
				],
				403
			)
		}

		const strategyIdToName = new Map(
			cached.strategies.map((s) => [s.id, s.code || s.name])
		)
		const timeframeIdToName = new Map(
			cached.timeframes.map((t) => [t.id, t.code || t.name])
		)
		const tagIdToName = new Map(cached.tags.map((t) => [t.id, t.name]))

		const onlySet = body.only ? new Set(body.only) : null
		const skipSet = new Set(body.skip ?? [])
		const edits = body.edits ?? {}

		const successes: FormattedTrade[] = []
		const errors: ConfirmRowError[] = []
		const skipped: { rowId: string; rowNumber: number; reason: string }[] = []

		// Auth context override: confirm body may target a different account than
		// the preview was generated against. createArchTrade reads auth.accountId,
		// so we substitute when the caller provided one.
		const effectiveAuth =
			accountId === auth.accountId ? auth : { ...auth, accountId }

		for (const row of cached.trades) {
			if (row.status === "skipped" || !row.assetFound) {
				skipped.push({
					rowId: row.id,
					rowNumber: row.rowNumber,
					reason: row.skipReason ?? "Auto-skipped by validator",
				})
				continue
			}
			if (onlySet && !onlySet.has(row.id)) {
				skipped.push({
					rowId: row.id,
					rowNumber: row.rowNumber,
					reason: "Not in `only` whitelist",
				})
				continue
			}
			if (skipSet.has(row.id)) {
				skipped.push({
					rowId: row.id,
					rowNumber: row.rowNumber,
					reason: "Listed in `skip`",
				})
				continue
			}

			const createBody = buildCreateBody(row, edits[row.id], {
				strategyIdToName,
				timeframeIdToName,
				tagIdToName,
			})

			try {
				// eslint-disable-next-line no-await-in-loop -- per-row sequential to keep error isolation and dedup-hash check ordering
				const result = await createArchTrade(createBody, effectiveAuth)
				if (result.ok) {
					successes.push(result.trade)
				} else {
					errors.push({
						rowId: row.id,
						rowNumber: row.rowNumber,
						code: result.code,
						detail: result.detail,
					})
				}
			} catch (rowError) {
				errors.push({
					rowId: row.id,
					rowNumber: row.rowNumber,
					code: "ROW_FAILED",
					detail:
						rowError instanceof Error ? rowError.message : String(rowError),
				})
			}
		}

		ARCH_PROFITCHART_CACHE.delete(body.importId)

		return archSuccess("ProfitChart import committed", {
			importId: body.importId,
			created: successes.length,
			failed: errors.length,
			skipped: skipped.length,
			trades: successes,
			errors,
			skippedRows: skipped,
		})
	} catch (error) {
		return archError(
			"Failed to confirm ProfitChart import",
			[{ code: "CONFIRM_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
