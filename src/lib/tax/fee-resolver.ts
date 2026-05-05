import { and, eq, isNull } from "drizzle-orm"
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
			eq(accountFeeRates.assetSymbol, assetSymbol),
		),
	})
	if (perAsset) return computeSnapshot(perAsset)

	const accountDefault = await db.query.accountFeeRates.findFirst({
		where: and(
			eq(accountFeeRates.accountId, accountId),
			isNull(accountFeeRates.assetSymbol),
		),
	})
	if (accountDefault) return computeSnapshot(accountDefault)

	return fromHardcodedDefault(assetSymbol)
}

export { resolveFeeSnapshot }
export type { FeeSnapshot, ResolveFeeSnapshotInput }
