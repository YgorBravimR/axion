"use client"

import { useState, useCallback } from "react"
import {
	CircuitBreakerPanel,
	DailyChecklist,
	ChecklistManager,
	PreMarketNotes,
	PostMarketNotes,
	AssetRulesPanel,
	DailySummaryCard,
	LiveTradingStatusPanel,
} from "@/components/command-center"
import { DateNavigator } from "@/components/command-center/date-navigator"
import {
	getTodayCompletions,
	getTodayNotes,
	getAssetSettings,
	getCircuitBreakerStatus,
	getDailySummary,
} from "@/app/actions/command-center"
import { getLiveTradingStatus } from "@/app/actions/live-trading-status"
import type {
	ChecklistWithCompletion,
	AssetSettingWithAsset,
	DailySummary,
} from "@/app/actions/command-center"
import type { CircuitBreakerStatus } from "@/lib/validations/command-center"
import type { LiveTradingStatusResult } from "@/types/live-trading-status"
import type {
	DailyChecklist as DailyChecklistType,
	DailyAccountNote,
	Asset,
	TradingAccount,
	MonthlyPlan,
} from "@/db/schema"
import { useTranslations } from "next-intl"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useFormatting } from "@/hooks/use-formatting"
import { fromCents } from "@/lib/money"
import { CalendarDays, Target, TrendingDown, ShieldCheck } from "lucide-react"

export interface CommandCenterContentProps {
	initialChecklists: DailyChecklistType[]
	initialCompletions: ChecklistWithCompletion[]
	initialNotes: DailyAccountNote | null
	initialAssetSettings: AssetSettingWithAsset[]
	initialCircuitBreaker: CircuitBreakerStatus | null
	initialSummary: DailySummary | null
	availableAssets: Asset[]
	account: TradingAccount | null
	viewDate: string
	isToday: boolean
	initialPlan?: MonthlyPlan | null
	riskProfileName?: string | null
	initialLiveTradingStatus?: LiveTradingStatusResult | null
}

