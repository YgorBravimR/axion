import { and, eq, inArray, isNull, or } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { accountFeeRates } from "@/db/schema"
import { ASSET_FEE_DEFAULTS } from "@/lib/tax/asset-defaults"
import type { FeeRatesEntry } from "@/lib/tax/types"

interface ResolveFeeSnapshotInput {
	accountId: string
	assetSymbol: string
}

interface FeeSnapshot {
	commissionCents: number
	feesCents: number
}

const computeSnapshot = (entry: {
	txCorretagemCents: number
	txRegistroCents: number
	emolumentosCents: number
	issRatePercent: string
}): FeeSnapshot => {
	const issRate = parseFloat(entry.issRatePercent)
	const safeIssRate = Number.isFinite(issRate) ? issRate : 0
	const issCents = Math.round((entry.txCorretagemCents * safeIssRate) / 100)
	return {
		commissionCents: entry.txCorretagemCents + issCents,
		feesCents: entry.txRegistroCents + entry.emolumentosCents,
	}
}

const fromHardcodedDefault = (assetSymbol: string): FeeSnapshot => {
	const preset: FeeRatesEntry | undefined = ASSET_FEE_DEFAULTS[assetSymbol]
	if (!preset) {
		return { commissionCents: 0, feesCents: 0 }
	}
	return computeSnapshot(preset)
}

const resolveFeeSnapshot = async ({
	accountId,
	assetSymbol,
}: ResolveFeeSnapshotInput): Promise<FeeSnapshot> => {
	const perAsset = await db.query.accountFeeRates.findFirst({
		where: and(
			eq(accountFeeRates.accountId, accountId),
			eq(accountFeeRates.assetSymbol, assetSymbol)
		),
	})
	if (perAsset) {
		return computeSnapshot(perAsset)
	}

	const accountDefault = await db.query.accountFeeRates.findFirst({
		where: and(
			eq(accountFeeRates.accountId, accountId),
			isNull(accountFeeRates.assetSymbol)
		),
	})
	if (accountDefault) {
		return computeSnapshot(accountDefault)
	}

	return fromHardcodedDefault(assetSymbol)
}

/**
 * Batch variant of `resolveFeeSnapshot`. Loads the per-asset rows (for the
 * requested symbols) AND the account-default row in a SINGLE round-trip,
 * then resolves each symbol against the same three-tier fallback chain.
 *
 * Use this instead of looping `resolveFeeSnapshot` per asset when you have
 * 2+ symbols for the same account — e.g. CSV import lookup. Per-call
 * semantics are byte-identical to `resolveFeeSnapshot`.
 */
const resolveFeeSnapshotsBatch = async ({
	accountId,
	assetSymbols,
}: {
	accountId: string
	assetSymbols: string[]
}): Promise<Map<string, FeeSnapshot>> => {
	const out = new Map<string, FeeSnapshot>()
	if (assetSymbols.length === 0) {
		return out
	}

	// One query that pulls every per-asset row for the requested symbols AND
	// the account-default row (NULL assetSymbol). Postgres handles the
	// `OR (symbol IN (...) , symbol IS NULL)` in a single index scan on
	// `account_fee_rates_account_asset_idx`.
	const rows = await db.query.accountFeeRates.findMany({
		where: and(
			eq(accountFeeRates.accountId, accountId),
			or(
				inArray(accountFeeRates.assetSymbol, assetSymbols),
				isNull(accountFeeRates.assetSymbol)
			)
		),
	})

	let accountDefault: (typeof rows)[number] | undefined
	const perAssetMap = new Map<string, (typeof rows)[number]>()
	for (const row of rows) {
		if (row.assetSymbol === null) {
			accountDefault = row
		} else {
			perAssetMap.set(row.assetSymbol, row)
		}
	}

	for (const symbol of assetSymbols) {
		const perAsset = perAssetMap.get(symbol)
		if (perAsset) {
			out.set(symbol, computeSnapshot(perAsset))
			continue
		}
		if (accountDefault) {
			out.set(symbol, computeSnapshot(accountDefault))
			continue
		}
		out.set(symbol, fromHardcodedDefault(symbol))
	}

	return out
}

export { resolveFeeSnapshot, resolveFeeSnapshotsBatch }
export type { FeeSnapshot, ResolveFeeSnapshotInput }
