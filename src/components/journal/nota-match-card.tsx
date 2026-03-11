"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, RefreshCw, HelpCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { EnrichmentMatch, NotaFill } from "@/lib/nota-parser/types"

interface NotaMatchCardProps {
	match: EnrichmentMatch
	isSelected: boolean
	reEnrich: boolean
	onToggleSelect: () => void
	onToggleReEnrich: () => void
}

const statusConfig = {
	matched: { color: "text-trade-buy", bg: "bg-trade-buy/10", border: "border-trade-buy/30", icon: CheckCircle2 },
	ambiguous: { color: "text-warning", bg: "bg-warning/10", border: "border-warning/30", icon: HelpCircle },
	already_enriched: { color: "text-txt-300", bg: "bg-bg-300/30", border: "border-bg-300", icon: RefreshCw },
	quantity_mismatch: { color: "text-warning", bg: "bg-warning/10", border: "border-warning/30", icon: AlertTriangle },
	price_mismatch: { color: "text-warning", bg: "bg-warning/10", border: "border-warning/30", icon: AlertTriangle },
}

const FillRow = ({ fill, t }: { fill: NotaFill; t: ReturnType<typeof useTranslations> }) => (
	<tr className="border-bg-300 border-b last:border-b-0">
		<td className="py-s-100 px-s-200 text-tiny">
			<span className={fill.side === "C" ? "text-action-buy" : "text-action-sell"}>
				{fill.side === "C" ? t("buy") : t("sell")}
			</span>
		</td>
		<td className="py-s-100 px-s-200 text-tiny text-txt-200 text-right">{fill.quantity}</td>
		<td className="py-s-100 px-s-200 text-tiny text-txt-200 text-right">
			{fill.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
		</td>
		<td className="py-s-100 px-s-200 text-tiny text-txt-300 text-right">
			{fill.operationalFee > 0 ? fill.operationalFee.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "-"}
		</td>
		<td className="py-s-100 px-s-200 text-tiny text-txt-300 text-right">
			{fill.isDayTrade && (
				<span className="bg-acc-100/20 text-acc-100 px-s-100 rounded text-micro font-medium">{t("dayTrade")}</span>
			)}
		</td>
	</tr>
)

const FillTable = ({ fills, label, t }: { fills: NotaFill[]; label: string; t: ReturnType<typeof useTranslations> }) => {
	if (fills.length === 0) return null

	const totalQty = fills.reduce((s, f) => s + f.quantity, 0)
	const weightedAvg = totalQty > 0
		? fills.reduce((s, f) => s + f.price * f.quantity, 0) / totalQty
		: 0

	return (
		<div className="mt-s-200">
			<div className="mb-s-100 flex items-center justify-between">
				<span className="text-tiny text-txt-300 font-medium uppercase tracking-wide">{label}</span>
				<span className="text-tiny text-txt-200">
					{t("avgPrice")}: {weightedAvg.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | {t("totalQty")}: {totalQty}
				</span>
			</div>
			<table className="w-full">
				<thead>
					<tr className="border-bg-300 border-b">
						<th className="py-s-100 px-s-200 text-tiny text-txt-300 text-left font-medium">{t("side")}</th>
						<th className="py-s-100 px-s-200 text-tiny text-txt-300 text-right font-medium">{t("qty")}</th>
						<th className="py-s-100 px-s-200 text-tiny text-txt-300 text-right font-medium">{t("price")}</th>
						<th className="py-s-100 px-s-200 text-tiny text-txt-300 text-right font-medium">{t("fee")}</th>
						<th className="py-s-100 px-s-200 text-tiny text-txt-300 text-right font-medium" />
					</tr>
				</thead>
				<tbody>
					{fills.map((fill, idx) => (
						<FillRow key={`${fill.sequenceNumber}-${idx}`} fill={fill} t={t} />
					))}
				</tbody>
			</table>
		</div>
	)
}

const NotaMatchCard = ({
	match,
	isSelected,
	reEnrich,
	onToggleSelect,
	onToggleReEnrich,
}: NotaMatchCardProps) => {
	const t = useTranslations("journal.nota")
	const tCommon = useTranslations("common")
	const [isExpanded, setIsExpanded] = useState(false)

	const config = statusConfig[match.status]
	const StatusIcon = config.icon
	const isSelectable = match.status === "matched" || match.status === "quantity_mismatch" || match.status === "price_mismatch"
	const isEnriched = match.status === "already_enriched"

	const handleToggleExpand = () => {
		setIsExpanded((prev) => !prev)
	}

	return (
		<div className={cn("rounded-lg border transition-colors", config.border, isSelected ? config.bg : "bg-bg-200")}>
			{/* Header */}
			<div className="p-s-300 sm:p-m-400 flex items-center gap-s-200 sm:gap-m-400">
				{/* Checkbox */}
				{(isSelectable || isEnriched) && (
					<input
						type="checkbox"
						checked={isEnriched ? reEnrich : isSelected}
						onChange={isEnriched ? onToggleReEnrich : onToggleSelect}
						className="accent-acc-100 h-4 w-4 shrink-0 rounded"
						aria-label={`Select trade ${match.trade.asset}`}
					/>
				)}

				{/* Status icon */}
				<StatusIcon className={cn("h-4 w-4 shrink-0", config.color)} />

				{/* Trade info */}
				<div className="flex-1 min-w-0">
					<div className="flex flex-wrap items-center gap-s-200">
						<span className="text-small text-txt-100 font-semibold">{match.trade.asset}</span>
						<span className={cn(
							"text-tiny px-s-100 rounded font-medium",
							match.trade.direction === "long" ? "bg-action-buy-muted text-action-buy" : "bg-action-sell-muted text-action-sell"
						)}>
							{match.trade.direction === "long" ? tCommon("long") : tCommon("short")}
						</span>
						<span className={cn("text-tiny px-s-100 rounded font-medium", config.bg, config.color)}>
							{t(match.status === "already_enriched" ? "alreadyEnriched" :
								match.status === "quantity_mismatch" ? "quantityMismatch" :
								match.status === "price_mismatch" ? "priceMismatch" :
								match.status)}
						</span>
					</div>
					{match.message && (
						<p className="text-tiny text-txt-300 mt-s-100">{match.message}</p>
					)}
				</div>

				{/* Price comparison */}
				<div className="text-right shrink-0">
					<div className="text-tiny text-txt-300">
						{t("currentValue")}: {match.trade.entryPrice}
					</div>
					<div className="text-tiny text-txt-200">
						{t("notaValue")}: {match.computedAvgEntry.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
					</div>
					{match.priceDeltaPercent > 0 && (
						<div className="text-tiny text-warning">
							{t("delta")}: {match.priceDeltaPercent.toFixed(2)}%
						</div>
					)}
				</div>

				{/* Re-enrich label for enriched trades */}
				{isEnriched && (
					<span className="text-tiny text-txt-300 shrink-0">{t("reEnrich")}</span>
				)}

				{/* Expand button */}
				<button
					type="button"
					onClick={handleToggleExpand}
					className="text-txt-300 hover:text-txt-100 shrink-0 p-s-100 transition-colors"
					aria-label={tCommon("toggleDetails")}
					aria-expanded={isExpanded}
				>
					{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
				</button>
			</div>

			{/* Expanded fill details */}
			{isExpanded && (
				<div className="border-bg-300 px-s-300 pb-s-300 sm:px-m-400 sm:pb-m-400 border-t pt-s-300 sm:pt-m-400">
					<FillTable fills={match.entryFills} label={t("entryFills")} t={t} />
					<FillTable fills={match.exitFills} label={t("exitFills")} t={t} />
					{match.entryFills.length === 0 && match.exitFills.length === 0 && (
						<p className="text-tiny text-txt-300 text-center py-m-400">{t("noFillsFound")}</p>
					)}
				</div>
			)}
		</div>
	)
}

export { NotaMatchCard }
