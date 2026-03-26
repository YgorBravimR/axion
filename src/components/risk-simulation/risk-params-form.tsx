"use client"

import { useState, useEffect, useId, type ChangeEvent } from "react"
import { useTranslations } from "next-intl"
import { Lock } from "lucide-react"
import { fromCents } from "@/lib/money"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import type {
	AdvancedSimulationParams,
	RiskSimulationParams,
} from "@/types/risk-simulation"
import type { DecisionTreeConfig } from "@/types/risk-profile"

interface RiskParamsFormProps {
	params: RiskSimulationParams
	onChange: (params: RiskSimulationParams) => void
	isLocked: boolean
	originalAdvancedParams: AdvancedSimulationParams | null
}

interface FieldProps {
	label: string
	value: string | number
	onChange: (value: string) => void
	type?: "number" | "text"
	suffix?: string
	disabled?: boolean
	locked?: boolean
}

const Field = ({ label, value, onChange, type = "number", suffix, disabled, locked }: FieldProps) => {
	const generatedId = useId()
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={generatedId} className="text-tiny text-txt-300 flex items-center gap-1">
				{label}
				{locked && <Lock className="text-txt-300 h-3 w-3 shrink-0" aria-hidden="true" />}
			</label>
			<div className="flex items-center gap-1">
				<Input
					id={generatedId}
					type={type}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					disabled={disabled || locked}
					className={cn(
						"border-bg-300 text-txt-100 text-small w-full rounded-md border px-3 py-1.5",
						disabled || locked ? "bg-bg-300/50 text-txt-300 cursor-not-allowed opacity-70" : "bg-bg-100"
					)}
				/>
				{suffix && <span className="text-tiny text-txt-300 shrink-0">{suffix}</span>}
			</div>
		</div>
	)
}

/**
 * Currency field that maintains a local string state while the user is typing,
 * preventing cursor jumps caused by reformatting (e.g. .toFixed(2)) on every keystroke.
 * The parent's onChange is called on every keystroke for live updates, but the displayed
 * value is the user's raw input. On blur, the display is formatted to 2 decimal places.
 */
interface CurrencyFieldProps {
	label: string
	valueCents: number
	onChange: (rawValue: string) => void
	suffix?: string
	disabled?: boolean
	locked?: boolean
}

const CurrencyField = ({ label, valueCents, onChange, suffix, disabled, locked }: CurrencyFieldProps) => {
	const generatedId = useId()
	const [localValue, setLocalValue] = useState(() => fromCents(valueCents).toFixed(2))
	const [isFocused, setIsFocused] = useState(false)

	// Sync from parent when not focused (e.g. prefill selection, balance scaling)
	useEffect(() => {
		if (!isFocused) {
			setLocalValue(fromCents(valueCents).toFixed(2))
		}
	}, [valueCents, isFocused])

	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		const raw = event.target.value
		setLocalValue(raw)
		onChange(raw)
	}

	const handleFocus = () => {
		setIsFocused(true)
	}

	const handleBlur = () => {
		setIsFocused(false)
		// Format to 2 decimal places on blur
		const parsed = parseFloat(localValue || "0")
		const formatted = isNaN(parsed) ? "0.00" : parsed.toFixed(2)
		setLocalValue(formatted)
	}

	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={generatedId} className="text-tiny text-txt-300 flex items-center gap-1">
				{label}
				{locked && <Lock className="text-txt-300 h-3 w-3 shrink-0" aria-hidden="true" />}
			</label>
			<div className="flex items-center gap-1">
				<Input
					id={generatedId}
					type="number"
					value={localValue}
					onChange={handleChange}
					onFocus={handleFocus}
					onBlur={handleBlur}
					disabled={disabled || locked}
					step="0.01"
					className={cn(
						"border-bg-300 text-txt-100 text-small w-full rounded-md border px-3 py-1.5",
						disabled || locked ? "bg-bg-300/50 text-txt-300 cursor-not-allowed opacity-70" : "bg-bg-100"
					)}
				/>
				{suffix && <span className="text-tiny text-txt-300 shrink-0">{suffix}</span>}
			</div>
		</div>
	)
}

