"use client"

import { useMemo, useRef } from "react"
import { useTranslations } from "next-intl"
import { DataTable } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCentsAsCurrency } from "@/lib/money"
import {
	Pin,
	PinOff,
	ChevronRight,
	Trash2,
	AlertTriangle,
	Info,
} from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { OptimizationRun } from "@/types/backtest"

interface RunsComparisonTableProps {
	runs: OptimizationRun[]
	expandedRunId: string | null
	onTogglePin: (_runId: string) => void
	onToggleExpand: (_runId: string) => void
	onDelete: (_runId: string) => void
	onUpdateLabel: (_runId: string, _label: string) => void
	robustFilterEnabled?: boolean
	onRobustFilterChange?: (_enabled: boolean) => void
	selectedRunIds?: Set<string>
	onToggleSelect?: (_runId: string) => void
	onSelectAll?: (_visibleRunIds: string[]) => void
}

const MIN_TRADES_THRESHOLD = 30

const RunsComparisonTable = ({
	runs,
	expandedRunId,
	onTogglePin,
	onToggleExpand,
	onDelete,
	onUpdateLabel: _onUpdateLabel,
	robustFilterEnabled = false,
	onRobustFilterChange,
	selectedRunIds,
	onToggleSelect,
	onSelectAll,
}: RunsComparisonTableProps) => {
	const t = useTranslations("optimize")

	// Filter runs based on robustness setting
	const filteredRuns = useMemo(() => {
		if (!robustFilterEnabled) {
			return runs
		}
		// Keep runs with OOS data + robust flag true, OR runs without OOS data (legacy)
		return runs.filter((r) => r.oosRobust === true || r.summaryIS === undefined)
	}, [runs, robustFilterEnabled])

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

	const selectionEnabled =
		selectedRunIds !== undefined && onToggleSelect !== undefined
	const visibleRunIds = useMemo(
		() => filteredRuns.map((r) => r.id),
		[filteredRuns]
	)
	const allVisibleSelected =
		selectionEnabled &&
		visibleRunIds.length > 0 &&
		visibleRunIds.every((id) => selectedRunIds.has(id))
	const someVisibleSelected =
		selectionEnabled &&
		!allVisibleSelected &&
		visibleRunIds.some((id) => selectedRunIds.has(id))

	const columns = useMemo<ColumnDef<OptimizationRun, unknown>[]>(
		() => [
			...(selectionEnabled
				? [
						{
							id: "select",
							header: () => (
								<Checkbox
									id="select-all-runs"
									checked={
										allVisibleSelected
											? true
											: someVisibleSelected
												? "indeterminate"
												: false
									}
									onCheckedChange={() => onSelectAll?.(visibleRunIds)}
									aria-label={t("selectAllRows")}
								/>
							),
							cell: ({ row }: { row: { original: OptimizationRun } }) => {
								const run = row.original
								return (
									<Checkbox
										id={`select-${run.id}`}
										checked={selectedRunIds?.has(run.id) ?? false}
										onCheckedChange={() => onToggleSelect?.(run.id)}
										aria-label={t("selectRow")}
									/>
								)
							},
							enableSorting: false,
							meta: { headerClassName: "w-10", cellClassName: "w-10" },
						} as ColumnDef<OptimizationRun, unknown>,
					]
				: []),
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
				accessorFn: (row) => row.provenance?.stage,
				id: "stage",
				header: t("funnel.stageColumn"),
				cell: ({ getValue, row }) => {
					const stage = getValue<string | undefined>()
					if (!stage) {
						return (
							<span className="text-tiny text-txt-300">
								{t("funnel.stageAdHoc")}
							</span>
						)
					}
					const parents = row.original.provenance?.parentRunIds?.length ?? 0
					const label = t(`funnel.stage_${stage}` as const)
					const colorClass =
						stage === "broad"
							? "border-acc-100 text-acc-100"
							: stage === "refine"
								? "border-trade-buy text-trade-buy"
								: "border-warning text-warning"
					return (
						<div className="gap-s-100 flex items-center">
							<Badge
								id={`stage-${row.original.id}`}
								variant="outline"
								className={`text-micro px-s-100 py-0 ${colorClass}`}
							>
								{label}
							</Badge>
							{parents > 0 && (
								<span
									className="text-tiny text-txt-300"
									title={row.original.provenance?.parentRunIds?.join(", ")}
								>
									{t("funnel.parentsCount", { count: parents })}
								</span>
							)}
						</div>
					)
				},
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
				accessorFn: (row) => row.summaryIS?.profitFactor,
				id: "isPF",
				meta: { ariaLabel: t("walkForward.isPF") },
				header: () => (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="gap-s-100 inline-flex cursor-help items-center">
								{t("walkForward.isPF")}
								<Info className="size-3" />
							</span>
						</TooltipTrigger>
						<TooltipContent id="table-is-pf-tooltip" className="max-w-xs">
							{t("walkForward.inSampleTooltip")}
						</TooltipContent>
					</Tooltip>
				),
				cell: ({ getValue }) => {
					const isPF = getValue<number | undefined>()
					if (isPF === undefined) {
						return <span className="text-tiny text-txt-300">-</span>
					}
					return (
						<span className="text-small text-txt-100 tabular-nums">
							{isPF.toFixed(2)}
						</span>
					)
				},
			},
			{
				accessorFn: (row) => row.summaryOOS?.profitFactor,
				id: "oosPF",
				meta: { ariaLabel: t("walkForward.oosPF") },
				header: () => (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="gap-s-100 inline-flex cursor-help items-center">
								{t("walkForward.oosPF")}
								<Info className="size-3" />
							</span>
						</TooltipTrigger>
						<TooltipContent id="table-oos-pf-tooltip" className="max-w-xs">
							{t("walkForward.outOfSampleTooltip")}
						</TooltipContent>
					</Tooltip>
				),
				cell: ({ getValue, row }) => {
					const oosPF = getValue<number | undefined>()
					if (oosPF === undefined) {
						return <span className="text-tiny text-txt-300">-</span>
					}
					const isRobust = row.original.oosRobust
					const color = isRobust ? "text-trade-buy" : "text-warning"
					return (
						<div className="gap-s-100 flex items-center">
							<span className={`text-small tabular-nums ${color}`}>
								{oosPF.toFixed(2)}
							</span>
							{isRobust !== undefined && (
								<Badge
									id={`robust-${row.original.id}`}
									variant="outline"
									className={`text-micro px-s-100 py-0 ${
										isRobust
											? "border-trade-buy text-trade-buy"
											: "border-warning text-warning"
									}`}
								>
									{isRobust ? "✓" : "✗"}
								</Badge>
							)}
						</div>
					)
				},
			},
			{
				accessorFn: (row) => row.matchRate,
				id: "matchRate",
				header: t("matchRate"),
				cell: ({ getValue }) => {
					const rate = getValue<number | undefined>()
					if (rate === undefined) {
						return <span className="text-tiny text-txt-300">-</span>
					}
					return (
						<span className="text-small text-txt-100 tabular-nums">
							{(rate * 100).toFixed(0)}%
						</span>
					)
				},
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
		[
			bestRunId,
			onTogglePin,
			onToggleExpand,
			onDelete,
			t,
			selectionEnabled,
			selectedRunIds,
			allVisibleSelected,
			someVisibleSelected,
			visibleRunIds,
			onToggleSelect,
			onSelectAll,
		]
	)

	// Check if any runs have walk-forward data
	const hasWalkForwardData = useMemo(
		() => runs.some((r) => r.summaryIS !== undefined),
		[runs]
	)

	return (
		<div className="space-y-s-300">
			{/* Robust filter toggle (only show if there's walk-forward data) */}
			{hasWalkForwardData && (
				<div className="gap-s-200 flex items-center">
					<label className="gap-s-200 flex cursor-pointer items-center">
						<Checkbox
							id="robust-filter"
							checked={robustFilterEnabled}
							onCheckedChange={(checked) => {
								onRobustFilterChange?.(checked === true)
							}}
						/>
						<span className="text-small text-txt-200">
							{t("walkForward.robustFilter")}
						</span>
					</label>
				</div>
			)}
			<DataTable columns={columns} data={filteredRuns} pageSize={20} striped />
		</div>
	)
}

export { RunsComparisonTable }
