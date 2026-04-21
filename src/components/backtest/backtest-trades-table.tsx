"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { DataTable } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { formatCentsAsCurrency } from "@/lib/money"
import type { ColumnDef } from "@tanstack/react-table"
import type { BacktestTrade } from "@/types/backtest"

interface BacktestTradesTableProps {
	trades: BacktestTrade[]
}

const BacktestTradesTable = ({ trades }: BacktestTradesTableProps) => {
	const t = useTranslations("backtest.table")
	const tReasons = useTranslations("backtest.exitReasons")
	const tResults = useTranslations("backtest.results")

	const columns: ColumnDef<BacktestTrade>[] = useMemo(
		() => [
			{
				accessorKey: "id",
				header: t("trade"),
				cell: ({ row }) => (
					<span className="font-mono text-txt-200">{row.original.id}</span>
				),
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
						<span className={`inline-flex items-center rounded-full px-s-300 py-s-100 text-tiny font-medium ${
							isLong ? "bg-action-buy/15 text-action-buy" : "bg-action-sell/15 text-action-sell"
						}`}>
							{isLong ? "LONG" : "SHORT"}
						</span>
					)
				},
				enableSorting: false,
			},
			{
				accessorKey: "entryPrice",
				header: () => <span className="flex justify-end">{t("entry")}</span>,
				cell: ({ row }) => (
					<span className="flex justify-end font-mono text-txt-100">
						{row.original.entryPrice.toLocaleString()}
					</span>
				),
			},
			{
				accessorKey: "exitPrice",
				header: () => <span className="flex justify-end">{t("exit")}</span>,
				cell: ({ row }) => (
					<span className="flex justify-end font-mono text-txt-100">
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
			},
			{
				accessorKey: "contracts",
				header: () => <span className="flex justify-end">{t("contracts")}</span>,
				cell: ({ row }) => (
					<span className="flex justify-end font-mono text-txt-200">
						{row.original.contracts}
					</span>
				),
			},
			{
				accessorKey: "netPnlCents",
				header: () => <span className="flex justify-end">{t("pnl")}</span>,
				cell: ({ row }) => {
					const pnl = row.original.netPnlCents
					return (
						<span className={`flex justify-end font-mono font-medium ${
							pnl > 0 ? "text-trade-buy" : pnl < 0 ? "text-trade-sell" : "text-txt-200"
						}`}>
							{formatCentsAsCurrency(pnl, "BRL")}
						</span>
					)
				},
			},
			{
				accessorKey: "rMultiple",
				header: () => <span className="flex justify-end">{t("rMultiple")}</span>,
				cell: ({ row }) => {
					const r = row.original.rMultiple
					return (
						<span className={`flex justify-end font-mono font-medium ${
							r > 0 ? "text-trade-buy" : r < 0 ? "text-trade-sell" : "text-txt-200"
						}`}>
							{r > 0 ? "+" : ""}{r}R
						</span>
					)
				},
			},
		],
		[t, tReasons]
	)

	return (
		<div className="border-bg-300 bg-bg-200 rounded-lg border p-m-400">
			<h3 className="text-h3 font-semibold text-txt-100 mb-m-400">
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
