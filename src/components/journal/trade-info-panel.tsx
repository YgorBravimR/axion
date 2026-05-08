"use client"

import { useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TradeInfoStatsTab } from "./trade-info-stats-tab"
import { TradeInfoNotesTab } from "./trade-info-notes-tab"
import { TradeInfoExecutionsTab } from "./trade-info-executions-tab"
import type { TradeChartData } from "@/types/candle"

interface TradeInfoPanelProps {
	trade: TradeChartData["trade"]
	executions: TradeChartData["executions"]
	onDirtyChange?: (_dirty: boolean) => void
	fullTrade: {
		preTradeThoughts?: string | null
		postTradeReflection?: string | null
		lessonLearned?: string | null
		disciplineNotes?: string | null
		strategy?: { name: string } | null
		rating?: string | null
		followedPlan?: boolean | null
		mfe?: string | null
		mae?: string | null
		plannedRMultiple?: string | null
		realizedRMultiple?: string | null
		plannedRiskAmount?: number | null
		executionMode: string
		tradeTags?: Array<{ tag: { id: string; name: string; type: string } }>
		timeframe?: { name: string } | null
	}
	tickSize?: number
	tickValue?: number
}

const TradeInfoPanel = ({
	trade,
	executions,
	fullTrade,
	onDirtyChange,
}: TradeInfoPanelProps) => {
	const tPanel = useTranslations("trade.panel")
	const [isDirty, setIsDirty] = useState(false)

	// M3: useCallback prevents TradeInfoNotesTab from re-rendering due to new function reference
	const handleDirtyChange = useCallback(
		(dirty: boolean) => {
			setIsDirty(dirty)
			onDirtyChange?.(dirty)
		},
		[onDirtyChange]
	)

	return (
		<div
			id="trade-info-panel"
			className="bg-bg-200 border-bg-300 p-m-400 flex h-full flex-col border-l"
		>
			<Tabs defaultValue="stats" className="flex h-full flex-col">
				<TabsList
					id="trade-info-tabs-list"
					variant="line"
					className="w-full shrink-0"
				>
					<TabsTrigger id="trade-info-tab-stats" value="stats">
						{tPanel("stats")}
					</TabsTrigger>
					<TabsTrigger id="trade-info-tab-notes" value="notes">
						{tPanel("notes")}
						{isDirty && (
							<span
								className="bg-warning ml-s-200 inline-block h-2 w-2 rounded-full"
								aria-label={tPanel("unsavedChanges")}
							/>
						)}
					</TabsTrigger>
					<TabsTrigger id="trade-info-tab-executions" value="executions">
						{tPanel("executions")}
					</TabsTrigger>
				</TabsList>

				{/* Stats Tab */}
				<TabsContent value="stats" className="pt-m-400 flex-1 overflow-y-auto">
					<TradeInfoStatsTab trade={trade} fullTrade={fullTrade} />
				</TabsContent>

				{/* Notes Tab — Editable Form */}
				<TabsContent
					value="notes"
					className="pt-m-400 flex flex-1 flex-col overflow-hidden"
				>
					<TradeInfoNotesTab
						tradeId={trade.id}
						fullTrade={fullTrade}
						onDirtyChange={handleDirtyChange}
					/>
				</TabsContent>

				{/* Executions Tab */}
				<TabsContent
					value="executions"
					className="pt-m-400 flex-1 overflow-y-auto"
				>
					<TradeInfoExecutionsTab trade={trade} executions={executions} />
				</TabsContent>
			</Tabs>
		</div>
	)
}

export type { TradeInfoPanelProps }
export { TradeInfoPanel }
