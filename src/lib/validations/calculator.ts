import { z } from "zod"

const calculatorInputSchema = z.object({
	assetId: z.string().min(1, "validation.calculator.assetRequired"),
	direction: z.enum(["long", "short"]),
	entryPrice: z.coerce.number().positive("validation.calculator.entryPricePositive"),
	stopPrice: z.coerce.number().positive("validation.calculator.stopPricePositive"),
	targetPrice: z.coerce.number().positive("validation.calculator.targetPricePositive").optional().nullable(),
	manualContracts: z.coerce.number().int().positive("validation.calculator.contractsPositive").optional().nullable(),
})

type CalculatorInput = z.infer<typeof calculatorInputSchema>

export { calculatorInputSchema }
export type { CalculatorInput }
