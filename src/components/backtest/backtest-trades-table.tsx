"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { LineChart } from "lucide-react"
import { DataTable } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCentsAsCurrency } from "@/lib/money"
import type { ColumnDef } from "@tanstack/react-table"
import type { BacktestTrade } from "@/types/backtest"

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
		[t, tReasons, tResults, onTradeView]
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
		</div>
	)
}

export { BacktestTradesTable }
