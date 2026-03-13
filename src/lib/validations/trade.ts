import { z } from "zod"
import { BRT_OFFSET } from "@/lib/dates"

// Direction and outcome enums
export const tradeDirectionSchema = z.enum(["long", "short"])
export const tradeOutcomeSchema = z.enum(["win", "loss", "breakeven"])

/**
 * Coerce a value to Date, treating timezone-naive strings as BRT (UTC-3).
 * datetime-local inputs produce strings like "2026-03-11T09:00" without timezone.
 * Without this, `new Date()` would interpret them in the server/browser's local TZ.
 */
const coerceDateAsBrt = z.union([z.date(), z.string(), z.number()]).transform((val, ctx) => {
	if (val instanceof Date) return val

	if (typeof val === "string") {
		const hasTimezone = val.includes("Z") || val.includes("+") || /T.*-\d{2}:/.test(val)
		const dateStr = hasTimezone ? val : `${val}${BRT_OFFSET}`
		const date = new Date(dateStr)
		if (isNaN(date.getTime())) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: "validation.invalidDate" })
			return z.NEVER
		}
		return date
	}

	const date = new Date(val)
	if (isNaN(date.getTime())) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: "validation.invalidDate" })
		return z.NEVER
	}
	return date
})

// Base trade fields (used by both createTradeSchema and cross-field validation)
const tradeBaseFields = {
	// Basic Info
	asset: z
		.string()
		.min(1, "validation.trade.assetRequired")
		.max(20, "validation.trade.assetMaxLength")
		.transform((val) => val.toUpperCase()),
	direction: tradeDirectionSchema,
	timeframeId: z.string().uuid().optional().nullable(),

	// Timing
	entryDate: coerceDateAsBrt.pipe(z.date({ message: "validation.trade.entryDateRequired" })),
	exitDate: coerceDateAsBrt.optional(),

	// Execution
	entryPrice: z.coerce
		.number({ message: "validation.trade.entryPriceRequired" })
		.positive("validation.trade.entryPricePositive"),
	exitPrice: z.coerce
		.number()
		.positive("validation.trade.exitPricePositive")
		.optional(),
	positionSize: z.coerce
		.number({ message: "validation.trade.positionSizeRequired" })
		.positive("validation.trade.positionSizePositive"),

	// Risk Management
	stopLoss: z.coerce.number().positive("validation.trade.stopLossPositive").optional(),
	takeProfit: z.coerce
		.number()
		.positive("validation.trade.takeProfitPositive")
		.optional(),
	// Risk amount can be manually entered if stopLoss is not used
	// If stopLoss is provided, riskAmount will be auto-calculated from it
	riskAmount: z.coerce.number().positive("validation.trade.riskAmountPositive").optional(),
	// Note: plannedRMultiple is always calculated from takeProfit/stopLoss ratio

	// Results (can be auto-calculated or manual)
	pnl: z.coerce.number().optional(),
	realizedRMultiple: z.coerce.number().optional(),

	// MFE/MAE
	mfe: z.coerce.number().optional(),
	mae: z.coerce.number().optional(),

	// Contracts executed (total executions: entry + exit + any scaling)
	// Default is positionSize * 2 if not provided
	contractsExecuted: z.coerce.number().positive().optional(),

	// Narrative
	preTradeThoughts: z.string().max(2000).optional(),
	postTradeReflection: z.string().max(2000).optional(),
	lessonLearned: z.string().max(2000).optional(),

	// Strategy Reference
	strategyId: z.string().uuid().optional().nullable(),

	// Compliance
	followedPlan: z.boolean().optional(),
	disciplineNotes: z.string().max(1000).optional(),

	// Tags
	tagIds: z.array(z.string().uuid()).optional(),

	// Setup Rank (A/AA/AAA based on conditions met)
	setupRank: z.enum(["A", "AA", "AAA"]).optional().nullable(),

	// Trade Screenshot
	screenshotUrl: z.string().url().max(500).optional().or(z.literal("")),
	screenshotS3Key: z.string().max(500).optional().or(z.literal("")),
}

