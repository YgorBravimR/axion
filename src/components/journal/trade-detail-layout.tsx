"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type {
	CandleRow,
	IndicatorGroupWithKeys,
	TradeChartData,
} from "@/types/candle"
import { TradeChartView } from "./trade-chart-view"
import type { TradeInfoPanelProps } from "./trade-info-panel"
import { HawksTripleScreenInspector } from "@/components/backtest/inspector/triple-screen-inspector"
import type { BacktestTrade } from "@/types/backtest"

interface TradeDetailLayoutProps {
	children: ReactNode
	chartData: {
		trade: TradeChartData["trade"]
		executions: TradeChartData["executions"]
		candles: CandleRow[]
		indicatorGroups: IndicatorGroupWithKeys[]
		fullTrade: TradeInfoPanelProps["fullTrade"]
		tickSize?: number
		tickValue?: number
	} | null
	// When set, the chart view renders the hawks triple-screen renko panes
	// (5m / 15m / 60m) instead of the default single-pane candle chart.
	tripleScreen?: {
		trade: BacktestTrade
		assetSymbol: string
	} | null
}

const TradeDetailLayout = ({
	children,
	chartData,
	tripleScreen,
}: TradeDetailLayoutProps) => {
	const tChart = useTranslations("trade.chart")
	const tDialog = useTranslations("trade.unsavedDialog")
	const hasChartView = Boolean(chartData) || Boolean(tripleScreen)
	const [view, setView] = useState<"chart" | "details">(
		hasChartView ? "chart" : "details"
	)
	const [chartKey, setChartKey] = useState(0)
	const isDirtyRef = useRef(false)
	const [pendingNavUrl, setPendingNavUrl] = useState<string | null>(null)
	// H11: Scoped to the layout container — avoids running closest("a") on every click in the document
	const layoutContainerRef = useRef<HTMLDivElement>(null)

	const handleDirtyChange = useCallback((dirty: boolean) => {
		isDirtyRef.current = dirty
	}, [])

	// H11: Scoped to layoutContainerRef — avoids running closest("a") + new URL() on every
	// document-level click. Handler is stable via useCallback.
	const handleClick = useCallback((e: MouseEvent) => {
		if (!isDirtyRef.current) {
			return
		}

		const anchor = (e.target as HTMLElement).closest("a")
		if (!anchor) {
			return
		}

		const href = anchor.getAttribute("href")
		if (!href || href.startsWith("#") || href.startsWith("javascript")) {
			return
		}

		const url = new URL(href, window.location.origin)
		if (url.origin !== window.location.origin) {
			return
		}

		if (url.pathname === window.location.pathname) {
			return
		}

		e.preventDefault()
		e.stopPropagation()
		setPendingNavUrl(href)
	}, [])

	useEffect(() => {
		const container = layoutContainerRef.current
		if (!container) {
			return
		}
		container.addEventListener("click", handleClick, true)
		return () => container.removeEventListener("click", handleClick, true)
	}, [handleClick])

	const handleConfirmNav = () => {
		isDirtyRef.current = false
		const url = pendingNavUrl
		setPendingNavUrl(null)
		if (url) {
			// Hard navigation to ensure full remount and clear stale form state
			window.location.href = url
		}
	}

	const handleCancelNav = () => {
		setPendingNavUrl(null)
	}

	if (!hasChartView) {
		return <>{children}</>
	}

	return (
		<>
			<div
				ref={layoutContainerRef}
				className="flex h-[calc(100dvh-var(--app-header-height))] flex-col"
			>
				{view === "chart" ? (
					<div className="flex h-full flex-col overflow-hidden">
						{tripleScreen ? (
							<div className="p-m-400 sm:p-m-500 flex flex-1 flex-col overflow-auto">
								<HawksTripleScreenInspector
									key={chartKey}
									trade={tripleScreen.trade}
									assetSymbol={tripleScreen.assetSymbol}
								/>
								<div className="mt-m-400 flex justify-end">
									<Button
										id="toggle-detail-view-triple-screen"
										size="sm"
										variant="outline"
										onClick={() => setView("details")}
										className="border-acc-100/40 text-acc-100 hover:bg-acc-100/10 gap-s-200"
										aria-label={tChart("switchToDetailView")}
									>
										<BarChart3 className="h-4 w-4" aria-hidden="true" />
										{tChart("switchToDetailView")}
									</Button>
								</div>
							</div>
						) : chartData ? (
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
								onDirtyChange={handleDirtyChange}
							/>
						) : null}
					</div>
				) : (
					<div className="flex-1 overflow-auto">
						{/* H10: backdrop-blur-sm used for visual polish on scroll edge; note performance trade-off on older tablets */}
						<div className="bg-bg-100/80 px-m-400 py-s-300 sm:px-m-500 lg:px-m-600 sticky top-0 z-10 flex justify-end backdrop-blur-sm">
							<Button
								id="toggle-chart-view"
								size="sm"
								variant="outline"
								onClick={() => {
									setChartKey((k) => k + 1)
									setView("chart")
								}}
								className="gap-s-200"
								aria-label={tChart("switchToChartView")}
							>
								<BarChart3 className="h-4 w-4" aria-hidden="true" />
								{tChart("chartButton")}
							</Button>
						</div>
						<div className="mx-auto max-w-4xl">{children}</div>
					</div>
				)}
			</div>

			{/* Unsaved changes confirmation dialog */}
			<AlertDialog
				open={!!pendingNavUrl}
				onOpenChange={(open) => {
					if (!open) {
						handleCancelNav()
					}
				}}
			>
				<AlertDialogContent id="unsaved-changes-dialog">
					<AlertDialogHeader>
						<AlertDialogTitle>{tDialog("title")}</AlertDialogTitle>
						<AlertDialogDescription>
							{tDialog("description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel
							id="unsaved-changes-stay"
							onClick={handleCancelNav}
						>
							{tDialog("stay")}
						</AlertDialogCancel>
						<AlertDialogAction
							id="unsaved-changes-leave"
							variant="destructive"
							onClick={handleConfirmNav}
						>
							{tDialog("leave")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}

export type { TradeDetailLayoutProps }
export { TradeDetailLayout }
