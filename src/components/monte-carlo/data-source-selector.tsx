"use client"

import { useTranslations } from "next-intl"
import { Globe, Database, LineChart, Lock } from "lucide-react"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import type { DataSourceOption, DataSource } from "@/types/monte-carlo"

const MIN_TRADES = 10

interface DataSourceSelectorProps {
	options: DataSourceOption[]
	selectedSource: DataSource | null
	onSourceChange: (source: DataSource) => void
	isLoading: boolean
}

const DataSourceSelector = ({
	options,
	selectedSource,
	onSourceChange,
	isLoading,
}: DataSourceSelectorProps) => {
	const t = useTranslations("monteCarlo.dataSource")

	const handleValueChange = (value: string) => {
		if (value === "all_strategies") {
			onSourceChange({ type: "all_strategies" })
		} else if (value === "universal") {
			onSourceChange({ type: "universal" })
		} else {
			onSourceChange({ type: "strategy", strategyId: value })
		}
	}

	const getCurrentValue = (): string => {
		if (!selectedSource) return ""
		if (selectedSource.type === "strategy") return selectedSource.strategyId
		return selectedSource.type
	}

	const getIcon = (type: DataSource["type"]) => {
		switch (type) {
			case "strategy":
				return <LineChart className="h-4 w-4" />
			case "all_strategies":
				return <Database className="h-4 w-4" />
			case "universal":
				return <Globe className="h-4 w-4" />
		}
	}

	const hasAnyDisabled = options.some((o) => o.disabled)

	// Group options by type
	const strategyOptions = options.filter((o) => o.type === "strategy")
	const aggregateOptions = options.filter((o) => o.type !== "strategy")

	const renderTradeCount = (option: DataSourceOption) => {
		if (option.disabled) {
			return (
				<span className="text-tiny text-txt-300 ml-auto flex items-center gap-1">
					<Lock className="h-3 w-3" aria-hidden="true" />
					<span>
						{option.tradesCount}/{MIN_TRADES}
					</span>
				</span>
			)
		}

		return (
			<span className="text-tiny text-txt-300">
				({option.tradesCount} {t("trades")})
			</span>
		)
	}

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
			<h3 className="mb-s-300 text-small text-txt-200 font-medium">
				{t("title")}
			</h3>

			<Select
				value={getCurrentValue()}
				onValueChange={handleValueChange}
				disabled={isLoading}
			>
				<SelectTrigger id="monte-carlo-data-source" className="w-full">
					<SelectValue placeholder={t("selectSource")} />
				</SelectTrigger>
				<SelectContent
					position="popper"
					className="w-[var(--radix-select-trigger-width)]"
				>
					{/* Individual Strategies */}
					{strategyOptions.length > 0 && (
						<>
							<div className="text-tiny text-txt-300 px-2 py-1.5 font-medium">
								{t("individual")}
							</div>
							{strategyOptions.map((option) => (
								<SelectItem
									key={option.strategyId}
									value={option.strategyId!}
									disabled={option.disabled}
								>
									<div className="gap-s-200 flex items-center">
										{getIcon(option.type)}
										<span>{option.label}</span>
										{renderTradeCount(option)}
									</div>
								</SelectItem>
							))}
							<div className="border-bg-300 my-1 border-t" />
						</>
					)}

					{/* Aggregate Options */}
					{aggregateOptions.map((option) => {
						const label =
							option.type === "all_strategies"
								? t("allStrategies")
								: option.type === "universal"
									? t("universal")
									: option.label
						const description =
							option.type === "all_strategies"
								? t("allStrategiesDesc")
								: option.type === "universal"
									? t("universalDesc")
									: option.description

						return (
							<SelectItem
								key={option.type}
								value={option.type}
								disabled={option.disabled}
							>
								<div className="gap-s-200 flex items-center">
									{getIcon(option.type)}
									<div className="flex flex-col">
										<span>{label}</span>
										{description && (
											<span className="text-tiny text-txt-300">
												{description}
											</span>
										)}
									</div>
									{renderTradeCount(option)}
								</div>
							</SelectItem>
						)
					})}

					{/* Helper hint when some options are disabled */}
					{hasAnyDisabled && (
						<div className="text-tiny text-txt-300 border-bg-300 mt-1 border-t px-2 py-2">
							{t("minTradesHint", { min: MIN_TRADES })}
						</div>
					)}
				</SelectContent>
			</Select>
		</div>
	)
}

export { DataSourceSelector }
