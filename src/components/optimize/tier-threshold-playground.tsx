"use client"

import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import {
	computeTierBreakdown,
	DEFAULT_TIER_THRESHOLDS,
} from "@/lib/backtest/tier-analytics"
import { formatCentsAsCurrency } from "@/lib/money"
import type { BacktestTrade, TierThresholds } from "@/types/backtest"

interface TierThresholdPlaygroundProps {
	trades: BacktestTrade[]
	currency?: string
}

const TierThresholdPlayground = ({
	trades,
	currency = "BRL",
}: TierThresholdPlaygroundProps) => {
	const t = useTranslations("optimize.tierPlayground")
	const [thresholds, setThresholds] = useState<TierThresholds>(
		DEFAULT_TIER_THRESHOLDS
	)

	// Recompute breakdown when thresholds change.
	const rows = useMemo(
		() => computeTierBreakdown(trades, thresholds),
		[trades, thresholds]
	)

	// Enforce constraint: AAA >= AA >= A
	const handleThresholdChange = (
		tier: keyof TierThresholds,
		newValue: number
	) => {
		const updated: TierThresholds = { ...thresholds, [tier]: newValue }

		// Enforce ordering: AAA >= AA >= A
		if (tier === "AAA") {
			if (updated.AA > updated.AAA) {
				updated.AA = updated.AAA
			}
			if (updated.A > updated.AAA) {
				updated.A = updated.AAA
			}
		} else if (tier === "AA") {
			if (updated.AAA < updated.AA) {
				updated.AAA = updated.AA
			}
			if (updated.A > updated.AA) {
				updated.A = updated.AA
			}
		} else if (tier === "A") {
			if (updated.AA < updated.A) {
				updated.AA = updated.A
			}
			if (updated.AAA < updated.AA) {
				updated.AAA = updated.AA
			}
		}

		setThresholds(updated)
	}

	const handleReset = () => {
		setThresholds(DEFAULT_TIER_THRESHOLDS)
	}

	return (
		<div className="bg-bg-100/50 gap-s-300 p-s-300 space-y-m-400 rounded-lg">
			{/* Header */}
			<div className="border-bg-300 pb-s-300 border-b">
				<h3 className="text-h3 text-txt-100 font-semibold">{t("title")}</h3>
				<p className="text-small text-txt-300 mt-s-100">{t("subtitle")}</p>
			</div>

			{/* Sliders */}
			<div className="gap-m-400 grid sm:grid-cols-3">
				{(["AAA", "AA", "A"] as const).map((tierKey) => (
					<div key={tierKey} className="space-y-s-200">
						<Label id={`threshold-${tierKey}`} className="text-small" filled>
							{t(tierKey.toLowerCase())}
						</Label>
						<Input
							id={`threshold-${tierKey}`}
							type="range"
							min={-5}
							max={10}
							step={1}
							value={thresholds[tierKey]}
							onChange={(e) =>
								handleThresholdChange(tierKey, parseInt(e.target.value, 10))
							}
							className="h-2 cursor-pointer"
						/>
						<div className="text-small text-txt-200 text-center font-mono">
							{thresholds[tierKey]}
						</div>
					</div>
				))}
			</div>

			{/* Reset button */}
			<div className="flex justify-end">
				<Button
					id="reset-thresholds"
					variant="ghost"
					size="sm"
					onClick={handleReset}
				>
					{t("reset")}
				</Button>
			</div>

			{/* Tier breakdown table */}
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("tier")}</TableHead>
							<TableHead className="text-right">{t("count")}</TableHead>
							<TableHead className="text-right">{t("winRate")}</TableHead>
							<TableHead className="text-right">{t("pnl")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.tier}>
								<TableCell className="text-small font-mono">
									{row.tier === "untiered" ? "—" : row.tier}
								</TableCell>
								<TableCell className="text-right font-mono">
									{row.count}
								</TableCell>
								<TableCell className="text-right font-mono">
									{row.winRate.toFixed(1)}%
								</TableCell>
								<TableCell
									className={`text-right font-mono ${
										row.totalPnlCents > 0
											? "text-trade-buy"
											: row.totalPnlCents < 0
												? "text-trade-sell"
												: "text-txt-200"
									}`}
								>
									{formatCentsAsCurrency(row.totalPnlCents, currency)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	)
}

export { TierThresholdPlayground }
