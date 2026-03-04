"use client"

import { useTranslations } from "next-intl"
import { Lock } from "lucide-react"
import { fromCents } from "@/lib/money"
import { cn } from "@/lib/utils"
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

const Field = ({ label, value, onChange, type = "number", suffix, disabled, locked }: FieldProps) => (
	<div className="flex flex-col gap-1">
		<label className="text-tiny text-txt-300 flex items-center gap-1">
			{label}
			{locked && <Lock className="text-txt-300 h-3 w-3 shrink-0" aria-hidden="true" />}
		</label>
		<div className="flex items-center gap-1">
			<input
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
}) => (
	<label className={cn("flex items-center gap-2", locked ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>
		<input
			type="checkbox"
			checked={checked}
			onChange={(event) => onChange(event.target.checked)}
			disabled={locked}
			className="accent-acc-100 h-4 w-4 rounded"
		/>
		<span className="text-small text-txt-200 flex items-center gap-1">
			{label}
			{locked && <Lock className="text-txt-300 h-3 w-3 shrink-0" aria-hidden="true" />}
		</span>
	</label>
)

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
	gainMode:
		tree.gainMode.type === "singleTarget"
			? { ...tree.gainMode, dailyTargetCents: Math.round(tree.gainMode.dailyTargetCents * scaleFactor) }
			: tree.gainMode.type === "compounding" && tree.gainMode.dailyTargetCents
				? { ...tree.gainMode, dailyTargetCents: Math.round(tree.gainMode.dailyTargetCents * scaleFactor) }
				: tree.gainMode,
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
			<div className="space-y-s-300">
				<h3 className="text-small text-txt-100 font-semibold">
					{t("advancedMode")}
				</h3>
				<p className="text-tiny text-txt-300">{t("advancedDescription")}</p>
				<div className="gap-s-300 grid grid-cols-2 sm:grid-cols-3">
					<Field
						label={t("accountBalance")}
						value={fromCents(params.accountBalanceCents).toFixed(2)}
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
					<Field
						label={t("dailyLoss")}
						value={fromCents(params.dailyLossCents).toFixed(2)}
						onChange={(val) =>
							onChange({
								...params,
								dailyLossCents: Math.round(parseFloat(val || "0") * 100),
							})
						}
						suffix="R$"
						locked={isLocked}
					/>
					<Field
						label={t("monthlyLoss")}
						value={fromCents(params.monthlyLossCents).toFixed(2)}
						onChange={(val) =>
							onChange({
								...params,
								monthlyLossCents: Math.round(parseFloat(val || "0") * 100),
							})
						}
						suffix="R$"
						locked={isLocked}
					/>
					<Field
						label={t("baseRisk")}
						value={fromCents(params.decisionTree.baseTrade.riskCents).toFixed(
							2
						)}
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
		<div className="space-y-s-300">
			<h3 className="text-small text-txt-100 font-semibold">
				{t("simpleMode")}
			</h3>
			<div className="gap-s-300 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
				<Field
					label={t("accountBalance")}
					value={fromCents(params.accountBalanceCents).toFixed(2)}
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
				<Field
					label={t("riskReductionFactor")}
					value={params.riskReductionFactor}
					onChange={(val) =>
						updateSimple({ riskReductionFactor: parseFloat(val || "0.5") })
					}
					locked={isLocked}
				/>
			)}
			{params.increaseRiskAfterWin && (
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
			)}
		</div>
	)
}

export { RiskParamsForm }
