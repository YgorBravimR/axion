"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Trophy } from "lucide-react"
import type { SessionAssetPerformance, TradingSession } from "@/types"
import { formatBrlCompactWithSign, formatR } from "@/lib/formatting"
import type { ExpectancyMode } from "./expectancy-mode-toggle"
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table"

interface SessionAssetTableProps {
	data: SessionAssetPerformance[]
	expectancyMode: ExpectancyMode
}

/**
 * Displays asset performance breakdown by trading session in a table format.
 * Shows P&L and win rate for each asset across different market sessions.
 *
 * @param data - Array of asset performance data with session breakdowns
 */
export const SessionAssetTable = ({
	data,
	expectancyMode,
}: SessionAssetTableProps) => {
	const t = useTranslations("analytics")
	const tLabels = useTranslations("analytics.session.labels")

	const isRMode = expectancyMode === "edge"

	// Translate session labels
	const getSessionLabel = (session: TradingSession): string => {
		return tLabels(session)
	}

	// Pre-compute weighted R per asset for R mode total column
	const weightedRByAsset = useMemo(() => {
		const map = new Map<string, number>()
		for (const asset of data) {
			const totalTrades = asset.sessions.reduce((s, sess) => s + sess.trades, 0)
			const weightedR =
				totalTrades > 0
					? asset.sessions.reduce((s, sess) => s + sess.avgR * sess.trades, 0) /
						totalTrades
					: 0
			map.set(asset.asset, weightedR)
		}
		return map
	}, [data])

	// Build session lookup maps for O(1) access instead of O(n) find() calls
	const sessionMaps = useMemo(() => {
		const maps = new Map<
			string,
			Map<TradingSession, SessionAssetPerformance["sessions"][0]>
		>()
		for (const asset of data) {
			const sessionMap = new Map<
				TradingSession,
				SessionAssetPerformance["sessions"][0]
			>()
			for (const session of asset.sessions) {
				sessionMap.set(session.session, session)
			}
			maps.set(asset.asset, sessionMap)
		}
		return maps
	}, [data])

	if (data.length === 0) {
		return (
			<div
				id="analytics-session-asset"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border"
			>
				<h3 className="mb-s-300 sm:mb-m-400 text-small sm:text-body text-txt-100 font-semibold">
					{t("session.assetTitle")}
				</h3>
				<div className="text-txt-300 flex h-[120px] items-center justify-center sm:h-[150px]">
					{t("noData")}
				</div>
			</div>
		)
	}

	const sessions: TradingSession[] = [
		"preOpen",
		"morning",
		"afternoon",
		"close",
	]

	return (
		<div
			id="analytics-session-asset"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border"
		>
			<h3 className="mb-s-300 text-small sm:text-body text-txt-100 font-semibold">
				{t("session.assetTitle")}
			</h3>
			<p className="mb-s-300 text-tiny text-txt-300">
				{t("session.assetDescription")}
			</p>

			<p className="mb-s-200 text-tiny text-txt-300 sm:hidden">
				Showing best session only — view on larger screen for full breakdown
			</p>
			<Table className="w-full">
				<TableHeader>
					<TableRow className="border-bg-300 border-b">
						<TableHead className="pb-s-200 text-tiny text-txt-300 text-left font-medium">
							{t("session.asset")}
						</TableHead>
						{sessions.map((session) => (
							<TableHead
								key={session}
								className="pb-s-200 text-tiny text-txt-300 hidden text-center font-medium sm:table-cell"
							>
								{getSessionLabel(session)}
							</TableHead>
						))}
						<TableHead className="pb-s-200 text-tiny text-txt-300 text-center font-medium">
							{t("session.bestSession")}
						</TableHead>
						<TableHead className="pb-s-200 text-tiny text-txt-300 text-right font-medium">
							{t("session.total")}
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map((asset) => (
						<TableRow
							key={asset.asset}
							className="border-bg-300/50 border-b last:border-b-0"
						>
							<TableCell className="py-s-200 text-small text-txt-100 font-medium">
								{asset.asset}
							</TableCell>
							{sessions.map((session) => {
								const sessionData = sessionMaps.get(asset.asset)?.get(session)
								if (!sessionData || sessionData.trades === 0) {
									return (
										<TableCell
											key={session}
											className="py-s-200 hidden text-center sm:table-cell"
										>
											<span className="text-tiny text-txt-300">-</span>
										</TableCell>
									)
								}

								const isBest = asset.bestSession === session
								const metricValue = isRMode ? sessionData.avgR : sessionData.pnl
								return (
									<TableCell
										key={session}
										className="py-s-200 hidden text-center sm:table-cell"
									>
										<div
											className={`px-s-100 inline-flex flex-col items-center rounded-sm py-px ${
												isBest ? "bg-acc-100/10" : ""
											}`}
										>
											<span
												className={`text-tiny font-medium ${
													metricValue >= 0
														? "text-trade-buy"
														: "text-trade-sell"
												}`}
											>
												{isRMode
													? formatR(metricValue)
													: formatBrlCompactWithSign(metricValue)}
											</span>
											<span className="text-txt-300 text-micro">
												{sessionData.winRate.toFixed(0)}% • {sessionData.trades}
											</span>
										</div>
									</TableCell>
								)
							})}
							<TableCell className="py-s-200 text-center">
								{asset.bestSession ? (
									<span className="gap-s-100 bg-acc-100/10 px-s-200 text-tiny text-acc-100 inline-flex items-center rounded-full py-px font-medium">
										<Trophy className="h-3 w-3" />
										{getSessionLabel(asset.bestSession)}
									</span>
								) : (
									<span className="text-tiny text-txt-300">-</span>
								)}
							</TableCell>
							<TableCell className="py-s-200 text-right">
								{isRMode ? (
									<span
										className={`text-small font-semibold ${
											(weightedRByAsset.get(asset.asset) ?? 0) >= 0
												? "text-trade-buy"
												: "text-trade-sell"
										}`}
									>
										{formatR(weightedRByAsset.get(asset.asset) ?? 0)}
									</span>
								) : (
									<span
										className={`text-small font-semibold ${
											asset.totalPnl >= 0 ? "text-trade-buy" : "text-trade-sell"
										}`}
									>
										{formatBrlCompactWithSign(asset.totalPnl)}
									</span>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

			{/* Legend */}
			<div className="mt-s-300 gap-s-300 text-txt-300 text-micro flex items-center justify-end">
				<span>{t("session.legendWinRate")}</span>
				<span>•</span>
				<span>{t("session.legendTrades")}</span>
			</div>
		</div>
	)
}
