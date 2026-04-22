"use client"

import { useMemo, useRef } from "react"
import { useTranslations } from "next-intl"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { AlertTriangle } from "lucide-react"
import {
	getSweepableParams,
	countCombinations,
	MAX_COMBINATIONS,
	WARN_COMBINATIONS,
} from "@/lib/optimize/parameter-grid"
import type {
	ParameterRange,
	NumericParameterRange,
	EnumParameterRange,
	SweepableParam,
	NumericSweepableParam,
	EnumSweepableParam,
} from "@/lib/optimize/parameter-grid"
import type { StrategyRecipe } from "@/types/backtest"

interface SweepConfigPanelProps {
	recipe: StrategyRecipe
	activeRanges: ParameterRange[]
	onRangesChange: (ranges: ParameterRange[]) => void
}

const SweepConfigPanel = ({ recipe, activeRanges, onRangesChange }: SweepConfigPanelProps) => {
	const t = useTranslations("optimize")

	// Derive active enum selections for union filtering of numeric params
	// Stable ref prevents new object identity when content hasn't changed
	const activeEnumValuesRef = useRef<Record<string, string[]> | undefined>(undefined)
	const activeEnumValues = useMemo(() => {
		const values: Record<string, string[]> = {}
		for (const range of activeRanges) {
			if (range.kind === "enum") {
				values[range.path] = range.selectedValues
			}
		}
		const next = Object.keys(values).length > 0 ? values : undefined
		if (JSON.stringify(next) === JSON.stringify(activeEnumValuesRef.current)) {
			return activeEnumValuesRef.current
		}
		activeEnumValuesRef.current = next
		return next
	}, [activeRanges])

	const availableParams = useMemo(
		() => getSweepableParams(recipe, activeEnumValues),
		[recipe, activeEnumValues]
	)

	const totalCombinations = useMemo(
		() => (activeRanges.length > 0 ? countCombinations(activeRanges, recipe) : 0),
		[activeRanges, recipe]
	)

	const isOverLimit = totalCombinations > MAX_COMBINATIONS
	const isWarning = totalCombinations > WARN_COMBINATIONS && !isOverLimit

	// ── Numeric param helpers ─────────────────────────────────────

	const getNumericLabel = (param: NumericSweepableParam): string => {
		const base = t(`sweepParam.${param.labelKey}`)
		const suffix = param.unitSuffix?.(recipe)
		return suffix ? `${base} (${suffix})` : base
	}

	const handleToggleNumeric = (param: NumericSweepableParam, checked: boolean) => {
		if (checked) {
			const defaults = param.dynamicDefaults?.(recipe)
			const newRange: NumericParameterRange = {
				kind: "numeric",
				path: param.path,
				label: getNumericLabel(param),
				min: defaults?.min ?? param.defaultMin,
				max: defaults?.max ?? param.defaultMax,
				step: defaults?.step ?? param.defaultStep,
			}
			onRangesChange([...activeRanges, newRange])
		} else {
			onRangesChange(activeRanges.filter((r) => r.path !== param.path))
		}
	}

	const handleUpdateNumeric = (path: string, field: "min" | "max" | "step", value: number) => {
		onRangesChange(
			activeRanges.map((r) =>
				r.kind === "numeric" && r.path === path ? { ...r, [field]: value } : r
			)
		)
	}

	const isNumericActive = (path: string): boolean =>
		activeRanges.some((r) => r.kind === "numeric" && r.path === path)

	const getNumericRange = (path: string): NumericParameterRange | undefined =>
		activeRanges.find((r): r is NumericParameterRange => r.kind === "numeric" && r.path === path)

	const getValueCount = (range: NumericParameterRange): number =>
		Math.max(0, Math.floor((range.max - range.min) / range.step) + 1)

	// ── Enum param helpers ────────────────────────────────────────

	const getEnumRange = (path: string): EnumParameterRange | undefined =>
		activeRanges.find((r): r is EnumParameterRange => r.kind === "enum" && r.path === path)

	const isEnumValueSelected = (path: string, value: string): boolean => {
		const range = getEnumRange(path)
		return range?.selectedValues.includes(value) ?? false
	}

	const handleToggleEnumValue = (param: EnumSweepableParam, value: string, checked: boolean) => {
		const existing = getEnumRange(param.path)

		if (checked) {
			if (existing) {
				// Add value to existing range
				onRangesChange(
					activeRanges.map((r) =>
						r.kind === "enum" && r.path === param.path
							? { ...r, selectedValues: [...(r as EnumParameterRange).selectedValues, value] }
							: r
					)
				)
			} else {
				// Create new enum range
				const option = param.options.find((o) => o.value === value)
				const newRange: EnumParameterRange = {
					kind: "enum",
					path: param.path,
					label: t(`sweepParam.${param.labelKey}`),
					selectedValues: [value],
					enumDef: param,
				}
				onRangesChange([...activeRanges, newRange])
				// If the option label is needed, we already store it in enumDef
				void option
			}
		} else {
			if (existing && existing.selectedValues.length <= 1) {
				// Remove entire enum range + any orphaned numeric children
				onRangesChange(activeRanges.filter((r) => !(r.kind === "enum" && r.path === param.path)))
			} else if (existing) {
				// Remove single value
				onRangesChange(
					activeRanges.map((r) =>
						r.kind === "enum" && r.path === param.path
							? { ...r, selectedValues: (r as EnumParameterRange).selectedValues.filter((v) => v !== value) }
							: r
					)
				)
			}
		}
	}

	// ── Render ────────────────────────────────────────────────────

	const enumParams = availableParams.filter((p): p is EnumSweepableParam => p.kind === "enum")
	const numericParams = availableParams.filter((p): p is NumericSweepableParam => p.kind === "numeric")

	return (
		<div className="border-bg-300 bg-bg-200 space-y-m-300 rounded-lg border p-m-400">
			<h3 className="text-h3 font-semibold text-txt-100">{t("sweepParameters")}</h3>
			<p className="text-tiny text-txt-300">{t("sweepParametersHint")}</p>

			{/* Enum parameter rows */}
			{enumParams.length > 0 && (
				<div className="space-y-s-300">
					{enumParams.map((param) => {
						const currentValue = param.getCurrentValue(recipe)
						const selectedCount = getEnumRange(param.path)?.selectedValues.length ?? 0

						return (
							<div
								key={param.path}
								className={`space-y-s-200 rounded-md border p-s-300 transition-colors ${
									selectedCount >= 2
										? "border-acc-100/30 bg-acc-100/5"
										: "border-bg-300 bg-bg-100/30"
								}`}
							>
								{/* Label row */}
								<div className="flex items-center justify-between">
									<span className="text-small font-medium text-txt-100">
										{t(`sweepParam.${param.labelKey}`)}
									</span>
									{selectedCount >= 2 && (
										<span className="text-tiny text-txt-300 tabular-nums">
											{selectedCount} {t("sweepValues")}
										</span>
									)}
								</div>

								{/* Option chips */}
								<div className="flex flex-wrap gap-s-200">
									{param.options.map((option) => {
										const isSelected = isEnumValueSelected(param.path, option.value)
										const isCurrent = option.value === currentValue

										return (
											<label
												key={option.value}
												className={`flex cursor-pointer items-center gap-s-100 rounded-md border px-s-300 py-s-100 transition-colors ${
													isSelected
														? "border-acc-100/50 bg-acc-100/10 text-txt-100"
														: "border-bg-300 text-txt-300 hover:border-bg-400 hover:text-txt-200"
												}`}
											>
												<Checkbox
													id={`enum-${param.path}-${option.value}`}
													checked={isSelected}
													onCheckedChange={(checked) =>
														handleToggleEnumValue(param, option.value, checked === true)
													}
													className="h-3.5 w-3.5"
												/>
												<span className="text-small">
													{t(`sweepParam.${option.labelKey}`)}
													{isCurrent && !isSelected && (
														<span className="text-tiny text-txt-300 ml-s-100">(atual)</span>
													)}
												</span>
											</label>
										)
									})}
								</div>
							</div>
						)
					})}
				</div>
			)}

			{/* Numeric parameter rows */}
			{numericParams.length > 0 && (
				<div className="space-y-s-300">
					{numericParams.map((param) => {
						const active = isNumericActive(param.path)
						const range = getNumericRange(param.path)

						return (
							<div
								key={param.path}
								className={`space-y-s-200 rounded-md border p-s-300 transition-colors ${
									active ? "border-acc-100/30 bg-acc-100/5" : "border-bg-300 bg-bg-100/30"
								}`}
							>
								{/* Checkbox + label row */}
								<div className="flex items-center gap-s-200">
									<Checkbox
										id={`sweep-${param.path}`}
										checked={active}
										onCheckedChange={(checked) => handleToggleNumeric(param, checked === true)}
									/>
									<label
										htmlFor={`sweep-${param.path}`}
										className={`text-small cursor-pointer select-none ${
											active ? "text-txt-100 font-medium" : "text-txt-300"
										}`}
									>
										{getNumericLabel(param)}
									</label>
									{active && range && (
										<span className="text-tiny text-txt-300 ml-auto tabular-nums">
											{getValueCount(range)} {t("sweepValues")}
										</span>
									)}
								</div>

								{/* Min / Max / Step inputs (only when active) */}
								{active && range && (
									<div className="grid grid-cols-3 gap-s-200 pl-m-300">
										<div className="space-y-s-100">
											<span className="text-tiny text-txt-300">{t("sweepMin")}</span>
											<Input
												id={`sweep-min-${param.path}`}
												type="number"
												value={range.min}
												onChange={(e) => handleUpdateNumeric(param.path, "min", parseFloat(e.target.value) || 0)}
												className="h-8 text-small tabular-nums"
												step={range.step}
											/>
										</div>
										<div className="space-y-s-100">
											<span className="text-tiny text-txt-300">{t("sweepMax")}</span>
											<Input
												id={`sweep-max-${param.path}`}
												type="number"
												value={range.max}
												onChange={(e) => handleUpdateNumeric(param.path, "max", parseFloat(e.target.value) || 0)}
												className="h-8 text-small tabular-nums"
												step={range.step}
											/>
										</div>
										<div className="space-y-s-100">
											<span className="text-tiny text-txt-300">{t("sweepStep")}</span>
											<Input
												id={`sweep-step-${param.path}`}
												type="number"
												value={range.step}
												onChange={(e) => handleUpdateNumeric(param.path, "step", parseFloat(e.target.value) || 1)}
												className="h-8 text-small tabular-nums"
												min={0.01}
											/>
										</div>
									</div>
								)}
							</div>
						)
					})}
				</div>
			)}

			{/* Combination counter */}
			{activeRanges.length > 0 && (
				<div
					className={`flex items-center justify-between rounded-md border p-s-300 ${
						isOverLimit
							? "border-fb-error/30 bg-fb-error/5"
							: isWarning
								? "border-acc-100/30 bg-acc-100/5"
								: "border-bg-300 bg-bg-100/30"
					}`}
				>
					<div className="flex items-center gap-s-200">
						{(isOverLimit || isWarning) && (
							<AlertTriangle
								className={`h-4 w-4 shrink-0 ${isOverLimit ? "text-fb-error" : "text-acc-100"}`}
								aria-label={isOverLimit ? t("sweepOverLimit") : t("sweepWarning")}
							/>
						)}
						<span className="text-small tabular-nums text-txt-100">
							{totalCombinations.toLocaleString()} {t("sweepCombinations")}
						</span>
					</div>
					{isOverLimit && (
						<span className="text-tiny text-fb-error">
							{t("sweepOverLimit", { max: MAX_COMBINATIONS.toLocaleString() })}
						</span>
					)}
					{isWarning && (
						<span className="text-tiny text-acc-100">{t("sweepWarning")}</span>
					)}
				</div>
			)}
		</div>
	)
}

export { SweepConfigPanel }