// Base object schema (no refinements) — used for .partial() and server actions
const tradeBaseSchema = z.object(tradeBaseFields)

// Create trade input schema with cross-field SL/TP validation
export const createTradeSchema = tradeBaseSchema.superRefine((data, ctx) => {
	if (!data.entryPrice || !data.direction) return

	// Validate stop loss is on the correct side of entry price
	if (data.stopLoss) {
		if (data.direction === "long" && data.stopLoss >= data.entryPrice) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "stopLossMustBeBelowEntry",
				path: ["stopLoss"],
			})
		}
		if (data.direction === "short" && data.stopLoss <= data.entryPrice) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "stopLossMustBeAboveEntry",
				path: ["stopLoss"],
			})
		}
	}

	// Validate take profit is on the correct side of entry price
	if (data.takeProfit) {
		if (data.direction === "long" && data.takeProfit <= data.entryPrice) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "takeProfitMustBeAboveEntry",
				path: ["takeProfit"],
			})
		}
		if (data.direction === "short" && data.takeProfit >= data.entryPrice) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "takeProfitMustBeBelowEntry",
				path: ["takeProfit"],
			})
		}
	}
})

// Validated/transformed output type
export type CreateTradeOutput = z.output<typeof createTradeSchema>

// Manual input type for forms and server actions (accepts coercible values)
export interface CreateTradeInput {
	asset: string
	direction: "long" | "short"
	timeframeId?: string | null
	entryDate: Date | string | number
	exitDate?: Date | string | number
	entryPrice: number | string
	exitPrice?: number | string
	positionSize: number | string
	stopLoss?: number | string
	takeProfit?: number | string
	riskAmount?: number | string
	pnl?: number | string
	realizedRMultiple?: number | string
	mfe?: number | string
	mae?: number | string
	contractsExecuted?: number | string // total contract executions (entry + exit + scaling)
	preTradeThoughts?: string
	postTradeReflection?: string
	lessonLearned?: string
	strategyId?: string | null
	followedPlan?: boolean
	disciplineNotes?: string
	tagIds?: string[]
	setupRank?: "A" | "AA" | "AAA" | null
	screenshotUrl?: string
	screenshotS3Key?: string
}

// Form input type alias
export type TradeFormInput = CreateTradeInput

// Shared state between Simple and Scaled forms during mode switch
export interface SharedTradeFormState {
	asset?: string
	direction: "long" | "short"
	timeframeId?: string | null
	strategyId?: string | null
	stopLoss?: string
	takeProfit?: string
	preTradeThoughts?: string
	postTradeReflection?: string
	lessonLearned?: string
	followedPlan?: boolean
	disciplineNotes?: string
	tagIds?: string[]
	setupRank?: "A" | "AA" | "AAA" | null
}

export interface TradeFormRef {
	getSharedState: () => SharedTradeFormState
}

// Update trade schema (all fields optional, uses base schema without refinements)
export const updateTradeSchema = tradeBaseSchema.partial()

// Update input type (all fields optional)
export type UpdateTradeInput = Partial<CreateTradeInput>

// Filter schema for trade queries
export const tradeFiltersSchema = z.object({
	dateFrom: z.coerce.date().optional(),
	dateTo: z.coerce.date().optional(),
	assets: z.array(z.string()).optional(),
	directions: z.array(tradeDirectionSchema).optional(),
	outcomes: z.array(tradeOutcomeSchema).optional(),
	strategyIds: z.array(z.string().uuid()).optional(),
	tagIds: z.array(z.string().uuid()).optional(),
	timeframeIds: z.array(z.string().uuid()).optional(),
})

export type TradeFilters = z.infer<typeof tradeFiltersSchema>

// Pagination schema
export const paginationSchema = z.object({
	limit: z.coerce.number().min(1).max(100).default(20),
	offset: z.coerce.number().min(0).default(0),
	sortBy: z
		.enum(["entryDate", "pnl", "realizedRMultiple", "asset"])
		.default("entryDate"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
})

// Use z.input for params to allow defaults to be optional at call site
export type PaginationParams = z.input<typeof paginationSchema>
