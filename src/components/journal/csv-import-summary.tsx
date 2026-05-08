"use client"

import { useMemo } from "react"
import { CheckCircle2, XCircle, AlertTriangle, TrendingUp } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import type { ProcessedCsvTrade } from "@/app/actions/csv-import.types"

export type FilterStatus = "all" | "valid" | "warning" | "skipped"

interface CsvImportSummaryProps {
	trades: ProcessedCsvTrade[]
	filter: FilterStatus
	onFilterChange: (_filter: FilterStatus) => void
	selectedCount: number
	selectableCount: number
	onSelectAll: (_selected: boolean) => void
	allSelected: boolean
}

export const CsvImportSummary = ({
	trades,
	filter,
	onFilterChange,
	selectedCount,
	selectableCount,
	onSelectAll,
	allSelected,
}: CsvImportSummaryProps) => {
	const t = useTranslations("journal.csv")
	const tCommon = useTranslations("common")

	// C3: Single pass computes all 6 values instead of 3× .filter() + 3× .reduce()
	const {
		validCount,
		warningCount,
		skippedCount,
		grossPnl,
		netPnl,
		totalCosts,
	} = useMemo(() => {
		let valid = 0
		let warning = 0
		let skipped = 0
		let gross = 0
		let net = 0
		let costs = 0
		for (const trade of trades) {
			if (trade.status === "valid") {
				valid++
			} else if (trade.status === "warning") {
				warning++
			} else if (trade.status === "skipped") {
				skipped++
			}
			gross += trade.grossPnl || 0
			net += trade.netPnl || 0
			costs += trade.totalCosts || 0
		}
		return {
			validCount: valid,
			warningCount: warning,
			skippedCount: skipped,
			grossPnl: gross,
			netPnl: net,
			totalCosts: costs,
		}
	}, [trades])

	const formatCurrency = (value: number) => {
		const formatted = new Intl.NumberFormat("pt-BR", {
			style: "currency",
			currency: "BRL",
			minimumFractionDigits: 2,
		}).format(value)
		return value >= 0 ? `+${formatted}` : formatted
	}

	return (
		<div id="csv-import-summary" className="space-y-m-400">
			{/* Stats Cards */}
			<div className="gap-s-200 sm:gap-s-300 grid grid-cols-2 md:grid-cols-4">
				{/* Valid */}
				<button
					type="button"
					onClick={() => onFilterChange(filter === "valid" ? "all" : "valid")}
					className={cn(
						"p-s-300 sm:p-m-400 rounded-lg border text-center transition-all",
						filter === "valid"
							? "border-trade-buy bg-trade-buy/10"
							: "border-bg-300 bg-bg-200 hover:border-trade-buy/50"
					)}
				>
					<div className="gap-s-200 flex items-center justify-center">
						<CheckCircle2 className="text-trade-buy h-5 w-5" />
						<span className="text-h3 text-trade-buy font-bold">
							{validCount}
						</span>
					</div>
					<p className="mt-s-100 text-tiny text-txt-300">{t("validTrades")}</p>
				</button>

				{/* Skipped */}
				<button
					type="button"
					onClick={() =>
						onFilterChange(filter === "skipped" ? "all" : "skipped")
					}
					className={cn(
						"p-s-300 sm:p-m-400 rounded-lg border text-center transition-all",
						filter === "skipped"
							? "border-fb-error bg-fb-error/10"
							: "border-bg-300 bg-bg-200 hover:border-fb-error/50"
					)}
				>
					<div className="gap-s-200 flex items-center justify-center">
						<XCircle className="text-fb-error h-5 w-5" />
						<span className="text-h3 text-fb-error font-bold">
							{skippedCount}
						</span>
					</div>
					<p className="mt-s-100 text-tiny text-txt-300">
						{tCommon("skipped")}
					</p>
				</button>

				{/* Warnings */}
				<button
					type="button"
					onClick={() =>
						onFilterChange(filter === "warning" ? "all" : "warning")
					}
					className={cn(
						"p-s-300 sm:p-m-400 rounded-lg border text-center transition-all",
						filter === "warning"
							? "border-warning bg-warning/10"
							: "border-bg-300 bg-bg-200 hover:border-warning/50"
					)}
				>
					<div className="gap-s-200 flex items-center justify-center">
						<AlertTriangle className="text-warning h-5 w-5" />
						<span className="text-h3 text-warning font-bold">
							{warningCount}
						</span>
					</div>
					<p className="mt-s-100 text-tiny text-txt-300">{t("warnings")}</p>
				</button>

				{/* Net P&L */}
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border text-center">
					<div className="gap-s-200 flex items-center justify-center">
						<TrendingUp
							className={cn(
								"h-5 w-5",
								netPnl >= 0 ? "text-trade-buy" : "text-trade-sell"
							)}
						/>
						<span
							className={cn(
								"text-h3 font-bold",
								netPnl >= 0 ? "text-trade-buy" : "text-trade-sell"
							)}
						>
							{formatCurrency(netPnl)}
						</span>
					</div>
					<p className="mt-s-100 text-tiny text-txt-300">
						{tCommon("grossCostBreakdown", {
							gross: formatCurrency(grossPnl),
							costs: formatCurrency(-totalCosts),
						})}
					</p>
				</div>
			</div>

			{/* Filter Bar */}
			<div className="gap-s-300 border-bg-300 bg-bg-200 px-s-300 sm:px-m-400 py-s-300 flex min-w-0 flex-wrap items-center justify-between rounded-lg border">
				{/* Filter Buttons */}
				<div className="gap-s-200 flex flex-wrap items-center">
					<span className="text-tiny text-txt-300">
						{tCommon("filterLabel")}
					</span>
					<div className="gap-s-100 flex flex-wrap">
						{(["all", "valid", "warning", "skipped"] as const).map((status) => (
							<button
								key={status}
								type="button"
								onClick={() => onFilterChange(status)}
								className={cn(
									"px-s-300 py-s-100 text-tiny rounded-md font-medium transition-colors",
									filter === status
										? "bg-acc-100 text-bg-100"
										: "bg-bg-300 text-txt-200 hover:bg-bg-100"
								)}
							>
								{status === "all" && tCommon("filterAll")}
								{status === "valid" &&
									tCommon("filterValid", { count: validCount })}
								{status === "warning" &&
									tCommon("filterWarnings", { count: warningCount })}
								{status === "skipped" &&
									tCommon("filterSkipped", { count: skippedCount })}
							</button>
						))}
					</div>
				</div>

				{/* Select All */}
				<div className="gap-s-200 flex items-center">
					<Checkbox
						id="select-all"
						checked={allSelected}
						onCheckedChange={(checked) => onSelectAll(checked === true)}
						disabled={selectableCount === 0}
					/>
					<label
						htmlFor="select-all"
						className="text-small text-txt-200 cursor-pointer"
					>
						{tCommon("selectAllValid", {
							selected: selectedCount,
							total: selectableCount,
						})}
					</label>
				</div>
			</div>
		</div>
	)
}
