"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Calculator, TrendingUp, Shield, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"
import { fromCents } from "@/lib/money"
import type { CalculatorResult } from "@/lib/calculator"

interface CalculatorResultsProps {
	result: CalculatorResult | null
	hasAssetSelected: boolean
	hasPrices: boolean
	isMaxRiskFromSettings?: boolean
	currency?: string
}

const formatCurrency = (cents: number, currency = "R$"): string => {
	const value = fromCents(cents)
	const absValue = Math.abs(value)
	const prefix = value < 0 ? "-" : ""
	return `${prefix}${currency} ${absValue.toFixed(2)}`
}

const formatPoints = (points: number): string => {
	// Use reasonable precision: if value has decimals show them, otherwise show integer
	if (points === Math.floor(points)) {
		return points.toString()
	}
	return points.toFixed(2)
}

const getRiskRewardColor = (ratio: number): string => {
	if (ratio >= 2) return "text-trade-buy"
	if (ratio >= 1) return "text-acc-100"
	return "text-trade-sell"
}

const CalculatorResults = ({
	result,
	hasAssetSelected,
	hasPrices,
	isMaxRiskFromSettings = true,
	currency = "R$",
}: CalculatorResultsProps) => {
	const t = useTranslations("commandCenter.calculator")

	// Empty state: no asset selected
	if (!hasAssetSelected) {
		return (
			<div className="border-bg-300 p-s-300 sm:p-m-400 lg:p-m-500 flex h-full items-center justify-center rounded-lg border border-dashed">
				<div className="text-center">
					<Calculator className="mb-s-200 text-txt-300 mx-auto h-8 w-8" />
					<p className="text-small text-txt-300">{t("selectAssetToStart")}</p>
				</div>
			</div>
		)
	}

	// Empty state: no prices yet
	if (!hasPrices || !result) {
		return (
			<div className="border-bg-300 p-s-300 sm:p-m-400 lg:p-m-500 flex h-full items-center justify-center rounded-lg border border-dashed">
				<div className="text-center">
					<BarChart3 className="mb-s-200 text-txt-300 mx-auto h-8 w-8" />
					<p className="text-small text-txt-300">
						{t("enterPricesToCalculate")}
					</p>
				</div>
			</div>
		)
	}

	// Validation errors
	if (!result.isValid) {
		return (
			<div className="border-trade-sell/30 bg-trade-sell/5 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<div className="space-y-s-200">
					{result.errors.map((error) => (
						<p key={error} className="text-small text-trade-sell">
							{t(error)}
						</p>
					))}
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-m-400">
			{/* Risk Section */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
				<div className="mb-s-300 gap-s-200 flex items-center">
					<Shield className="text-trade-sell h-4 w-4" />
					<h4 className="text-small text-txt-100 font-semibold">
						{t("riskAnalysis")}
					</h4>
				</div>

				<div className="gap-s-300 grid grid-cols-2">
					{/* Stop Distance */}
					<div>
						<p className="text-tiny text-txt-300">{t("stopPoints")}</p>
						<p className="text-body text-txt-100 font-semibold">
							{formatPoints(result.stopPoints)} {t("points")}
						</p>
					</div>

					{/* Risk Per Contract */}
					<div>
						<p className="text-tiny text-txt-300">{t("riskPerContract")}</p>
						<p className="text-body text-trade-sell font-semibold">
							{formatCurrency(result.riskPerContractCents, currency)}
						</p>
					</div>

					{/* Max Allowed Risk */}
					<div>
						<p className="text-tiny text-txt-300">
							{t("maxAllowedRisk")}
							{isMaxRiskFromSettings ? (
								<Link
									href="/settings?tab=account"
									className="ml-s-100 text-acc-100 hover:text-acc-200 underline transition-colors"
									aria-label={t("fromSettings")}
								>
									({t("fromSettings")})
								</Link>
							) : (
								<span className="ml-s-100 text-acc-100">({t("manual")})</span>
							)}
						</p>
						<p className="text-body text-txt-100 font-semibold">
							{formatCurrency(result.maxAllowedRiskCents, currency)}
						</p>
					</div>

					{/* Total Risk */}
					<div>
						<p className="text-tiny text-txt-300">{t("totalRisk")}</p>
						<p
							className={cn(
								"text-body font-semibold",
								result.totalRiskCents > result.maxAllowedRiskCents
									? "text-fb-error"
									: "text-trade-sell"
							)}
						>
							{formatCurrency(result.totalRiskCents, currency)}
						</p>
						{result.totalRiskCents > result.maxAllowedRiskCents && (
							<p className="text-tiny text-fb-error">{t("exceedsMaxRisk")}</p>
						)}
					</div>

					{/* Risk with +1 contract hint */}
					{result.suggestedContracts > 0 && result.riskPerContractCents > 0 && (
						<div className="border-bg-300 px-s-300 py-s-200 col-span-2 rounded-md border border-dashed">
							<p className="text-tiny text-txt-300">
								{t("riskWithExtraContract", {
									contracts: result.suggestedContracts + 1,
								})}
							</p>
							<p
								className={cn(
									"text-small font-medium",
									(result.suggestedContracts + 1) *
										result.riskPerContractCents >
										result.maxAllowedRiskCents
										? "text-trade-sell"
										: "text-txt-200"
								)}
							>
								{formatCurrency(
									(result.suggestedContracts + 1) * result.riskPerContractCents,
									currency
								)}
								{(result.suggestedContracts + 1) * result.riskPerContractCents >
									result.maxAllowedRiskCents && (
									<span className="ml-s-200 text-tiny text-trade-sell font-normal">
										(+
										{formatCurrency(
											(result.suggestedContracts + 1) *
												result.riskPerContractCents -
												result.maxAllowedRiskCents,
											currency
										)}{" "}
										{t("overLimit")})
									</span>
								)}
							</p>
						</div>
					)}
				</div>
			</div>

			{/* Position Size Section */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
				<div className="mb-s-300 gap-s-200 flex items-center">
					<BarChart3 className="text-acc-100 h-4 w-4" />
					<h4 className="text-small text-txt-100 font-semibold">
						{t("positionSizing")}
					</h4>
				</div>

				<div className="gap-s-300 grid grid-cols-2">
					{/* Suggested Contracts */}
					<div>
						<p className="text-tiny text-txt-300">{t("suggestedContracts")}</p>
						<p className="text-body text-acc-100 font-semibold">
							{result.suggestedContracts} {t("contracts")}
						</p>
					</div>

					{/* Actual Contracts */}
					<div>
						<p className="text-tiny text-txt-300">{t("actualContracts")}</p>
						<p
							className={cn(
								"text-body font-semibold",
								result.actualContracts !== result.suggestedContracts
									? "text-acc-100"
									: "text-txt-100"
							)}
						>
							{result.actualContracts} {t("contracts")}
						</p>
					</div>
				</div>
			</div>

			{/* Target / R:R Section */}
			{result.targetPoints !== null && (
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
					<div className="mb-s-300 gap-s-200 flex items-center">
						<TrendingUp className="text-trade-buy h-4 w-4" />
						<h4 className="text-small text-txt-100 font-semibold">
							{t("targetAnalysis")}
						</h4>
					</div>

					<div className="gap-s-300 grid grid-cols-2">
						{/* Target Distance */}
						<div>
							<p className="text-tiny text-txt-300">{t("targetPoints")}</p>
							<p className="text-body text-txt-100 font-semibold">
								{formatPoints(result.targetPoints)} {t("points")}
							</p>
						</div>

						{/* Return Per Contract */}
						{result.returnPerContractCents !== null && (
							<div>
								<p className="text-tiny text-txt-300">
									{t("returnPerContract")}
								</p>
								<p className="text-body text-trade-buy font-semibold">
									{formatCurrency(result.returnPerContractCents, currency)}
								</p>
							</div>
						)}

						{/* R:R Ratio */}
						{result.riskRewardRatio !== null && (
							<div className="col-span-2">
								<p className="text-tiny text-txt-300">{t("riskRewardRatio")}</p>
								<p
									className={cn(
										"text-h3 font-bold",
										getRiskRewardColor(result.riskRewardRatio)
									)}
								>
									1 : {result.riskRewardRatio.toFixed(2)}
								</p>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}

export { CalculatorResults }
export type { CalculatorResultsProps }
