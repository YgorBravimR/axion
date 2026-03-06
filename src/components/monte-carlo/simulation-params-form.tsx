"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SimulationParams } from "@/types/monte-carlo"
import { SIMULATION_BUDGET_CAP } from "@/lib/validations/monte-carlo"
import { cn } from "@/lib/utils"

interface SimulationParamsFormProps {
	params: SimulationParams
	onChange: (params: SimulationParams) => void
	disabled?: boolean
}

export const SimulationParamsForm = ({
	params,
	onChange,
	disabled = false,
}: SimulationParamsFormProps) => {
	const t = useTranslations("monteCarlo.params")

	const handleChange = (
		field: keyof SimulationParams,
		value: string | number
	) => {
		onChange({
			...params,
			[field]: value,
		})
	}

	const totalIterations = params.numberOfTrades * params.simulationCount
	const budgetUsage = totalIterations / SIMULATION_BUDGET_CAP
	const isOverBudget = totalIterations > SIMULATION_BUDGET_CAP

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
			<h3 className="mb-m-400 text-small sm:text-body text-txt-100 font-semibold">
				{t("title")}
			</h3>

			<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
				{/* Win Rate */}
				<div>
					<Label
						id="label-simulation-win-rate"
						className="mb-s-200 text-small text-txt-200 block"
					>
						{t("winRate")}
					</Label>
					<div className="relative">
						<Input
							id="simulation-win-rate"
							type="number"
							step="1"
							min={1}
							max={99}
							value={params.winRate}
							onChange={(e) =>
								handleChange("winRate", parseFloat(e.target.value) || 0)
							}
							className="pr-7"
							disabled={disabled}
						/>
						<span className="text-tiny text-txt-300 absolute top-1/2 right-3 -translate-y-1/2">
							%
						</span>
					</div>
				</div>

				{/* Reward/Risk Ratio */}
				<div>
					<Label
						id="label-simulation-reward-risk-ratio"
						className="mb-s-200 text-small text-txt-200 block"
					>
						{t("rewardRiskRatio")}
					</Label>
					<Input
						id="simulation-reward-risk-ratio"
						type="number"
						step="0.1"
						min={0.1}
						max={20}
						value={params.rewardRiskRatio}
						onChange={(e) =>
							handleChange("rewardRiskRatio", parseFloat(e.target.value) || 0)
						}
						disabled={disabled}
					/>
				</div>

				{/* Number of Trades */}
				<div>
					<Label
						id="label-simulation-number-of-trades"
						className="mb-s-200 text-small text-txt-200 block"
					>
						{t("numberOfTrades")}
					</Label>
					<Input
						id="simulation-number-of-trades"
						type="number"
						step="10"
						min={10}
						max={10000}
						value={params.numberOfTrades}
						onChange={(e) =>
							handleChange("numberOfTrades", parseInt(e.target.value) || 0)
						}
						disabled={disabled}
					/>
				</div>

				{/* Commission Impact (% of R) */}
				<div>
					<Label
						id="label-simulation-commission-impact"
						className="mb-s-200 text-small text-txt-200 block"
					>
						{t("commissionImpactR")}
					</Label>
					<div className="relative">
						<Input
							id="simulation-commission-impact"
							type="number"
							step="0.1"
							min={0}
							max={50}
							value={params.commissionImpactR}
							onChange={(e) =>
								handleChange(
									"commissionImpactR",
									parseFloat(e.target.value) || 0
								)
							}
							className="pr-7"
							disabled={disabled}
						/>
						<span className="text-tiny text-txt-300 absolute top-1/2 right-3 -translate-y-1/2">
							%
						</span>
					</div>
				</div>

				{/* Simulation Count */}
				<div>
					<Label
						id="label-simulation-count"
						className="mb-s-200 text-small text-txt-200 block"
					>
						{t("simulationCount")}
					</Label>
					<Input
						id="simulation-count"
						type="number"
						step="1000"
						min={100}
						max={50000}
						value={params.simulationCount}
						onChange={(e) =>
							handleChange("simulationCount", parseInt(e.target.value) || 0)
						}
						disabled={disabled}
					/>
				</div>
			</div>

			{/* Budget Indicator */}
			<div className="mt-m-400 text-small flex items-center justify-between">
				<span className="text-txt-300">
					{t("totalIterations")}: {totalIterations.toLocaleString()} /{" "}
					{SIMULATION_BUDGET_CAP.toLocaleString()}
				</span>
				<span
					className={cn(
						"",
						isOverBudget
							? "text-fb-error font-semibold"
							: budgetUsage > 0.8
								? "text-fb-warning"
								: "text-txt-300"
					)}
				>
					{(budgetUsage * 100).toFixed(0)}%
				</span>
			</div>
			{isOverBudget && (
				<p className="mt-s-200 text-caption text-fb-error">
					{t("budgetExceeded", {
						maxTrades: Math.floor(
							SIMULATION_BUDGET_CAP / params.simulationCount
						).toLocaleString(),
						maxSimulations: Math.floor(
							SIMULATION_BUDGET_CAP / params.numberOfTrades
						).toLocaleString(),
					})}
				</p>
			)}
		</div>
	)
}