const CheckboxField = ({
	label,
	checked,
	onChange,
	locked,
}: {
	label: string
	checked: boolean
	onChange: (checked: boolean) => void
	locked?: boolean
}) => {
	const generatedId = useId()
	return (
		<div className={cn("flex items-center gap-2", locked ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>
			<Checkbox
				id={generatedId}
				checked={checked}
				onCheckedChange={(value) => onChange(value === true)}
				disabled={locked}
			/>
			<label htmlFor={generatedId} className="text-small text-txt-200 flex items-center gap-1">
				{label}
				{locked && <Lock className="text-txt-300 h-3 w-3 shrink-0" aria-hidden="true" />}
			</label>
		</div>
	)
}

/**
 * Scales all cents-based values in a DecisionTreeConfig proportionally.
 * percentOfBase and sameAsPrevious steps scale automatically via baseTrade.riskCents.
 */
const scaleDecisionTree = (tree: DecisionTreeConfig, scaleFactor: number): DecisionTreeConfig => ({
	...tree,
	baseTrade: {
		...tree.baseTrade,
		riskCents: Math.round(tree.baseTrade.riskCents * scaleFactor),
	},
	lossRecovery: {
		...tree.lossRecovery,
		sequence: tree.lossRecovery.sequence.map((step) => ({
			...step,
			riskCalculation:
				step.riskCalculation.type === "fixedCents"
					? { ...step.riskCalculation, amountCents: Math.round(step.riskCalculation.amountCents * scaleFactor) }
					: step.riskCalculation,
		})),
	},
	gainMode: (() => {
		const gm = tree.gainMode
		if (gm.type === "singleTarget") {
			return { ...gm, dailyTargetCents: Math.round(gm.dailyTargetCents * scaleFactor) }
		}
		if (gm.type === "compounding") {
			return gm.dailyTargetCents
				? { ...gm, dailyTargetCents: Math.round(gm.dailyTargetCents * scaleFactor) }
				: gm
		}
		if (gm.type === "gainSequence") {
			return {
				...gm,
				sequence: gm.sequence.map((step) => ({
					...step,
					riskCalculation:
						step.riskCalculation.type === "fixedCents"
							? { ...step.riskCalculation, amountCents: Math.round(step.riskCalculation.amountCents * scaleFactor) }
							: step.riskCalculation,
				})),
				dailyTargetCents: gm.dailyTargetCents
					? Math.round(gm.dailyTargetCents * scaleFactor)
					: null,
			}
		}
		return gm
	})(),
	cascadingLimits: {
		...tree.cascadingLimits,
		weeklyLossCents: tree.cascadingLimits.weeklyLossCents
			? Math.round(tree.cascadingLimits.weeklyLossCents * scaleFactor)
			: null,
		monthlyLossCents: Math.round(tree.cascadingLimits.monthlyLossCents * scaleFactor),
	},
})

const RiskParamsForm = ({ params, onChange, isLocked, originalAdvancedParams }: RiskParamsFormProps) => {
	const t = useTranslations("riskSimulation.params")

	/** Handle balance change for advanced mode — scales all cents proportionally from original snapshot */
	const handleAdvancedBalanceChange = (rawValue: string) => {
		if (params.mode !== "advanced" || !originalAdvancedParams) return

		const newBalanceCents = Math.round(parseFloat(rawValue || "0") * 100)
		if (originalAdvancedParams.accountBalanceCents === 0) return

		const scale = newBalanceCents / originalAdvancedParams.accountBalanceCents

		onChange({
			...params,
			accountBalanceCents: newBalanceCents,
			dailyLossCents: Math.round(originalAdvancedParams.dailyLossCents * scale),
			dailyProfitTargetCents: originalAdvancedParams.dailyProfitTargetCents
				? Math.round(originalAdvancedParams.dailyProfitTargetCents * scale)
				: null,
			weeklyLossCents: originalAdvancedParams.weeklyLossCents
				? Math.round(originalAdvancedParams.weeklyLossCents * scale)
				: null,
			monthlyLossCents: Math.round(originalAdvancedParams.monthlyLossCents * scale),
			decisionTree: scaleDecisionTree(originalAdvancedParams.decisionTree, scale),
		})
	}

	if (params.mode === "advanced") {
		return (
			<div id="sim-risk-params" className="space-y-s-300">
				<h3 className="text-small text-txt-100 font-semibold">
					{t("advancedMode")}
				</h3>
				<p className="text-tiny text-txt-300">{t("advancedDescription")}</p>
				<div className="gap-s-300 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
					<CurrencyField
						label={t("accountBalance")}
						valueCents={params.accountBalanceCents}
						onChange={
							isLocked
								? handleAdvancedBalanceChange
								: (val) =>
										onChange({
											...params,
											accountBalanceCents: Math.round(
												parseFloat(val || "0") * 100
											),
										})
						}
						suffix="R$"
					/>
					<CurrencyField
						label={t("dailyLoss")}
						valueCents={params.dailyLossCents}
						onChange={(val) =>
							onChange({
								...params,
								dailyLossCents: Math.round(parseFloat(val || "0") * 100),
							})
						}
						suffix="R$"
						locked={isLocked}
					/>
					<CurrencyField
						label={t("monthlyLoss")}
						valueCents={params.monthlyLossCents}
						onChange={(val) =>
							onChange({
								...params,
								monthlyLossCents: Math.round(parseFloat(val || "0") * 100),
							})
						}
						suffix="R$"
						locked={isLocked}
					/>
					<CurrencyField
						label={t("baseRisk")}
						valueCents={params.decisionTree.baseTrade.riskCents}
						onChange={() => {}}
						disabled
						suffix="R$"
						locked={isLocked}
					/>
				</div>
			</div>
		)
	}

	// Simple mode
	const updateSimple = (partial: Partial<typeof params>) => {
		onChange({ ...params, ...partial })
	}

	return (
		<div id="sim-risk-params" className="space-y-s-300">
			<h3 className="text-small text-txt-100 font-semibold">
				{t("simpleMode")}
			</h3>
			<div className="gap-s-300 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
				<CurrencyField
					label={t("accountBalance")}
					valueCents={params.accountBalanceCents}
					onChange={(val) =>
						updateSimple({
							accountBalanceCents: Math.round(parseFloat(val || "0") * 100),
						})
					}
					suffix="R$"
				/>
				<Field
					label={t("riskPerTrade")}
					value={params.riskPerTradePercent}
					onChange={(val) =>
						updateSimple({ riskPerTradePercent: parseFloat(val || "0") })
					}
					suffix="%"
					locked={isLocked}
				/>
				<Field
					label={t("dailyLossPercent")}
					value={params.dailyLossPercent}
					onChange={(val) =>
						updateSimple({ dailyLossPercent: parseFloat(val || "0") })
					}
					suffix="%"
					locked={isLocked}
				/>
				<Field
					label={t("dailyProfitTarget")}
					value={params.dailyProfitTargetPercent ?? ""}
					onChange={(val) =>
						updateSimple({
							dailyProfitTargetPercent: val ? parseFloat(val) : null,
						})
					}
					suffix="%"
					locked={isLocked}
				/>
				<Field
					label={t("monthlyLossPercent")}
					value={params.monthlyLossPercent ?? ""}
					onChange={(val) =>
						updateSimple({
							monthlyLossPercent: val ? parseFloat(val) : null,
						})
					}
					suffix="%"
					locked={isLocked}
				/>
				<Field
					label={t("weeklyLossPercent")}
					value={params.weeklyLossPercent ?? ""}
					onChange={(val) =>
						updateSimple({
							weeklyLossPercent: val ? parseFloat(val) : null,
						})
					}
					suffix="%"
					locked={isLocked}
				/>
				<Field
					label={t("maxDailyTrades")}
					value={params.maxDailyTrades ?? ""}
					onChange={(val) =>
						updateSimple({
							maxDailyTrades: val ? parseInt(val, 10) : null,
						})
					}
					locked={isLocked}
				/>
				<Field
					label={t("maxConsecutiveLosses")}
					value={params.maxConsecutiveLosses ?? ""}
					onChange={(val) =>
						updateSimple({
							maxConsecutiveLosses: val ? parseInt(val, 10) : null,
						})
					}
					locked={isLocked}
				/>
			</div>
			<div className="flex flex-wrap gap-4">
				<CheckboxField
					label={t("reduceRiskAfterLoss")}
					checked={params.reduceRiskAfterLoss}
					onChange={(checked) => updateSimple({ reduceRiskAfterLoss: checked })}
					locked={isLocked}
				/>
				<CheckboxField
					label={t("increaseRiskAfterWin")}
					checked={params.increaseRiskAfterWin}
					onChange={(checked) =>
						updateSimple({ increaseRiskAfterWin: checked })
					}
					locked={isLocked}
				/>
			</div>
			{params.reduceRiskAfterLoss && (
				<div id="sim-reduction-factor">
					<Field
						label={t("riskReductionFactor")}
						value={params.riskReductionFactor}
						onChange={(val) =>
							updateSimple({ riskReductionFactor: parseFloat(val || "50") })
						}
						suffix="%"
						locked={isLocked}
					/>
				</div>
			)}
			{params.increaseRiskAfterWin && (
				<div id="sim-reinvestment-percent">
					<Field
						label={t("profitReinvestmentPercent")}
						value={params.profitReinvestmentPercent ?? ""}
						onChange={(val) =>
							updateSimple({
								profitReinvestmentPercent: val ? parseFloat(val) : null,
							})
						}
						suffix="%"
						locked={isLocked}
					/>
				</div>
			)}
		</div>
	)
}

export { RiskParamsForm }
