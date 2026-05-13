import { z } from "zod"

const hawksBiasSchema = z.enum(["long", "short", "neutral"])
const hawksStopDirectionSchema = z.enum(["with", "against", "same"])
const hawksScreensSchema = z.object({
	renko60: z.boolean(),
	macd: z.boolean(),
	emaStack: z.boolean(),
	vwap: z.boolean(),
	ajuste: z.boolean(),
})

const hawksTradePayloadSchema = z.object({
	scenarioId: z.string().uuid().optional().nullable(),
	tripleScreenConfirmed: z.boolean(),
	vwapRespected: z.boolean(),
	ajusteRespected: z.boolean(),
})

const confirmDailyBiasSchema = z.object({
	tradingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	bias: hawksBiasSchema,
	screens: hawksScreensSchema,
	notesPt: z.string().max(1000).optional(),
})

const recordStopAuditSchema = z.object({
	tradeId: z.string().uuid(),
	stopPriceR: z.coerce.number().min(-99).max(99),
	directionVsPosition: hawksStopDirectionSchema,
	methodViolation: z.boolean().default(false),
})

type HawksTradePayload = z.input<typeof hawksTradePayloadSchema>
type ConfirmDailyBiasInput = z.input<typeof confirmDailyBiasSchema>
type RecordStopAuditInput = z.input<typeof recordStopAuditSchema>

export {
	hawksBiasSchema,
	hawksStopDirectionSchema,
	hawksScreensSchema,
	hawksTradePayloadSchema,
	confirmDailyBiasSchema,
	recordStopAuditSchema,
}
export type { HawksTradePayload, ConfirmDailyBiasInput, RecordStopAuditInput }
