"use client"

import { memo } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { hhmmToTimeString, timeStringToHhmm } from "@/lib/backtest/time-utils"
import type { StrategyRecipe, OrbEntryConfig } from "@/types/backtest"

interface OrbEntrySectionProps {
	recipe: StrategyRecipe
	onRecipeChange: (_recipe: StrategyRecipe) => void
}

const OrbEntrySection = memo(
	({ recipe, onRecipeChange }: OrbEntrySectionProps) => {
		const t = useTranslations("backtest.orb")
		const tBuilder = useTranslations("backtest.builder")

		if (recipe.entry.type !== "orb_breakout") {
			return null
		}
		const config = recipe.entry.config as OrbEntryConfig

		const update = (field: string, value: number | boolean) => {
			onRecipeChange({
				...recipe,
				entry: { type: "orb_breakout", config: { ...config, [field]: value } },
			})
		}

		return (
			<div className="border-bg-300 bg-bg-200 space-y-m-400 p-m-400 rounded-lg border">
				<h2 className="text-h3 text-txt-100 font-semibold">{t("name")}</h2>
				<p className="text-small text-txt-300">
					{tBuilder("entryDescription")}
				</p>

				<div className="gap-m-400 grid grid-cols-2 sm:grid-cols-3">
					<div className="space-y-s-200">
						<Label htmlFor="orb-startTime" id="label-startTime">
							{t("startTime")}
						</Label>
						<Input
							id="orb-startTime"
							type="time"
							value={hhmmToTimeString(config.startTime)}
							onChange={(e) =>
								update("startTime", timeStringToHhmm(e.target.value))
							}
						/>
					</div>

					<div className="space-y-s-200">
						<Label htmlFor="orb-endTime" id="label-endTime">
							{t("endTime")}
						</Label>
						<Input
							id="orb-endTime"
							type="time"
							value={hhmmToTimeString(config.endTime)}
							onChange={(e) =>
								update("endTime", timeStringToHhmm(e.target.value))
							}
						/>
					</div>

					<div className="gap-s-300 pt-m-400 flex items-center">
						<Switch
							id="orb-ignorarGaps"
							checked={config.ignorarGaps}
							onCheckedChange={(checked) => update("ignorarGaps", checked)}
						/>
						<Label htmlFor="orb-ignorarGaps" id="label-ignorarGaps">
							{t("ignorarGaps")}
						</Label>
					</div>
				</div>
			</div>
		)
	}
)
OrbEntrySection.displayName = "OrbEntrySection"

export { OrbEntrySection }
