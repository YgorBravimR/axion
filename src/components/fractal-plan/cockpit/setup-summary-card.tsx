"use client"

import { useEffect, useState } from "react"
import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { YearlyPlanSlideover } from "./yearly-plan-slideover"
import { WhatIfCalculator, type AssetOption } from "./what-if-calculator"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"
import type { RiskManagementProfile } from "@/types/risk-profile"

interface SetupSummaryCardProps {
	year: number
	initialCapitalCents: number
	ladderRules: LadderRuleR[]
	tradingDaysPerWeek: number
	defaultDailyLossR: number | null
	defaultDailyWinR: number | null
	defaultMonthlyLossR: number | null
	defaultMonthlyWinR: number | null
	irTaxRate: number
	withdrawalPct: number
	riskProfiles: RiskManagementProfile[]
	existing: {
		initialCapitalCents: number
		ladderRules: LadderRuleR[]
		tradingDaysPerWeek: number
		defaultDailyLossR: string | null
		defaultDailyWinR: string | null
		defaultWeeklyLossR: string | null
		defaultWeeklyWinR: string | null
		defaultMonthlyLossR: string | null
		defaultMonthlyWinR: string | null
		defaultRiskProfileId: string | null
		notes: string | null
	} | null
	defaultInitialCapitalCents: number | null
	currentOneRCents: number
	availableAssets: readonly AssetOption[]
}

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const formatR = (r: number | null): string => (r == null ? "—" : `${r.toFixed(2)}R`)

const SetupSummaryCard = ({
	year,
	initialCapitalCents,
	ladderRules,
	tradingDaysPerWeek,
	defaultDailyLossR,
	defaultDailyWinR,
	defaultMonthlyLossR,
	defaultMonthlyWinR,
	irTaxRate,
	withdrawalPct,
	riskProfiles,
	existing,
	defaultInitialCapitalCents,
	currentOneRCents,
	availableAssets,
}: SetupSummaryCardProps) => {
	const [editing, setEditing] = useState(false)

	useEffect(() => {
		const handle = (event: Event) => {
			const detail = (event as CustomEvent<{ open: boolean }>).detail
			if (typeof detail?.open === "boolean") setEditing(detail.open)
		}
		window.addEventListener("plan-year-guide:set-drawer", handle)
		return () => window.removeEventListener("plan-year-guide:set-drawer", handle)
	}, [])

	return (
		<>
			<section
				id="plan-year-setup-card"
				className="rounded-lg border border-bg-300 bg-bg-200 p-m-500"
			>
				<header className="flex items-baseline justify-between">
					<div>
						<h2 className="text-h3 text-txt-100">Setup {year}</h2>
						<p className="text-small text-txt-300">
							Capital ladder, IR e defaults — propaga para meses, semanas e dias
						</p>
					</div>
					<Button
						id={`setup-edit-${year}`}
						variant="ghost"
						size="sm"
						onClick={() => setEditing(true)}
						aria-label="Editar plano anual"
					>
						<Pencil className="size-3.5" />
						Editar
					</Button>
				</header>

				<dl className="mt-m-400 grid grid-cols-2 gap-m-400 md:grid-cols-3 lg:grid-cols-5">
					<div>
						<dt className="text-xs text-txt-300">Capital inicial</dt>
						<dd className="mt-1 font-mono text-h3 tabular-nums text-txt-100">
							{formatBRL(initialCapitalCents)}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-txt-300">IR (day-trade)</dt>
						<dd className="mt-1 font-mono text-h3 tabular-nums text-txt-100">
							{(irTaxRate * 100).toFixed(0)}%
						</dd>
					</div>
					<div>
						<dt className="text-xs text-txt-300">Retirada mensal</dt>
						<dd className="mt-1 font-mono text-h3 tabular-nums text-guide">
							{(withdrawalPct * 100).toFixed(0)}%
						</dd>
					</div>
					<div>
						<dt className="text-xs text-txt-300">Dias / semana</dt>
						<dd className="mt-1 font-mono text-h3 tabular-nums text-txt-100">
							{tradingDaysPerWeek}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-txt-300">Caps diários (loss / win)</dt>
						<dd className="mt-1 font-mono text-small tabular-nums text-txt-200">
							{formatR(defaultDailyLossR)} / {formatR(defaultDailyWinR)}
						</dd>
					</div>
				</dl>

				<div id="plan-year-ladder" className="mt-m-500">
					<h3 className="text-xs uppercase tracking-wide text-txt-300">Capital ladder</h3>
					{ladderRules.length === 0 ? (
						<p className="mt-s-200 text-small text-txt-300">
							Sem tiers definidos. Use "Editar" para configurar a escada de capital.
						</p>
					) : (
						<ul className="mt-s-200 flex flex-wrap gap-s-200">
							{ladderRules.map((rule, idx) => (
								<li
									key={`${rule.minCapitalCents}-${rule.maxCapitalCents}`}
									className="rounded-sm border border-bg-300 bg-bg-100 px-s-300 py-s-100 font-mono text-xs"
								>
									<span className="text-txt-300">T{idx + 1}</span>
									<span className="mx-s-100 text-txt-300">·</span>
									<span className="text-txt-200">
										{formatBRL(rule.minCapitalCents)}+
									</span>
									<span className="mx-s-100 text-txt-300">·</span>
									<span className="text-acc-100">1R = {formatBRL(rule.oneRCents)}</span>
								</li>
							))}
						</ul>
					)}
				</div>

				<div className="mt-m-400 text-xs text-txt-300">
					Caps mensais: loss {formatR(defaultMonthlyLossR)} · win {formatR(defaultMonthlyWinR)}
				</div>

				<details className="group mt-m-500 rounded-sm border border-bg-300 bg-bg-100">
					<summary className="flex cursor-pointer list-none items-center justify-between gap-s-300 px-m-400 py-s-300 text-small text-txt-200 hover:text-txt-100">
						<span>
							<span className="font-medium text-txt-100">What-if · sizing</span>
							<span className="ml-s-200 text-xs text-txt-300">
								traduz 1R em nº de contratos a partir do stop em ticks (consulta opcional)
							</span>
						</span>
						<span className="text-xs text-txt-300 transition-transform group-open:rotate-180">▾</span>
					</summary>
					<div className="border-t border-bg-300 p-m-400">
						<WhatIfCalculator oneRCents={currentOneRCents} assets={availableAssets} />
					</div>
				</details>
			</section>

			<YearlyPlanSlideover
				open={editing}
				onOpenChange={setEditing}
				year={year}
				existing={existing}
				riskProfiles={riskProfiles}
				defaultInitialCapitalCents={defaultInitialCapitalCents}
			/>
		</>
	)
}

export { SetupSummaryCard }
export type { SetupSummaryCardProps }
