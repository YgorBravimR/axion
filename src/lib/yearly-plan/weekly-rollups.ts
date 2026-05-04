import type { WeeklyTarget } from "@/db/schema"

interface PlanStub {
	irTaxRate: string
	tradingDaysPerWeek: number
	valorPorContratoCents: number
}

interface MonthRollupData {
	totalPtsAlvo: number
	totalPtsFeito: number
	avgPtsPerWeek: number
	monthlyProjectedNetCents: number
	cumulativeFinancialCents: number
	cumulativePoints: number
}

const computeMonthRollup = (
	weeks: WeeklyTarget[],
	plan: PlanStub,
	priorCumulativeFinancialCents: number,
	priorCumulativePoints: number,
): MonthRollupData => {
	const irRate = parseFloat(plan.irTaxRate) / 100

	const totalPtsAlvo = weeks.reduce(
		(sum, w) => sum + (w.ptsAlvo != null ? parseFloat(String(w.ptsAlvo)) : 0),
		0,
	)
	const totalPtsFeito = weeks.reduce(
		(sum, w) => sum + (w.ptsFeito != null ? parseFloat(String(w.ptsFeito)) : 0),
		0,
	)

	const weeksWithData = weeks.filter((w) => w.ptsFeito != null).length
	const avgPtsPerWeek = weeksWithData > 0 ? totalPtsFeito / weeksWithData : 0

	const monthGrossCents = weeks.reduce(
		(sum, w) => sum + (w.metaBrutoCents ?? 0),
		0,
	)
	const monthlyProjectedNetCents = Math.round(monthGrossCents * (1 - irRate))

	return {
		totalPtsAlvo,
		totalPtsFeito,
		avgPtsPerWeek,
		monthlyProjectedNetCents,
		cumulativeFinancialCents: priorCumulativeFinancialCents + monthGrossCents,
		cumulativePoints: priorCumulativePoints + totalPtsFeito,
	}
}

export { computeMonthRollup }
export type { MonthRollupData, PlanStub }
