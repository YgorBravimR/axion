"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { HAWKS_BENCHMARKS } from "@/lib/hawks/analytics"
import {
	fetchHawksAnalyticsBundle,
	type HawksAnalyticsBundle,
} from "@/app/actions/hawks-analytics"

const formatPct = (value: number) => `${(value * 100).toFixed(1)}%`
const formatR = (value: number, digits = 2) => `${value.toFixed(digits)}R`
const formatPf = (value: number | null) =>
	value === null ? "—" : `${value.toFixed(2)}×`

interface KpiTileProps {
	id: string
	label: string
	value: string
	benchmark: string
	met: boolean | null
	hint?: string
}

const KpiTile = ({ id, label, value, benchmark, met, hint }: KpiTileProps) => (
	<div
		id={id}
		className="flex flex-col gap-s-100 rounded-md border border-bg-300 bg-bg-200/40 p-m-300"
	>
		<div className="flex items-center justify-between">
			<span className="text-text-300 text-fs-100 uppercase tracking-wide">
				{label}
			</span>
			{met !== null && (
				<span
					className={cn(
						"text-fs-100 font-semibold",
						met ? "text-profit" : "text-loss"
					)}
				>
					{met ? "✓" : "△"}
				</span>
			)}
		</div>
		<span className="text-fs-600 font-mono font-semibold tracking-tight">
			{value}
		</span>
		<span className="text-text-300 text-fs-100">{benchmark}</span>
		{hint && <span className="text-text-300 text-fs-100 opacity-80">{hint}</span>}
	</div>
)

