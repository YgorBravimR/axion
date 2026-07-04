"use client"

import {
	getAssetSettings,
	getTodayCompletions,
} from "@/app/actions/command-center"
import type {
	AssetSettingWithAsset,
	ChecklistWithCompletion,
	DailySummary,
} from "@/app/actions/command-center.types"
import { getDailyPlanForCurrentAccount } from "@/app/actions/fractal-plan/daily"
import {
	AssetRulesPanel,
	ChecklistManager,
	CircuitBreakerPanel,
	DailyChecklist,
	DailySummaryCard,
	LiveTradingStatusPanel,
	PostMarketNotes,
	PreMarketNotes,
} from "@/components/command-center"
import { DateNavigator } from "@/components/command-center/date-navigator"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { commandCenterGuide } from "@/components/ui/page-guide/guide-configs/command-center"
import type {
	Asset,
	DailyChecklist as DailyChecklistType,
	DailyHawksBias,
	DailyPlan,
} from "@/db/schema"
import { Crosshair, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useAccountMode } from "@/components/providers/account-mode-provider"
import type { CircuitBreakerStatus } from "@/lib/validations/command-center"
import type { LiveTradingStatusResult } from "@/types/live-trading-status"
import { useCallback, useState, useTransition } from "react"
import { QuickAddTradeFab } from "@/components/journal/quick-add-trade-fab"

interface CommandCenterContentProps {
	initialCompletions: ChecklistWithCompletion[]
	initialDailyPlan: DailyPlan | null
	initialAssetSettings: AssetSettingWithAsset[]
	initialCircuitBreaker: CircuitBreakerStatus | null
	initialSummary: DailySummary | null
	availableAssets: Asset[]
	viewDate: string
	isToday: boolean
	initialLiveTradingStatus?: LiveTradingStatusResult | null
	initialHawksBias?: DailyHawksBias | null
	hawksDailyOrdinal?: number
}

