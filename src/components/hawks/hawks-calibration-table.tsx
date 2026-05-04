"use client"

import { useEffect, useMemo, useState } from "react"
import { useFormatter, useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { listHawksCalibrations } from "@/app/actions/hawks-calibration"
import { Badge } from "@/components/ui/badge"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { startOfIsoWeek } from "@/lib/hawks/atr-calc"
import type { CalibrationRecord } from "@/lib/hawks/action-types"

const TIMEFRAME_COLUMNS = [
	{ minutes: 1440, key: "tfDay" as const },
	{ minutes: 60, key: "tf60" as const },
	{ minutes: 15, key: "tf15" as const },
	{ minutes: 5, key: "tf5" as const },
	{ minutes: 1, key: "tf1" as const },
]

interface RowGroup {
	weekKey: string
	weekStart: Date
	asset: string
	values: Map<number, number>
}

const groupByWeekAsset = (rows: CalibrationRecord[]): RowGroup[] => {
	const groups = new Map<string, RowGroup>()
	for (const row of rows) {
		const weekStart = new Date(row.weekStart)
		const weekKey = weekStart.toISOString().slice(0, 10)
		const key = `${weekKey}|${row.assetSymbol}`
		const existing = groups.get(key)
		if (existing) {
			existing.values.set(row.timeframeMinutes, row.rValue)
			continue
		}
		groups.set(key, {
			weekKey,
			weekStart,
			asset: row.assetSymbol,
			values: new Map([[row.timeframeMinutes, row.rValue]]),
		})
	}
	return Array.from(groups.values()).sort(
		(a, b) => b.weekStart.getTime() - a.weekStart.getTime() || a.asset.localeCompare(b.asset)
	)
}

const HawksCalibrationTable = () => {
	const t = useTranslations("hawksCalibration.table")
	const format = useFormatter()
	const [rows, setRows] = useState<CalibrationRecord[]>([])
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		let mounted = true
		const load = async () => {
			try {
				const result = await listHawksCalibrations(26)
				if (!mounted) return
				if (result.status === "success" && result.data) setRows(result.data)
			} catch (error) {
				console.error("Failed to load calibrations:", error)
			} finally {
				if (mounted) setIsLoading(false)
			}
		}
		load()
		return () => {
			mounted = false
		}
	}, [])

	const groups = useMemo(() => groupByWeekAsset(rows), [rows])
	const currentWeekKey = useMemo(
		() => startOfIsoWeek(new Date()).toISOString().slice(0, 10),
		[]
	)

	return (
		<Card id="hawks-calibration-table-card">
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
				<CardDescription>{t("description")}</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="text-text-200 flex items-center gap-s-200 text-small">
						<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
						<span>{t("loading")}</span>
					</div>
				) : groups.length === 0 ? (
					<p className="text-text-300 text-small">{t("empty")}</p>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("headers.week")}</TableHead>
									<TableHead>{t("headers.asset")}</TableHead>
									{TIMEFRAME_COLUMNS.map((tf) => (
										<TableHead key={tf.minutes} className="text-right">
											{t(`headers.${tf.key}`)}
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{groups.map((group) => {
									const isCurrent = group.weekKey === currentWeekKey
									return (
										<TableRow
											key={`${group.weekKey}-${group.asset}`}
											className={
												isCurrent ? "bg-acc-100/5 hover:bg-acc-100/10" : undefined
											}
										>
											<TableCell className="whitespace-nowrap">
												<div className="flex items-center gap-s-200">
													<span className="font-mono text-small">
														{format.dateTime(group.weekStart, {
															day: "2-digit",
															month: "short",
															year: "numeric",
														})}
													</span>
													{isCurrent && (
														<Badge
															id={`hawks-calib-current-${group.weekKey}-${group.asset}`}
															variant="outline"
															className="border-acc-100/40 text-acc-100"
														>
															{t("currentBadge")}
														</Badge>
													)}
												</div>
											</TableCell>
											<TableCell className="font-mono text-small">{group.asset}</TableCell>
											{TIMEFRAME_COLUMNS.map((tf) => {
												const value = group.values.get(tf.minutes)
												return (
													<TableCell
														key={tf.minutes}
														className={
															isCurrent
																? "text-acc-100 text-right font-mono"
																: "text-right font-mono"
														}
													>
														{value ?? t("missing")}
													</TableCell>
												)
											})}
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

export { HawksCalibrationTable }
