"use client"

import { useTranslations } from "next-intl"

interface WeekStripItem {
	isoWeek: number
	isoYear: number
	targetR: string | null
	actualR: string | null
}

interface WeekStripProps {
	weeks: readonly WeekStripItem[]
}

const formatR = (v: string | null): string => {
	if (v === null) {
		return "—"
	}
	const n = Number(v)
	return Number.isFinite(n) ? `${n.toFixed(1)}R` : "—"
}

const WeekStrip = ({ weeks }: WeekStripProps) => {
	const t = useTranslations("plan")
	if (weeks.length === 0) {
		return <p className="text-tiny text-txt-300">{t("weekStrip.noWeeks")}</p>
	}
	return (
		<div className="gap-s-200 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5">
			{weeks.map((w) => {
				const actualNum = w.actualR !== null ? Number(w.actualR) : null
				const positive = actualNum !== null && actualNum > 0
				const negative = actualNum !== null && actualNum < 0
				return (
					<div
						key={`${w.isoYear}-${w.isoWeek}`}
						className="border-bg-300 bg-bg-200 p-s-300 rounded-md border"
					>
						<div className="text-tiny text-txt-300">
							{t("weekStrip.weekLabel", { n: w.isoWeek })}
						</div>
						<div className="mt-1 flex items-baseline justify-between">
							<span className="text-tiny text-txt-200">
								{t("common.target")}
							</span>
							<span className="text-txt-100 text-small font-mono">
								{formatR(w.targetR)}
							</span>
						</div>
						<div className="mt-1 flex items-baseline justify-between">
							<span className="text-tiny text-txt-200">
								{t("common.actual")}
							</span>
							<span
								className={`text-small font-mono ${
									positive
										? "text-fb-success"
										: negative
											? "text-fb-error"
											: "text-txt-100"
								}`}
							>
								{formatR(w.actualR)}
							</span>
						</div>
					</div>
				)
			})}
		</div>
	)
}

export type { WeekStripItem, WeekStripProps }
export { WeekStrip }
