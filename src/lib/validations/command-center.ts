import { z } from "zod"

// Checklist item schema
export const checklistItemSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1, "validation.commandCenter.itemLabelRequired").max(200, "validation.commandCenter.itemLabelMax"),
	order: z.number().int().min(0),
})

// Create checklist schema
export const createChecklistSchema = z.object({
	name: z
		.string()
		.min(1, "validation.commandCenter.checklistNameRequired")
		.max(100, "validation.commandCenter.checklistNameMax"),
	items: z
		.array(checklistItemSchema)
		.min(1, "validation.commandCenter.atLeastOneItem")
		.max(50, "validation.commandCenter.maxItems"),
	isActive: z.boolean().default(true),
})

export const updateChecklistSchema = createChecklistSchema.partial()

// Checklist completion schema
export const updateCompletionSchema = z.object({
	checklistId: z.string().uuid("validation.commandCenter.invalidChecklistId"),
	itemId: z.string().min(1),
	completed: z.boolean(),
})

// Mood options
export const moodOptions = ["great", "good", "neutral", "bad", "terrible"] as const
export type MoodType = (typeof moodOptions)[number]

// Bias options
export const biasOptions = ["long", "short", "neutral"] as const
export type BiasType = (typeof biasOptions)[number]

// Daily notes schema
export const dailyNotesSchema = z.object({
	date: z.string().or(z.date()),
	preMarketNotes: z
		.string()
		.max(10000, "validation.commandCenter.preMarketNotesMax")
		.optional()
		.nullable(),
	postMarketNotes: z
		.string()
		.max(10000, "validation.commandCenter.postMarketNotesMax")
		.optional()
		.nullable(),
	mood: z.enum(moodOptions).optional().nullable(),
})

// Asset settings schema
export const assetSettingsSchema = z.object({
	assetId: z.string().uuid("validation.commandCenter.invalidAssetId"),
	bias: z.enum(biasOptions).optional().nullable(),
	maxDailyTrades: z.coerce
		.number()
		.int("validation.commandCenter.maxDailyTradesInteger")
		.positive("validation.commandCenter.maxDailyTradesPositive")
		.max(1000, "validation.commandCenter.maxDailyTradesMax")
		.optional()
		.nullable(),
	maxPositionSize: z.coerce
		.number()
		.int("validation.commandCenter.maxPositionSizeInteger")
		.positive("validation.commandCenter.maxPositionSizePositive")
		.max(100000, "validation.commandCenter.maxPositionSizeMax")
		.optional()
		.nullable(),
	notes: z
		.string()
		.max(2000, "validation.commandCenter.notesMax")
		.optional()
		.nullable(),
	isActive: z.boolean().default(true),
})

// Type exports
export type ChecklistItem = z.infer<typeof checklistItemSchema>
export type CreateChecklistInput = z.infer<typeof createChecklistSchema>
export type UpdateChecklistInput = z.infer<typeof updateChecklistSchema>
export type UpdateCompletionInput = z.infer<typeof updateCompletionSchema>
export type DailyNotesInput = z.infer<typeof dailyNotesSchema>
export type AssetSettingsInput = z.infer<typeof assetSettingsSchema>

// Circuit breaker status type (not a zod schema, just a type)
export interface CircuitBreakerStatus {
	// Existing fields
	dailyPnL: number
	tradesCount: number
	consecutiveLosses: number
	profitTargetHit: boolean
	lossLimitHit: boolean
	maxTradesHit: boolean
	maxConsecutiveLossesHit: boolean
	shouldStopTrading: boolean
	alerts: string[]

	// Resolved limits from monthly plan
	profitTargetCents: number
	dailyLossLimitCents: number
	maxTrades: number | null
	maxConsecutiveLosses: number | null
	reduceRiskAfterLoss: boolean
	riskReductionFactor: string | null

	// Risk dashboard fields
	riskUsedTodayCents: number
	remainingDailyRiskCents: number
	recommendedRiskCents: number
	monthlyPnL: number
	monthlyLossLimitCents: number
	remainingMonthlyCents: number
	isMonthlyLimitHit: boolean
	isSecondOpBlocked: boolean
}