const HawksAnalyticsDashboard = () => {
	const t = useTranslations("hawksAnalytics")
	const [data, setData] = useState<HawksAnalyticsBundle | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const result = await fetchHawksAnalyticsBundle()
			if (!mounted) return
			if (result.status === "success" && result.data) {
				setData(result.data)
			} else {
				setError(result.message)
			}
			setLoading(false)
		}
		load()
		return () => {
			mounted = false
		}
	}, [])

	if (loading) {
		return (
			<div className="flex items-center gap-s-200 text-text-300 text-fs-200">
				<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
				{t("loading")}
			</div>
		)
	}

	if (error || !data) {
		return (
			<Card id="hawks-analytics-error">
				<CardContent className="py-m-400">
					<p className="text-loss text-fs-200">{error ?? t("errors.fetchFailed")}</p>
				</CardContent>
			</Card>
		)
	}

	const { kpis, scenarioPerformance, discipline, insights } = data

	return (
		<div className="space-y-m-500">
			<section className="grid gap-m-300 sm:grid-cols-2 lg:grid-cols-4">
				<KpiTile
					id="hawks-kpi-pf"
					label={t("kpi.profitFactor")}
					value={formatPf(kpis.profitFactor)}
					benchmark={t("kpi.benchmark", { value: `${HAWKS_BENCHMARKS.profitFactor.toFixed(2)}×` })}
					met={
						kpis.profitFactor === null
							? null
							: kpis.profitFactor >= HAWKS_BENCHMARKS.profitFactor
					}
				/>
				<KpiTile
					id="hawks-kpi-wr"
					label={t("kpi.winRate")}
					value={formatPct(kpis.winRate)}
					benchmark={t("kpi.benchmark", { value: formatPct(HAWKS_BENCHMARKS.winRate) })}
					met={kpis.winRate >= HAWKS_BENCHMARKS.winRate}
					hint={t("kpi.tradesCount", { count: kpis.tradeCount })}
				/>
				<KpiTile
					id="hawks-kpi-expectancy"
					label={t("kpi.expectancy")}
					value={formatR(kpis.expectancyR)}
					benchmark={t("kpi.expectancyBenchmark")}
					met={kpis.expectancyR > 0}
				/>
				<KpiTile
					id="hawks-kpi-mfe"
					label={t("kpi.mfeCapture")}
					value={kpis.mfeCapture === null ? "—" : formatPct(kpis.mfeCapture)}
					benchmark={t("kpi.mfeBenchmark")}
					met={kpis.mfeCapture === null ? null : kpis.mfeCapture >= 0.5}
				/>
			</section>

			<Card id="hawks-discipline-card">
				<CardHeader>
					<CardTitle>{t("discipline.title")}</CardTitle>
					<CardDescription>{t("discipline.description")}</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-m-300 sm:grid-cols-3">
					<KpiTile
						id="hawks-discipline-stop"
						label={t("discipline.stopDiscipline")}
						value={formatPct(discipline.stopDiscipline)}
						benchmark={t("discipline.stopBenchmark", {
							changes: discipline.stopChanges,
							violations: discipline.stopViolations,
						})}
						met={discipline.stopDiscipline >= HAWKS_BENCHMARKS.stopDiscipline}
					/>
					<KpiTile
						id="hawks-discipline-cap"
						label={t("discipline.tradeCap")}
						value={t("discipline.tradeCapValue", {
							over: discipline.overCapDays,
							total: discipline.totalSessionDays,
						})}
						benchmark={t("discipline.tradeCapBenchmark")}
						met={discipline.overCapDays === 0}
					/>
					<KpiTile
						id="hawks-discipline-mfe"
						label={t("discipline.avgMfeCapture")}
						value={
							discipline.avgMfeCapture === null
								? "—"
								: formatPct(discipline.avgMfeCapture)
						}
						benchmark={t("kpi.mfeBenchmark")}
						met={
							discipline.avgMfeCapture === null
								? null
								: discipline.avgMfeCapture >= 0.5
						}
					/>
				</CardContent>
			</Card>

			<Card id="hawks-scenario-card">
				<CardHeader>
					<CardTitle>{t("scenario.title")}</CardTitle>
					<CardDescription>{t("scenario.description")}</CardDescription>
				</CardHeader>
				<CardContent>
					{scenarioPerformance.length === 0 ? (
						<p className="text-text-300 text-fs-200">{t("scenario.empty")}</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-fs-200">
								<thead className="text-text-300 text-fs-100 uppercase tracking-wide">
									<tr className="border-b border-bg-300">
										<th className="py-s-200 text-left">{t("scenario.code")}</th>
										<th className="py-s-200 text-right">{t("scenario.trades")}</th>
										<th className="py-s-200 text-right">{t("scenario.winRate")}</th>
										<th className="py-s-200 text-right">{t("scenario.expectancy")}</th>
										<th className="py-s-200 text-right">{t("scenario.totalR")}</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-bg-300">
									{scenarioPerformance.map((row) => (
										<tr key={row.scenarioCode}>
											<td className="py-s-200 font-medium">#{row.scenarioCode}</td>
											<td className="py-s-200 text-right font-mono">{row.tradeCount}</td>
											<td className="py-s-200 text-right font-mono">{formatPct(row.winRate)}</td>
											<td
												className={cn(
													"py-s-200 text-right font-mono",
													row.expectancyR > 0 ? "text-profit" : row.expectancyR < 0 ? "text-loss" : ""
												)}
											>
												{formatR(row.expectancyR)}
											</td>
											<td
												className={cn(
													"py-s-200 text-right font-mono",
													row.totalR > 0 ? "text-profit" : row.totalR < 0 ? "text-loss" : ""
												)}
											>
												{formatR(row.totalR)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</CardContent>
			</Card>

			<Card id="hawks-coach-card">
				<CardHeader>
					<CardTitle>{t("coach.title")}</CardTitle>
					<CardDescription>{t("coach.description")}</CardDescription>
				</CardHeader>
				<CardContent>
					{insights.length === 0 ? (
						<div className="flex items-center gap-s-200 text-profit text-fs-200">
							<CheckCircle2 className="h-4 w-4" aria-hidden="true" />
							{t("coach.empty")}
						</div>
					) : (
						<ul className="divide-y divide-bg-300">
							{insights.slice(0, 25).map((insight, idx) => (
								<li
									key={`${insight.kind}-${insight.tradeId}-${idx}`}
									className="flex items-start gap-s-300 py-s-300"
								>
									<AlertTriangle
										className="mt-s-050 h-4 w-4 shrink-0 text-loss"
										aria-hidden="true"
									/>
									<div className="space-y-s-050 text-fs-200">
										<p className="font-medium">{t(`coach.kinds.${insight.kind}`)}</p>
										<p className="text-text-300 text-fs-100">
											{insight.tradeDate} · {insight.asset ?? "—"}
										</p>
									</div>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

export { HawksAnalyticsDashboard }
