import { db } from "@/db/drizzle"
import { strategyVersions, type Strategy } from "@/db/schema"
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
