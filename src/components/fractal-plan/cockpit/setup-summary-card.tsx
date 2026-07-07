"use client"

import { useEffect, useState } from "react"
import { Pencil } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { useFormatting } from "@/hooks/use-formatting"
import {
	ProvenanceBadge,
	type CascadeLevel,
} from "@/components/fractal-plan/provenance-badge"
import { YearlyPlanSlideover } from "./yearly-plan-slideover"
import { WhatIfCalculator, type AssetOption } from "./what-if-calculator"
import {
	computeLadderRunway,
	type LadderRuleR,
} from "@/lib/fractal-plan/capital-ladder"
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
		defaultAssertivityPercent: string | null
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
	/** R-multiples below current tier's floor that trigger an intra-month downgrade. */
	drawdownTriggerThresholdR?: number
	/** Active snapshot tier index, used to highlight where the trader currently sits. */
	activeTierIndex?: number | null
	/** Cascaded defaults provenance — source level for each cap */
	defaultDailyLossRSource?: CascadeLevel | "none"
	defaultDailyWinRSource?: CascadeLevel | "none"
	defaultMonthlyLossRSource?: CascadeLevel | "none"
	defaultMonthlyWinRSource?: CascadeLevel | "none"
}

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
	drawdownTriggerThresholdR = 2,
	activeTierIndex = null,
	defaultDailyLossRSource = "none",
	defaultDailyWinRSource = "none",
	defaultMonthlyLossRSource = "none",
	defaultMonthlyWinRSource = "none",
}: SetupSummaryCardProps) => {
	const t = useTranslations("plan.setup")
	const { formatCurrency } = useFormatting()
	const formatBRL = (cents: number): string => formatCurrency(cents / 100)
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
						<dd className="text-h3 text-proj mt-1 font-mono italic tabular-nums">
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
						<div className="gap-s-100 mt-1 flex items-center">
							<dd className="text-small text-txt-200 font-mono tabular-nums">
								{formatR(defaultDailyLossR)} / {formatR(defaultDailyWinR)}
							</dd>
							{(defaultDailyLossRSource !== "none" ||
								defaultDailyWinRSource !== "none") && (
								<ProvenanceBadge
									level={defaultDailyWinRSource}
									showNonOverride
								/>
							)}
						</div>
					</div>
				</dl>

				<div id="plan-year-ladder" className="mt-m-500">
					<div className="gap-s-200 flex flex-wrap items-baseline justify-between">
						<h3 className="text-txt-300 text-tiny tracking-wide uppercase">
							{t("ladder.title")}
						</h3>
						<p className="text-tiny text-txt-300">
							{t("ladder.runwayHint", {
								threshold: drawdownTriggerThresholdR.toFixed(1),
							})}
						</p>
					</div>
					{ladderRules.length === 0 ? (
						<p className="mt-s-200 text-small text-txt-300">
							{t("ladder.noTiers")}
						</p>
					) : (
						<ul className="mt-s-300 gap-s-300 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
							{computeLadderRunway(ladderRules, drawdownTriggerThresholdR).map(
								(step) => {
									const isActive = activeTierIndex === step.tierIndex
									const isFloor = step.tierIndex === 0
									return (
										<li
											key={`${step.rule.minCapitalCents}-${step.rule.maxCapitalCents}`}
											aria-current={isActive ? "true" : undefined}
											className={`border-bg-300 bg-bg-100 p-s-300 rounded-md border ${
												isActive ? "border-acc-100 ring-acc-100/30 ring-1" : ""
											}`}
										>
											<div className="flex items-baseline justify-between">
												<span className="text-tiny text-txt-100 font-mono font-semibold">
													T{step.tierIndex + 1}
												</span>
												{isFloor ? (
													<span className="text-micro text-warning tracking-wide uppercase">
														{t("ladder.floorBadge")}
													</span>
												) : null}
											</div>
											<p className="mt-s-100 text-small text-txt-100 font-mono tabular-nums">
												{formatBRL(step.rule.minCapitalCents)}+
											</p>
											<p className="mt-s-100 text-tiny text-acc-100 font-mono tabular-nums">
												1R = {formatBRL(step.rule.oneRCents)}
											</p>
											<div className="border-bg-300 mt-s-300 pt-s-200 border-t">
												<p className="text-micro text-txt-300 tracking-wide uppercase">
													{t("ladder.runwayLabel")}
												</p>
												<p
													className="text-small text-txt-100 font-mono tabular-nums"
													title={t("ladder.runwayTitle", {
														r: step.rUntilRuin.toFixed(1),
													})}
												>
													{t("ladder.rUntilRuin", {
														r: step.rUntilRuin.toFixed(1),
													})}
												</p>
												<p className="text-micro text-txt-300 mt-s-100">
													{isFloor
														? t("ladder.noFurtherDowngrade")
														: t("ladder.toDowngrade", {
																r: step.rToNextDowngrade.toFixed(1),
															})}
												</p>
											</div>
										</li>
									)
								}
							)}
						</ul>
					)}
				</div>

				<div className="gap-s-100 mt-m-400 text-tiny flex items-center">
					<span className="text-txt-300">
						{t("monthlyCaps", {
							lossR: formatR(defaultMonthlyLossR),
							winR: formatR(defaultMonthlyWinR),
						})}
					</span>
					{(defaultMonthlyLossRSource !== "none" ||
						defaultMonthlyWinRSource !== "none") && (
						<ProvenanceBadge level={defaultMonthlyWinRSource} showNonOverride />
					)}
				</div>

				<details className="group mt-m-500 border-bg-300 bg-bg-100 rounded-sm border">
					<summary className="gap-s-300 px-m-400 py-s-300 text-small text-txt-200 hover:text-txt-100 flex cursor-pointer list-none items-center justify-between">
						<span>
							<span className="text-txt-100 font-medium">
								{t("whatIfTitle")}
							</span>
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
