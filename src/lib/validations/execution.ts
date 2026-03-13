import { z } from "zod"

// Execution type enum
export const executionTypeSchema = z.enum(["entry", "exit"])

// Order type enum
export const orderTypeSchema = z.enum(["market", "limit", "stop", "stop_limit"])

// Create execution input schema
export const createExecutionSchema = z.object({
	tradeId: z.string().uuid("validation.execution.invalidTradeId"),

	// Execution details
	executionType: executionTypeSchema,
	executionDate: z.coerce.date({ message: "validation.execution.executionDateRequired" }),
	price: z.coerce
		.number({ message: "validation.execution.priceRequired" })
		.positive("validation.execution.pricePositive"),
	quantity: z.coerce
		.number({ message: "validation.execution.quantityRequired" })
		.positive("validation.execution.quantityPositive"),

	// Optional metadata
	orderType: orderTypeSchema.optional().nullable(),
	notes: z.string().max(1000, "validation.execution.notesMaxLength").optional(),

	// Costs (in cents)
	commission: z.coerce.number().min(0).default(0),
	fees: z.coerce.number().min(0).default(0),
	slippage: z.coerce.number().default(0), // can be negative
})

// Validated/transformed output type
export type CreateExecutionOutput = z.output<typeof createExecutionSchema>

// Manual input type for forms and server actions (accepts coercible values)
export interface CreateExecutionInput {
	tradeId: string
	executionType: "entry" | "exit"
	executionDate: Date | string | number
	price: number | string
	quantity: number | string
	orderType?: "market" | "limit" | "stop" | "stop_limit" | null
	notes?: string
	commission?: number | string
	fees?: number | string
	slippage?: number | string
}

// Form input type alias
export type ExecutionFormInput = CreateExecutionInput

// Update execution schema (all fields optional except tradeId for context)
export const updateExecutionSchema = createExecutionSchema.omit({ tradeId: true }).partial()

// Update input type (all fields optional)
export type UpdateExecutionInput = Partial<Omit<CreateExecutionInput, "tradeId">>
