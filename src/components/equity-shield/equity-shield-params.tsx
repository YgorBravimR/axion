"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Play, Info } from "lucide-react"
import type { EquityShieldParams } from "@/types/equity-shield"
import { toCents } from "@/lib/money"

interface EquityShieldParamsProps {
	params: EquityShieldParams
	onParamsChange: (params: EquityShieldParams) => void
	onRun: () => void
	isLoading: boolean
	tradeCount: number | null
}

const EquityShieldParamsForm = ({
	params,
	onParamsChange,
	onRun,
	isLoading,
	tradeCount,
}: EquityShieldParamsProps) => {
	const t = useTranslations("equityShield.params")

	const handleFieldChange = (field: keyof EquityShieldParams, rawValue: string) => {
		const value = parseFloat(rawValue)
		if (Number.isNaN(value)) return

		if (field === "initialBalanceCents" || field === "drawdownLimitCents") {
			onParamsChange({ ...params, [field]: toCents(value) })
		} else {
			onParamsChange({ ...params, [field]: value })
		}
	}

	return (
		<div className="border-bg-300 bg-bg-200 space-y-m-400 rounded-lg border p-s-300 sm:p-m-400">
			<div className="flex items-center justify-between">
				<h2 className="text-body sm:text-h3 text-txt-100 font-semibold">
					{t("title")}
				</h2>
				{tradeCount !== null && (
					<span className="text-tiny text-txt-300">
						{t("tradeCount", { count: tradeCount })}
					</span>
				)}
			</div>

			{/* Tip about sample size */}
			<div className="bg-bg-100 border-bg-300 flex items-start gap-s-200 rounded-md border p-s-300">
				<Info className="text-acc-200 mt-0.5 h-4 w-4 shrink-0" />
				<p className="text-tiny text-txt-300">
					{t("sampleSizeTip")}
				</p>
			</div>

			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
				{/* Account Balance */}
				<div className="space-y-s-200">
					<Label id="label-initial-balance" htmlFor="initial-balance" className="text-tiny text-txt-300">
						{t("initialBalance")}
					</Label>
					<Input
						id="initial-balance"
						type="number"
						min={0}
						step={100}
						value={params.initialBalanceCents / 100}
						onChange={(e) =>
							handleFieldChange("initialBalanceCents", e.target.value)
						}
						aria-label={t("initialBalance")}
					/>
				</div>

				{/* DD Limit */}
				<div className="space-y-s-200">
					<Label id="label-dd-limit" htmlFor="dd-limit" className="text-tiny text-txt-300">
						{t("drawdownLimit")}
					</Label>
					<Input
						id="dd-limit"
						type="number"
						min={0}
						step={100}
						value={params.drawdownLimitCents / 100}
						onChange={(e) =>
							handleFieldChange("drawdownLimitCents", e.target.value)
						}
						aria-label={t("drawdownLimit")}
					/>
				</div>

				{/* MDD Multiplier */}
				<div className="space-y-s-200">
					<Label id="label-mdd-multiplier" htmlFor="mdd-multiplier" className="text-tiny text-txt-300">
						{t("mddMultiplier")}
					</Label>
					<Input
						id="mdd-multiplier"
						type="number"
						min={1}
						max={3}
						step={0.1}
						value={params.mddMultiplier}
						onChange={(e) =>
							handleFieldChange("mddMultiplier", e.target.value)
						}
						aria-label={t("mddMultiplier")}
					/>
				</div>

				{/* Recovery % */}
				<div className="space-y-s-200">
					<Label id="label-recovery-percent" htmlFor="recovery-percent" className="text-tiny text-txt-300">
						{t("recoveryPercent")}
					</Label>
					<Input
						id="recovery-percent"
						type="number"
						min={5}
						max={100}
						step={5}
						value={params.recoveryPercent * 100}
						onChange={(e) =>
							handleFieldChange(
								"recoveryPercent",
								String(parseFloat(e.target.value) / 100)
							)
						}
						aria-label={t("recoveryPercent")}
					/>
				</div>

				{/* SMA Period */}
				<div className="space-y-s-200">
					<Label id="label-sma-period" htmlFor="sma-period" className="text-tiny text-txt-300">
						{t("smaPeriod")}
					</Label>
					<Input
						id="sma-period"
						type="number"
						min={3}
						max={50}
						step={1}
						value={params.smaPeriod}
						onChange={(e) => handleFieldChange("smaPeriod", e.target.value)}
						aria-label={t("smaPeriod")}
					/>
				</div>
			</div>

			{/* Cut at DD Limit toggle */}
			<div className="flex items-center gap-s-300">
				<Switch
					id="cut-at-dd-limit"
					checked={params.cutAtDdLimit}
					onCheckedChange={(checked) =>
						onParamsChange({ ...params, cutAtDdLimit: checked })
					}
					aria-label={t("cutAtDdLimit")}
				/>
				<Label
					id="label-cut-at-dd"
					htmlFor="cut-at-dd-limit"
					className="text-tiny text-txt-300 cursor-pointer"
				>
					{t("cutAtDdLimit")}
				</Label>
				<span className="text-tiny text-txt-300 opacity-60">
					{t("cutAtDdLimitHint")}
				</span>
			</div>

			{/* Run button */}
			<div className="flex justify-end">
				<Button
					id="run-equity-shield"
					onClick={onRun}
					disabled={isLoading}
					className="gap-s-200"
					aria-label={t("runAnalysis")}
				>
					<Play className="h-4 w-4" />
					{isLoading ? t("running") : t("runAnalysis")}
				</Button>
			</div>
		</div>
	)
}

export { EquityShieldParamsForm }
