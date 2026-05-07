// Pure projection helpers for the cockpit grid.
// All math in integer cents; R-multiples stay floats. Asset-agnostic — `oneRCents`
// is the regulated handsize for the active capital tier and includes any
// asset/contract translation already.

interface ProjectMonthInput {
	readonly startBalanceCents: number
	readonly weekTargetRs: readonly (number | null)[]
	readonly oneRCents: number
	readonly tradingDaysPerWeek: number
	readonly irTaxRate: number
	/** 0–1 fraction of net (post-IR) profit earmarked as withdrawal. Display-only. */
	readonly withdrawalPct?: number
}

interface ProjectMonthResult {
	readonly endBalanceCents: number
	readonly grossPnlCents: number
	readonly projectedNetLiquidCents: number
	readonly withdrawalCents: number
	readonly monthlyRentPct: number
	readonly avgRPerWeek: number
	readonly avgRPerDay: number
	readonly totalTargetR: number
}

const sumR = (rs: readonly (number | null)[]): number =>
	rs.reduce<number>((acc, r) => acc + (r ?? 0), 0)

/**
 * Project a single month's outcome from week targets and the active 1R handsize.
 * `irTaxRate` is a 0–1 fraction (e.g. 0.30 for 30% — only deducted from positive PnL).
 */
const projectMonth = (input: ProjectMonthInput): ProjectMonthResult => {
	const {
		startBalanceCents,
		weekTargetRs,
		oneRCents,
		tradingDaysPerWeek,
		irTaxRate,
		withdrawalPct = 0,
	} = input

	const totalTargetR = sumR(weekTargetRs)
	const grossPnlCents = Math.round(totalTargetR * oneRCents)
	const taxCents = grossPnlCents > 0 ? Math.round(grossPnlCents * irTaxRate) : 0
	const projectedNetLiquidCents = grossPnlCents - taxCents
	const withdrawalCents =
		projectedNetLiquidCents > 0 && withdrawalPct > 0
			? Math.round(projectedNetLiquidCents * withdrawalPct)
			: 0
	const endBalanceCents = startBalanceCents + projectedNetLiquidCents

	const weeks = weekTargetRs.length || 1
	const avgRPerWeek = totalTargetR / weeks
	const avgRPerDay = tradingDaysPerWeek > 0 ? avgRPerWeek / tradingDaysPerWeek : 0

	const monthlyRentPct =
		startBalanceCents > 0 ? (projectedNetLiquidCents / startBalanceCents) * 100 : 0

	return {
		endBalanceCents,
		grossPnlCents,
		projectedNetLiquidCents,
		withdrawalCents,
		monthlyRentPct,
		avgRPerWeek,
		avgRPerDay,
		totalTargetR,
	}
}

interface MonthInput {
	readonly weekTargetRs: readonly (number | null)[]
	readonly oneRCents: number
	readonly tradingDaysPerWeek: number
}

interface ProjectYearInput {
	readonly initialCapitalCents: number
	readonly months: readonly MonthInput[]
	readonly irTaxRate: number
	readonly withdrawalPct?: number
}

interface ProjectYearMonth extends ProjectMonthResult {
	readonly index: number
	readonly startBalanceCents: number
	readonly oneRCents: number
}

interface ProjectYearResult {
	readonly months: readonly ProjectYearMonth[]
	readonly endBalanceCents: number
	readonly totalRentPct: number
	readonly projectedNetLiquidCents: number
	readonly totalRAccum: number
}

/**
 * Compound 12 months of projections off `initialCapitalCents`. Each month's
 * `startBalanceCents` is the previous month's `endBalanceCents`.
 */
