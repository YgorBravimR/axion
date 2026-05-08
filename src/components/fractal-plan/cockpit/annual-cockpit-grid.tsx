import { MonthCard, type WeekData } from "./month-card"
import { projectMonth } from "@/lib/fractal-plan/projection"
import {
	resolveTier,
	type LadderRuleR,
} from "@/lib/fractal-plan/capital-ladder"

interface MonthInputRow {
	monthIndex: number
	monthlyPlanId: string
	quarter: number
	snapshotCapitalCents: number
	snapshotOneRCents: number
	snapshotTierIndex: number
	snapshotReason: "month_start" | "drawdown_trigger" | "manual"
	weeks: WeekData[]
}

interface RealMonthData {
	monthIndex: number
	tradesCount: number
	realPnlCents: number
	realRSum: number
	tradingDaysWithTrades: number
	weeklyR: { isoWeek: number; sumR: number }[]
}

interface PaceMonthData {
	endBalanceCents: number
	oneRCents: number
	netLiquidCents: number
	grossPnlCents: number
}

interface CurrentMonthRemainder {
	addedRsum: number
	addedNetCents: number
	projectedEndBalanceCents: number
}

interface AnnualCockpitGridProps {
	year: number
	locale: string
	currentMonthIndex: number
	tradingDaysPerWeek: number
	irTaxRate: number
	withdrawalPct: number
	initialCapitalCents: number
	ladderRules: LadderRuleR[]
	accountStartYear: number | null
	accountStartMonth: number | null
	months: MonthInputRow[]
	realByMonth: RealMonthData[]
	lastActualMonthIdx: number
	paceByMonthIdx: Record<string, PaceMonthData>
	currentMonthRemainder: CurrentMonthRemainder | null
}

const MONTH_LABELS_PT = [
	"jan",
	"fev",
	"mar",
	"abr",
	"mai",
	"jun",
	"jul",
	"ago",
	"set",
	"out",
	"nov",
	"dez",
]

const AnnualCockpitGrid = ({
	year,
	locale,
	currentMonthIndex,
	tradingDaysPerWeek,
	irTaxRate,
	withdrawalPct,
	initialCapitalCents,
	ladderRules,
	accountStartYear,
	accountStartMonth,
	months,
	realByMonth,
	lastActualMonthIdx,
	paceByMonthIdx,
	currentMonthRemainder,
}: AnnualCockpitGridProps) => {
	const byIndex = new Map(months.map((m) => [m.monthIndex, m]))

	let runningCapitalCents = initialCapitalCents
	let prevEndCents: number | null = null

	const cards = Array.from({ length: 12 }, (_, i) => {
		const isMuted =
			accountStartYear !== null &&
			accountStartMonth !== null &&
			year === accountStartYear &&
			i < accountStartMonth - 1

		const row = byIndex.get(i)
		const real: RealMonthData = realByMonth[i] ?? {
			monthIndex: i,
			tradesCount: 0,
			realPnlCents: 0,
			realRSum: 0,
			tradingDaysWithTrades: 0,
			weeklyR: [],
		}
		const hasRealData = real.tradesCount > 0

		const isManual = row?.snapshotReason === "manual"
		const startBalanceCents =
			isManual && row ? row.snapshotCapitalCents : runningCapitalCents
		const tier =
			ladderRules.length > 0
				? resolveTier(startBalanceCents, ladderRules)
				: null
		const oneRCents =
			isManual && row
				? row.snapshotOneRCents
				: (tier?.oneRCents ?? row?.snapshotOneRCents ?? 0)
		const tierIndex =
			isManual && row
				? row.snapshotTierIndex
				: (tier?.tierIndex ?? row?.snapshotTierIndex ?? 0)
		const weeks: WeekData[] = row?.weeks ?? []

		const projection = projectMonth({
			startBalanceCents,
			weekTargetRs: weeks.map((w) => w.targetR),
			oneRCents,
			tradingDaysPerWeek,
			irTaxRate,
			withdrawalPct,
		})

		const pace = paceByMonthIdx[String(i)] ?? null
		const isCurrentWithRemainder =
			i === currentMonthIndex && hasRealData && currentMonthRemainder !== null
		const realOnlyEndCents = hasRealData
			? startBalanceCents + real.realPnlCents
			: null
		const effectiveEndCents = isCurrentWithRemainder
			? currentMonthRemainder!.projectedEndBalanceCents
			: hasRealData
				? realOnlyEndCents!
				: pace
					? pace.endBalanceCents
					: projection.endBalanceCents

		const cardPrevEndCents = prevEndCents
		runningCapitalCents = effectiveEndCents
		prevEndCents = effectiveEndCents

		const baseState: "past" | "current" | "future" | "muted" = isMuted
			? "muted"
			: i < currentMonthIndex
				? "past"
				: i === currentMonthIndex
					? "current"
					: "future"

		// Refine: future month with no real data yet → "projection"; current/past w/ real data stays factual.
		const state: "past" | "current" | "future" | "muted" | "projection" =
			baseState === "future" && i > lastActualMonthIdx
				? "projection"
				: baseState

		const quarter = row?.quarter ?? Math.floor(i / 3) + 1
		const month1Indexed = i + 1
		const href = `/${locale}/plan/${year}/${quarter}/${month1Indexed}`

		const paceOneR = pace?.oneRCents ?? oneRCents
		return {
			key: i,
			href,
			monthLabel: MONTH_LABELS_PT[i] ?? "",
			monthlyPlanId: row?.monthlyPlanId ?? null,
			startBalanceCents,
			endBalanceCents: effectiveEndCents,
			oneRCents: hasRealData ? oneRCents : paceOneR,
			tierIndex,
			weeks,
			projection,
			state,
			prevMonthEndCents: cardPrevEndCents,
			withdrawalCents:
				projection.withdrawalCents > 0 ? projection.withdrawalCents : undefined,
			real: hasRealData ? real : null,
			pace: !hasRealData && pace ? pace : null,
			remainder: isCurrentWithRemainder ? currentMonthRemainder : null,
		}
	})

	const seenAnchorStates = new Set<string>()
	return (
		<section
			aria-label={`Grade anual de planos para ${year}`}
			className="gap-m-400 grid auto-rows-fr grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
		>
			{cards.map((c) => {
				const anchorKey = c.state === "muted" ? null : c.state
				const isAnchor = anchorKey !== null && !seenAnchorStates.has(anchorKey)
				if (isAnchor && anchorKey) {
					seenAnchorStates.add(anchorKey)
				}
				return (
					<MonthCard
						key={c.key}
						year={year}
						monthIndex={c.key}
						monthLabel={c.monthLabel}
						href={c.href}
						monthlyPlanId={c.monthlyPlanId}
						startBalanceCents={c.startBalanceCents}
						endBalanceCents={c.endBalanceCents}
						oneRCents={c.oneRCents}
						tierIndex={c.tierIndex}
						weeks={c.weeks}
						projection={c.projection}
						state={c.state}
						prevMonthEndCents={c.prevMonthEndCents}
						withdrawalCents={c.withdrawalCents}
						real={c.real}
						pace={c.pace}
						remainder={c.remainder}
						guideAnchor={isAnchor}
					/>
				)
			})}
		</section>
	)
}

export { AnnualCockpitGrid }
export type {
	AnnualCockpitGridProps,
	MonthInputRow,
	RealMonthData,
	PaceMonthData,
	CurrentMonthRemainder,
}
