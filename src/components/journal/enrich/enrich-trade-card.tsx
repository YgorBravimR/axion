"use client"

import type { DryRunSnapshotHydrated } from "@/app/actions/enrichment.types"
import { useTranslations } from "next-intl"
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EnrichPassCard } from "./enrich-pass-card"

interface EnrichTradeCardProps {
	snapshot: DryRunSnapshotHydrated
	acceptedFields: Set<string>
	rejectedFields: Set<string>
	onToggleField: (
		_field: string,
		_state: "accepted" | "rejected" | "neither"
	) => void
	onAcceptAll: () => void
	onRejectAll: () => void
}

// trade.pnl is stored as integer CENTS — divide before formatting as currency.
const formatPnL = (cents: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
		signDisplay: "always",
	}).format(cents / 100)

const formatTime = (date: Date): string => {
	return date.toLocaleTimeString("pt-BR", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	})
}

export const EnrichTradeCard = ({
	snapshot,
	acceptedFields,
	rejectedFields,
	onToggleField,
	onAcceptAll,
	onRejectAll,
}: EnrichTradeCardProps) => {
	const t = useTranslations()

	const trade = snapshot.dryRun.trade
	const dryRun = snapshot.dryRun

	const direction = trade.direction?.toUpperCase() ?? null
	const entryTime = trade.entryDate
		? formatTime(new Date(trade.entryDate))
		: "—"
	const exitTime = trade.exitDate ? formatTime(new Date(trade.exitDate)) : "—"
	const pnlValue = Number(trade.pnl ?? 0)
	const pnlFormatted = formatPnL(pnlValue)
	const qty = trade.positionSize != null ? Number(trade.positionSize) : null

	// Determine state for each pass
	const passNames = [
		"operations",
		"candleMath",
		"indicatorReadout",
		"deterministicSlTarget",
	] as const

	const directionColor =
		direction === "LONG"
			? "var(--color-trade-buy)"
			: direction === "SHORT"
				? "var(--color-trade-sell)"
				: null

	return (
		<div className="space-y-m-400">
			{/* Trade header card */}
			<Card id="trade-header" className="overflow-hidden">
				<CardHeader className="p-m-500">
					<div className="gap-m-400 flex items-start justify-between">
						<div className="gap-s-200 flex flex-col">
							<div className="gap-s-300 flex flex-wrap items-center">
								<CardTitle className="text-h3 leading-none font-bold">
									{trade.asset}
								</CardTitle>
								{direction && directionColor && (
									<Badge
										id={`direction-${direction}`}
										className="border-transparent text-white"
										style={{ backgroundColor: directionColor }}
									>
										{direction}
									</Badge>
								)}
								{qty != null && (
									<span className="text-small text-txt-300">
										{t("journal.enrichment.review.contracts", { count: qty })}
									</span>
								)}
							</div>
							<CardDescription className="gap-s-300 flex flex-wrap items-center">
								<span>
									{entryTime} → {exitTime}
								</span>
								{pnlValue !== 0 && (
									<span
										className="font-semibold"
										style={{
											color:
												pnlValue > 0
													? "var(--color-trade-buy)"
													: "var(--color-fb-error)",
										}}
									>
										{pnlFormatted}
									</span>
								)}
							</CardDescription>
						</div>
						<div className="gap-s-200 flex shrink-0">
							<Button
								id="trade-header-reject-all"
								variant="ghost"
								size="sm"
								onClick={onRejectAll}
								className="text-txt-300"
							>
								{t("journal.enrichment.passActions.rejectAll")}
							</Button>
							<Button
								id="trade-header-accept-all"
								variant="outline"
								size="sm"
								onClick={onAcceptAll}
							>
								{t("journal.enrichment.passActions.acceptAll")}
							</Button>
						</div>
					</div>
				</CardHeader>
			</Card>

			{passNames.map((passName) => {
				const delta = dryRun.passes[passName]
				return (
					<EnrichPassCard
						key={passName}
						passName={passName}
						delta={delta}
						baseline={snapshot.baseline ?? {}}
						acceptedFields={acceptedFields}
						rejectedFields={rejectedFields}
						onToggleField={onToggleField}
					/>
				)
			})}
		</div>
	)
}
