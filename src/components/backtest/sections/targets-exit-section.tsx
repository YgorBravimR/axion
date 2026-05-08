"use client"

import { useMemo, memo } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { PluginPicker } from "./plugin-picker"
import { Plus, Trash2 } from "lucide-react"
import { hhmmToTimeString, timeStringToHhmm } from "@/lib/backtest/time-utils"
import type { StrategyRecipe, TargetLevel, TargetMode } from "@/types/backtest"

interface TargetsExitSectionProps {
	recipe: StrategyRecipe
	onRecipeChange: (recipe: StrategyRecipe) => void
}

/** Inline unit suffix for each target mode — removes ambiguity */
const getModeSuffix = (
	mode: TargetMode,
	t: ReturnType<typeof useTranslations>
): string => {
	switch (mode) {
		case "r_multiple":
			return t("modeSuffixR")
		case "pct_range":
			return t("modeSuffixPctRange")
		case "pct_stop":
			return t("modeSuffixPctStop")
		case "fixed_points":
			return t("modeSuffixPts")
	}
}

const TARGET_MODE_OPTIONS: { value: TargetMode; labelKey: string }[] = [
	{ value: "r_multiple", labelKey: "modeRMultiple" },
	{ value: "pct_range", labelKey: "modePctRange" },
	{ value: "pct_stop", labelKey: "modePctStop" },
	{ value: "fixed_points", labelKey: "modeFixedPoints" },
]

