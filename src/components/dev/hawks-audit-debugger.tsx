"use client"

// i18n-exempt: developer debug tool (src/components/dev/**) — English strings
// are intentional. Future /scan passes should skip dev-only components.

import { useMemo, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { runHawksAuditDebug } from "@/app/actions/hawks-audit-debug"
import type {
	AuditRow,
	HawksAuditDebugData,
	HawksAuditDebugResult,
} from "@/app/actions/hawks-audit-debug.types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { HawksAuditInspector } from "./hawks-audit-inspector"

interface HawksAuditDebuggerProps {
	readonly initialResult: HawksAuditDebugResult
	readonly initialFromDate: string
	readonly initialToDate: string
}

const formatPrice = (n: number | null | undefined): string => {
	if (n === null || n === undefined) {
		return "—"
	}
	// DB prices are stored in milli-points (e.g., 183150 = 183.150).
	return (n / 1000).toFixed(3)
}

const formatCurrency = (cents: number | null | undefined): string => {
	if (cents === null || cents === undefined) {
		return "—"
	}
	const sign = cents >= 0 ? "+" : "−"
	return `${sign}R$${Math.abs(cents / 100).toFixed(2)}`
}

const computedBadgeColor = (code: string | null): string => {
	switch (code) {
		case "GA":
			return "bg-fb-success/15 text-fb-success"
		case "BE":
			return "bg-acc-200/15 text-acc-200"
		case "ST":
			return "bg-destructive/15 text-destructive"
		case "EOD":
			return "bg-warning/15 text-warning"
		case "???":
			return "bg-warning/30 text-warning"
		default:
			return "bg-bg-300 text-txt-300"
	}
}

const HawksAuditDebugger = ({
	initialResult,
	initialFromDate,
	initialToDate,
}: HawksAuditDebuggerProps) => {
	const [result, setResult] = useState<HawksAuditDebugResult>(initialResult)
	const [fromDate, setFromDate] = useState(initialFromDate)
	const [toDate, setToDate] = useState(initialToDate)
	const [pending, startTransition] = useTransition()
	const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null)
	const [filterMismatchOnly, setFilterMismatchOnly] = useState(false)
	const [filterPattern, setFilterPattern] = useState<string | null>(null)
	const [filterDay, setFilterDay] = useState<string | null>(null)

	const data: HawksAuditDebugData | null =
		result.status === "success" ? result.data : null
	const errorMessage = result.status === "error" ? result.message : null

	const handleRun = () => {
		startTransition(async () => {
			const next = await runHawksAuditDebug(fromDate, toDate)
			setResult(next)
			setSelectedRowKey(null)
		})
	}

	const filteredRows = useMemo((): AuditRow[] => {
		if (!data) {
			return []
		}
		return data.rows.filter((r) => {
			if (filterMismatchOnly && r.matched) {
				return false
			}
			if (filterPattern && r.mismatchPattern !== filterPattern) {
				return false
			}
			if (filterDay && r.date !== filterDay) {
				return false
			}
			return true
		})
	}, [data, filterMismatchOnly, filterPattern, filterDay])

	const uniqueDays = useMemo((): string[] => {
		if (!data) {
			return []
		}
		return Array.from(new Set(data.rows.map((r) => r.date))).sort()
	}, [data])

	const selectedRow = useMemo((): AuditRow | null => {
		if (!data || !selectedRowKey) {
			return null
		}
		return (
			data.rows.find((r) => `${r.date}:${r.label}` === selectedRowKey) ?? null
		)
	}, [data, selectedRowKey])

	const stats = data?.stats

	return (
		<div className="space-y-m-500">
			<header className="space-y-s-300">
				<div className="flex items-baseline justify-between">
					<div>
						<h1 className="text-h1 text-txt-100 font-semibold">
							Hawks audit debugger
						</h1>
						<p className="text-small text-txt-300 mt-1">
							Compares user-catalog entries against the engine&apos;s computed
							outcome. Click a row to inspect bricks + indicators.
						</p>
					</div>
					{errorMessage && (
						<span className="text-small text-destructive">{errorMessage}</span>
					)}
				</div>

				<div className="gap-s-300 flex flex-wrap items-end">
					<label htmlFor="from-date" className="space-y-s-100 flex flex-col">
						<span className="text-tiny text-txt-300">From</span>
						<Input
							id="from-date"
							type="date"
							value={fromDate}
							onChange={(e) => setFromDate(e.target.value)}
							className="w-40"
						/>
					</label>
					<label htmlFor="to-date" className="space-y-s-100 flex flex-col">
						<span className="text-tiny text-txt-300">To</span>
						<Input
							id="to-date"
							type="date"
							value={toDate}
							onChange={(e) => setToDate(e.target.value)}
							className="w-40"
						/>
					</label>
					<Button
						id="run-audit"
						type="button"
						onClick={handleRun}
						disabled={pending}
					>
						{pending && <Loader2 className="mr-s-200 h-4 w-4 animate-spin" />}
						Run audit
					</Button>
					<label
						htmlFor="filter-mismatch"
						className="gap-s-200 ml-m-400 text-small text-txt-200 inline-flex items-center"
					>
						<Checkbox
							id="filter-mismatch"
							checked={filterMismatchOnly}
							onCheckedChange={(v) => setFilterMismatchOnly(v === true)}
						/>
						Mismatches only
					</label>
					<select
						value={filterDay ?? ""}
						onChange={(e) => setFilterDay(e.target.value || null)}
						className="bg-bg-200 border-bg-300 px-s-200 py-s-100 text-small text-txt-100 rounded-sm border"
					>
						<option value="">All days</option>
						{uniqueDays.map((d) => (
							<option key={d} value={d}>
								{d}
							</option>
						))}
					</select>
					<select
						value={filterPattern ?? ""}
						onChange={(e) => setFilterPattern(e.target.value || null)}
						className="bg-bg-200 border-bg-300 px-s-200 py-s-100 text-small text-txt-100 rounded-sm border"
					>
						<option value="">All patterns</option>
						{stats &&
							Object.keys(stats.byPattern)
								.sort()
								.map((p) => (
									<option key={p} value={p}>
										{p} ({stats.byPattern[p]})
									</option>
								))}
					</select>
				</div>
			</header>

			{stats && (
				<section className="gap-s-300 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
					<StatTile label="Days" value={stats.totalDays} />
					<StatTile label="Catalog entries" value={stats.totalCatalog} />
					<StatTile label="Fired" value={stats.fired} />
					<StatTile label="Not fired" value={stats.notFired} tone="warning" />
					<StatTile label="Matched" value={stats.matched} tone="success" />
					<StatTile
						label="Mismatched"
						value={stats.mismatched}
						tone="destructive"
					/>
					<StatTile
						label="Match %"
						value={`${stats.matchPct.toFixed(1)}%`}
						tone={stats.matchPct >= 90 ? "success" : "warning"}
					/>
				</section>
			)}

			{stats && Object.keys(stats.byPattern).length > 0 && (
				<section className="space-y-s-200">
					<h2 className="text-small text-txt-200 font-semibold">
						Mismatch patterns
					</h2>
					<div className="gap-s-200 flex flex-wrap">
						{Object.entries(stats.byPattern)
							.sort((a, b) => b[1] - a[1])
							.map(([pattern, count]) => (
								<button
									key={pattern}
									type="button"
									onClick={() =>
										setFilterPattern(filterPattern === pattern ? null : pattern)
									}
									className={`px-s-300 py-s-100 text-tiny rounded-sm border font-mono ${
										filterPattern === pattern
											? "bg-primary/20 border-primary text-txt-100"
											: "bg-bg-200 border-bg-300 text-txt-200"
									}`}
								>
									{pattern} <span className="text-txt-300">×{count}</span>
								</button>
							))}
					</div>
				</section>
			)}

			<section className="bg-bg-200 border-bg-300 overflow-hidden rounded-lg border">
				<div className="p-s-300 border-bg-300 flex items-baseline justify-between border-b">
					<h2 className="text-body text-txt-100 font-semibold">
						Trades ({filteredRows.length})
					</h2>
					<span className="text-tiny text-txt-300">click a row to inspect</span>
				</div>
				<div className="max-h-[480px] overflow-auto">
					<Table className="text-tiny font-mono">
						<TableHeader className="bg-bg-300 text-txt-200 sticky top-0">
							<TableRow>
								<TableHead className="text-left">Date</TableHead>
								<TableHead className="text-left">Label</TableHead>
								<TableHead className="text-right">Brick</TableHead>
								<TableHead className="text-left">Dir</TableHead>
								<TableHead className="text-right">Entry</TableHead>
								<TableHead className="text-right">Exit</TableHead>
								<TableHead className="text-left">Reason</TableHead>
								<TableHead className="text-right">PnL</TableHead>
								<TableHead className="text-right">R</TableHead>
								<TableHead className="text-center">Computed</TableHead>
								<TableHead className="text-center">Expected</TableHead>
								<TableHead className="text-center">Match</TableHead>
								<TableHead className="text-left">Pattern</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredRows.map((row) => {
								const key = `${row.date}:${row.label}`
								const isSelected = selectedRowKey === key
								return (
									<TableRow
										key={key}
										onClick={() => setSelectedRowKey(key)}
										className={`border-bg-300 hover:bg-bg-300 cursor-pointer border-t ${
											isSelected ? "bg-primary/10" : ""
										}`}
									>
										<TableCell className="text-txt-200">{row.date}</TableCell>
										<TableCell className="text-txt-100">{row.label}</TableCell>
										<TableCell className="text-txt-200 text-right">
											{row.brickIndex}
										</TableCell>
										<TableCell
											className={
												row.direction === "long"
													? "text-fb-success"
													: "text-destructive"
											}
										>
											{row.direction}
										</TableCell>
										<TableCell className="text-txt-200 text-right">
											{formatPrice(row.trade?.entryPrice)}
										</TableCell>
										<TableCell className="text-txt-200 text-right">
											{formatPrice(row.trade?.exitPrice)}
										</TableCell>
										<TableCell className="text-txt-300">
											{row.trade?.exitReason ?? "—"}
										</TableCell>
										<TableCell className="text-txt-200 text-right">
											{formatCurrency(row.trade?.netPnlCents)}
										</TableCell>
										<TableCell className="text-txt-200 text-right">
											{row.trade?.rMultiple?.toFixed(2) ?? "—"}
										</TableCell>
										<TableCell className="text-center">
											<span
												className={`px-s-200 py-s-100 inline-block rounded-sm ${computedBadgeColor(row.computedResult)}`}
											>
												{row.computedResult ?? "—"}
											</span>
										</TableCell>
										<TableCell className="text-txt-100 text-center">
											{row.expectedResult ?? "—"}
										</TableCell>
										<TableCell className="text-center">
											{row.matched ? (
												<span className="text-fb-success">✓</span>
											) : (
												<span className="text-destructive">✗</span>
											)}
										</TableCell>
										<TableCell className="text-txt-300">
											{row.mismatchPattern ?? ""}
										</TableCell>
									</TableRow>
								)
							})}
							{filteredRows.length === 0 && (
								<TableRow>
									<TableCell
										colSpan={13}
										className="py-m-400 text-txt-300 text-center"
									>
										no rows match the current filters
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</section>

			{selectedRow && data && (
				<section className="space-y-m-400">
					<div className="bg-bg-200 border-bg-300 p-m-400 rounded-lg border">
						<h2 className="text-body text-txt-100 mb-s-200 font-semibold">
							{selectedRow.date} · {selectedRow.label} (brick{" "}
							{selectedRow.brickIndex}, {selectedRow.direction})
						</h2>
						<div className="gap-m-400 grid grid-cols-2 md:grid-cols-4">
							<DetailItem
								label="Expected"
								value={selectedRow.expectedResult ?? "—"}
							/>
							<DetailItem
								label="Computed"
								value={selectedRow.computedResult ?? "NOT FIRED"}
								tone={selectedRow.matched ? "success" : "destructive"}
							/>
							<DetailItem
								label="Catalog closing px"
								value={formatPrice(selectedRow.closingBrickPrice)}
							/>
							<DetailItem
								label="Engine exit px"
								value={formatPrice(selectedRow.trade?.exitPrice)}
							/>
							<DetailItem
								label="Exit reason"
								value={selectedRow.trade?.exitReason ?? "—"}
							/>
							<DetailItem
								label="Net PnL"
								value={formatCurrency(selectedRow.trade?.netPnlCents)}
							/>
							<DetailItem
								label="R multiple"
								value={selectedRow.trade?.rMultiple?.toFixed(2) ?? "—"}
							/>
							<DetailItem
								label="Pattern"
								value={selectedRow.mismatchPattern ?? "match"}
								tone={selectedRow.matched ? "success" : "warning"}
							/>
						</div>
					</div>

					{selectedRow.trade ? (
						<HawksAuditInspector
							trade={selectedRow.trade}
							assetSymbol={data.assetSymbol}
						/>
					) : (
						<div className="bg-bg-200 border-bg-300 p-l-700 flex h-32 items-center justify-center rounded-lg border">
							<p className="text-small text-txt-300">
								Trade did not fire — no engine output to inspect. Brick existed
								in the catalog at {selectedRow.date} #{selectedRow.brickIndex}{" "}
								but a prior position was open or the time-window gate excluded
								it.
							</p>
						</div>
					)}
				</section>
			)}
		</div>
	)
}

interface StatTileProps {
	readonly label: string
	readonly value: string | number
	readonly tone?: "success" | "destructive" | "warning"
}

const StatTile = ({ label, value, tone }: StatTileProps) => {
	const toneClass =
		tone === "success"
			? "text-fb-success"
			: tone === "destructive"
				? "text-destructive"
				: tone === "warning"
					? "text-warning"
					: "text-txt-100"
	return (
		<div className="bg-bg-200 border-bg-300 p-s-300 rounded-lg border">
			<div className="text-tiny text-txt-300">{label}</div>
			<div className={`text-h2 mt-1 font-semibold ${toneClass}`}>{value}</div>
		</div>
	)
}

interface DetailItemProps {
	readonly label: string
	readonly value: string
	readonly tone?: "success" | "destructive" | "warning"
}

const DetailItem = ({ label, value, tone }: DetailItemProps) => {
	const toneClass =
		tone === "success"
			? "text-fb-success"
			: tone === "destructive"
				? "text-destructive"
				: tone === "warning"
					? "text-warning"
					: "text-txt-100"
	return (
		<div>
			<div className="text-tiny text-txt-300">{label}</div>
			<div className={`text-body mt-1 font-mono ${toneClass}`}>{value}</div>
		</div>
	)
}

export { HawksAuditDebugger }
