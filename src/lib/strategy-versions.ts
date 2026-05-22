import { db } from "@/db/drizzle"
import { strategies, strategyVersions, type Strategy } from "@/db/schema"
import { and, eq } from "drizzle-orm"

type StrategySnapshotFields = Pick<
	Strategy,
	| "name"
	| "description"
	| "entryCriteria"
	| "exitCriteria"
	| "riskRules"
	| "stopR"
	| "partialR"
	| "partialProportion"
	| "finalR"
	| "protectionR"
	| "defaultInstrumentSymbol"
	| "maxRiskPercent"
	| "screenshotUrl"
	| "screenshotS3Key"
	| "notes"
>

export const snapshotStrategy = (
	strategyId: string,
	version: number,
	fields: StrategySnapshotFields
) => ({
	strategyId,
	version,
	name: fields.name,
	description: fields.description,
	entryCriteria: fields.entryCriteria,
	exitCriteria: fields.exitCriteria,
	riskRules: fields.riskRules,
	stopR: fields.stopR,
	partialR: fields.partialR,
	partialProportion: fields.partialProportion,
	finalR: fields.finalR,
	protectionR: fields.protectionR,
	defaultInstrumentSymbol: fields.defaultInstrumentSymbol,
	maxRiskPercent: fields.maxRiskPercent,
	screenshotUrl: fields.screenshotUrl,
	screenshotS3Key: fields.screenshotS3Key,
	notes: fields.notes,
})

export const getCurrentVersionId = async (
	strategyId: string,
	currentVersion: number
): Promise<string | null> => {
	const row = await db.query.strategyVersions.findFirst({
		where: and(
			eq(strategyVersions.strategyId, strategyId),
			eq(strategyVersions.version, currentVersion)
		),
		columns: { id: true },
	})
	return row?.id ?? null
}

// Resolves the version pin for a trade insert. Returns null when the trade
// has no strategy attached — callers should write null to strategyVersionId
// in that case. If the strategy exists but its v{currentVersion} row is
// missing the function returns null too; this should never happen post-Phase A
// migration but the read is forgiving rather than throwing.
export const resolveCurrentVersionIdForTrade = async (
	strategyId: string | null | undefined
): Promise<string | null> => {
	if (!strategyId) {
		return null
	}
	const strategy = await db.query.strategies.findFirst({
		where: eq(strategies.id, strategyId),
		columns: { currentVersion: true },
	})
	if (!strategy) {
		return null
	}
	return getCurrentVersionId(strategyId, strategy.currentVersion)
}