const CommandCenterContent = ({
	initialCompletions,
	initialDailyPlan,
	initialAssetSettings,
	initialCircuitBreaker,
	initialSummary,
	availableAssets,
	viewDate,
	isToday,
	initialLiveTradingStatus = null,
	initialHawksBias: _initialHawksBias = null,
	hawksDailyOrdinal = 0,
}: CommandCenterContentProps) => {
	const isReadOnly = !isToday
	const { isPremium } = useFeatureAccess()
	const { isHawks: isHawksActive } = useAccountMode()
	const tHawks = useTranslations("hawks.dailyCount")
	const tNav = useTranslations("commandCenter.dateNavigator")
	useRegisterPageGuide(commandCenterGuide)

	// State
	const [completions, setCompletions] = useState(initialCompletions)
	const [dailyPlan, setDailyPlan] = useState(initialDailyPlan)
	const [assetSettings, setAssetSettings] = useState(initialAssetSettings)
	const [circuitBreaker] = useState(initialCircuitBreaker)
	const [summary] = useState(initialSummary)
	const [liveTradingStatus] = useState(initialLiveTradingStatus)

	// Checklist manager
	const [checklistManagerOpen, setChecklistManagerOpen] = useState(false)
	const [editingChecklist, setEditingChecklist] =
		useState<DailyChecklistType | null>(null)

	// Refresh transitions — independent per panel so a save in one column does
	// not dim an unrelated one. `isPending` flips true the moment startTransition
	// runs and stays true until the setState commit lands, giving us a synchronous
	// flag to forward as aria-busy + opacity dim while the action is in flight.
	const [isCompletionsRefreshing, startCompletionsTransition] = useTransition()
	const [isDailyPlanRefreshing, startDailyPlanTransition] = useTransition()
	const [isAssetSettingsRefreshing, startAssetSettingsTransition] =
		useTransition()

	// Refresh functions — all pass the current viewDate to fetch correct day's data
	const refreshCompletions = useCallback(() => {
		startCompletionsTransition(async () => {
			const result = await getTodayCompletions(new Date(viewDate))
			if (result.status === "success" && result.data) {
				setCompletions(result.data)
			}
		})
	}, [viewDate])

	const refreshDailyPlan = useCallback(() => {
		startDailyPlanTransition(async () => {
			const result = await getDailyPlanForCurrentAccount({ dateISO: viewDate })
			if (result.status === "success" && result.data?.kind === "ok") {
				setDailyPlan(result.data.dayRow)
			}
		})
	}, [viewDate])

	const refreshAssetSettings = useCallback(() => {
		startAssetSettingsTransition(async () => {
			const result = await getAssetSettings()
			if (result.status === "success" && result.data) {
				setAssetSettings(result.data)
			}
		})
	}, [])

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
		<div className="px-s-200 sm:px-m-400 space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 mx-auto max-w-7xl">
			{/* Date Navigator */}
			<DateNavigator currentDate={viewDate} isToday={isToday} />

			{/* Read-only banner — past-date view. The DateNavigator chip is easy
			    to miss; this banner is the unambiguous signal that the page's
			    edit controls are disabled. */}
			{isReadOnly && (
				<div
					className="p-s-300 gap-s-300 border-acc-100/30 bg-acc-100/5 flex items-center rounded-lg border"
					role="status"
					aria-live="polite"
				>
					<Clock className="text-acc-100 h-4 w-4 shrink-0" aria-hidden="true" />
					<span className="text-small text-txt-100 font-medium">
						{tNav("readOnlyBannerTitle")}
					</span>
					<span className="text-small text-txt-300">
						{tNav("readOnlyBannerDescription")}
					</span>
				</div>
			)}

			{/* Hawks "Viés do dia" UI intentionally disabled everywhere. The
			    creation/review widgets used to render here (HawksMissingBiasAlert
			    + DailyBiasForm) and on the journal page; both were removed per
			    Ygor on 2026-06-23 — bias confirmation moved out of the UI flow.
			    Server-side checks (trade creation rejects when bias missing) are
			    untouched. Re-enable here if the gate comes back. */}

			{/* Hawks daily trade counter — compact badge visible when Hawks is active today.
			    The cap mirrors the Circuit Breaker's resolved maxTrades (from the active
			    monthly plan) so both surfaces always show the same N. Falls back to the
			    Hawks ritual default of 3 if no plan is linked. */}
			{isHawksActive &&
				isToday &&
				(() => {
					const dailyCap = circuitBreaker?.maxTrades ?? 3
					const atCap = hawksDailyOrdinal >= dailyCap
					const nearCap =
						!atCap && dailyCap > 1 && hawksDailyOrdinal >= dailyCap - 1
					return (
						<div
							className={cn(
								"p-s-300 gap-s-300 flex items-center rounded-lg border",
								atCap
									? "border-destructive/30 bg-destructive/5"
									: nearCap
										? "border-warning/30 bg-warning/5"
										: "border-bg-300 bg-bg-200"
							)}
						>
							<Crosshair
								className={cn(
									"h-4 w-4 shrink-0",
									atCap
										? "text-destructive"
										: nearCap
											? "text-warning"
											: "text-acc-100"
								)}
								aria-hidden="true"
							/>
							<span
								className={cn(
									"text-small font-medium",
									atCap
										? "text-destructive"
										: nearCap
											? "text-warning"
											: "text-txt-100"
								)}
							>
								{atCap
									? tHawks("atCap")
									: tHawks("badge", {
											ordinal: hawksDailyOrdinal,
											cap: dailyCap,
										})}
							</span>
							<span
								className={cn(
									"text-micro ml-auto shrink-0 rounded-sm px-1.5 py-0.5 font-medium tabular-nums",
									atCap
										? "bg-destructive/20 text-destructive"
										: nearCap
											? "bg-warning/20 text-warning"
											: "bg-acc-100/10 text-acc-100"
								)}
							>
								{hawksDailyOrdinal}/{dailyCap}
							</span>
						</div>
					)
				})()}

			{/* Circuit Breaker Panel - Full Width */}
			<CircuitBreakerPanel status={circuitBreaker} />

			{/* Live Trading Status Panel - Full Width */}
			<LiveTradingStatusPanel
				data={liveTradingStatus}
				availableAssets={availableAssets}
			/>

			{/* Main Grid — reflowed:
			    • Daily Checklist gets its own full-width row.
			    • Pre-Market & Post-Market notes sit side-by-side as a
			      morning/evening pair, which mirrors the session arc
			      and removes the "lonely card in a third row" gap. */}
			{isPremium && (
				<DailyChecklist
					checklists={completions}
					onManageClick={handleManageChecklist}
					onRefresh={refreshCompletions}
					isReadOnly={isReadOnly}
					isRefreshing={isCompletionsRefreshing}
				/>
			)}

			{isPremium && (
				<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid md:grid-cols-2">
					<PreMarketNotes
						dailyPlan={dailyPlan}
						onRefresh={refreshDailyPlan}
						isReadOnly={isReadOnly}
						isRefreshing={isDailyPlanRefreshing}
					/>
					<PostMarketNotes
						dailyPlan={dailyPlan}
						onRefresh={refreshDailyPlan}
						isReadOnly={isReadOnly}
						isRefreshing={isDailyPlanRefreshing}
					/>
				</div>
			)}

			{/* Asset Rules — premium+ only */}
			{isPremium && (
				<AssetRulesPanel
					settings={assetSettings}
					availableAssets={availableAssets}
					onRefresh={refreshAssetSettings}
					isRefreshing={isAssetSettingsRefreshing}
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

			{/* Quick Add Trade FAB — visible only on today's view */}
			{isToday && <QuickAddTradeFab availableAssets={availableAssets} />}
		</div>
	)
}

export { CommandCenterContent }
export type { CommandCenterContentProps }
