"use client"

import { memo, useMemo } from "react"
import { useTranslations } from "next-intl"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { formatCentsAsCurrency } from "@/lib/money"
import { computeTierBreakdown } from "@/lib/backtest/tier-analytics"
import type { BacktestTrade, QualityTier } from "@/types/backtest"

interface BacktestTierBreakdownProps {
	trades: BacktestTrade[]
	currency?: string
}

// Color tokens per tier — keep consistent with the trades table tier column.
// AAA = strongest signal → trade-buy palette; B = weakest → trade-sell; A/AA
// land in between via neutral semantic tones.
const TIER_TONE: Record<QualityTier | "untiered", string> = {
	AAA: "bg-trade-buy/15 text-trade-buy border-trade-buy/30",
	AA: "bg-acc-100/15 text-acc-100 border-acc-100/30",
	A: "bg-txt-200/15 text-txt-100 border-txt-200/30",
	B: "bg-trade-sell/15 text-trade-sell border-trade-sell/30",
	untiered: "bg-bg-300 text-txt-300 border-bg-300",
}

const BacktestTierBreakdown = memo(
	({ trades, currency = "BRL" }: BacktestTierBreakdownProps) => {
		const t = useTranslations("backtest.tierBreakdown")

		// Pure derivation; cheap enough not to need explicit memoization,
		// but trades can be large arrays so let's avoid re-running on every
		// unrelated parent render.
		const rows = useMemo(() => computeTierBreakdown(trades), [trades])

		if (rows.length === 0) {
			return null
		}

		return (
			<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
				<div className="mb-s-300">
					<h3 className="text-h3 text-txt-100 font-semibold">{t("title")}</h3>
					<p className="text-small text-txt-300 mt-s-100">{t("hint")}</p>
				</div>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("tier")}</TableHead>
								<TableHead className="text-right">{t("count")}</TableHead>
								<TableHead className="text-right">{t("winRate")}</TableHead>
								<TableHead className="text-right">{t("avgR")}</TableHead>
								<TableHead className="text-right">{t("pnl")}</TableHead>
								<TableHead className="text-right">{t("maxDrawdown")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.tier}>
									<TableCell>
										<span
											className={`px-s-300 py-s-100 text-tiny inline-flex items-center rounded-full border font-mono font-medium ${TIER_TONE[row.tier]}`}
										>
											{row.tier === "untiered" ? t("untiered") : row.tier}
										</span>
									</TableCell>
									<TableCell className="text-txt-200 text-right font-mono">
										{row.count}
									</TableCell>
									<TableCell className="text-txt-100 text-right font-mono">
										{row.winRate}%
									</TableCell>
									<TableCell
										className={`text-right font-mono ${
											row.avgRMultiple > 0
												? "text-trade-buy"
												: row.avgRMultiple < 0
													? "text-trade-sell"
													: "text-txt-200"
										}`}
									>
										{row.avgRMultiple > 0 ? "+" : ""}
										{row.avgRMultiple}R
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
									<TableCell className="text-trade-sell text-right font-mono">
										{formatCentsAsCurrency(row.maxDrawdownCents, currency)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</div>
		)
	}
)
BacktestTierBreakdown.displayName = "BacktestTierBreakdown"

export { BacktestTierBreakdown, TIER_TONE }
