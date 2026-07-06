"use client"

import { useTranslations } from "next-intl"
import {
	Table,
	TableHeader,
	TableBody,
	TableHead,
	TableRow,
	TableCell,
} from "@/components/ui/table"
import type { SweepResult, FloorRow } from "@/lib/hawks/governor-sweep"

interface GovernorSweepTableProps {
	result: SweepResult
}

const fmtR = (r: number): string => `${r >= 0 ? "+" : ""}${r.toFixed(1)}R`

const floorLabel = (
	floorR: number | null,
	t: ReturnType<typeof useTranslations>
): string => {
	if (floorR === null) {
		return t("table.baseline")
	}
	if (floorR === 0) {
		return `0R · ${t("table.neverRed")}`
	}
	if (floorR > 0) {
		return `+${floorR}R · ${t("table.lockProfit")}`
	}
	return `${floorR}R`
}

const GovernorSweepTable = ({ result }: GovernorSweepTableProps) => {
	const t = useTranslations("equityShield.governor")
	const rows: FloorRow[] = [result.baseline, ...result.floors]

	return (
		<div className="space-y-s-300">
			<p className="text-small text-txt-300">{t("hint")}</p>
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("table.floor")}</TableHead>
							<TableHead className="text-right">{t("table.totalR")}</TableHead>
							<TableHead className="text-right">
								{t("table.expectancy")}
							</TableHead>
							<TableHead className="text-right">{t("table.maxDD")}</TableHead>
							<TableHead className="text-right">{t("table.redDays")}</TableHead>
							<TableHead className="text-right">
								{t("table.daysCapped")}
							</TableHead>
							<TableHead className="text-right">
								{t("table.tradesKept")}
							</TableHead>
							<TableHead className="text-right">
								{t("table.avgPerDay")}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => {
							const isBaseline = row.floorR === null
							return (
								<TableRow
									key={isBaseline ? "baseline" : `floor-${row.floorR}`}
									className={isBaseline ? "text-txt-300" : "text-txt-100"}
								>
									<TableCell className="font-medium">
										{floorLabel(row.floorR, t)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{fmtR(row.totalR)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{fmtR(row.expectancy)}
									</TableCell>
									<TableCell className="text-fb-error text-right tabular-nums">
										{row.maxDrawdownR.toFixed(1)}R
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{row.redDays}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{isBaseline ? "—" : row.daysCapped}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{row.tradesKept}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{row.avgTradesPerDay.toFixed(1)}
									</TableCell>
								</TableRow>
							)
						})}
					</TableBody>
				</Table>
			</div>
		</div>
	)
}

export { GovernorSweepTable }
