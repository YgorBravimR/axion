"use client"

import { Activity, Target, TrendingUp, Trophy } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

interface QuarterPlanVsRealityProps {
	quarterLabel: string
	planGoalCents: number | null
	planGoalSource: "manual" | "weeks" | "default" | "mixed" | "none"
	realizedNetCents: number
	projectedNetCents: number | null
	monthsTraded: number
	totalMonths: number
}

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	})

const QuarterPlanVsReality = ({
	quarterLabel,
	planGoalCents,
	planGoalSource,
	realizedNetCents,
	projectedNetCents,
	monthsTraded,
	totalMonths,
}: QuarterPlanVsRealityProps) => {
	const t = useTranslations("plan.planVsReality")
	const tQ = useTranslations("plan.quarter.planVsReality")
	const planSet = planGoalCents !== null && planGoalCents > 0
	const projection = projectedNetCents
	const hitPctOfGoal = planSet ? (realizedNetCents / planGoalCents!) * 100 : 0
	const projectedHitPct =
		planSet && projection !== null ? (projection / planGoalCents!) * 100 : 0

	const realizedTone =
		realizedNetCents > 0
			? "text-trade-buy"
			: realizedNetCents < 0
				? "text-trade-sell"
				: "text-txt-100"
	const projectionTone =
		projection !== null && projection > 0
			? "text-trade-buy"
			: projection !== null && projection < 0
				? "text-trade-sell"
				: "text-txt-100"

	const isAuto =
		planGoalSource === "weeks" ||
		planGoalSource === "default" ||
		planGoalSource === "mixed"

	return (
		<section
			id="quarter-plan-vs-reality"
			className="border-acc-100/30 from-acc-100/5 p-m-500 rounded-lg border bg-gradient-to-br to-transparent"
			aria-label={t("sectionAriaLabel", { label: quarterLabel })}
		>
			<div className="flex items-baseline justify-between">
				<span className="text-tiny text-acc-100 font-medium tracking-wider uppercase">
					{t("heading")}
				</span>
				<span className="text-tiny text-txt-300">{quarterLabel}</span>
			</div>

			<div className="mt-m-400 gap-m-400 grid grid-cols-2 lg:grid-cols-4">
				<div>
					<div className="gap-s-100 text-tiny text-txt-300 flex items-center">
						<Target className="size-3.5" aria-hidden="true" /> {t("meta")}
						{isAuto && (
							<span
								className="bg-bg-100 px-s-100 text-micro text-txt-300 rounded-sm py-px tracking-wider uppercase"
								title={tQ("autoTitle")}
							>
								auto
							</span>
						)}
					</div>
					{planSet ? (
						<p className="mt-s-100 text-h2 text-txt-100 font-mono tabular-nums">
							{formatBRL(planGoalCents!)}
						</p>
					) : (
						<p className="mt-s-100 text-h3 text-txt-placeholder">
							{t("noGoal")}
						</p>
					)}
					<p className="mt-s-100 text-micro text-txt-300">
						{planSet
							? planGoalSource === "manual"
								? tQ("manualGoalNote")
								: planGoalSource === "mixed"
									? tQ("mixedGoalNote")
									: tQ("monthlyGoalNote")
							: tQ("noGoalNote")}
					</p>
				</div>

				<div>
					<div className="gap-s-100 text-tiny text-txt-300 flex items-center">
						<Activity className="size-3.5" aria-hidden="true" /> {t("realized")}
					</div>
					<p
						className={cn(
							"mt-s-100 text-h2 font-mono tabular-nums",
							realizedTone
						)}
					>
						{formatBRL(realizedNetCents)}
					</p>
					<p className="mt-s-100 text-micro text-txt-300">
						{tQ("monthsNote", { traded: monthsTraded, total: totalMonths })}
					</p>
				</div>

				<div>
					<div className="gap-s-100 text-tiny text-txt-300 flex items-center">
						<TrendingUp className="size-3.5" aria-hidden="true" />{" "}
						{tQ("projectionLabel")}
					</div>
					{projection === null ? (
						<p className="mt-s-100 text-h3 text-txt-placeholder">
							{t("noProjection")}
						</p>
					) : (
						<p
							className={cn(
								"mt-s-100 text-h2 font-mono tabular-nums",
								projectionTone
							)}
						>
							{formatBRL(projection)}
						</p>
					)}
					<p className="mt-s-100 text-micro text-txt-300">
						{projection === null
							? tQ("noProjectionNote")
							: tQ("projectionNoteHasData")}
					</p>
				</div>

				<div>
					<div className="gap-s-100 text-tiny text-txt-300 flex items-center">
						<Trophy className="size-3.5" aria-hidden="true" /> {t("hitRate")}
					</div>
					{planSet ? (
						<>
							<p className="mt-s-100 text-h2 text-guide font-mono tabular-nums">
								{Math.round(hitPctOfGoal)}%
							</p>
							<div className="mt-s-200 bg-bg-100 h-1.5 w-full overflow-hidden rounded-full">
								<div
									className="bg-guide h-full rounded-full transition-[width]"
									style={{
										width: `${Math.min(100, Math.max(0, hitPctOfGoal))}%`,
									}}
									aria-hidden="true"
								/>
							</div>
							{projection !== null && (
								<p className="mt-s-100 text-micro text-txt-300">
									{tQ("projected", { pct: Math.round(projectedHitPct) })}
								</p>
							)}
						</>
					) : (
						<>
							<p className="mt-s-100 text-h3 text-txt-placeholder">—</p>
							<p className="mt-s-100 text-micro text-txt-300">
								{tQ("noGoalHitNote")}
							</p>
						</>
					)}
				</div>
			</div>
		</section>
	)
}

export { QuarterPlanVsReality }
export type { QuarterPlanVsRealityProps }