const TargetsExitSection = memo(
	({ recipe, onRecipeChange }: TargetsExitSectionProps) => {
		const t = useTranslations("backtest.builder")

		// ── Shared target mode — must be before any early return ────────────────────────────────────
		const targetModeOptionsPrecomputed = useMemo(
			() =>
				TARGET_MODE_OPTIONS.map((opt) => ({
					value: opt.value,
					label: t(opt.labelKey),
					description: t(`${opt.labelKey}Desc`),
				})),
			[t]
		)

		if (recipe.target.type !== "fixed_levels") {
			return null
		}
		const targetConfig = recipe.target

		const totalAllocation = targetConfig.levels.reduce(
			(sum, level) => sum + level.exitPct,
			0
		)
		const remaining = 100 - totalAllocation
		const isExact = totalAllocation === 100
		const isOver = totalAllocation > 100
		const isUnder = totalAllocation < 100

		// ── Exit level management ────────────────────────────────

		const handleAddLevel = () => {
			const newLevel: TargetLevel = {
				value: 1,
				mode: targetConfig.levels[0]?.mode ?? "r_multiple",
				exitPct: 100,
				label: `target${targetConfig.levels.length + 1}`,
			}
			onRecipeChange({
				...recipe,
				target: { ...targetConfig, levels: [...targetConfig.levels, newLevel] },
			})
		}

		const handleRemoveLevel = (index: number) => {
			const levels = targetConfig.levels.filter((_, i) => i !== index)
			onRecipeChange({ ...recipe, target: { ...targetConfig, levels } })
		}

		const handleLevelChange = (
			index: number,
			field: keyof TargetLevel,
			value: string | number
		) => {
			const levels = [...targetConfig.levels]
			const current = levels[index]
			if (!current) {
				return
			}
			levels[index] = { ...current, [field]: value }
			onRecipeChange({ ...recipe, target: { ...targetConfig, levels } })
		}

		const handleEodChange = (time: string) => {
			onRecipeChange({
				...recipe,
				target: { ...targetConfig, eodTime: timeStringToHhmm(time) },
			})
		}

		// ── Shared target mode ───────────────────────────────────

		const currentMode = targetConfig.levels[0]?.mode ?? "r_multiple"

		const handleModeChange = (mode: string) => {
			const levels = targetConfig.levels.map((level) => ({
				...level,
				mode: mode as TargetMode,
			}))
			onRecipeChange({ ...recipe, target: { ...targetConfig, levels } })
		}

		return (
			<div className="border-bg-300 bg-bg-200 space-y-m-500 p-m-400 rounded-lg border">
				<h2 className="text-h3 text-txt-100 font-semibold">
					{t("targetsExit")}
				</h2>

				{/* Target pricing mode */}
				<div className="space-y-s-300">
					<p className="text-small text-txt-200 font-medium">
						{t("targetMode")}
					</p>
					<PluginPicker
						options={targetModeOptionsPrecomputed}
						selected={currentMode}
						onSelect={handleModeChange}
					/>
				</div>

				{/* Exit levels */}
				<div className="space-y-s-300">
					<div className="flex items-center justify-between">
						<p className="text-small text-txt-200 font-medium">
							{t("exitLevels")}
						</p>
						<Button
							id="add-exit-level"
							variant="outline"
							size="sm"
							onClick={handleAddLevel}
							className="gap-s-200"
						>
							<Plus className="h-3.5 w-3.5" />
							{t("addLevel")}
						</Button>
					</div>

					<div className="space-y-s-200">
						{targetConfig.levels.map((level, index) => (
							<div
								key={index}
								className="border-bg-300 bg-bg-100/50 gap-m-400 p-s-300 flex items-end rounded-lg border"
							>
								<div className="space-y-s-100 flex-1">
									<Label id={`label-level-value-${index}`}>
										{t("targetValue")}
									</Label>
									<div className="gap-s-100 flex items-center">
										<Input
											id={`level-value-${index}`}
											type="number"
											step="any"
											value={level.value}
											onChange={(e) =>
												handleLevelChange(
													index,
													"value",
													parseFloat(e.target.value) || 1
												)
											}
										/>
										<span className="text-small text-txt-300 shrink-0">
											{getModeSuffix(currentMode, t)}
										</span>
									</div>
								</div>

								<div className="space-y-s-100 w-28">
									<Label id={`label-level-exit-${index}`}>{t("exitPct")}</Label>
									<div className="gap-s-100 flex items-center">
										<Input
											id={`level-exit-${index}`}
											type="number"
											min={1}
											max={100}
											value={level.exitPct}
											onChange={(e) =>
												handleLevelChange(
													index,
													"exitPct",
													parseInt(e.target.value) || 50
												)
											}
										/>
										<span className="text-small text-txt-300 shrink-0">%</span>
									</div>
								</div>

								{targetConfig.levels.length > 1 && (
									<Button
										id={`remove-level-${index}`}
										variant="ghost"
										size="sm"
										onClick={() => handleRemoveLevel(index)}
										className="text-txt-300 hover:text-fb-error shrink-0"
										aria-label={`Remove exit level ${index + 1}`}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								)}
							</div>
						))}
					</div>

					{/* Allocation tracker */}
					<div className="space-y-s-100">
						<div className="flex items-center justify-between">
							<span className="text-small text-txt-300">
								{t("allocationUsed", { total: totalAllocation })}
							</span>
							<span
								className={`text-small font-medium ${
									isExact
										? "text-fb-success"
										: isOver
											? "text-fb-error"
											: "text-txt-300"
								}`}
							>
								{isExact && t("allocationExact")}
								{isOver && t("allocationOver", { over: totalAllocation - 100 })}
								{isUnder && t("allocationRemaining", { remaining })}
							</span>
						</div>
						<div className="bg-bg-300 h-1.5 overflow-hidden rounded-full">
							<div
								className={`h-full rounded-full transition-all duration-200 ${
									isExact
										? "bg-fb-success"
										: isOver
											? "bg-fb-error"
											: "bg-txt-300"
								}`}
								style={{ width: `${Math.min(totalAllocation, 100)}%` }}
							/>
						</div>
					</div>
				</div>

				{/* EOD Exit */}
				<div className="gap-m-400 grid grid-cols-2 sm:grid-cols-4">
					<div className="space-y-s-200">
						<Label id="label-eod">{t("eodTime")}</Label>
						<Input
							id="eod-time"
							type="time"
							value={hhmmToTimeString(targetConfig.eodTime)}
							onChange={(e) => handleEodChange(e.target.value)}
						/>
					</div>
				</div>
			</div>
		)
	}
)
TargetsExitSection.displayName = "TargetsExitSection"

export { TargetsExitSection }
