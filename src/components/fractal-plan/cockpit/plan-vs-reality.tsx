"use client"

import { Target, TrendingUp, Activity, Trophy } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

type PlanGoalSource = "manual" | "weeks" | "default" | "none"

interface PlanVsRealityProps {
	monthLabel: string
	planGoalCents: number | null
	planGoalSource: PlanGoalSource
	totalTradingDays: number
	daysTraded: number
	tradingDaysRemaining: number
	currentNetProfitCents: number
	projectedNetProfitCents: number | null
	dailyAverageCents: number
	irTaxRate: number
}

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	})

const formatBRLPrecise = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	})

const PlanVsReality = ({
	monthLabel,
	planGoalCents,
	planGoalSource,
	totalTradingDays,
	daysTraded,
	tradingDaysRemaining,
	currentNetProfitCents,
	projectedNetProfitCents,
	dailyAverageCents,
	irTaxRate,
}: PlanVsRealityProps) => {
	const t = useTranslations("plan.planVsReality")
	const planSet = planGoalCents !== null && planGoalCents > 0
	const dailyPlanCents =
		planSet && totalTradingDays > 0
			? Math.round(planGoalCents! / totalTradingDays)
			: 0
	const projection = projectedNetProfitCents
	const projectedDarfCents =
		projection && projection > 0 ? Math.round(projection * irTaxRate) : 0

	const hitPctOfGoal = planSet
		? (currentNetProfitCents / planGoalCents!) * 100
		: 0
	const projectedHitPct =
		planSet && projection !== null ? (projection / planGoalCents!) * 100 : 0

	const realizedTone =
		currentNetProfitCents > 0
			? "text-trade-buy"
			: currentNetProfitCents < 0
				? "text-trade-sell"
				: "text-txt-100"
	const projectionTone =
		projection !== null && projection > 0
			? "text-trade-buy"
			: projection !== null && projection < 0
				? "text-trade-sell"
				: "text-txt-100"

	return (
		<section
			id="month-plan-vs-reality"
			className="border-acc-100/30 from-acc-100/5 p-m-500 rounded-lg border bg-gradient-to-br to-transparent"
			aria-label={t("sectionAriaLabel", { label: monthLabel })}
		>
			<div className="flex items-baseline justify-between">
				<span className="text-tiny text-acc-100 font-medium tracking-wider uppercase">
					{t("heading")}
				</span>
				<span className="text-tiny text-txt-300">{monthLabel}</span>
			</div>

			<div className="mt-m-400 gap-m-400 grid grid-cols-2 lg:grid-cols-4">
				<div>
					<div className="gap-s-100 text-tiny text-txt-300 flex items-center">
						<Target className="size-3.5" aria-hidden="true" /> {t("meta")}
						{(planGoalSource === "weeks" || planGoalSource === "default") && (
							<span
								className="bg-bg-100 px-s-100 text-micro text-txt-300 rounded-sm py-px tracking-wider uppercase"
								title={
									planGoalSource === "weeks"
										? t("metaAutoTitle.weeks")
										: t("metaAutoTitle.default")
								}
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
							? planGoalSource === "weeks"
								? t("dayNote.weeks", { daily: formatBRL(dailyPlanCents) })
								: planGoalSource === "default"
									? t("dayNote.default", {
											daily: formatBRL(dailyPlanCents),
											days: totalTradingDays,
										})
									: t("dayNote.manual", {
											daily: formatBRL(dailyPlanCents),
											days: totalTradingDays,
										})
							: t("noGoalNote")}
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
						{formatBRL(currentNetProfitCents)}
					</p>
					<p className="mt-s-100 text-micro text-txt-300">
						{t("realizedNote", {
							traded: daysTraded,
							total: totalTradingDays,
							daily: formatBRL(dailyAverageCents),
						})}
					</p>
				</div>

				<div>
					<div className="gap-s-100 text-tiny text-txt-300 flex items-center">
						<TrendingUp className="size-3.5" aria-hidden="true" />{" "}
						{t("projection")}
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
							? t("noProjectionNote", { remaining: tradingDaysRemaining })
							: t("projectionNote", {
									darf: formatBRLPrecise(projectedDarfCents),
									remaining: tradingDaysRemaining,
								})}
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
									{t("projectedHit", { pct: Math.round(projectedHitPct) })}
								</p>
							)}
						</>
					) : (
						<>
							<p className="mt-s-100 text-h3 text-txt-placeholder">—</p>
							<p className="mt-s-100 text-micro text-txt-300">
								{t("noHitRateNote")}
							</p>
						</>
					)}
				</div>
			</div>
		</section>
	)
}

export { PlanVsReality }
export type { PlanVsRealityProps }
