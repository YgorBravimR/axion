"use client"

import { CheckCircle2, XCircle, AlertTriangle, TrendingUp } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import type { ProcessedCsvTrade } from "@/app/actions/csv-import"

export type FilterStatus = "all" | "valid" | "warning" | "skipped"

interface CsvImportSummaryProps {
	trades: ProcessedCsvTrade[]
	filter: FilterStatus
	onFilterChange: (filter: FilterStatus) => void
	selectedCount: number
	selectableCount: number
	onSelectAll: (selected: boolean) => void
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

	// Calculate summary stats
	const validCount = trades.filter((t) => t.status === "valid").length
	const warningCount = trades.filter((t) => t.status === "warning").length
	const skippedCount = trades.filter((t) => t.status === "skipped").length

	const grossPnl = trades.reduce((sum, t) => sum + (t.grossPnl || 0), 0)
	const netPnl = trades.reduce((sum, t) => sum + (t.netPnl || 0), 0)
	const totalCosts = trades.reduce((sum, t) => sum + (t.totalCosts || 0), 0)

	const formatCurrency = (value: number) => {
		const formatted = new Intl.NumberFormat("pt-BR", {
			style: "currency",
			currency: "BRL",
			minimumFractionDigits: 2,
		}).format(value)
		return value >= 0 ? `+${formatted}` : formatted
	}

	return (
		<div className="space-y-m-400">
			{/* Stats Cards */}
			<div className="grid grid-cols-2 gap-s-200 sm:gap-s-300 md:grid-cols-4">
				{/* Valid */}
				<button
					type="button"
					onClick={() => onFilterChange(filter === "valid" ? "all" : "valid")}
					className={cn(
						"rounded-lg border p-s-300 sm:p-m-400 text-center transition-all",
						filter === "valid"
							? "border-trade-buy bg-trade-buy/10"
							: "border-bg-300 bg-bg-200 hover:border-trade-buy/50"
					)}
				>
					<div className="flex items-center justify-center gap-s-200">
						<CheckCircle2 className="h-5 w-5 text-trade-buy" />
						<span className="text-h3 font-bold text-trade-buy">{validCount}</span>
					</div>
					<p className="mt-s-100 text-tiny text-txt-300">{t("validTrades")}</p>
				</button>

				{/* Skipped */}
				<button
					type="button"
					onClick={() => onFilterChange(filter === "skipped" ? "all" : "skipped")}
					className={cn(
						"rounded-lg border p-s-300 sm:p-m-400 text-center transition-all",
						filter === "skipped"
							? "border-fb-error bg-fb-error/10"
							: "border-bg-300 bg-bg-200 hover:border-fb-error/50"
					)}
				>
					<div className="flex items-center justify-center gap-s-200">
						<XCircle className="h-5 w-5 text-fb-error" />
						<span className="text-h3 font-bold text-fb-error">{skippedCount}</span>
					</div>
					<p className="mt-s-100 text-tiny text-txt-300">Skipped</p>
				</button>

				{/* Warnings */}
				<button
					type="button"
					onClick={() => onFilterChange(filter === "warning" ? "all" : "warning")}
					className={cn(
						"rounded-lg border p-s-300 sm:p-m-400 text-center transition-all",
						filter === "warning"
							? "border-warning bg-warning/10"
							: "border-bg-300 bg-bg-200 hover:border-warning/50"
					)}
				>
					<div className="flex items-center justify-center gap-s-200">
						<AlertTriangle className="h-5 w-5 text-warning" />
						<span className="text-h3 font-bold text-warning">{warningCount}</span>
					</div>
					<p className="mt-s-100 text-tiny text-txt-300">{t("warnings")}</p>
				</button>

				{/* Net P&L */}
				<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 text-center">
					<div className="flex items-center justify-center gap-s-200">
						<TrendingUp
							className={cn("h-5 w-5", netPnl >= 0 ? "text-trade-buy" : "text-trade-sell")}
						/>
						<span
							className={cn(
								"text-h4 font-bold",
								netPnl >= 0 ? "text-trade-buy" : "text-trade-sell"
							)}
						>
							{formatCurrency(netPnl)}
						</span>
					</div>
					<p className="mt-s-100 text-tiny text-txt-300">
						Gross: {formatCurrency(grossPnl)} | Costs: {formatCurrency(-totalCosts)}
					</p>
				</div>
			</div>

			{/* Filter Bar */}
			<div className="flex flex-wrap items-center justify-between gap-s-300 rounded-lg border border-bg-300 bg-bg-200 px-s-300 sm:px-m-400 py-s-300">
				{/* Filter Buttons */}
				<div className="flex flex-wrap items-center gap-s-200">
					<span className="text-tiny text-txt-300">Filter:</span>
					<div className="flex flex-wrap gap-s-100">
						{(["all", "valid", "warning", "skipped"] as const).map((status) => (
							<button
								key={status}
								type="button"
								onClick={() => onFilterChange(status)}
								className={cn(
									"rounded-md px-s-300 py-s-100 text-tiny font-medium transition-colors",
									filter === status
										? "bg-acc-100 text-bg-100"
										: "bg-bg-300 text-txt-200 hover:bg-bg-100"
								)}
							>
								{status === "all" && "All"}
								{status === "valid" && `Valid (${validCount})`}
								{status === "warning" && `Warnings (${warningCount})`}
								{status === "skipped" && `Skipped (${skippedCount})`}
							</button>
						))}
					</div>
				</div>

				{/* Select All */}
				<div className="flex items-center gap-s-200">
					<Checkbox
						id="select-all"
						checked={allSelected}
						onCheckedChange={(checked) => onSelectAll(checked === true)}
						disabled={selectableCount === 0}
					/>
					<label
						htmlFor="select-all"
						className="cursor-pointer text-small text-txt-200"
					>
						Select All Valid ({selectedCount}/{selectableCount})
					</label>
				</div>
			</div>
		</div>
	)
}
