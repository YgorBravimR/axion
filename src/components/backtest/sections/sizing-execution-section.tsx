"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PluginPicker } from "./plugin-picker"
import type { StrategyRecipe, SizingConfig, RiskDistribution } from "@/types/backtest"

interface SizingExecutionSectionProps {
	recipe: StrategyRecipe
	onRecipeChange: (recipe: StrategyRecipe) => void
}

const SizingExecutionSection = ({ recipe, onRecipeChange }: SizingExecutionSectionProps) => {
	const t = useTranslations("backtest.builder")

	const sizingType = recipe.sizing.type
	const hasReversal = recipe.reversal.type === "reverse_on_stop"
	const maxReversals = recipe.reversal.type === "reverse_on_stop" ? recipe.reversal.maxReversals : 0

	const sizingOptions = [
		{ value: "monetary_risk", label: t("sizingMonetary"), description: t("sizingMonetaryDesc") },
		{ value: "fixed_lots", label: t("sizingFixed"), description: t("sizingFixedDesc") },
	]

	const handleSizingChange = (type: string) => {
		let sizing: SizingConfig
		if (type === "monetary_risk") {
			sizing = { type: "monetary_risk", riskAmountCents: 8000, valuePerPointCents: recipe.sizing.type === "monetary_risk" ? recipe.sizing.valuePerPointCents : 20, riskDistribution: "per_trade" }
		} else {
			sizing = { type: "fixed_lots", lots: 2 }
		}
		onRecipeChange({ ...recipe, sizing })
	}

	// Risk distribution options (only shown when reversal is active + monetary risk)
	const riskDistOptions = [
		{
			value: "per_trade",
			label: t("riskPerTrade"),
			description: t("riskPerTradeDesc"),
		},
		{
			value: "per_day",
			label: t("riskPerDay"),
			description: t("riskPerDayDesc", { trades: maxReversals + 1 }),
		},
	]

	const handleRiskDistChange = (value: string) => {
		if (recipe.sizing.type !== "monetary_risk") return
		onRecipeChange({
			...recipe,
			sizing: { ...recipe.sizing, riskDistribution: value as RiskDistribution },
		})
	}

	// Compute per-trade display when "per_day" is selected
	const perTradeAmount = recipe.sizing.type === "monetary_risk" && recipe.sizing.riskDistribution === "per_day"
		? Math.round(recipe.sizing.riskAmountCents / (maxReversals + 1))
		: null

	return (
		<div className="border-bg-300 bg-bg-200 space-y-m-500 rounded-lg border p-m-400">
			<h2 className="text-h3 font-semibold text-txt-100">{t("sizingExecution")}</h2>

			{/* Sizing mode */}
			<div className="space-y-s-300">
				<p className="text-small font-medium text-txt-200">{t("positionSizing")}</p>
				<PluginPicker
					options={sizingOptions}
					selected={sizingType}
					onSelect={handleSizingChange}
				/>
			</div>

			{/* Sizing inputs */}
			<div className="gap-m-400 grid grid-cols-2 sm:grid-cols-3">
				{sizingType === "monetary_risk" && (
					<div className="space-y-s-200">
						<Label id="label-risk-amount">{t("riskAmount")}</Label>
						<div className="flex items-center gap-s-100">
							<span className="text-small text-txt-300 shrink-0">R$</span>
							<Input
								id="risk-amount"
								type="number"
								step="0.01"
								value={recipe.sizing.type === "monetary_risk" ? recipe.sizing.riskAmountCents / 100 : 80}
								onChange={(e) => {
									const reais = parseFloat(e.target.value) || 80
									if (recipe.sizing.type !== "monetary_risk") return
									onRecipeChange({
										...recipe,
										sizing: { ...recipe.sizing, riskAmountCents: Math.round(reais * 100) },
									})
								}}
							/>
						</div>
						{perTradeAmount !== null && (
							<p className="text-tiny text-acc-100">
								= R${(perTradeAmount / 100).toFixed(2)} {t("perTradeCalc")}
							</p>
						)}
					</div>
				)}

				{sizingType === "fixed_lots" && (
					<div className="space-y-s-200">
						<Label id="label-fixed-lots">{t("fixedLots")}</Label>
						<Input
							id="fixed-lots"
							type="number"
							value={recipe.sizing.type === "fixed_lots" ? recipe.sizing.lots : 2}
							onChange={(e) => {
								const lots = parseInt(e.target.value) || 2
								onRecipeChange({ ...recipe, sizing: { type: "fixed_lots", lots } })
							}}
						/>
					</div>
				)}

				<div className="space-y-s-200">
					<Label id="label-slippage">{t("slippage")}</Label>
					<div className="flex items-center gap-s-100">
						<Input
							id="slippage"
							type="number"
							value={recipe.slippageTicks}
							onChange={(e) => onRecipeChange({ ...recipe, slippageTicks: parseInt(e.target.value) || 0 })}
						/>
						<span className="text-small text-txt-300 shrink-0">{t("slippageUnit")}</span>
					</div>
				</div>
			</div>

			{/* Risk distribution — only when reversal is active + monetary risk */}
			{hasReversal && sizingType === "monetary_risk" && (
				<div className="space-y-s-300">
					<p className="text-small font-medium text-txt-200">{t("riskDistribution")}</p>
					<PluginPicker
						options={riskDistOptions}
						selected={recipe.sizing.type === "monetary_risk" ? recipe.sizing.riskDistribution : "per_trade"}
						onSelect={handleRiskDistChange}
					/>
				</div>
			)}
		</div>
	)
}

export { SizingExecutionSection }