export const CommandCenterContent = ({
	initialChecklists,
	initialCompletions,
	initialNotes,
	initialAssetSettings,
	initialCircuitBreaker,
	initialSummary,
	availableAssets,
	account,
	viewDate,
	isToday,
	initialPlan,
	riskProfileName,
	initialLiveTradingStatus = null,
}: CommandCenterContentProps) => {
	const isReadOnly = !isToday
	const tPlan = useTranslations("commandCenter.plan")
	const { isAdmin } = useFeatureAccess()
	const { formatCurrency } = useFormatting()

	// State
	const [completions, setCompletions] = useState(initialCompletions)
	const [notes, setNotes] = useState(initialNotes)
	const [assetSettings, setAssetSettings] = useState(initialAssetSettings)
	const [circuitBreaker, setCircuitBreaker] = useState(initialCircuitBreaker)
	const [summary, setSummary] = useState(initialSummary)
	const [liveTradingStatus, setLiveTradingStatus] = useState(
		initialLiveTradingStatus
	)

	// Checklist manager
	const [checklistManagerOpen, setChecklistManagerOpen] = useState(false)
	const [editingChecklist, setEditingChecklist] =
		useState<DailyChecklistType | null>(null)

	// Refresh functions
	const refreshCompletions = useCallback(async () => {
		const result = await getTodayCompletions()
		if (result.status === "success" && result.data) {
			setCompletions(result.data)
		}
	}, [])

	const refreshNotes = useCallback(async () => {
		const result = await getTodayNotes()
		if (result.status === "success") {
			setNotes(result.data ?? null)
		}
	}, [])

	const refreshAssetSettings = useCallback(async () => {
		const result = await getAssetSettings()
		if (result.status === "success" && result.data) {
			setAssetSettings(result.data)
		}
	}, [])

	const refreshCircuitBreaker = useCallback(async () => {
		const result = await getCircuitBreakerStatus()
		if (result.status === "success" && result.data) {
			setCircuitBreaker(result.data)
		}
	}, [])

	const refreshSummary = useCallback(async () => {
		const result = await getDailySummary()
		if (result.status === "success" && result.data) {
			setSummary(result.data)
		}
	}, [])

	const refreshLiveTradingStatus = useCallback(async () => {
		const result = await getLiveTradingStatus()
		if (result.status === "success" && result.data) {
			setLiveTradingStatus(result.data)
		}
	}, [])

	const handleManageChecklist = () => {
		setEditingChecklist(completions.length > 0 ? completions[0] : null)
		setChecklistManagerOpen(true)
	}

	const handleChecklistManagerClose = () => {
		setChecklistManagerOpen(false)
		setEditingChecklist(null)
	}

	const handleChecklistManagerSuccess = () => {
		refreshCompletions()
	}

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 mx-auto max-w-7xl">
			{/* Date Navigator */}
			<DateNavigator
				currentDate={viewDate}
				isToday={isToday}
				isReplayAccount={account?.accountType === "replay"}
			/>

			{/* Circuit Breaker Panel - Full Width */}
			<CircuitBreakerPanel status={circuitBreaker} />

			{/* Live Trading Status Panel - Full Width */}
			<LiveTradingStatusPanel
				data={liveTradingStatus}
				availableAssets={availableAssets}
			/>

			{/* Main Grid */}
			<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid md:grid-cols-2">
				{/* Left Column */}
				<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 min-w-0">
					{/* Daily Checklist — admin only */}
					{isAdmin && (
						<DailyChecklist
							checklists={completions}
							onManageClick={handleManageChecklist}
							onRefresh={refreshCompletions}
							isReadOnly={isReadOnly}
						/>
					)}

					{/* Pre-Market Notes — admin only */}
					{isAdmin && (
						<PreMarketNotes
							notes={notes}
							onRefresh={refreshNotes}
							isReadOnly={isReadOnly}
						/>
					)}
				</div>

				{/* Right Column */}
				<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 min-w-0">
					{/* Plan summary or "create plan" prompt */}
					{initialPlan ? (
						<div className="border-bg-300 bg-bg-100 p-s-300 sm:p-m-400 rounded-lg border">
							<div className="mb-s-300 sm:mb-m-400 gap-s-200 flex items-center">
								<CalendarDays className="text-acc-100 h-4 w-4" />
								<h3 className="text-small text-txt-100 font-semibold">
									{tPlan("title")}
								</h3>
							</div>
							{riskProfileName && (
								<div className="mb-s-300 gap-s-200 border-acc-100/20 bg-acc-100/5 px-s-300 py-s-200 flex items-center rounded-md border">
									<ShieldCheck className="text-acc-100 h-3.5 w-3.5" />
									<span className="text-tiny text-txt-200 font-medium">
										{tPlan("summary.usingProfile", { name: riskProfileName })}
									</span>
								</div>
							)}
							<div className="gap-s-300 grid grid-cols-2">
								<div className="border-bg-300 bg-bg-200 p-s-300 rounded-md border">
									<div className="gap-s-100 flex items-center">
										<Target className="text-acc-100 h-3 w-3" />
										<span className="text-tiny text-txt-300">
											{tPlan("summary.riskPerTrade")}
										</span>
									</div>
									<p className="mt-s-100 text-small text-txt-100 font-medium">
										{formatCurrency(fromCents(initialPlan.riskPerTradeCents))}
									</p>
									<p className="text-tiny text-txt-300">
										{initialPlan.riskPerTradePercent}%
									</p>
								</div>
								<div className="border-bg-300 bg-bg-200 p-s-300 rounded-md border">
									<div className="gap-s-100 flex items-center">
										<TrendingDown className="text-trade-sell h-3 w-3" />
										<span className="text-tiny text-txt-300">
											{tPlan("summary.dailyLossLimit")}
										</span>
									</div>
									<p className="mt-s-100 text-small text-txt-100 font-medium">
										{formatCurrency(fromCents(initialPlan.dailyLossCents))}
									</p>
									<p className="text-tiny text-txt-300">
										{initialPlan.dailyLossPercent}%
									</p>
								</div>
							</div>
						</div>
					) : (
						<div className="border-bg-300 bg-bg-100 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border border-dashed">
							<div className="gap-s-300 flex flex-col items-center text-center">
								<CalendarDays className="text-txt-300 h-8 w-8" />
								<p className="text-small text-txt-200">
									{tPlan("noPlanPrompt")}
								</p>
							</div>
						</div>
					)}

					{/* Post-Market Notes — admin only */}
					{isAdmin && (
						<PostMarketNotes
							notes={notes}
							onRefresh={refreshNotes}
							isReadOnly={isReadOnly}
						/>
					)}
				</div>
			</div>

			{/* Asset Rules — admin only */}
			{isAdmin && (
				<AssetRulesPanel
					settings={assetSettings}
					availableAssets={availableAssets}
					onRefresh={refreshAssetSettings}
				/>
			)}

			{/* Daily Summary - Full Width */}
			<DailySummaryCard summary={summary} />

			{/* Checklist Manager Dialog — admin only */}
			{isAdmin && !isReadOnly && (
				<ChecklistManager
					open={checklistManagerOpen}
					onClose={handleChecklistManagerClose}
					checklist={editingChecklist}
					onSuccess={handleChecklistManagerSuccess}
				/>
			)}
		</div>
	)
}
