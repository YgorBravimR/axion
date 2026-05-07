"use client"

import { Calendar } from "lucide-react"
import { cn } from "@/lib/utils"

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
}

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const formatDateRangePT = (startISO: string, endISO: string): string => {
	const s = new Date(startISO)
	const e = new Date(endISO)
	const dd = (d: Date) => String(d.getUTCDate()).padStart(2, "0")
	return `${dd(s)}-${dd(e)}`
}

const parseR = (v: string | null): number => {
	if (v == null) return 0
	const n = Number(v)
	return Number.isFinite(n) ? n : 0
}

const MonthWeekTable = ({ planWeeks, actualWeeks, oneRCents }: MonthWeekTableProps) => {
	const sortedPlan = [...planWeeks].sort((a, b) => a.isoWeek - b.isoWeek)
	const maxAbsActualCents = Math.max(0, ...actualWeeks.map((w) => Math.abs(w.pnl * 100)))
	const rowCount = Math.max(sortedPlan.length, actualWeeks.length)

	if (rowCount === 0) {
		return (
			<section
				id="month-week-table"
				className="rounded-lg border border-bg-300 bg-bg-200 p-m-500"
				aria-label="Semanas do mês"
			>
				<header className="flex items-center gap-s-200">
					<Calendar className="size-4 text-acc-100" />
					<h2 className="text-body font-semibold text-txt-100">Semanas</h2>
				</header>
				<p className="mt-m-400 text-small text-txt-300">
					Sem semanas geradas para este mês ainda. As semanas são auto-geradas ao criar o plano anual.
				</p>
			</section>
		)
	}

	return (
		<section
			id="month-week-table"
			className="rounded-lg border border-bg-300 bg-bg-200 p-m-500"
			aria-label="Semanas do mês — alvo R vs realizado"
		>
			<header className="flex items-baseline justify-between">
				<div className="flex items-center gap-s-200">
					<Calendar className="size-4 text-acc-100" />
					<h2 className="text-body font-semibold text-txt-100">Semanas</h2>
				</div>
				<span className="text-tiny text-txt-300">alvo R · realizado · BRL · WR%</span>
			</header>

			<ol className="mt-m-400 space-y-s-300">
				{Array.from({ length: rowCount }, (_, idx) => {
					const week = sortedPlan[idx] ?? null
					const actual = actualWeeks[idx] ?? null
					const targetR = week ? parseR(week.targetR) : 0
					const actualR = week ? parseR(week.actualR) : 0
					const targetCents = Math.round(targetR * oneRCents)
					const actualCents = actual?.pnl ? Math.round(actual.pnl * 100) : 0
					const barWidth =
						maxAbsActualCents > 0 ? (Math.abs(actualCents) / maxAbsActualCents) * 100 : 0
					const isPositive = actualCents > 0
					const isNegative = actualCents < 0
					const hitPct = targetCents !== 0 ? (actualCents / targetCents) * 100 : 0

					const dateRange = actual ? formatDateRangePT(actual.weekStart, actual.weekEnd) : ""
					const rowKey = week?.weeklyPlanId ?? `actual-${idx}`

					const body = (
						<>
							<div className="flex flex-wrap items-baseline justify-between gap-x-m-400 gap-y-s-100">
								<div className="flex items-baseline gap-s-300">
									<span className="text-small font-medium text-txt-100">Sem {idx + 1}</span>
									{dateRange && (
										<span className="text-tiny text-txt-300">({dateRange})</span>
									)}
									<span className="font-mono text-tiny tabular-nums text-txt-300">
										alvo <span className="text-txt-200">{targetR.toFixed(2)}R</span>
									</span>
									<span className="font-mono text-tiny tabular-nums text-txt-300">
										real{" "}
										<span
											className={cn(
												actualR > 0 && "text-trade-buy",
												actualR < 0 && "text-trade-sell",
												actualR === 0 && "text-txt-200",
											)}
										>
											{actualR.toFixed(2)}R
										</span>
									</span>
								</div>
								<div className="flex items-baseline gap-s-300">
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
											"font-mono text-small font-medium tabular-nums",
											isPositive && "text-trade-buy",
											isNegative && "text-trade-sell",
											!isPositive && !isNegative && "text-txt-100",
										)}
									>
										{formatBRL(actualCents)}
									</span>
								</div>
							</div>

							<div className="relative mt-s-200 h-2 w-full overflow-hidden rounded-full bg-bg-200">
								<div
									className={cn(
										"h-full rounded-full transition-[width]",
										isPositive && "bg-trade-buy/50",
										isNegative && "bg-trade-sell/50",
										!isPositive && !isNegative && "bg-bg-300",
									)}
									style={{ width: `${barWidth}%` }}
								/>
								{targetCents !== 0 && (
									<span className="absolute right-2 top-1/2 -translate-y-1/2 text-micro font-medium text-txt-300">
										{hitPct >= 0 ? "+" : ""}
										{hitPct.toFixed(0)}% alvo
									</span>
								)}
							</div>
						</>
					)

					const ariaLabel = `Semana ${idx + 1} ${dateRange ? `(${dateRange})` : ""} — alvo ${targetR.toFixed(2)}R, realizado ${actualR.toFixed(2)}R`

					return (
						<li
							key={rowKey}
							className="rounded-sm border border-bg-300 bg-bg-100 px-m-400 py-s-300"
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
