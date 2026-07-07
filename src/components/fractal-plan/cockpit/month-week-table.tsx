"use client"

import { Calendar } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { useFormatting } from "@/hooks/use-formatting"

interface PlanWeek {
	weeklyPlanId: string
	isoWeek: number
	isoYear: number
	targetR: string | null
	actualR: string | null
}

interface ActualWeek {
	weekStart: string
	weekEnd: string
	tradeCount: number
	pnl: number
	winRate: number
}

interface MonthWeekTableProps {
	planWeeks: readonly PlanWeek[]
	actualWeeks: readonly ActualWeek[]
	oneRCents: number
	monthlyGoalCents?: number | null
}

const formatDateRangePT = (startISO: string, endISO: string): string => {
	const s = new Date(startISO)
	const e = new Date(endISO)
	const dd = (d: Date) => String(d.getUTCDate()).padStart(2, "0")
	return `${dd(s)}-${dd(e)}`
}

const parseR = (v: string | null): number => {
	if (v === null) {
		return 0
	}
	const n = Number(v)
	return Number.isFinite(n) ? n : 0
}

const MonthWeekTable = ({
	planWeeks,
	actualWeeks,
	oneRCents,
	monthlyGoalCents,
}: MonthWeekTableProps) => {
	const t = useTranslations("plan.month")
	const { formatCurrency } = useFormatting()

	const formatBRL = (cents: number): string => formatCurrency(cents / 100)
	const sortedPlan = [...planWeeks].sort((a, b) => a.isoWeek - b.isoWeek)
	const maxAbsActualCents = Math.max(
		0,
		...actualWeeks.map((w) => Math.abs(w.pnl * 100))
	)
	const rowCount = Math.max(sortedPlan.length, actualWeeks.length)
	const derivedWeeklyGoalCents =
		monthlyGoalCents && monthlyGoalCents > 0 && sortedPlan.length > 0
			? Math.round(monthlyGoalCents / sortedPlan.length)
			: 0

	if (rowCount === 0) {
		return (
			<section
				id="month-week-table"
				className="border-bg-300 bg-bg-200 p-m-500 rounded-lg border"
				aria-label={t("weeksAriaEmpty")}
			>
				<header className="gap-s-200 flex items-center">
					<Calendar className="text-acc-100 size-4" aria-hidden="true" />
					<h2 className="text-body text-txt-100 font-semibold">
						{t("weeksHeading")}
					</h2>
				</header>
				<p className="mt-m-400 text-small text-txt-300">
					{t("noWeeksGenerated")}
				</p>
			</section>
		)
	}

	return (
		<section
			id="month-week-table"
			className="border-bg-300 bg-bg-200 p-m-500 rounded-lg border"
			aria-label={t("weeksAriaFull")}
		>
			<header className="flex items-baseline justify-between">
				<div className="gap-s-200 flex items-center">
					<Calendar className="text-acc-100 size-4" aria-hidden="true" />
					<h2 className="text-body text-txt-100 font-semibold">
						{t("weeksHeading")}
					</h2>
				</div>
				<span className="text-tiny text-txt-300">{t("weeksSubheading")}</span>
			</header>

			<ol className="mt-m-400 space-y-s-300">
				{Array.from({ length: rowCount }, (_, idx) => {
					const week = sortedPlan[idx] ?? null
					const actual = actualWeeks[idx] ?? null
					const targetR = week ? parseR(week.targetR) : 0
					const actualR = week ? parseR(week.actualR) : 0
					const targetCents =
						targetR > 0
							? Math.round(targetR * oneRCents)
							: derivedWeeklyGoalCents
					const actualCents = actual?.pnl ? Math.round(actual.pnl * 100) : 0
					const barWidth =
						maxAbsActualCents > 0
							? (Math.abs(actualCents) / maxAbsActualCents) * 100
							: 0
					const isPositive = actualCents > 0
					const isNegative = actualCents < 0
					const hitPct =
						targetCents !== 0 ? (actualCents / targetCents) * 100 : 0

					const dateRange = actual
						? formatDateRangePT(actual.weekStart, actual.weekEnd)
						: ""
					const rowKey = week?.weeklyPlanId ?? `actual-${idx}`

					const body = (
						<>
							<div className="gap-x-m-400 gap-y-s-100 flex flex-wrap items-baseline justify-between">
								<div className="gap-s-300 flex items-baseline">
									<span className="text-small text-txt-100 font-medium">
										{t("weekLabel", { n: idx + 1 })}
									</span>
									{dateRange && (
										<span className="text-tiny text-txt-300">
											({dateRange})
										</span>
									)}
									<span className="text-tiny text-txt-300 font-mono tabular-nums">
										{t("target")}{" "}
										<span className="text-txt-300 italic">
											{targetR.toFixed(1)}R
										</span>
									</span>
									<span className="text-tiny font-mono font-medium tabular-nums">
										{t("realized")}{" "}
										<span
											className={cn(
												"font-semibold",
												actualR > 0 && "text-trade-buy",
												actualR < 0 && "text-trade-sell",
												actualR === 0 && "text-txt-100"
											)}
										>
											{actualR.toFixed(1)}R
										</span>
									</span>
								</div>
								<div className="gap-s-300 flex items-baseline">
									{actual && (
										<>
											<span className="text-tiny text-txt-300">
												{actual.tradeCount} trades
											</span>
											<span className="text-tiny text-txt-300">
												{actual.winRate.toFixed(0)}% WR
											</span>
										</>
									)}
									<span
										className={cn(
											"text-small font-mono font-medium tabular-nums",
											isPositive && "text-trade-buy",
											isNegative && "text-trade-sell",
											!isPositive && !isNegative && "text-txt-100"
										)}
									>
										{formatBRL(actualCents)}
									</span>
								</div>
							</div>

							<div className="mt-s-200 bg-bg-200 relative h-2 w-full overflow-hidden rounded-full">
								<div
									className={cn(
										"h-full rounded-full transition-[width]",
										isPositive && "bg-trade-buy/50",
										isNegative && "bg-trade-sell/50",
										!isPositive && !isNegative && "bg-bg-300"
									)}
									style={{ width: `${barWidth}%` }}
								/>
								{targetCents !== 0 && (
									<span className="text-micro text-txt-300 absolute top-1/2 right-2 -translate-y-1/2 font-medium">
										{hitPct >= 0 ? "+" : ""}
										{hitPct.toFixed(0)}% {t("target")}
									</span>
								)}
							</div>
						</>
					)

					const ariaLabel = t("weekAriaLabel", {
						n: idx + 1,
						range: dateRange ? `(${dateRange})` : "",
						targetR: targetR.toFixed(1),
						actualR: actualR.toFixed(1),
					})

					return (
						<li
							key={rowKey}
							className="border-bg-300 bg-bg-100 px-m-400 py-s-300 rounded-sm border"
							aria-label={ariaLabel}
						>
							{body}
						</li>
					)
				})}
			</ol>
		</section>
	)
}

export { MonthWeekTable }
export type { MonthWeekTableProps }
