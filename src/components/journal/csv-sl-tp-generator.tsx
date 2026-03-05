"use client"

import { useState, useMemo, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import type { ProcessedCsvTrade } from "@/app/actions/csv-import"

interface AssetSlTpConfig {
	asset: string
	slTicks: number
	slVariance: number
	tpTicks: number
	tpVariance: number
}

interface CsvSlTpGeneratorProps {
	processedTrades: ProcessedCsvTrade[]
	onApply: (updatedTrades: ProcessedCsvTrade[]) => void
}

const getRandomInt = (min: number, max: number): number => {
	return Math.floor(Math.random() * (max - min + 1)) + min
}

export const CsvSlTpGenerator = ({
	processedTrades,
	onApply,
}: CsvSlTpGeneratorProps) => {
	const t = useTranslations("journal.csv.slTpGenerator")
	const { showLoading, updateLoading, hideLoading } = useLoadingOverlay()
	const [isEnabled, setIsEnabled] = useState(false)
	const [isGenerating, setIsGenerating] = useState(false)

	// Extract unique assets from valid/warning trades with assetConfig
	const uniqueAssets = useMemo(() => {
		const assets = new Set<string>()
		for (const trade of processedTrades) {
			if (
				trade.assetConfig &&
				(trade.status === "valid" || trade.status === "warning")
			) {
				assets.add(trade.assetConfig.symbol)
			}
		}
		return Array.from(assets).sort()
	}, [processedTrades])

	// Asset config state - initialize with reasonable defaults
	const [assetConfigs, setAssetConfigs] = useState<Record<string, AssetSlTpConfig>>({})

	// Initialize configs when assets change
	const initializeConfigs = () => {
		const newConfigs: Record<string, AssetSlTpConfig> = {}
		for (const asset of uniqueAssets) {
			if (!assetConfigs[asset]) {
				newConfigs[asset] = {
					asset,
					slTicks: 20,
					slVariance: 5,
					tpTicks: 40,
					tpVariance: 10,
				}
			} else {
				newConfigs[asset] = assetConfigs[asset]
			}
		}
		setAssetConfigs(newConfigs)
	}

	const handleEnableToggle = (checked: boolean) => {
		setIsEnabled(checked)
		if (checked && Object.keys(assetConfigs).length === 0) {
			initializeConfigs()
		}
	}

	const handleConfigChange = (
		asset: string,
		field: keyof AssetSlTpConfig,
		value: string
	) => {
		const numValue = parseInt(value, 10)
		if (isNaN(numValue)) return

		setAssetConfigs((prev) => ({
			...prev,
			[asset]: {
				...prev[asset],
				[field]: numValue,
			},
		}))
	}

	const getRangeLabel = (base: number, variance: number): string => {
		const min = base - variance
		const max = base + variance
		return t("range", { min, max })
	}

	const delay = (ms: number): Promise<void> =>
		new Promise((resolve) => setTimeout(resolve, ms))

	const generateSlTpForTrade = useCallback(
		(trade: ProcessedCsvTrade): ProcessedCsvTrade => {
			if (trade.status === "skipped" || !trade.assetConfig) return trade
			if (trade.originalData.entryPrice === null || !trade.originalData.entryPrice) return trade

			const config = assetConfigs[trade.assetConfig.symbol]
			if (!config) return trade

			const entryPrice = Number(trade.originalData.entryPrice)
			const exitPrice = trade.originalData.exitPrice
				? Number(trade.originalData.exitPrice)
				: null
			const tickSize = trade.assetConfig.tickSize
			const direction = trade.originalData.direction.toLowerCase()

			const isWin = trade.grossPnl !== null && trade.grossPnl >= 0
			let slPrice: number
			let tpPrice: number

			if (isWin) {
				const slTicks = getRandomInt(
					config.slTicks - config.slVariance,
					config.slTicks + config.slVariance
				)
				const tpTicks = getRandomInt(
					config.tpTicks - config.tpVariance,
					config.tpTicks + config.tpVariance
				)

				if (direction === "long") {
					slPrice = entryPrice - slTicks * tickSize
					tpPrice = entryPrice + tpTicks * tickSize
				} else {
					slPrice = entryPrice + slTicks * tickSize
					tpPrice = entryPrice - tpTicks * tickSize
				}
			} else {
				if (!exitPrice) return trade

				slPrice = exitPrice
				const tpTicks = getRandomInt(
					config.tpTicks - config.tpVariance,
					config.tpTicks + config.tpVariance
				)

				if (direction === "long") {
					tpPrice = entryPrice + tpTicks * tickSize
				} else {
					tpPrice = entryPrice - tpTicks * tickSize
				}
			}

			return {
				...trade,
				edits: {
					...trade.edits,
					stopLoss: slPrice,
					takeProfit: tpPrice,
				},
			}
		},
		[assetConfigs]
	)

	const handleGenerate = async () => {
		const eligibleIndices: number[] = []
		for (let i = 0; i < processedTrades.length; i++) {
			const trade = processedTrades[i]
			if (
				trade.status !== "skipped" &&
				trade.assetConfig &&
				assetConfigs[trade.assetConfig.symbol]
			) {
				eligibleIndices.push(i)
			}
		}

		if (eligibleIndices.length === 0) return

		setIsGenerating(true)
		showLoading({ message: t("generatingSlTp"), progress: 0 })

		const DURATION_MS = 5000
		const CHUNKS = 10
		const chunkDelay = DURATION_MS / CHUNKS
		const chunkSize = Math.ceil(eligibleIndices.length / CHUNKS)

		const updatedTrades = [...processedTrades]

		for (let i = 0; i < CHUNKS; i++) {
			const start = i * chunkSize
			const end = Math.min(start + chunkSize, eligibleIndices.length)

			for (let j = start; j < end; j++) {
				const tradeIndex = eligibleIndices[j]
				updatedTrades[tradeIndex] = generateSlTpForTrade(updatedTrades[tradeIndex])
			}

			const progress = Math.round(((i + 1) / CHUNKS) * 100)
			updateLoading({ progress })
			await delay(chunkDelay)
		}

		onApply(updatedTrades)
		hideLoading()
		setIsGenerating(false)
	}

	if (uniqueAssets.length === 0) {
		return null
	}

	return (
		<div className="space-y-m-400 sm:space-y-m-500">
			{/* Checkbox */}
			<div className="gap-s-300 flex items-center">
				<Checkbox
					id="csv-sl-tp-generator-checkbox"
					checked={isEnabled}
					onCheckedChange={handleEnableToggle}
				/>
				<Label
					id="csv-sl-tp-generator-label"
					htmlFor="csv-sl-tp-generator-checkbox"
					className="text-body text-txt-100 font-medium"
				>
					{t("title")}
				</Label>
			</div>

			{/* Content */}
			{isEnabled && (
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 space-y-s-300 sm:space-y-m-400 rounded-lg border">
					{/* Description */}
					<div>
						<p className="text-small text-txt-300">{t("description")}</p>
						<p className="mt-s-200 text-small text-txt-300">{t("lossNote")}</p>
					</div>

					{/* Asset Config Cards */}
					<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 md:grid-cols-2">
						{uniqueAssets.map((asset) => {
							const config = assetConfigs[asset]
							if (!config) return null

							return (
								<div
									key={asset}
									className="border-bg-300 bg-bg-100 p-s-300 sm:p-m-400 rounded-lg border space-y-s-200"
								>
									{/* Asset Title */}
									<h4 className="text-small text-txt-100 font-semibold">
										{asset}
									</h4>

									{/* SL Inputs */}
									<div className="grid gap-s-200 grid-cols-2">
										<div>
											<Label
												id={`sl-ticks-${asset}`}
												className="text-tiny text-txt-300"
											>
												{t("slTicks")}
											</Label>
											<Input
												id={`sl-ticks-input-${asset}`}
												type="number"
												value={config.slTicks}
												onChange={(e) =>
													handleConfigChange(asset, "slTicks", e.target.value)
												}
												className="mt-s-100"
											/>
										</div>
										<div>
											<Label
												id={`sl-variance-${asset}`}
												className="text-tiny text-txt-300"
											>
												{t("slVariance")}
											</Label>
											<Input
												id={`sl-variance-input-${asset}`}
												type="number"
												value={config.slVariance}
												onChange={(e) =>
													handleConfigChange(
														asset,
														"slVariance",
														e.target.value
													)
												}
												className="mt-s-100"
											/>
										</div>
									</div>
									<p className="text-tiny text-txt-300">
										{getRangeLabel(config.slTicks, config.slVariance)}
									</p>

									{/* TP Inputs */}
									<div className="mt-s-300 grid gap-s-200 grid-cols-2">
										<div>
											<Label
												id={`tp-ticks-${asset}`}
												className="text-tiny text-txt-300"
											>
												{t("tpTicks")}
											</Label>
											<Input
												id={`tp-ticks-input-${asset}`}
												type="number"
												value={config.tpTicks}
												onChange={(e) =>
													handleConfigChange(asset, "tpTicks", e.target.value)
												}
												className="mt-s-100"
											/>
										</div>
										<div>
											<Label
												id={`tp-variance-${asset}`}
												className="text-tiny text-txt-300"
											>
												{t("tpVariance")}
											</Label>
											<Input
												id={`tp-variance-input-${asset}`}
												type="number"
												value={config.tpVariance}
												onChange={(e) =>
													handleConfigChange(
														asset,
														"tpVariance",
														e.target.value
													)
												}
												className="mt-s-100"
											/>
										</div>
									</div>
									<p className="text-tiny text-txt-300">
										{getRangeLabel(config.tpTicks, config.tpVariance)}
									</p>
								</div>
							)
						})}
					</div>

					{/* Generate Button */}
					<Button
						id="csv-sl-tp-generator-button"
						onClick={handleGenerate}
						disabled={isGenerating}
						className="w-full"
					>
						{t("generate")}
					</Button>
				</div>
			)}
		</div>
	)
}
