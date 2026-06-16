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

const formatPnL = (value: number): string => {
	const formatted = new Intl.NumberFormat("pt-BR", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
		signDisplay: "always",
	}).format(value)

	return formatted
}

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

	const direction = trade.direction?.toUpperCase() || "—"
	const entryTime = formatTime(new Date(trade.entryAt))
	const exitTime = trade.exitAt ? formatTime(new Date(trade.exitAt)) : "—"
	const pnlValue = trade.pnl ?? 0
	const pnlFormatted = formatPnL(pnlValue)

	// Determine state for each pass
	const passNames = [
		"operations",
		"candleMath",
		"indicatorReadout",
		"deterministicSlTarget",
	] as const

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
			{/* Trade header card */}
			<Card id="trade-header">
				<CardHeader>
					<div className="gap-m-400 flex items-start justify-between">
						<div className="gap-s-200 flex flex-col">
							<div className="gap-s-200 flex items-center">
								<CardTitle>{trade.asset}</CardTitle>
								<Badge
									id={`direction-${direction}`}
									variant={direction === "LONG" ? "default" : "secondary"}
								>
									{direction}
								</Badge>
								{trade.qty && (
									<span className="text-small text-txt-200">
										qty {new Intl.NumberFormat("pt-BR").format(trade.qty)}
									</span>
								)}
							</div>
							<CardDescription>
								{entryTime} → {exitTime}
								{pnlValue !== 0 && (
									<span
										className="ml-m-400 font-medium"
										style={{
											color:
												pnlValue > 0
													? "var(--color-trade-buy)"
													: "var(--color-fb-error)",
										}}
									>
										{pnlFormatted} BRL
									</span>
								)}
							</CardDescription>
						</div>
						<div className="gap-s-200 flex">
							<Button
								id="trade-header-accept-all"
								variant="outline"
								size="sm"
								onClick={onAcceptAll}
							>
								{t("journal.enrichment.passActions.acceptAll")}
							</Button>
							<Button
								id="trade-header-reject-all"
								variant="outline"
								size="sm"
								onClick={onRejectAll}
							>
								{t("journal.enrichment.passActions.rejectAll")}
							</Button>
						</div>
					</div>
				</CardHeader>
			</Card>

			{/* Pass cards */}
			{passNames.map((passName) => {
				const delta = dryRun.passes[passName]
				const baselineData = snapshot.baseline[passName] || {}

				return (
					<EnrichPassCard
						key={passName}
						passName={passName}
						delta={delta}
						baseline={baselineData}
						acceptedFields={acceptedFields}
						rejectedFields={rejectedFields}
						onToggleField={onToggleField}
					/>
				)
			})}
		</div>
	)
}
