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
}

const TradeDetailLayout = ({ children, chartData }: TradeDetailLayoutProps) => {
	const tChart = useTranslations("trade.chart")
	const tDialog = useTranslations("trade.unsavedDialog")
	const [view, setView] = useState<"chart" | "details">(
		chartData ? "chart" : "details"
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

	if (!chartData) {
		return <>{children}</>
	}

	return (
		<>
			<div
				ref={layoutContainerRef}
				className="flex h-[calc(100dvh-3.5rem)] flex-col md:h-[calc(100dvh-3rem)]"
			>
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
							onDirtyChange={handleDirtyChange}
						/>
					</div>
				) : (
					<div className="flex-1 overflow-auto">
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
						{children}
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
