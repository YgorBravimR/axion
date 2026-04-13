"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PluginPicker, TogglePlugin } from "./plugin-picker"
import type { StrategyRecipe, InitialStopConfig, BreakevenConfig, ReversalConfig } from "@/types/backtest"

interface StopProtectionSectionProps {
	recipe: StrategyRecipe
	onRecipeChange: (recipe: StrategyRecipe) => void
}

const StopProtectionSection = ({ recipe, onRecipeChange }: StopProtectionSectionProps) => {
	const t = useTranslations("backtest.builder")

	const stopConfig = recipe.stop
	const initialType = stopConfig.initial.type

	// ── Initial Stop ────────────────────────────────────────

	const initialStopOptions = [
		{ value: "pct_range", label: t("stopPctRange"), description: t("stopPctRangeDesc") },
		{ value: "fixed_points", label: t("stopFixedPoints"), description: t("stopFixedPointsDesc") },
		{ value: "full_range", label: t("stopFullRange"), description: t("stopFullRangeDesc") },
	]

	const handleInitialStopChange = (type: string) => {
		let initial: InitialStopConfig
		switch (type) {
			case "pct_range":
				initial = { type: "pct_range", pct: 30 }
				break
			case "fixed_points":
				initial = { type: "fixed_points", points: 200 }
				break
			case "full_range":
				initial = { type: "full_range", ticksBuffer: 2 }
				break
			default:
				return
		}
		onRecipeChange({ ...recipe, stop: { ...stopConfig, initial } })
	}

	const handleInitialStopValue = (value: number) => {
		if (initialType === "pct_range") {
			onRecipeChange({ ...recipe, stop: { ...stopConfig, initial: { type: "pct_range", pct: value } } })
		} else if (initialType === "fixed_points") {
			onRecipeChange({ ...recipe, stop: { ...stopConfig, initial: { type: "fixed_points", points: value } } })
		} else if (initialType === "full_range") {
			onRecipeChange({ ...recipe, stop: { ...stopConfig, initial: { type: "full_range", ticksBuffer: value } } })
		}
	}

	// ── Breakeven ───────────────────────────────────────────

	const hasBreakeven = !!stopConfig.breakeven
	const breakevenType = stopConfig.breakeven?.type ?? "on_partial"

	const handleBreakevenToggle = (enabled: boolean) => {
		if (!enabled) {
			onRecipeChange({ ...recipe, stop: { ...stopConfig, breakeven: undefined } })
			return
		}
		const be: BreakevenConfig = { type: "on_partial" }
		onRecipeChange({ ...recipe, stop: { ...stopConfig, breakeven: be } })
	}

	const breakevenOptions = [
		{ value: "on_partial", label: t("beOnPartial"), description: t("beOnPartialDesc") },
		{ value: "on_pct_risk", label: t("beOnPctRisk"), description: t("beOnPctRiskDesc") },
	]

	const handleBreakevenTypeChange = (type: string) => {
		if (type === "on_partial") {
			onRecipeChange({ ...recipe, stop: { ...stopConfig, breakeven: { type: "on_partial" } } })
		} else if (type === "on_pct_risk") {
			onRecipeChange({ ...recipe, stop: { ...stopConfig, breakeven: { type: "on_pct_risk", triggerPct: 50 } } })
		}
	}

	// ── Trailing ────────────────────────────────────────────

	const hasTrailing = !!stopConfig.trailing

	const handleTrailingToggle = (enabled: boolean) => {
		if (!enabled) {
			onRecipeChange({ ...recipe, stop: { ...stopConfig, trailing: undefined } })
			return
		}
		onRecipeChange({ ...recipe, stop: { ...stopConfig, trailing: { type: "price_distance", distance: 100 } } })
	}

	// ── Reversal ────────────────────────────────────────────

	const hasReversal = recipe.reversal.type === "reverse_on_stop"

	const handleReversalToggle = (enabled: boolean) => {
		const reversal: ReversalConfig = enabled
			? { type: "reverse_on_stop", maxReversals: 1, virarNoBE: false }
			: { type: "none" }
		onRecipeChange({ ...recipe, reversal })
	}

	return (
		<div className="border-bg-300 bg-bg-200 space-y-m-500 rounded-lg border p-m-400">
			<h2 className="text-heading-3 font-semibold text-txt-100">{t("stopProtection")}</h2>

			{/* Initial Stop — pick one */}
			<div className="space-y-s-300">
				<p className="text-small font-medium text-txt-200">{t("initialStop")}</p>
				<PluginPicker
					options={initialStopOptions}
					selected={initialType}
					onSelect={handleInitialStopChange}
				/>

				{/* Config inputs for selected stop type */}
				<div className="gap-m-400 grid grid-cols-2 sm:grid-cols-3 pt-s-200">
					{initialType === "pct_range" && (
						<div className="space-y-s-200">
							<Label id="label-stop-pct">{t("stopPctLabel")}</Label>
							<Input
								id="stop-pct"
								type="number"
								value={stopConfig.initial.type === "pct_range" ? stopConfig.initial.pct : 30}
								onChange={(e) => handleInitialStopValue(parseInt(e.target.value) || 30)}
							/>
						</div>
					)}
					{initialType === "fixed_points" && (
						<div className="space-y-s-200">
							<Label id="label-stop-points">{t("stopPointsLabel")}</Label>
							<Input
								id="stop-points"
								type="number"
								value={stopConfig.initial.type === "fixed_points" ? stopConfig.initial.points : 200}
								onChange={(e) => handleInitialStopValue(parseInt(e.target.value) || 200)}
							/>
						</div>
					)}
					{initialType === "full_range" && (
						<div className="space-y-s-200">
							<Label id="label-stop-buffer">{t("stopBufferLabel")}</Label>
							<Input
								id="stop-buffer"
								type="number"
								value={stopConfig.initial.type === "full_range" ? stopConfig.initial.ticksBuffer : 2}
								onChange={(e) => handleInitialStopValue(parseInt(e.target.value) || 2)}
							/>
						</div>
					)}
				</div>
			</div>

			{/* Additive plugins */}
			<div className="space-y-s-300">
				<p className="text-small font-medium text-txt-200">{t("addOns")}</p>
				<div className="gap-s-300 grid grid-cols-1 sm:grid-cols-3">
					{/* Breakeven */}
					<TogglePlugin
						label={t("breakeven")}
						description={t("breakevenDesc")}
						enabled={hasBreakeven}
						onToggle={handleBreakevenToggle}
					>
						<div className="space-y-s-300">
							<PluginPicker
								options={breakevenOptions}
								selected={breakevenType}
								onSelect={handleBreakevenTypeChange}
							/>
							{breakevenType === "on_pct_risk" && hasBreakeven && (
								<div className="space-y-s-200">
									<Label id="label-be-pct">{t("beTriggerPct")}</Label>
									<Input
										id="be-pct"
										type="number"
										value={stopConfig.breakeven?.type === "on_pct_risk" ? stopConfig.breakeven.triggerPct : 50}
										onChange={(e) => {
											const pct = parseInt(e.target.value) || 50
											onRecipeChange({
												...recipe,
												stop: { ...stopConfig, breakeven: { type: "on_pct_risk", triggerPct: pct } },
											})
										}}
									/>
								</div>
							)}
						</div>
					</TogglePlugin>

					{/* Trailing */}
					<TogglePlugin
						label={t("trailing")}
						description={t("trailingDesc")}
						enabled={hasTrailing}
						onToggle={handleTrailingToggle}
					>
						<div className="space-y-s-200">
							<Label id="label-trail-dist">{t("trailDistance")}</Label>
							<Input
								id="trail-dist"
								type="number"
								value={stopConfig.trailing?.type === "price_distance" ? stopConfig.trailing.distance : 100}
								onChange={(e) => {
									const distance = parseInt(e.target.value) || 100
									onRecipeChange({
										...recipe,
										stop: { ...stopConfig, trailing: { type: "price_distance", distance } },
									})
								}}
							/>
						</div>
					</TogglePlugin>

					{/* Reversal */}
					<TogglePlugin
						label={t("reversal")}
						description={t("reversalDesc")}
						enabled={hasReversal}
						onToggle={handleReversalToggle}
					>
						<div className="gap-s-300 grid grid-cols-2">
							<div className="space-y-s-200">
								<Label id="label-max-reversals">{t("maxReversals")}</Label>
								<Input
									id="max-reversals"
									type="number"
									value={recipe.reversal.type === "reverse_on_stop" ? recipe.reversal.maxReversals : 1}
									onChange={(e) => {
										const max = parseInt(e.target.value) || 1
										onRecipeChange({
											...recipe,
											reversal: { type: "reverse_on_stop", maxReversals: max, virarNoBE: recipe.reversal.type === "reverse_on_stop" ? recipe.reversal.virarNoBE : false },
										})
									}}
								/>
							</div>
						</div>
					</TogglePlugin>
				</div>
			</div>
		</div>
	)
}

export { StopProtectionSection }
