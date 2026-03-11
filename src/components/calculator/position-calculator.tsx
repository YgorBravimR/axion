"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Calculator } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { calculatePositionSize } from "@/lib/calculator"
import { toCents } from "@/lib/money"
import { CalculatorForm } from "./calculator-form"
import { CalculatorResults } from "./calculator-results"
import type { Asset } from "@/db/schema"
import type { StrategyWithStats } from "@/app/actions/strategies"
import type { AssetSettingWithAsset } from "@/app/actions/command-center"

interface PositionCalculatorProps {
	assets: Asset[]
	accountSettings: {
		defaultRiskPerTrade: string | null
		maxDailyLoss: number | null
	}
	strategies: StrategyWithStats[]
	assetSettings: AssetSettingWithAsset[]
	defaultAssetSymbol?: string
}

const PositionCalculator = ({
	assets,
	accountSettings,
	strategies,
	assetSettings,
	defaultAssetSymbol,
}: PositionCalculatorProps) => {
	const t = useTranslations("commandCenter.calculator")

	// Form state — pre-select from account's default asset if available
	const [selectedAssetId, setSelectedAssetId] = useState(() => {
		if (defaultAssetSymbol) {
			const match = assets.find((a) => a.symbol === defaultAssetSymbol)
			if (match) return match.id
		}
		return ""
	})
	const [direction, setDirection] = useState<"long" | "short">("long")
	const [entryPrice, setEntryPrice] = useState("")
	const [stopPrice, setStopPrice] = useState("")
	const [targetPrice, setTargetPrice] = useState("")
	const [manualContracts, setManualContracts] = useState("")
	const [maxRiskOverride, setMaxRiskOverride] = useState("")

	// Strategy state
	const [selectedStrategyId, setSelectedStrategyId] = useState("")
	const [isTargetManual, setIsTargetManual] = useState(false)

	// Track which fields were pre-filled from asset settings
	const [prefilledFields, setPrefilledFields] = useState<Set<string>>(new Set())

	// Filter strategies that have targetRMultiple set
	const strategiesWithTarget = useMemo(
		() => strategies.filter((strategy) => strategy.targetRMultiple !== null),
		[strategies]
	)

	// Derived: find the selected asset
	const selectedAsset = useMemo(
		() => assets.find((asset) => asset.id === selectedAssetId) ?? null,
		[assets, selectedAssetId]
	)

	// Derived: find the selected strategy
	const selectedStrategy = useMemo(
		() => strategiesWithTarget.find((strategy) => strategy.id === selectedStrategyId) ?? null,
		[strategiesWithTarget, selectedStrategyId]
	)

	// Derived: max risk from account settings (used as default / placeholder)
	const settingsRiskCents = useMemo(() => {
		if (accountSettings.defaultRiskPerTrade) {
			return toCents(accountSettings.defaultRiskPerTrade)
		}
		if (accountSettings.maxDailyLoss) {
			return accountSettings.maxDailyLoss
		}
		return 0
	}, [accountSettings])

	// Effective max risk: manual override takes priority over settings
	const maxAllowedRiskCents = useMemo(() => {
		if (maxRiskOverride) {
			const parsed = parseFloat(maxRiskOverride)
			if (!isNaN(parsed) && parsed > 0) {
				return toCents(parsed)
			}
		}
		return settingsRiskCents
	}, [maxRiskOverride, settingsRiskCents])

	const isMaxRiskFromSettings = maxRiskOverride === ""

	// Pre-fill from asset settings when asset changes
	useEffect(() => {
		if (!selectedAssetId) return

		const assetSetting = assetSettings.find(
			(setting) => setting.assetId === selectedAssetId
		)
		if (!assetSetting) {
			setPrefilledFields(new Set())
			return
		}

		const newPrefilled = new Set<string>()

		// Pre-fill direction from bias (skip neutral)
		if (assetSetting.bias === "long" || assetSetting.bias === "short") {
			setDirection(assetSetting.bias)
			newPrefilled.add("direction")
		}

		// Pre-fill contracts from maxPositionSize
		if (assetSetting.maxPositionSize) {
			setManualContracts(String(assetSetting.maxPositionSize))
			newPrefilled.add("manualContracts")
		}

		setPrefilledFields(newPrefilled)
	}, [selectedAssetId, assetSettings])

	// Auto-calculate target price from strategy R-multiple
	useEffect(() => {
		if (!selectedStrategy || isTargetManual) return

		const entry = parseFloat(entryPrice)
		const stop = parseFloat(stopPrice)
		if (isNaN(entry) || isNaN(stop) || entry <= 0 || stop <= 0) return

		const rMultiple = parseFloat(selectedStrategy.targetRMultiple!)
		if (isNaN(rMultiple) || rMultiple <= 0) return

		const stopDistance = Math.abs(entry - stop)
		const targetDistance = stopDistance * rMultiple

		const computedTarget = direction === "long"
			? entry + targetDistance
			: entry - targetDistance

		// Round to a reasonable precision (match tick size if available)
		if (selectedAsset) {
			const tickSize = parseFloat(selectedAsset.tickSize)
			const rounded = Math.round(computedTarget / tickSize) * tickSize
			setTargetPrice(String(parseFloat(rounded.toFixed(10))))
		} else {
			setTargetPrice(String(parseFloat(computedTarget.toFixed(2))))
		}
	}, [selectedStrategy, entryPrice, stopPrice, direction, isTargetManual, selectedAsset])

	// Handle manual target price change — marks target as manual
	const handleTargetPriceChange = useCallback((value: string) => {
		setTargetPrice(value)
		if (value !== "") {
			setIsTargetManual(true)
		}
	}, [])

	// Handle strategy change — reset manual target flag
	const handleStrategyChange = useCallback((strategyId: string) => {
		setSelectedStrategyId(strategyId)
		setIsTargetManual(false)
	}, [])

	// Check if prices are entered
	const hasPrices = entryPrice !== "" && stopPrice !== ""

	// Compute result
	const calculatorResult = useMemo(() => {
		if (!selectedAsset) return null

		const entry = parseFloat(entryPrice)
		const stop = parseFloat(stopPrice)

		if (isNaN(entry) || isNaN(stop) || entry <= 0 || stop <= 0) return null

		const target = targetPrice ? parseFloat(targetPrice) : null
		if (targetPrice && (target === null || isNaN(target) || target <= 0)) return null

		const contracts = manualContracts ? parseInt(manualContracts, 10) : null
		if (manualContracts && (contracts === null || isNaN(contracts) || contracts <= 0)) {
			return null
		}

		return calculatePositionSize({
			entryPrice: entry,
			stopPrice: stop,
			targetPrice: target,
			direction,
			tickSize: parseFloat(selectedAsset.tickSize),
			tickValue: selectedAsset.tickValue,
			multiplier: parseFloat(selectedAsset.multiplier ?? "1"),
			maxAllowedRiskCents: maxAllowedRiskCents,
			manualContracts: contracts,
		})
	}, [
		selectedAsset,
		entryPrice,
		stopPrice,
		targetPrice,
		manualContracts,
		direction,
		maxAllowedRiskCents,
	])

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="mb-m-400 flex items-center gap-s-200">
				<Calculator className="h-5 w-5 text-acc-100" />
				<h3 className="text-body font-semibold text-txt-100">{t("title")}</h3>
			</div>

			{/* Two Column Layout */}
			<div className="grid gap-m-500 lg:grid-cols-2">
				{/* Left: Form */}
				<CalculatorForm
					assets={assets}
					selectedAssetId={selectedAssetId}
					direction={direction}
					entryPrice={entryPrice}
					stopPrice={stopPrice}
					targetPrice={targetPrice}
					manualContracts={manualContracts}
					maxRiskOverride={maxRiskOverride}
					settingsRiskCents={settingsRiskCents}
					onAssetChange={setSelectedAssetId}
					onDirectionChange={setDirection}
					onEntryPriceChange={setEntryPrice}
					onStopPriceChange={setStopPrice}
					onTargetPriceChange={handleTargetPriceChange}
					onManualContractsChange={setManualContracts}
					onMaxRiskOverrideChange={setMaxRiskOverride}
					strategies={strategiesWithTarget}
					selectedStrategyId={selectedStrategyId}
					onStrategyChange={handleStrategyChange}
					isTargetFromStrategy={!!selectedStrategy && !isTargetManual}
					prefilledFields={prefilledFields}
				/>

				{/* Right: Results */}
				<CalculatorResults
					result={calculatorResult}
					hasAssetSelected={selectedAssetId !== ""}
					hasPrices={hasPrices}
					isMaxRiskFromSettings={isMaxRiskFromSettings}
				/>
			</div>

			{/* Max risk source indicator */}
			{settingsRiskCents === 0 && !maxRiskOverride && selectedAssetId && (
				<p className="mt-m-400 text-tiny text-trade-sell">
					{t("noRiskConfiguredMessage")}{" "}
					<Link
						href="/settings?tab=account"
						className="underline transition-colors hover:text-acc-100"
						aria-label={t("setInAccountSettings")}
					>
						{t("setInAccountSettings")}
					</Link>
				</p>
			)}
		</div>
	)
}

export { PositionCalculator }
