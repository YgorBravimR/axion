"use client"

import { memo } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { hhmmToTimeString, timeStringToHhmm } from "@/lib/backtest/time-utils"
import type { StrategyRecipe, HawksTripleScreenConfig } from "@/types/backtest"

interface HawksEntrySectionProps {
	recipe: StrategyRecipe
	onRecipeChange: (_recipe: StrategyRecipe) => void
}

const HawksEntrySection = memo(
	({ recipe, onRecipeChange }: HawksEntrySectionProps) => {
		const t = useTranslations("backtest.hawks")
		const tBuilder = useTranslations("backtest.builder")

		if (recipe.entry.type !== "hawks_triple_screen") {
			return null
		}
		const config = recipe.entry.config as HawksTripleScreenConfig

		const update = (
			field: keyof HawksTripleScreenConfig,
			value: string | number
		) => {
			const newConfig = { ...config, [field]: value }
			// Sync requiredIndicators — Hawks reads pre-computed EMAs from JSONB
			const requiredIndicators = [
				newConfig.ema27_60m_key,
				newConfig.ema55_60m_key,
				newConfig.ema27_15m_key,
				newConfig.macd_key,
			]
			onRecipeChange({
				...recipe,
				entry: { type: "hawks_triple_screen", config: newConfig },
				requiredIndicators,
			})
		}

		return (
			<div className="border-bg-300 bg-bg-200 space-y-m-400 p-m-400 rounded-lg border">
				<div>
					<h2 className="text-h3 text-txt-100 font-semibold">{t("name")}</h2>
					<p className="text-small text-txt-300 mt-s-100">
						{tBuilder("entryDescription")}
					</p>
				</div>

				{/* Time window */}
				<div className="gap-m-400 grid grid-cols-2">
					<div className="space-y-s-200">
						<Label htmlFor="hawks-startTime">{t("startTime")}</Label>
						<Input
							id="hawks-startTime"
							type="time"
							value={hhmmToTimeString(config.startTime)}
							onChange={(e) =>
								update("startTime", timeStringToHhmm(e.target.value))
							}
						/>
					</div>

					<div className="space-y-s-200">
						<Label htmlFor="hawks-endTime">{t("endTime")}</Label>
						<Input
							id="hawks-endTime"
							type="time"
							value={hhmmToTimeString(config.endTime)}
							onChange={(e) =>
								update("endTime", timeStringToHhmm(e.target.value))
							}
						/>
					</div>
				</div>

				{/* Indicator keys */}
				<div className="space-y-s-200">
					<p className="text-small text-txt-200 font-medium">
						{t("indicatorKeys")}
					</p>
					<p className="text-small text-txt-300">{t("indicatorKeysDesc")}</p>
					<div className="gap-s-300 grid grid-cols-2 sm:grid-cols-4">
						<div className="space-y-s-200">
							<Label htmlFor="hawks-ema27-60m">{t("ema27_60m_key")}</Label>
							<Input
								id="hawks-ema27-60m"
								value={config.ema27_60m_key}
								onChange={(e) => update("ema27_60m_key", e.target.value)}
								className="text-tiny font-mono"
							/>
						</div>
						<div className="space-y-s-200">
							<Label htmlFor="hawks-ema55-60m">{t("ema55_60m_key")}</Label>
							<Input
								id="hawks-ema55-60m"
								value={config.ema55_60m_key}
								onChange={(e) => update("ema55_60m_key", e.target.value)}
								className="text-tiny font-mono"
							/>
						</div>
						<div className="space-y-s-200">
							<Label htmlFor="hawks-ema27-15m">{t("ema27_15m_key")}</Label>
							<Input
								id="hawks-ema27-15m"
								value={config.ema27_15m_key}
								onChange={(e) => update("ema27_15m_key", e.target.value)}
								className="text-tiny font-mono"
							/>
						</div>
						<div className="space-y-s-200">
							<Label htmlFor="hawks-macd-key">{t("macd_key")}</Label>
							<Input
								id="hawks-macd-key"
								value={config.macd_key}
								onChange={(e) => update("macd_key", e.target.value)}
								className="text-tiny font-mono"
							/>
						</div>
					</div>
				</div>
			</div>
		)
	}
)
HawksEntrySection.displayName = "HawksEntrySection"

export { HawksEntrySection }
