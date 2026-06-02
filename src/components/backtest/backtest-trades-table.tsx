"use client"

import { useMemo, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { LineChart } from "lucide-react"
import { DataTable } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCentsAsCurrency } from "@/lib/money"
import type { ColumnDef } from "@tanstack/react-table"
import type { BacktestTrade } from "@/types/backtest"
import { TIER_TONE } from "./backtest-tier-breakdown"
import { BacktestQualityDrawer } from "./backtest-quality-drawer"

interface BacktestTradesTableProps {
	trades: BacktestTrade[]
	currency?: string
	onTradeView?: (_trade: BacktestTrade) => void
}

const BacktestTradesTable = ({
	trades,
	currency = "BRL",
	onTradeView,
}: BacktestTradesTableProps) => {
	const t = useTranslations("backtest.table")
	const tReasons = useTranslations("backtest.exitReasons")
	const tResults = useTranslations("backtest.results")
	const tCommon = useTranslations("common")

	// Local state for the quality drawer. Kept here (not lifted) because the
	// only consumer is this table — no other component needs to know which
	// trade's contributions are open.
	const [qualityTrade, setQualityTrade] = useState<BacktestTrade | null>(null)
	const handleDrawerChange = useCallback((open: boolean) => {
		if (!open) {
			setQualityTrade(null)
		}
	}, [])

	// Show tier + score columns only when at least one trade carries quality
	// data. Other strategies (orb, dezk) emit trades without quality, so the
	// columns would be all-blank dead weight.
	const hasQuality = useMemo(
		() => trades.some((tr) => tr.quality !== undefined),
		[trades]
	)

	const columns: ColumnDef<BacktestTrade>[] = useMemo(
		() => [
			{
				accessorKey: "id",
				header: t("trade"),
				cell: ({ row }) => (
					<span className="text-txt-200 font-mono">{row.original.id}</span>
				),
				meta: {
					headerClassName: "hidden sm:table-cell",
					cellClassName: "hidden sm:table-cell",
				},
			},
			{
				accessorKey: "dayKey",
				header: t("day"),
				cell: ({ row }) => (
					<span className="text-txt-200">{row.original.dayKey}</span>
				),
			},
			{
				accessorKey: "direction",
				header: t("direction"),
				cell: ({ row }) => {
					const isLong = row.original.direction === "long"
					return (
						<span
							className={`px-s-300 py-s-100 text-tiny inline-flex items-center rounded-full font-medium ${
								isLong
									? "bg-action-buy/15 text-action-buy"
									: "bg-action-sell/15 text-action-sell"
							}`}
						>
							{(isLong ? tCommon("long") : tCommon("short")).toUpperCase()}
						</span>
					)
				},
				enableSorting: false,
			},
			...(hasQuality
				? ([
						{
							id: "tier",
							accessorFn: (row) => row.quality?.tier ?? "",
							header: t("tier"),
							cell: ({ row }) => {
								const q = row.original.quality
								if (!q) {
									return <span className="text-txt-300 text-tiny">—</span>
								}
								return (
									<button
										id={`btn-trade-tier-${row.original.id}`}
										type="button"
										onClick={() => setQualityTrade(row.original)}
										aria-label={t("openQualityDrawer", { id: row.original.id })}
										className={`px-s-300 py-s-100 text-tiny focus-visible:outline-acc-100 inline-flex items-center rounded-full border font-mono font-medium transition-opacity hover:opacity-80 focus-visible:outline-1 focus-visible:outline-offset-1 ${TIER_TONE[q.tier]}`}
									>
										{q.tier}
									</button>
								)
							},
							meta: {
								headerClassName: "hidden md:table-cell",
								cellClassName: "hidden md:table-cell",
							},
						},
						{
							id: "score",
							accessorFn: (row) => row.quality?.score ?? 0,
							header: () => (
								<span className="flex justify-end">{t("score")}</span>
							),
							cell: ({ row }) => {
								const q = row.original.quality
								if (!q) {
									return (
										<span className="text-txt-300 flex justify-end font-mono">
											—
										</span>
									)
								}
								return (
									<span
										className={`flex justify-end font-mono font-medium ${
											q.score > 0
												? "text-trade-buy"
												: q.score < 0
													? "text-trade-sell"
													: "text-txt-200"
										}`}
									>
										{q.score > 0 ? "+" : ""}
										{q.score}
									</span>
								)
							},
							meta: {
								headerClassName: "hidden lg:table-cell",
								cellClassName: "hidden lg:table-cell",
							},
						},
					] satisfies ColumnDef<BacktestTrade>[])
				: []),
			{
				accessorKey: "entryPrice",
				header: () => <span className="flex justify-end">{t("entry")}</span>,
				cell: ({ row }) => (
					<span className="text-txt-100 flex justify-end font-mono">
						{row.original.entryPrice.toLocaleString()}
					</span>
				),
			},
			{
				accessorKey: "exitPrice",
				header: () => <span className="flex justify-end">{t("exit")}</span>,
				cell: ({ row }) => (
					<span className="text-txt-100 flex justify-end font-mono">
						{row.original.exitPrice.toLocaleString()}
					</span>
				),
			},
			{
				accessorKey: "exitReason",
				header: t("reason"),
				cell: ({ row }) => (
					<Badge
						id={`badge-trade-reason-${row.original.id}`}
						variant="outline"
						className="text-tiny"
					>
						{tReasons(row.original.exitReason)}
					</Badge>
				),
				enableSorting: false,
				meta: {
					headerClassName: "hidden md:table-cell",
					cellClassName: "hidden md:table-cell",
				},
			},
			{
				accessorKey: "contracts",
				header: () => (
					<span className="flex justify-end">{t("contracts")}</span>
				),
				cell: ({ row }) => (
					<span className="text-txt-200 flex justify-end font-mono">
						{row.original.contracts}
					</span>
				),
				meta: {
					headerClassName: "hidden lg:table-cell",
					cellClassName: "hidden lg:table-cell",
				},
			},
			{
				accessorKey: "netPnlCents",
				header: () => <span className="flex justify-end">{t("pnl")}</span>,
				cell: ({ row }) => {
					const pnl = row.original.netPnlCents
					return (
						<span
							className={`flex justify-end font-mono font-medium ${
								pnl > 0
									? "text-trade-buy"
									: pnl < 0
										? "text-trade-sell"
										: "text-txt-200"
							}`}
						>
							{formatCentsAsCurrency(pnl, currency)}
						</span>
					)
				},
			},
			{
				accessorKey: "rMultiple",
				header: () => (
					<span className="flex justify-end">{t("rMultiple")}</span>
				),
				cell: ({ row }) => {
					const r = row.original.rMultiple
					return (
						<span
							className={`flex justify-end font-mono font-medium ${
								r > 0
									? "text-trade-buy"
									: r < 0
										? "text-trade-sell"
										: "text-txt-200"
							}`}
						>
							{r > 0 ? "+" : ""}
							{r}R
						</span>
					)
				},
			},
			...(onTradeView
				? [
						{
							id: "view",
							header: () => <span className="sr-only">{t("viewChart")}</span>,
							cell: ({ row }) => (
								<div className="flex justify-end">
									<Button
										id={`btn-view-trade-${row.original.id}`}
										type="button"
										variant="ghost"
										size="sm"
										aria-label={t("viewChart")}
										onClick={() => onTradeView(row.original)}
									>
										<LineChart className="h-4 w-4" aria-hidden="true" />
									</Button>
								</div>
							),
							enableSorting: false,
						} satisfies ColumnDef<BacktestTrade>,
					]
				: []),
		],
		[t, tReasons, tCommon, onTradeView, hasQuality, currency]
	)

	return (
		<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
			<h3 className="text-h3 text-txt-100 mb-m-400 font-semibold">
				{tResults("tradeList")}
			</h3>
			<div className="overflow-x-auto">
				<DataTable
					columns={columns}
					data={trades}
					emptyMessage={t("noTrades")}
					pageSize={20}
				/>
			</div>
			<BacktestQualityDrawer
				trade={qualityTrade}
				onOpenChange={handleDrawerChange}
			/>
		</div>
	)
}

export { BacktestTradesTable }
