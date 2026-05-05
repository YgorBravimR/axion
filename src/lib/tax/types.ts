interface MonthlyDarfRow {
	id: string
	accountId: string
	month: Date
	grossGainCents: number
	totalTxCorretagemCents: number
	totalTxRegistroCents: number
	totalEmolumentosCents: number
	totalIssCents: number
	totalFeesCents: number
	irrfCents: number
	netGainBeforeCarryoverCents: number
	carryoverInCents: number
	carryoverConsumedCents: number
	carryoverOutCents: number
	taxableGainCents: number
	irGrossCents: number
	darfDueCents: number
	darfStatus: "pending" | "paid" | "exempt" | "overdue"
	darfDueDate: Date | null
	darfPaidAt: Date | null
	darfPaidAmountCents: number | null
	netLiquidCents: number
	tradeCount: number
	isDirty: boolean
	computedAt: Date | null
}

interface YearTaxSummary {
	grossGainCents: number
	totalFeesCents: number
	totalIrrfCents: number
	totalDarfPaidCents: number
	totalDarfPendingCents: number
	netLiquidCents: number
	irBurdenPercent: number
	heuristicWarning: boolean
}

interface FeeRatesRow {
	txCorretagemCents: number
	txRegistroCents: number
	emolumentosCents: number
	issRatePercent: string
	irrfRateBps: number
	irRateBps: number
	subjectToPersonalIr: boolean
}

export type { MonthlyDarfRow, YearTaxSummary, FeeRatesRow }
