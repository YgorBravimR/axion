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
	getAssetSettings,
	getCircuitBreakerStatus,
	getDailySummary,
} from "@/app/actions/command-center"
import { getDailyPlanForCurrentAccount } from "@/app/actions/fractal-plan/daily"
import { getLiveTradingStatus } from "@/app/actions/live-trading-status"
import type {
	ChecklistWithCompletion,
	AssetSettingWithAsset,
	DailySummary,
} from "@/app/actions/command-center.types"
import type { CircuitBreakerStatus } from "@/lib/validations/command-center"
import type { LiveTradingStatusResult } from "@/types/live-trading-status"
import type {
	DailyChecklist as DailyChecklistType,
	DailyPlan,
	Asset,
	TradingAccount,
} from "@/db/schema"
import { useTranslations } from "next-intl"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { commandCenterGuide } from "@/components/ui/page-guide/guide-configs/command-center"

import { CalendarDays } from "lucide-react"

interface CommandCenterContentProps {
	initialCompletions: ChecklistWithCompletion[]
	initialDailyPlan: DailyPlan | null
	initialAssetSettings: AssetSettingWithAsset[]
	initialCircuitBreaker: CircuitBreakerStatus | null
	initialSummary: DailySummary | null
	availableAssets: Asset[]
	account: TradingAccount | null
	viewDate: string
	isToday: boolean
	initialLiveTradingStatus?: LiveTradingStatusResult | null
}

const CommandCenterContent = ({
	initialCompletions,
	initialDailyPlan,
	initialAssetSettings,
	initialCircuitBreaker,
	initialSummary,
	availableAssets,
	account,
	viewDate,
	isToday,
	initialLiveTradingStatus = null,
}: CommandCenterContentProps) => {
	const isReadOnly = !isToday
	const tPlan = useTranslations("commandCenter.plan")
	const { isPremium } = useFeatureAccess()
	useRegisterPageGuide(commandCenterGuide)

	// State
	const [completions, setCompletions] = useState(initialCompletions)
	const [dailyPlan, setDailyPlan] = useState(initialDailyPlan)
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

	// Refresh functions — all pass the current viewDate to fetch correct day's data
	const refreshCompletions = useCallback(async () => {
		const result = await getTodayCompletions(new Date(viewDate))
		if (result.status === "success" && result.data) {
			setCompletions(result.data)
		}
	}, [viewDate])

	const refreshDailyPlan = useCallback(async () => {
		const result = await getDailyPlanForCurrentAccount({ dateISO: viewDate })
		if (result.status === "success" && result.data?.kind === "ok") {
			setDailyPlan(result.data.dayRow)
		}
	}, [viewDate])

	const refreshAssetSettings = useCallback(async () => {
		const result = await getAssetSettings()
		if (result.status === "success" && result.data) {
			setAssetSettings(result.data)
		}
	}, [])

	const refreshCircuitBreaker = useCallback(async () => {
		const result = await getCircuitBreakerStatus(new Date(viewDate))
		if (result.status === "success" && result.data) {
			setCircuitBreaker(result.data)
		}
	}, [viewDate])

	const refreshSummary = useCallback(async () => {
		const result = await getDailySummary(new Date(viewDate))
		if (result.status === "success" && result.data) {
			setSummary(result.data)
		}
	}, [viewDate])

	const refreshLiveTradingStatus = useCallback(async () => {
		const result = await getLiveTradingStatus(new Date(viewDate))
		if (result.status === "success" && result.data) {
			setLiveTradingStatus(result.data)
		}
	}, [viewDate])

	const handleManageChecklist = useCallback(
		(checklistId: string) => {
			const checklist = completions.find((c) => c.id === checklistId) ?? null
			setEditingChecklist(checklist)
			setChecklistManagerOpen(true)
		},
		[completions]
	)

	const handleChecklistManagerClose = useCallback(() => {
		setChecklistManagerOpen(false)
		setEditingChecklist(null)
	}, [])

	const handleChecklistManagerSuccess = useCallback(() => {
		void refreshCompletions()
	}, [refreshCompletions])

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
					{/* Daily Checklist — premium+ only */}
					{isPremium && (
						<DailyChecklist
							checklists={completions}
							onManageClick={handleManageChecklist}
							onRefresh={refreshCompletions}
							isReadOnly={isReadOnly}
						/>
					)}

					{/* Pre-Market Notes — premium+ only */}
					{isPremium && (
						<PreMarketNotes
							dailyPlan={dailyPlan}
							onRefresh={refreshDailyPlan}
							isReadOnly={isReadOnly}
						/>
					)}
				</div>

				{/* Right Column */}
				<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 min-w-0">
					{/* Phase 4b: legacy plan summary removed — fractal-plan UI (Phase 5) replaces this. */}
					<div
						id="cc-plan-summary"
						className="border-bg-300 bg-bg-100 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border border-dashed"
						aria-label={tPlan("title")}
					>
						<div className="gap-s-300 flex flex-col items-center text-center">
							<CalendarDays className="text-txt-300 h-8 w-8" />
							<h3 className="text-small text-txt-100 font-semibold">
								{tPlan("title")}
							</h3>
							<p className="text-tiny text-txt-300">{tPlan("noPlanPrompt")}</p>
						</div>
					</div>

					{/* Post-Market Notes — premium+ only */}
					{isPremium && (
						<PostMarketNotes
							dailyPlan={dailyPlan}
							onRefresh={refreshDailyPlan}
							isReadOnly={isReadOnly}
						/>
					)}
				</div>
			</div>

			{/* Asset Rules — premium+ only */}
			{isPremium && (
				<AssetRulesPanel
					settings={assetSettings}
					availableAssets={availableAssets}
					onRefresh={refreshAssetSettings}
				/>
			)}

			{/* Daily Summary - Full Width */}
			<DailySummaryCard summary={summary} />

			{/* Checklist Manager Dialog — premium+ only */}
			{isPremium && !isReadOnly && (
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

export { CommandCenterContent }
export type { CommandCenterContentProps }
