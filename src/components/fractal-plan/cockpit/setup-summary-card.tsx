"use client"

import { useEffect, useState } from "react"
import { Pencil } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { YearlyPlanSlideover } from "./yearly-plan-slideover"
import { WhatIfCalculator, type AssetOption } from "./what-if-calculator"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"
import type { RiskManagementProfile } from "@/types/risk-profile"

interface SetupSummaryCardProps {
	accountId: string
	year: number
	initialCapitalCents: number
	ladderRules: LadderRuleR[]
	tradingDaysPerWeek: number
	defaultDailyLossR: number | null
	defaultDailyWinR: number | null
	defaultMonthlyLossR: number | null
	defaultMonthlyWinR: number | null
	irTaxRate: number
	irTaxRateSource: string
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

const formatR = (r: number | null): string =>
	r === null ? "—" : `${r.toFixed(2)}R`

const SetupSummaryCard = ({
	accountId,
	year,
	initialCapitalCents,
	ladderRules,
	tradingDaysPerWeek,
	defaultDailyLossR,
	defaultDailyWinR,
	defaultMonthlyLossR,
	defaultMonthlyWinR,
	irTaxRate,
	irTaxRateSource,
	withdrawalPct,
	riskProfiles,
	existing,
	defaultInitialCapitalCents,
	currentOneRCents,
	availableAssets,
}: SetupSummaryCardProps) => {
	const t = useTranslations("plan.setup")
	const [editing, setEditing] = useState(false)

	useEffect(() => {
		const handle = (event: Event) => {
			const detail = (event as CustomEvent<{ open: boolean }>).detail
			if (typeof detail?.open === "boolean") {
				setEditing(detail.open)
			}
		}
		window.addEventListener("plan-year-guide:set-drawer", handle)
		return () =>
			window.removeEventListener("plan-year-guide:set-drawer", handle)
	}, [])

	return (
		<>
			<section
				id="plan-year-setup-card"
				className="border-bg-300 bg-bg-200 p-m-500 rounded-lg border"
			>
				<header className="flex items-baseline justify-between">
					<div>
						<h2 className="text-h3 text-txt-100">{t("title", { year })}</h2>
						<p className="text-small text-txt-300">{t("subtitle")}</p>
					</div>
					<Button
						id={`setup-edit-${year}`}
						variant="ghost"
						size="sm"
						onClick={() => setEditing(true)}
						aria-label={t("editAriaLabel")}
					>
						<Pencil className="size-3.5" />
						{t("editButton")}
					</Button>
				</header>

				<dl className="mt-m-400 gap-m-400 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
					<div>
						<dt className="text-txt-300 text-tiny">
							{t("fields.initialCapital")}
						</dt>
						<dd className="text-h3 text-txt-100 mt-1 font-mono tabular-nums">
							{formatBRL(initialCapitalCents)}
						</dd>
					</div>
					<div>
						<dt className="text-txt-300 text-tiny">{t("fields.irDayTrade")}</dt>
						<dd
							className="text-h3 text-txt-100 mt-1 font-mono tabular-nums"
							title={t("fields.irRateTitle", { source: irTaxRateSource })}
						>
							{(irTaxRate * 100).toFixed(1).replace(/\.0$/, "")}%
						</dd>
						<p className="text-micro text-txt-300 mt-1">{irTaxRateSource}</p>
					</div>
					<div>
						<dt className="text-txt-300 text-tiny">
							{t("fields.monthlyWithdrawal")}
						</dt>
						<dd className="text-h3 text-guide mt-1 font-mono tabular-nums">
							{(withdrawalPct * 100).toFixed(0)}%
						</dd>
					</div>
					<div>
						<dt className="text-txt-300 text-tiny">
							{t("fields.daysPerWeek")}
						</dt>
						<dd className="text-h3 text-txt-100 mt-1 font-mono tabular-nums">
							{tradingDaysPerWeek}
						</dd>
					</div>
					<div>
						<dt className="text-txt-300 text-tiny">{t("fields.dailyCaps")}</dt>
						<dd className="text-small text-txt-200 mt-1 font-mono tabular-nums">
							{formatR(defaultDailyLossR)} / {formatR(defaultDailyWinR)}
						</dd>
					</div>
				</dl>

				<div id="plan-year-ladder" className="mt-m-500">
					<h3 className="text-txt-300 text-tiny tracking-wide uppercase">
						{t("ladder.title")}
					</h3>
					{ladderRules.length === 0 ? (
						<p className="mt-s-200 text-small text-txt-300">
							{t("ladder.noTiers")}
						</p>
					) : (
						<ul className="mt-s-200 gap-s-200 flex flex-wrap">
							{ladderRules.map((rule, idx) => (
								<li
									key={`${rule.minCapitalCents}-${rule.maxCapitalCents}`}
									className="border-bg-300 bg-bg-100 px-s-300 py-s-100 text-tiny rounded-sm border font-mono"
								>
									<span className="text-txt-300">T{idx + 1}</span>
									<span className="mx-s-100 text-txt-300">·</span>
									<span className="text-txt-200">
										{formatBRL(rule.minCapitalCents)}+
									</span>
									<span className="mx-s-100 text-txt-300">·</span>
									<span className="text-acc-100">
										1R = {formatBRL(rule.oneRCents)}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>

				<div className="mt-m-400 text-txt-300 text-tiny">
					{t("monthlyCaps", {
						lossR: formatR(defaultMonthlyLossR),
						winR: formatR(defaultMonthlyWinR),
					})}
				</div>

				<details className="group mt-m-500 border-bg-300 bg-bg-100 rounded-sm border">
					<summary className="gap-s-300 px-m-400 py-s-300 text-small text-txt-200 hover:text-txt-100 flex cursor-pointer list-none items-center justify-between">
						<span>
							<span className="text-txt-100 font-medium">What-if · sizing</span>
							<span className="ml-s-200 text-txt-300 text-tiny">
								{t("whatIfSummary")}
							</span>
						</span>
						<span className="text-txt-300 text-tiny transition-transform group-open:rotate-180">
							▾
						</span>
					</summary>
					<div className="border-bg-300 p-m-400 border-t">
						<WhatIfCalculator
							oneRCents={currentOneRCents}
							assets={availableAssets}
						/>
					</div>
				</details>
			</section>

			<YearlyPlanSlideover
				accountId={accountId}
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
