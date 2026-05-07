"use client"

import { Target, TrendingUp, Activity, Trophy } from "lucide-react"
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
	const planSet = planGoalCents != null && planGoalCents > 0
	const dailyPlanCents = planSet && totalTradingDays > 0 ? Math.round(planGoalCents! / totalTradingDays) : 0
	const projection = projectedNetProfitCents
	const projectedDarfCents = projection && projection > 0 ? Math.round(projection * irTaxRate) : 0

	const hitPctOfGoal = planSet ? (currentNetProfitCents / planGoalCents!) * 100 : 0
	const projectedHitPct = planSet && projection != null ? (projection / planGoalCents!) * 100 : 0

	const realizedTone =
		currentNetProfitCents > 0 ? "text-trade-buy" : currentNetProfitCents < 0 ? "text-trade-sell" : "text-txt-100"
	const projectionTone =
		projection != null && projection > 0
			? "text-trade-buy"
			: projection != null && projection < 0
				? "text-trade-sell"
				: "text-txt-100"

	return (
		<section
			id="month-plan-vs-reality"
			className="rounded-lg border border-acc-100/30 bg-gradient-to-br from-acc-100/5 to-transparent p-m-500"
			aria-label={`Plano vs realidade · ${monthLabel}`}
		>
			<div className="flex items-baseline justify-between">
				<span className="text-tiny font-medium uppercase tracking-wider text-acc-100">
					Plano vs realidade
				</span>
				<span className="text-tiny text-txt-300">{monthLabel}</span>
			</div>

			<div className="mt-m-400 grid grid-cols-2 gap-m-400 lg:grid-cols-4">
				<div>
					<div className="flex items-center gap-s-100 text-tiny text-txt-300">
						<Target className="size-3.5" /> Meta
						{(planGoalSource === "weeks" || planGoalSource === "default") && (
							<span
								className="rounded-sm bg-bg-100 px-s-100 py-px text-micro uppercase tracking-wider text-txt-300"
								title={
									planGoalSource === "weeks"
										? "Calculada a partir das metas semanais"
										: "Calculada a partir do alvo diário cascateado do plano anual"
								}
							>
								auto
							</span>
						)}
					</div>
					{planSet ? (
						<p className="mt-s-100 font-mono text-h2 tabular-nums text-txt-100">
							{formatBRL(planGoalCents!)}
						</p>
					) : (
						<p className="mt-s-100 text-h3 text-txt-placeholder">Sem meta</p>
					)}
					<p className="mt-s-100 text-micro text-txt-300">
						{planSet
							? planGoalSource === "weeks"
								? `${formatBRL(dailyPlanCents)}/dia · soma das semanas`
								: planGoalSource === "default"
									? `${formatBRL(dailyPlanCents)}/dia · alvo diário × ${totalTradingDays} dias`
									: `${formatBRL(dailyPlanCents)}/dia · ${totalTradingDays} dias úteis`
							: "Preencha as metas semanais ou defina meta no botão Editar"}
					</p>
				</div>

				<div>
					<div className="flex items-center gap-s-100 text-tiny text-txt-300">
						<Activity className="size-3.5" /> Realizado
					</div>
					<p className={cn("mt-s-100 font-mono text-h2 tabular-nums", realizedTone)}>
						{formatBRL(currentNetProfitCents)}
					</p>
					<p className="mt-s-100 text-micro text-txt-300">
						{daysTraded}/{totalTradingDays} dias · {formatBRL(dailyAverageCents)}/dia
					</p>
				</div>

				<div>
					<div className="flex items-center gap-s-100 text-tiny text-txt-300">
						<TrendingUp className="size-3.5" /> Projeção
					</div>
					{projection == null ? (
						<p className="mt-s-100 text-h3 text-txt-placeholder">Sem projeção</p>
					) : (
						<p className={cn("mt-s-100 font-mono text-h2 tabular-nums", projectionTone)}>
							{formatBRL(projection)}
						</p>
					)}
					<p className="mt-s-100 text-micro text-txt-300">
						{projection == null
							? `${tradingDaysRemaining} dias restantes · trade pra projetar`
							: `IR ~${formatBRLPrecise(projectedDarfCents)} · ${tradingDaysRemaining} dias restantes`}
					</p>
				</div>

				<div>
					<div className="flex items-center gap-s-100 text-tiny text-txt-300">
						<Trophy className="size-3.5" /> Hit rate
					</div>
					{planSet ? (
						<>
							<p className="mt-s-100 font-mono text-h2 tabular-nums text-guide">
								{Math.round(hitPctOfGoal)}%
							</p>
							<div className="mt-s-200 h-1.5 w-full overflow-hidden rounded-full bg-bg-100">
								<div
									className="h-full rounded-full bg-guide transition-[width]"
									style={{ width: `${Math.min(100, Math.max(0, hitPctOfGoal))}%` }}
									aria-hidden="true"
								/>
							</div>
							{projection != null && (
								<p className="mt-s-100 text-micro text-txt-300">
									Projetado: {Math.round(projectedHitPct)}% da meta
								</p>
							)}
						</>
					) : (
						<>
							<p className="mt-s-100 text-h3 text-txt-placeholder">—</p>
							<p className="mt-s-100 text-micro text-txt-300">Defina a meta para acompanhar</p>
						</>
					)}
				</div>
			</div>
		</section>
	)
}

export { PlanVsReality }
export type { PlanVsRealityProps }
