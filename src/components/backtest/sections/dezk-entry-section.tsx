"use client"

import { memo } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { hhmmToTimeString, timeStringToHhmm } from "@/lib/backtest/time-utils"
import type { StrategyRecipe, MACDWMAConfig } from "@/types/backtest"

interface DezkEntrySectionProps {
	recipe: StrategyRecipe
	onRecipeChange: (recipe: StrategyRecipe) => void
}

const DezkEntrySection = memo(
	({ recipe, onRecipeChange }: DezkEntrySectionProps) => {
		const t = useTranslations("backtest.dezk")
		const tBuilder = useTranslations("backtest.builder")

		if (recipe.entry.type !== "macd_wma_alignment") {
			return null
		}
		const config = recipe.entry.config as MACDWMAConfig

		const update = (field: string, value: number | boolean) => {
			onRecipeChange({
				...recipe,
				entry: {
					type: "macd_wma_alignment",
					config: { ...config, [field]: value },
				},
			})
		}

		return (
			<div className="border-bg-300 bg-bg-200 space-y-m-400 p-m-400 rounded-lg border">
				<h2 className="text-h3 text-txt-100 font-semibold">{t("name")}</h2>
				<p className="text-small text-txt-300">
					{tBuilder("entryDescriptionDezk")}
				</p>

				{/* MACD params */}
				<div className="space-y-s-200">
					<p className="text-small text-txt-200 font-medium">MACD</p>
					<div className="gap-m-400 grid grid-cols-3">
						<div className="space-y-s-200">
							<Label id="label-macd-fast">{t("macdFast")}</Label>
							<Input
								id="macd-fast"
								type="number"
								value={config.macdFast}
								onChange={(e) =>
									update("macdFast", parseInt(e.target.value) || 12)
								}
							/>
						</div>
						<div className="space-y-s-200">
							<Label id="label-macd-slow">{t("macdSlow")}</Label>
							<Input
								id="macd-slow"
								type="number"
								value={config.macdSlow}
								onChange={(e) =>
									update("macdSlow", parseInt(e.target.value) || 26)
								}
							/>
						</div>
						<div className="space-y-s-200">
							<Label id="label-macd-signal">{t("macdSignal")}</Label>
							<Input
								id="macd-signal"
								type="number"
								value={config.macdSignal}
								onChange={(e) =>
									update("macdSignal", parseInt(e.target.value) || 15)
								}
							/>
						</div>
					</div>
				</div>

				{/* WMA + Entry + Stop params */}
				<div className="gap-m-400 grid grid-cols-2 sm:grid-cols-4">
					<div className="space-y-s-200">
						<Label id="label-wma-fast">{t("wmaFast")}</Label>
						<Input
							id="wma-fast"
							type="number"
							value={config.wmaFast}
							onChange={(e) => update("wmaFast", parseInt(e.target.value) || 9)}
						/>
					</div>
					<div className="space-y-s-200">
						<Label id="label-wma-slow">{t("wmaSlow")}</Label>
						<Input
							id="wma-slow"
							type="number"
							value={config.wmaSlow}
							onChange={(e) =>
								update("wmaSlow", parseInt(e.target.value) || 21)
							}
						/>
					</div>
					<div className="space-y-s-200">
						<Label id="label-candles-after">{t("candlesAfter")}</Label>
						<Input
							id="candles-after"
							type="number"
							value={config.candlesAfterAlignment}
							onChange={(e) =>
								update("candlesAfterAlignment", parseInt(e.target.value) || 2)
							}
						/>
					</div>
					<div className="space-y-s-200">
						<Label id="label-stop-buffer">{t("stopBuffer")}</Label>
						<div className="gap-s-100 flex items-center">
							<Input
								id="stop-buffer"
								type="number"
								value={config.stopBufferPoints}
								onChange={(e) =>
									update("stopBufferPoints", parseInt(e.target.value) || 30)
								}
							/>
							<span className="text-small text-txt-300 shrink-0">pts</span>
						</div>
					</div>
				</div>

				{/* Time + flags */}
				<div className="gap-m-400 grid grid-cols-2 sm:grid-cols-4">
					<div className="space-y-s-200">
						<Label id="label-dezk-start">{t("startTime")}</Label>
						<Input
							id="dezk-start"
							type="time"
							value={hhmmToTimeString(config.startTime)}
							onChange={(e) =>
								update("startTime", timeStringToHhmm(e.target.value))
							}
						/>
					</div>
					<div className="space-y-s-200">
						<Label id="label-dezk-end">{t("endTime")}</Label>
						<Input
							id="dezk-end"
							type="time"
							value={hhmmToTimeString(config.endTime)}
							onChange={(e) =>
								update("endTime", timeStringToHhmm(e.target.value))
							}
						/>
					</div>
					<div className="gap-s-300 pt-m-400 flex items-center">
						<Switch
							id="dezk-zero-cross"
							checked={config.requireZeroCross}
							onCheckedChange={(checked) => update("requireZeroCross", checked)}
						/>
						<Label id="label-zero-cross">{t("requireZeroCross")}</Label>
					</div>
				</div>
			</div>
		)
	}
)
DezkEntrySection.displayName = "DezkEntrySection"

export { DezkEntrySection }
