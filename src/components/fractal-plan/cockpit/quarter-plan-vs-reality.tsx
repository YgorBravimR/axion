"use client"

import { Activity, Target, TrendingUp, Trophy } from "lucide-react"
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
	const planSet = planGoalCents != null && planGoalCents > 0
	const projection = projectedNetCents
	const hitPctOfGoal = planSet ? (realizedNetCents / planGoalCents!) * 100 : 0
	const projectedHitPct = planSet && projection != null ? (projection / planGoalCents!) * 100 : 0

	const realizedTone =
		realizedNetCents > 0 ? "text-trade-buy" : realizedNetCents < 0 ? "text-trade-sell" : "text-txt-100"
	const projectionTone =
		projection != null && projection > 0
			? "text-trade-buy"
			: projection != null && projection < 0
				? "text-trade-sell"
				: "text-txt-100"

	const isAuto = planGoalSource === "weeks" || planGoalSource === "default" || planGoalSource === "mixed"

	return (
		<section
			id="quarter-plan-vs-reality"
			className="rounded-lg border border-acc-100/30 bg-gradient-to-br from-acc-100/5 to-transparent p-m-500"
			aria-label={`Plano vs realidade · ${quarterLabel}`}
		>
			<div className="flex items-baseline justify-between">
				<span className="text-tiny font-medium uppercase tracking-wider text-acc-100">
					Plano vs realidade
				</span>
				<span className="text-tiny text-txt-300">{quarterLabel}</span>
			</div>

			<div className="mt-m-400 grid grid-cols-2 gap-m-400 lg:grid-cols-4">
				<div>
					<div className="flex items-center gap-s-100 text-tiny text-txt-300">
						<Target className="size-3.5" /> Meta
						{isAuto && (
							<span
								className="rounded-sm bg-bg-100 px-s-100 py-px text-micro uppercase tracking-wider text-txt-300"
								title="Soma das metas mensais (manuais ou cascateadas)"
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
							? planGoalSource === "manual"
								? "Definida manualmente"
								: planGoalSource === "mixed"
									? "Soma · manual + auto"
									: "Soma das metas mensais"
							: "Defina metas mensais ou trimestral no botão Editar"}
					</p>
				</div>

				<div>
					<div className="flex items-center gap-s-100 text-tiny text-txt-300">
						<Activity className="size-3.5" /> Realizado
					</div>
					<p className={cn("mt-s-100 font-mono text-h2 tabular-nums", realizedTone)}>
						{formatBRL(realizedNetCents)}
					</p>
					<p className="mt-s-100 text-micro text-txt-300">
						{monthsTraded}/{totalMonths} mês(es) c/ trades · líq. pós-IR
					</p>
				</div>

				<div>
					<div className="flex items-center gap-s-100 text-tiny text-txt-300">
						<TrendingUp className="size-3.5" /> Projeção fim Q
					</div>
					{projection == null ? (
						<p className="mt-s-100 text-h3 text-txt-placeholder">Sem projeção</p>
					) : (
						<p className={cn("mt-s-100 font-mono text-h2 tabular-nums", projectionTone)}>
							{formatBRL(projection)}
						</p>
					)}
					<p className="mt-s-100 text-micro text-txt-300">
						{projection == null ? "trade pra projetar" : "realizado + projeção do mês corrente"}
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
							<p className="mt-s-100 text-micro text-txt-300">Defina meta para acompanhar</p>
						</>
					)}
				</div>
			</div>
		</section>
	)
}

export { QuarterPlanVsReality }
export type { QuarterPlanVsRealityProps }
