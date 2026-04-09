"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { BarChart3, LayoutList } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CandleRow, IndicatorGroupWithKeys, TradeChartData } from "@/types/candle"
import { TradeChartView } from "./trade-chart-view"
import type { TradeInfoPanelProps } from "./trade-info-panel"

interface TradeDetailLayoutProps {
	/** The original stacked-cards detail view (server-rendered) */
	children: ReactNode
	/** Chart data — if null, chart toggle is hidden */
	chartData: {
		trade: TradeChartData["trade"]
		executions: TradeChartData["executions"]
		candles: CandleRow[]
		indicatorGroups: IndicatorGroupWithKeys[]
		fullTrade: TradeInfoPanelProps["fullTrade"]
		tickSize?: number
		tickValue?: number
	} | null
}

const TradeDetailLayout = ({ children, chartData }: TradeDetailLayoutProps) => {
	const [view, setView] = useState<"chart" | "details">(chartData ? "chart" : "details")
	// Increment key on each chart remount to force clean state (avoids stale refs)
	const [chartKey, setChartKey] = useState(0)

	// No chart data — just render the detail view
	if (!chartData) {
		return <>{children}</>
	}

	return (
		<div className="flex h-[calc(100dvh-3rem)] flex-col">
			{view === "chart" ? (
				<div className="h-full overflow-hidden">
					<TradeChartView
						key={chartKey}
						trade={chartData.trade}
						executions={chartData.executions}
						candles={chartData.candles}
						indicatorGroups={chartData.indicatorGroups}
						fullTrade={chartData.fullTrade}
						tickSize={chartData.tickSize}
						tickValue={chartData.tickValue}
						onToggleView={() => setView("details")}
					/>
				</div>
			) : (
				<div className="flex-1 overflow-auto">
					{/* Toggle back to chart at the top */}
					<div className="flex justify-end px-m-400 pt-m-400 sm:px-m-500 sm:pt-m-500 lg:px-m-600 lg:pt-m-600">
						<Button
							id="toggle-chart-view"
							size="sm"
							variant="ghost"
							onClick={() => { setChartKey((k) => k + 1); setView("chart") }}
							className="text-txt-300 hover:text-txt-100 gap-s-200"
							aria-label="Switch to chart view"
						>
							<BarChart3 className="h-4 w-4" />
							Chart
						</Button>
					</div>
					{children}
				</div>
			)}
		</div>
	)
}

export type { TradeDetailLayoutProps }
export { TradeDetailLayout }
