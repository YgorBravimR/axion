"use client"

import { memo, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { hhmmToTimeString, timeStringToHhmm } from "@/lib/backtest/time-utils"
import type {
	StrategyRecipe,
	HawksTripleScreenConfig,
	QualityGatesConfig,
} from "@/types/backtest"
import { HawksQualityControls } from "./hawks-quality-controls"

interface HawksEntrySectionProps {
	recipe: StrategyRecipe
	onRecipeChange: (_recipe: StrategyRecipe) => void
}

const HawksEntrySection = memo(
	({ recipe, onRecipeChange }: HawksEntrySectionProps) => {
		const t = useTranslations("backtest.hawks")
		const tBuilder = useTranslations("backtest.builder")

		// Narrow defensively so hooks below run unconditionally. Parent guards
		// on entry.type already, but Rules of Hooks requires a stable hook
		// call order regardless of an early return.
		const config: HawksTripleScreenConfig | null =
			recipe.entry.type === "hawks_playbook"
				? (recipe.entry.config as HawksTripleScreenConfig)
				: null

		// Indicator JSONB key names are a stable contract between the candle
		// importer and the engine — defaults are set by the preset and are not
		// user-editable. We still mirror them onto `requiredIndicators` so the
		// engine receives the same shape it always has.
		const update = (
			field: keyof HawksTripleScreenConfig,
			value: string | number
		) => {
			if (!config) {
				return
			}
			const newConfig = { ...config, [field]: value }
			const requiredIndicators = [
				newConfig.ema27_60m_key,
				newConfig.ema55_60m_key,
				newConfig.ema27_15m_key,
				newConfig.macd_key,
			]
			onRecipeChange({
				...recipe,
				entry: { type: "hawks_playbook", config: newConfig },
				requiredIndicators,
			})
		}

		const handleQualityChange = useCallback(
			(nextGates: QualityGatesConfig) => {
				if (recipe.entry.type !== "hawks_playbook") {
					return
				}
				const currentConfig = recipe.entry.config as HawksTripleScreenConfig
				onRecipeChange({
					...recipe,
					entry: {
						type: "hawks_playbook",
						config: { ...currentConfig, qualityGates: nextGates },
					},
				})
			},
			[recipe, onRecipeChange]
		)

		if (!config) {
			return null
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
						<Label id="hawks-startTime-label" htmlFor="hawks-startTime">
							{t("startTime")}
						</Label>
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
						<Label id="hawks-endTime-label" htmlFor="hawks-endTime">
							{t("endTime")}
						</Label>
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

				<HawksQualityControls
					qualityGates={config.qualityGates}
					onChange={handleQualityChange}
				/>
			</div>
		)
	}
)
HawksEntrySection.displayName = "HawksEntrySection"

export { HawksEntrySection }
