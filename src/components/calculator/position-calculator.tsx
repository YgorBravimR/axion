"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Calculator } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { calculatePositionSize } from "@/lib/calculator"
import { toCents } from "@/lib/money"
import { CalculatorForm } from "./calculator-form"
import { CalculatorResults } from "./calculator-results"
import type { Asset } from "@/db/schema"
import type { StrategyWithStats } from "@/app/actions/strategies.types"
import type { AssetSettingWithAsset } from "@/app/actions/command-center.types"

interface PositionCalculatorProps {
	assets: Asset[]
	accountSettings: {
		defaultRiskPerTrade: string | null
		maxDailyLoss: number | null
	}
	strategies: StrategyWithStats[]
	assetSettings: AssetSettingWithAsset[]
	defaultAssetId?: string
	// Resolved by the circuit breaker for today (today only — non-today views
	// pass null). When present, this is the canonical R cap the trader should
	// respect and takes precedence over the static account-settings value.
	recommendedRiskCents?: number | null
}

const PositionCalculator = ({
	assets,
	accountSettings,
	strategies,
	assetSettings,
	defaultAssetId,
	recommendedRiskCents = null,
}: PositionCalculatorProps) => {
	const t = useTranslations("commandCenter.calculator")

	// Form state — pre-select from account's default asset if available
	const [selectedAssetId, setSelectedAssetId] = useState(() => {
		if (defaultAssetId) {
			const match = assets.find((a) => a.id === defaultAssetId)
			if (match) {
				return match.id
			}
		}
		return ""
	})
	const [direction, setDirection] = useState<"long" | "short">("long")
	const [entryPrice, setEntryPrice] = useState("")
	const [debouncedEntryPrice, setDebouncedEntryPrice] = useState("")
	const [stopPrice, setStopPrice] = useState("")
	const [debouncedStopPrice, setDebouncedStopPrice] = useState("")
	const [targetPrice, setTargetPrice] = useState("")
	const [manualContracts, setManualContracts] = useState("")
	const [maxRiskOverride, setMaxRiskOverride] = useState("")

	// Debounce timer refs for price inputs
	const entryPriceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const stopPriceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Strategy state
	const [selectedStrategyId, setSelectedStrategyId] = useState("")
	const [isTargetManual, setIsTargetManual] = useState(false)

	// Track which fields were pre-filled from asset settings
	const [prefilledFields, setPrefilledFields] = useState<Set<string>>(new Set())

	// Filter strategies that have finalR set
	const strategiesWithTarget = useMemo(
		() => strategies.filter((strategy) => strategy.finalR !== null),
		[strategies]
	)

	// Derived: find the selected asset
	const selectedAsset = useMemo(
		() => assets.find((asset) => asset.id === selectedAssetId) ?? null,
		[assets, selectedAssetId]
	)

	// Derived: find the selected strategy
	const selectedStrategy = useMemo(
		() =>
			strategiesWithTarget.find(
				(strategy) => strategy.id === selectedStrategyId
			) ?? null,
		[strategiesWithTarget, selectedStrategyId]
	)

	// Derived: max risk default. Circuit-breaker recommendation wins when
	// available because it already factors in today's daily-loss cap and
	// post-loss reduction. Falls back to account settings, then maxDailyLoss.
	const settingsRiskCents = useMemo(() => {
		if (recommendedRiskCents !== null && recommendedRiskCents > 0) {
			return recommendedRiskCents
		}
		if (accountSettings.defaultRiskPerTrade) {
			return toCents(accountSettings.defaultRiskPerTrade)
		}
		if (accountSettings.maxDailyLoss) {
			return accountSettings.maxDailyLoss
		}
		return 0
	}, [accountSettings, recommendedRiskCents])

	const riskSource: "breaker" | "settings" | "none" =
		recommendedRiskCents !== null && recommendedRiskCents > 0
			? "breaker"
			: accountSettings.defaultRiskPerTrade || accountSettings.maxDailyLoss
				? "settings"
				: "none"

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
		if (!selectedAssetId) {
			return
		}

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
		if (!selectedStrategy || isTargetManual) {
			return
		}

		const entry = parseFloat(entryPrice)
		const stop = parseFloat(stopPrice)
		if (isNaN(entry) || isNaN(stop) || entry <= 0 || stop <= 0) {
			return
		}

		const rMultiple = parseFloat(selectedStrategy.finalR!)
		if (isNaN(rMultiple) || rMultiple <= 0) {
			return
		}

		const stopDistance = Math.abs(entry - stop)
		const targetDistance = stopDistance * rMultiple

		const computedTarget =
			direction === "long" ? entry + targetDistance : entry - targetDistance

		// Round to a reasonable precision (match tick size if available)
		if (selectedAsset) {
			const tickSize = parseFloat(selectedAsset.tickSize)
			const rounded = Math.round(computedTarget / tickSize) * tickSize
			setTargetPrice(String(parseFloat(rounded.toFixed(10))))
		} else {
			setTargetPrice(String(parseFloat(computedTarget.toFixed(2))))
		}
	}, [
		selectedStrategy,
		entryPrice,
		stopPrice,
		direction,
		isTargetManual,
		selectedAsset,
	])

	// Debounce entry price: update local state immediately, sync to debounced after 200ms
	useEffect(() => {
		if (entryPriceTimerRef.current) {
			clearTimeout(entryPriceTimerRef.current)
		}
		entryPriceTimerRef.current = setTimeout(() => {
			setDebouncedEntryPrice(entryPrice)
		}, 200)
		return () => {
			if (entryPriceTimerRef.current) {
				clearTimeout(entryPriceTimerRef.current)
			}
		}
	}, [entryPrice])

	// Debounce stop price: update local state immediately, sync to debounced after 200ms
	useEffect(() => {
		if (stopPriceTimerRef.current) {
			clearTimeout(stopPriceTimerRef.current)
		}
		stopPriceTimerRef.current = setTimeout(() => {
			setDebouncedStopPrice(stopPrice)
		}, 200)
		return () => {
			if (stopPriceTimerRef.current) {
				clearTimeout(stopPriceTimerRef.current)
			}
		}
	}, [stopPrice])

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

	// Compute result using debounced prices to avoid recalculation on every keystroke
	const calculatorResult = useMemo(() => {
		if (!selectedAsset) {
			return null
		}

		const entry = parseFloat(debouncedEntryPrice)
		const stop = parseFloat(debouncedStopPrice)

		if (isNaN(entry) || isNaN(stop) || entry <= 0 || stop <= 0) {
			return null
		}

		const target = targetPrice ? parseFloat(targetPrice) : null
		if (targetPrice && (target === null || isNaN(target) || target <= 0)) {
			return null
		}

		const contracts = manualContracts ? parseInt(manualContracts, 10) : null
		if (
			manualContracts &&
			(contracts === null || isNaN(contracts) || contracts <= 0)
		) {
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
		debouncedEntryPrice,
		debouncedStopPrice,
		targetPrice,
		manualContracts,
		direction,
		maxAllowedRiskCents,
	])

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
			{/* Header */}
			<div className="mb-m-400 gap-s-200 flex items-center">
				<Calculator className="text-acc-100 h-5 w-5" />
				<h3 className="text-body text-txt-100 font-semibold">{t("title")}</h3>
			</div>

			{/* Two Column Layout */}
			<div className="gap-m-500 grid lg:grid-cols-2">
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
					riskSource={riskSource}
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
						className="hover:text-acc-100 underline transition-colors"
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
