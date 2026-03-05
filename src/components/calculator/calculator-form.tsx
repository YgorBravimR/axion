"use client"

import { useTranslations } from "next-intl"
import { ArrowUpCircle, ArrowDownCircle, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { fromCents } from "@/lib/money"
import type { Asset } from "@/db/schema"
import type { StrategyWithStats } from "@/app/actions/strategies"

interface CalculatorFormProps {
	assets: Asset[]
	selectedAssetId: string
	direction: "long" | "short"
	entryPrice: string
	stopPrice: string
	targetPrice: string
	manualContracts: string
	maxRiskOverride: string
	settingsRiskCents: number
	onAssetChange: (id: string) => void
	onDirectionChange: (dir: "long" | "short") => void
	onEntryPriceChange: (value: string) => void
	onStopPriceChange: (value: string) => void
	onTargetPriceChange: (value: string) => void
	onManualContractsChange: (value: string) => void
	onMaxRiskOverrideChange: (value: string) => void
	strategies: StrategyWithStats[]
	selectedStrategyId: string
	onStrategyChange: (id: string) => void
	isTargetFromStrategy: boolean
	prefilledFields: Set<string>
}

const PrefilledBadge = ({ label }: { label: string }) => (
	<span className="ml-s-200 inline-flex items-center gap-s-100 rounded-sm bg-acc-100/15 px-s-200 py-px text-micro text-acc-100">
		<Sparkles className="h-2.5 w-2.5" />
		{label}
	</span>
)

const CalculatorForm = ({
	assets,
	selectedAssetId,
	direction,
	entryPrice,
	stopPrice,
	targetPrice,
	manualContracts,
	maxRiskOverride,
	settingsRiskCents,
	onAssetChange,
	onDirectionChange,
	onEntryPriceChange,
	onStopPriceChange,
	onTargetPriceChange,
	onManualContractsChange,
	onMaxRiskOverrideChange,
	strategies,
	selectedStrategyId,
	onStrategyChange,
	isTargetFromStrategy,
	prefilledFields,
}: CalculatorFormProps) => {
	const t = useTranslations("commandCenter.calculator")

	return (
		<div className="space-y-m-400">
			{/* Asset Selector */}
			<div>
				<label className="mb-s-200 block text-small text-txt-200">
					{t("asset")}
				</label>
				<Select value={selectedAssetId} onValueChange={onAssetChange}>
					<SelectTrigger
						id="calculator-asset"
						className="w-full"
						aria-label={t("selectAsset")}
					>
						<SelectValue placeholder={t("selectAsset")} />
					</SelectTrigger>
					<SelectContent>
						{assets.map((asset) => (
							<SelectItem key={asset.id} value={asset.id}>
								{asset.symbol} - {asset.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Strategy Selector */}
			{strategies.length > 0 && (
				<div>
					<label className="mb-s-200 block text-small text-txt-200">
						{t("strategy")}
					</label>
					<Select value={selectedStrategyId} onValueChange={onStrategyChange}>
						<SelectTrigger
							id="calculator-strategy"
							className="w-full"
							aria-label={t("selectStrategy")}
						>
							<SelectValue placeholder={t("selectStrategy")} />
						</SelectTrigger>
						<SelectContent>
							{strategies.map((strategy) => (
								<SelectItem key={strategy.id} value={strategy.id}>
									{strategy.code} - {strategy.name} ({strategy.targetRMultiple}R)
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{selectedStrategyId && (
						<p className="mt-s-100 text-tiny text-txt-300">
							{t("strategyHint", {
								r: strategies.find((s) => s.id === selectedStrategyId)?.targetRMultiple ?? "",
							})}
						</p>
					)}
				</div>
			)}

			{/* Direction Toggle */}
			<div>
				<label className="mb-s-200 block text-small text-txt-200">
					{t("direction")}
					{prefilledFields.has("direction") && (
						<PrefilledBadge label={t("fromAssetSettings")} />
					)}
				</label>
				<div className="grid grid-cols-2 gap-s-200">
					<button
						type="button"
						tabIndex={0}
						aria-label={t("long")}
						onClick={() => onDirectionChange("long")}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") onDirectionChange("long")
						}}
						className={cn(
							"flex items-center justify-center gap-s-200 rounded-md border px-m-400 py-s-300 text-small font-medium transition-colors",
							direction === "long"
								? "border-trade-buy bg-trade-buy/15 text-trade-buy"
								: "border-bg-300 bg-bg-200 text-txt-300 hover:text-txt-200"
						)}
					>
						<ArrowUpCircle className="h-4 w-4" />
						{t("long")}
					</button>
					<button
						type="button"
						tabIndex={0}
						aria-label={t("short")}
						onClick={() => onDirectionChange("short")}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") onDirectionChange("short")
						}}
						className={cn(
							"flex items-center justify-center gap-s-200 rounded-md border px-m-400 py-s-300 text-small font-medium transition-colors",
							direction === "short"
								? "border-trade-sell bg-trade-sell/15 text-trade-sell"
								: "border-bg-300 bg-bg-200 text-txt-300 hover:text-txt-200"
						)}
					>
						<ArrowDownCircle className="h-4 w-4" />
						{t("short")}
					</button>
				</div>
			</div>

			{/* Price Inputs */}
			<div className="grid grid-cols-1 gap-m-400 sm:grid-cols-2">
				{/* Entry Price */}
				<div>
					<label className="mb-s-200 block text-small text-txt-200">
						{t("entryPrice")}
					</label>
					<Input
						id="calculator-entry-price"
						type="number"
						step="any"
						min="0"
						value={entryPrice}
						onChange={(e) => onEntryPriceChange(e.target.value)}
						placeholder="0.00"
						aria-label={t("entryPrice")}
					/>
				</div>

				{/* Stop Price */}
				<div>
					<label className="mb-s-200 block text-small text-txt-200">
						{t("stopPrice")}
					</label>
					<Input
						id="calculator-stop-price"
						type="number"
						step="any"
						min="0"
						value={stopPrice}
						onChange={(e) => onStopPriceChange(e.target.value)}
						placeholder="0.00"
						aria-label={t("stopPrice")}
					/>
				</div>
			</div>

			{/* Target Price */}
			<div>
				<label className="mb-s-200 block text-small text-txt-200">
					{t("targetPrice")}
					{isTargetFromStrategy && (
						<PrefilledBadge label={`${strategies.find((s) => s.id === selectedStrategyId)?.targetRMultiple}R`} />
					)}
				</label>
				<Input
					id="calculator-target-price"
					type="number"
					step="any"
					min="0"
					value={targetPrice}
					onChange={(e) => onTargetPriceChange(e.target.value)}
					placeholder={t("optional")}
					aria-label={t("targetPrice")}
					className={cn(
						isTargetFromStrategy && "border-acc-100/40 text-acc-100"
					)}
				/>
			</div>

			{/* Max Risk Override */}
			<div>
				<label className="mb-s-200 block text-small text-txt-200">
					{t("maxRisk")}
				</label>
				<Input
					id="calculator-max-risk"
					type="number"
					step="any"
					min="0"
					value={maxRiskOverride}
					onChange={(e) => onMaxRiskOverrideChange(e.target.value)}
					placeholder={
						settingsRiskCents > 0
							? `${fromCents(settingsRiskCents).toFixed(2)} (${t("fromSettings")})`
							: t("enterMaxRisk")
					}
					aria-label={t("maxRisk")}
				/>
				<p className="mt-s-100 text-tiny text-txt-300">
					{t("maxRiskHelp")}
				</p>
			</div>

			{/* Manual Contracts Override */}
			<div>
				<label className="mb-s-200 block text-small text-txt-200">
					{t("manualContracts")}
					{prefilledFields.has("manualContracts") && (
						<PrefilledBadge label={t("fromAssetSettings")} />
					)}
				</label>
				<Input
					id="calculator-manual-contracts"
					type="number"
					step="1"
					min="1"
					value={manualContracts}
					onChange={(e) => onManualContractsChange(e.target.value)}
					placeholder={t("optional")}
					aria-label={t("manualContracts")}
				/>
				<p className="mt-s-100 text-tiny text-txt-300">
					{t("manualContractsHelp")}
				</p>
			</div>
		</div>
	)
}

export { CalculatorForm }
