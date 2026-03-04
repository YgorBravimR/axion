import { getTranslations, setRequestLocale } from "next-intl/server"
import { CommandCenterTabs } from "./command-center-tabs"
import {
	getChecklists,
	getTodayCompletions,
	getTodayNotes,
	getAccountAssetSettings,
	getCircuitBreakerStatus,
	getDailySummary,
} from "@/app/actions/command-center"
import { getActiveMonthlyPlan } from "@/app/actions/monthly-plans"
import { listActiveRiskProfiles } from "@/app/actions/risk-profiles"
import { getActiveAssets } from "@/app/actions/assets"
import { getCurrentAccount } from "@/app/actions/auth"
import { getStrategies } from "@/app/actions/strategies"
import { getLiveTradingStatus } from "@/app/actions/live-trading-status"
import { getEffectiveDateWithOverride } from "@/lib/effective-date"
import { formatDateKey } from "@/lib/dates"
import { fromCents } from "@/lib/money"

// Force dynamic rendering to ensure account-specific data
export const dynamic = "force-dynamic"

interface CommandCenterPageProps {
	params: Promise<{ locale: string }>
	searchParams: Promise<{ date?: string }>
}

const isSameDay = (a: Date, b: Date): boolean =>
	a.getFullYear() === b.getFullYear() &&
	a.getMonth() === b.getMonth() &&
	a.getDate() === b.getDate()

const CommandCenterPage = async ({ params, searchParams }: CommandCenterPageProps) => {
	const { locale } = await params
	const { date: dateParam } = await searchParams
	setRequestLocale(locale)

	const t = await getTranslations("commandCenter")

	// Fetch account first so we can resolve effective date for replay accounts
	const account = await getCurrentAccount()

	// Resolve view date: URL param → replay date → real now
	const urlDate = dateParam ? new Date(dateParam + "T12:00:00") : undefined
	const effectiveDate = getEffectiveDateWithOverride(account, urlDate)
	const now = new Date()
	const isToday = !dateParam || isSameDay(effectiveDate, account?.accountType === "replay" && account.replayCurrentDate ? new Date(account.replayCurrentDate) : now)
	const viewDateStr = formatDateKey(effectiveDate)

	// Pass date to date-sensitive actions (undefined = today's effective date)
	const dateArg = isToday ? (account?.accountType === "replay" ? effectiveDate : undefined) : effectiveDate

	// Fetch all initial data server-side in parallel
	const [
		checklistsResult,
		completionsResult,
		notesResult,
		assetSettingsResult,
		circuitBreakerResult,
		summaryResult,
		assetsResult,
		strategiesResult,
		monthlyPlanResult,
		riskProfilesResult,
		liveTradingStatusResult,
	] = await Promise.all([
		getChecklists(),
		getTodayCompletions(dateArg),
		getTodayNotes(dateArg),
		getAccountAssetSettings(),
		getCircuitBreakerStatus(dateArg),
		getDailySummary(dateArg),
		getActiveAssets().catch(() => []),
		getStrategies(),
		getActiveMonthlyPlan(),
		listActiveRiskProfiles(),
		getLiveTradingStatus(dateArg),
	])

	const initialChecklists =
		checklistsResult.status === "success" && checklistsResult.data
			? checklistsResult.data
			: []
	const initialCompletions =
		completionsResult.status === "success" && completionsResult.data
			? completionsResult.data
			: []
	const initialNotes =
		notesResult.status === "success" ? (notesResult.data ?? null) : null
	const initialAssetSettings =
		assetSettingsResult.status === "success" && assetSettingsResult.data
			? assetSettingsResult.data
			: []
	const initialCircuitBreaker =
		circuitBreakerResult.status === "success" ? (circuitBreakerResult.data ?? null) : null
	const initialSummary =
		summaryResult.status === "success" ? (summaryResult.data ?? null) : null
	const availableAssets = assetsResult || []
	const initialStrategies =
		strategiesResult.status === "success" && strategiesResult.data
			? strategiesResult.data
			: []
	const initialPlan =
		monthlyPlanResult.status === "success" ? (monthlyPlanResult.data ?? null) : null
	const riskProfiles =
		riskProfilesResult.status === "success" ? (riskProfilesResult.data ?? []) : []
	const initialLiveTradingStatus =
		liveTradingStatusResult.status === "success" ? (liveTradingStatusResult.data ?? null) : null

	// Derive current year/month from effective date for the Plan tab
	const planYear = effectiveDate.getFullYear()
	const planMonth = effectiveDate.getMonth() + 1

	// Account settings: read exclusively from monthly plan
	const accountSettings = {
		defaultRiskPerTrade: initialPlan?.riskPerTradeCents
			? String(fromCents(initialPlan.riskPerTradeCents))
			: null,
		maxDailyLoss: initialPlan?.dailyLossCents ? Number(initialPlan.dailyLossCents) : null,
	}

	return (
		<div className="flex h-full flex-col">
			<CommandCenterTabs
				initialChecklists={initialChecklists}
				initialCompletions={initialCompletions}
				initialNotes={initialNotes}
				initialAssetSettings={initialAssetSettings}
				initialCircuitBreaker={initialCircuitBreaker}
				initialSummary={initialSummary}
				availableAssets={availableAssets}
				account={account}
				calculatorAssets={availableAssets}
				accountSettings={accountSettings}
				strategies={initialStrategies}
				assetSettings={initialAssetSettings}
				initialPlan={initialPlan}
				initialYear={planYear}
				initialMonth={planMonth}
				viewDate={viewDateStr}
				isToday={isToday}
				riskProfiles={riskProfiles}
				isReplayAccount={account?.accountType === "replay"}
				initialLiveTradingStatus={initialLiveTradingStatus}
			/>
		</div>
	)
}

export default CommandCenterPage