const projectYear = (input: ProjectYearInput): ProjectYearResult => {
	const { initialCapitalCents, months, irTaxRate, withdrawalPct } = input

	const projected: ProjectYearMonth[] = []
	let running = initialCapitalCents
	let totalR = 0

	for (let i = 0; i < months.length; i++) {
		const m = months[i]
		const result = projectMonth({
			startBalanceCents: running,
			weekTargetRs: m.weekTargetRs,
			oneRCents: m.oneRCents,
			tradingDaysPerWeek: m.tradingDaysPerWeek,
			irTaxRate,
			withdrawalPct,
		})
		projected.push({
			...result,
			index: i,
			startBalanceCents: running,
			oneRCents: m.oneRCents,
		})
		running = result.endBalanceCents
		totalR += result.totalTargetR
	}

	const projectedNetLiquidCents = running - initialCapitalCents
	const totalRentPct =
		initialCapitalCents > 0 ? (projectedNetLiquidCents / initialCapitalCents) * 100 : 0

	return {
		months: projected,
		endBalanceCents: running,
		totalRentPct,
		projectedNetLiquidCents,
		totalRAccum: totalR,
	}
}

interface LadderRuleLite {
	readonly minCapitalCents: number
	readonly maxCapitalCents: number
	readonly oneRCents: number
}

const resolveOneRFromLadder = (capCents: number, rules: readonly LadderRuleLite[]): number => {
	if (rules.length === 0) return 0
	for (const r of rules) {
		if (capCents >= r.minCapitalCents && capCents <= r.maxCapitalCents) return r.oneRCents
	}
	return rules[rules.length - 1].oneRCents
}

interface ProjectFromPaceInput {
	readonly startBalanceCents: number
	readonly monthsRemaining: number
	readonly avgRPerDayYtd: number
	readonly tradingDaysPerWeek: number
	readonly weeksPerMonth?: number
	readonly ladderRules: readonly LadderRuleLite[]
	readonly irTaxRate: number
	readonly withdrawalPct?: number
}

interface ProjectFromPaceMonth {
	readonly index: number
	readonly startBalanceCents: number
	readonly endBalanceCents: number
	readonly oneRCents: number
	readonly grossPnlCents: number
	readonly netLiquidCents: number
}

interface ProjectFromPaceResult {
	readonly months: readonly ProjectFromPaceMonth[]
	readonly endBalanceCents: number
	readonly totalNetLiquidCents: number
	readonly totalRentPct: number
}

/**
 * Forward-project remaining months at a fixed YTD daily-R pace, recompounding each month.
 * Re-resolves 1R from the ladder as the balance grows so projections respect tier breaks.
 */
const projectFromPace = (input: ProjectFromPaceInput): ProjectFromPaceResult => {
	const {
		startBalanceCents,
		monthsRemaining,
		avgRPerDayYtd,
		tradingDaysPerWeek,
		weeksPerMonth = 4.33,
		ladderRules,
		irTaxRate,
		withdrawalPct = 0,
	} = input

	const months: ProjectFromPaceMonth[] = []
	let running = startBalanceCents

	for (let i = 0; i < monthsRemaining; i++) {
		const oneRCents = resolveOneRFromLadder(running, ladderRules)
		const monthlyR = avgRPerDayYtd * tradingDaysPerWeek * weeksPerMonth
		const grossPnlCents = Math.round(monthlyR * oneRCents)
		const taxCents = grossPnlCents > 0 ? Math.round(grossPnlCents * irTaxRate) : 0
		const netAfterTax = grossPnlCents - taxCents
		const withdrawal = netAfterTax > 0 && withdrawalPct > 0 ? Math.round(netAfterTax * withdrawalPct) : 0
		const netLiquidCents = netAfterTax - withdrawal
		const endBalanceCents = running + netLiquidCents
		months.push({ index: i, startBalanceCents: running, endBalanceCents, oneRCents, grossPnlCents, netLiquidCents })
		running = endBalanceCents
	}

	const totalNetLiquidCents = running - startBalanceCents
	const totalRentPct = startBalanceCents > 0 ? (totalNetLiquidCents / startBalanceCents) * 100 : 0

	return { months, endBalanceCents: running, totalNetLiquidCents, totalRentPct }
}

export type { ProjectMonthInput, ProjectMonthResult, ProjectYearInput, ProjectYearResult, ProjectYearMonth, MonthInput, ProjectFromPaceInput, ProjectFromPaceResult, ProjectFromPaceMonth }
export { projectMonth, projectYear, projectFromPace }
