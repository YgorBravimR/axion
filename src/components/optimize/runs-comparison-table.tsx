"use client"

import { useMemo, useRef } from "react"
import { useTranslations } from "next-intl"
import { DataTable } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCentsAsCurrency } from "@/lib/money"
import { Pin, PinOff, ChevronRight, Trash2, AlertTriangle } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { OptimizationRun } from "@/types/backtest"

interface RunsComparisonTableProps {
	runs: OptimizationRun[]
	expandedRunId: string | null
	onTogglePin: (_runId: string) => void
	onToggleExpand: (_runId: string) => void
	onDelete: (_runId: string) => void
	onUpdateLabel: (_runId: string, _label: string) => void
}

const MIN_TRADES_THRESHOLD = 30

const RunsComparisonTable = ({
	runs,
	expandedRunId,
	onTogglePin,
	onToggleExpand,
	onDelete,
	onUpdateLabel: _onUpdateLabel,
}: RunsComparisonTableProps) => {
	const t = useTranslations("optimize")

	const expandedRunIdRef = useRef(expandedRunId)
	expandedRunIdRef.current = expandedRunId

	// Find best run by profit factor (among runs with enough trades)
	const bestRunId = useMemo(() => {
		const viable = runs.filter(
			(r) => r.summary.totalTrades >= MIN_TRADES_THRESHOLD
		)
		if (viable.length === 0) {
			return null
		}
		return viable.reduce((best, run) =>
			run.summary.profitFactor > best.summary.profitFactor ? run : best
		).id
	}, [runs])

	const columns = useMemo<ColumnDef<OptimizationRun, unknown>[]>(
		() => [
			{
				id: "pin",
				header: "",
				cell: ({ row }) => {
					const run = row.original
					return (
						<Button
							id={`pin-${run.id}`}
							variant="ghost"
							size="sm"
							onClick={() => onTogglePin(run.id)}
							className="h-7 w-7 p-0"
							aria-label={run.pinned ? t("unpinFromChart") : t("pinToChart")}
						>
							{run.pinned ? (
								<Pin className="text-acc-100 h-3.5 w-3.5" aria-hidden="true" />
							) : (
								<PinOff
									className="text-txt-300 h-3.5 w-3.5"
									aria-hidden="true"
								/>
							)}
						</Button>
					)
				},
				enableSorting: false,
				meta: { headerClassName: "w-10", cellClassName: "w-10" },
			},
			{
				accessorKey: "label",
				header: t("labelColumn"),
				cell: ({ row }) => {
					const run = row.original
					const isBest = run.id === bestRunId
					return (
						<div className="gap-s-200 flex items-center">
							<span
								className={`text-small ${isBest ? "text-acc-100 font-medium" : "text-txt-100"}`}
								title={run.label}
							>
								{run.label}
							</span>
							{isBest && (
								<Badge
									id={`best-${run.id}`}
									variant="outline"
									className="border-acc-100 text-acc-100 text-micro px-s-100 py-0"
								>
									{t("bestRun")}
								</Badge>
							)}
							{run.summary.totalTrades < MIN_TRADES_THRESHOLD && (
								<AlertTriangle
									className="text-warning h-3 w-3 shrink-0"
									aria-label={t("lowTradeWarning")}
								/>
							)}
						</div>
					)
				},
				enableSorting: false,
				meta: { cellClassName: "min-w-[140px]" },
			},
			{
				accessorFn: (row) => row.summary.totalTrades,
				id: "totalTrades",
				header: t("trades"),
				cell: ({ getValue }) => (
					<span className="text-small text-txt-100 tabular-nums">
						{getValue<number>()}
					</span>
				),
			},
			{
				accessorFn: (row) => row.summary.winRate,
				id: "winRate",
				header: t("winRate"),
				cell: ({ getValue }) => (
					<span className="text-small text-txt-100 tabular-nums">
						{getValue<number>().toFixed(1)}%
					</span>
				),
			},
			{
				accessorFn: (row) => row.summary.profitFactor,
				id: "profitFactor",
				header: t("profitFactor"),
				cell: ({ getValue }) => (
					<span className="text-small text-txt-100 font-medium tabular-nums">
						{getValue<number>().toFixed(2)}
					</span>
				),
			},
			{
				accessorFn: (row) => row.summary.totalPnlCents,
				id: "totalPnl",
				header: t("totalPnl"),
				cell: ({ getValue }) => {
					const cents = getValue<number>()
					const color =
						cents > 0
							? "text-trade-buy"
							: cents < 0
								? "text-trade-sell"
								: "text-txt-100"
					return (
						<span className={`text-small tabular-nums ${color}`}>
							{formatCentsAsCurrency(cents, "BRL")}
						</span>
					)
				},
			},
			{
				accessorFn: (row) => row.summary.maxDrawdownCents,
				id: "maxDrawdown",
				header: t("maxDD"),
				cell: ({ getValue }) => (
					<span className="text-small text-trade-sell tabular-nums">
						{formatCentsAsCurrency(getValue<number>(), "BRL")}
					</span>
				),
			},
			{
				accessorFn: (row) => row.summary.sharpeRatio,
				id: "sharpe",
				header: t("sharpe"),
				cell: ({ getValue }) => (
					<span className="text-small text-txt-100 tabular-nums">
						{getValue<number>().toFixed(2)}
					</span>
				),
			},
			{
				accessorFn: (row) => row.summary.avgRMultiple,
				id: "avgR",
				header: t("avgR"),
				cell: ({ getValue }) => {
					const value = getValue<number>()
					const color =
						value > 0
							? "text-trade-buy"
							: value < 0
								? "text-trade-sell"
								: "text-txt-100"
					return (
						<span className={`text-small tabular-nums ${color}`}>
							{value.toFixed(2)}R
						</span>
					)
				},
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => {
					const run = row.original
					const isExpanded = run.id === expandedRunIdRef.current
					return (
						<div className="gap-s-100 flex items-center">
							<Button
								id={`expand-${run.id}`}
								variant="ghost"
								size="sm"
								onClick={() => onToggleExpand(run.id)}
								className="h-7 w-7 p-0"
								aria-label={t("expandRun")}
							>
								<ChevronRight
									className={`text-txt-300 h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
									aria-hidden="true"
								/>
							</Button>
							<Button
								id={`delete-${run.id}`}
								variant="ghost"
								size="sm"
								onClick={() => onDelete(run.id)}
								className="text-txt-300 hover:text-fb-error h-7 w-7 p-0"
								aria-label={t("deleteRun")}
							>
								<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
							</Button>
						</div>
					)
				},
				enableSorting: false,
				meta: { headerClassName: "w-20", cellClassName: "w-20" },
			},
		],
		[bestRunId, onTogglePin, onToggleExpand, onDelete, t]
	)

	return <DataTable columns={columns} data={runs} pageSize={20} striped />
}

export { RunsComparisonTable }
