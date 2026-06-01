"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import type { MonthInputRow } from "./annual-cockpit-grid"

interface WeeklyGridTabProps {
	year: number
	months: MonthInputRow[]
	currentMonthIndex: number
}

interface WeekCell {
	isoWeek: number
	monthIndex: number
	targetR: number | null
	actualR: number | null
	hasActual: boolean
}

const MONTH_LABELS_KEYS = [
	"jan",
	"feb",
	"mar",
	"apr",
	"may",
	"jun",
	"jul",
	"aug",
	"sep",
	"oct",
	"nov",
	"dec",
] as const

const buildWeekCells = (months: MonthInputRow[]): WeekCell[] => {
	const byIsoWeek = new Map<number, WeekCell>()
	for (const m of months) {
		for (const w of m.weeks) {
			const target = w.targetR ?? null
			const actual = w.actualR ?? null
			const existing = byIsoWeek.get(w.isoWeek)
			if (!existing) {
				byIsoWeek.set(w.isoWeek, {
					isoWeek: w.isoWeek,
					monthIndex: m.monthIndex,
					targetR: target,
					actualR: actual,
					hasActual: actual !== null,
				})
			}
		}
	}
	return Array.from(byIsoWeek.values()).sort((a, b) => a.isoWeek - b.isoWeek)
}

const cellTone = (cell: WeekCell): string => {
	if (!cell.hasActual) {
		return "bg-bg-200 border-bg-300 text-txt-300"
	}
	const actual = cell.actualR ?? 0
	const target = cell.targetR ?? 0
	if (actual < 0) {
		return "bg-trade-sell/15 border-trade-sell/40 text-trade-sell"
	}
	if (target > 0 && actual >= target) {
		return "bg-trade-buy/20 border-trade-buy/50 text-trade-buy"
	}
	if (actual > 0) {
		return "bg-trade-buy/10 border-trade-buy/30 text-txt-100"
	}
	return "bg-bg-200 border-bg-300 text-txt-200"
}

const formatR = (n: number | null): string => {
	if (n === null) {
		return "—"
	}
	return `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`
}

const WeeklyGridTab = ({
	year,
	months,
	currentMonthIndex,
}: WeeklyGridTabProps) => {
	const t = useTranslations("plan.weeklyGrid")
	const cells = useMemo(() => buildWeekCells(months), [months])

	const totals = useMemo(() => {
		const target = cells.reduce((acc, c) => acc + (c.targetR ?? 0), 0)
		const actual = cells.reduce(
			(acc, c) => acc + (c.hasActual ? (c.actualR ?? 0) : 0),
			0
		)
		const weeksWithData = cells.filter((c) => c.hasActual).length
		return { target, actual, weeksWithData }
	}, [cells])

	if (cells.length === 0) {
		return (
			<div className="bg-bg-200 border-bg-300 p-m-500 mt-m-400 rounded-lg border">
				<p className="text-small text-txt-300">{t("empty")}</p>
			</div>
		)
	}

	return (
		<div className="space-y-m-400 mt-m-400">
			<header className="space-y-s-200">
				<h3 className="text-body text-txt-100 font-semibold">
					{t("title", { year })}
				</h3>
				<p className="text-tiny text-txt-300">{t("subtitle")}</p>
			</header>

			<dl className="gap-s-300 grid grid-cols-3">
				<div className="bg-bg-200 border-bg-300 p-s-300 rounded-md border">
					<dt className="text-tiny text-txt-300">{t("totalTarget")}</dt>
					<dd className="text-body text-txt-100 mt-1 font-mono">
						{formatR(totals.target)}
					</dd>
				</div>
				<div className="bg-bg-200 border-bg-300 p-s-300 rounded-md border">
					<dt className="text-tiny text-txt-300">{t("totalActual")}</dt>
					<dd className="text-body text-txt-100 mt-1 font-mono">
						{formatR(totals.actual)}
					</dd>
				</div>
				<div className="bg-bg-200 border-bg-300 p-s-300 rounded-md border">
					<dt className="text-tiny text-txt-300">{t("weeksTracked")}</dt>
					<dd className="text-body text-txt-100 mt-1 font-mono">
						{totals.weeksWithData} / {cells.length}
					</dd>
				</div>
			</dl>

			<div
				className="gap-s-200 grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-13"
				role="grid"
				aria-label={t("ariaLabel", { year })}
			>
				{cells.map((c) => {
					const isCurrent = c.monthIndex === currentMonthIndex
					return (
						<div
							key={c.isoWeek}
							role="gridcell"
							className={`p-s-200 flex flex-col items-center rounded-md border ${cellTone(
								c
							)} ${isCurrent ? "ring-acc-100/50 ring-2" : ""}`}
							title={t("cellTitle", {
								week: c.isoWeek,
								month: t(`months.${MONTH_LABELS_KEYS[c.monthIndex] ?? "jan"}`),
								target: formatR(c.targetR),
								actual: formatR(c.actualR),
							})}
						>
							<span className="text-tiny opacity-70">W{c.isoWeek}</span>
							<span className="text-small mt-1 font-mono font-semibold">
								{c.hasActual ? formatR(c.actualR) : "—"}
							</span>
							<span className="text-tiny opacity-60">
								{c.targetR !== null ? `→${c.targetR.toFixed(1)}` : ""}
							</span>
						</div>
					)
				})}
			</div>

			<footer className="text-tiny text-txt-300 gap-s-300 flex flex-wrap items-center">
				<span className="bg-trade-buy/20 border-trade-buy/50 inline-block h-3 w-3 rounded-sm border" />
				<span>{t("legendHit")}</span>
				<span className="bg-trade-buy/10 border-trade-buy/30 ml-s-200 inline-block h-3 w-3 rounded-sm border" />
				<span>{t("legendPositive")}</span>
				<span className="bg-trade-sell/15 border-trade-sell/40 ml-s-200 inline-block h-3 w-3 rounded-sm border" />
				<span>{t("legendNegative")}</span>
				<span className="bg-bg-200 border-bg-300 ml-s-200 inline-block h-3 w-3 rounded-sm border" />
				<span>{t("legendPending")}</span>
			</footer>
		</div>
	)
}

export { WeeklyGridTab }
