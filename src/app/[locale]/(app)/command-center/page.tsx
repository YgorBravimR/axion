import { setRequestLocale } from "next-intl/server"
import { CommandCenterTabs } from "./command-center-tabs"
import {
	getTodayCompletions,
	getAccountAssetSettings,
	getCircuitBreakerStatus,
	getDailySummary,
} from "@/app/actions/command-center"
import { getActiveAssets } from "@/app/actions/assets"
import { getCurrentAccount } from "@/app/actions/auth"
import { getStrategies } from "@/app/actions/strategies"
import { getLiveTradingStatus } from "@/app/actions/live-trading-status"
import { getEffectiveDateWithOverride } from "@/lib/effective-date"
import { formatDateKey } from "@/lib/dates"
import { fromCents } from "@/lib/money"
import { ensureDailyPlanForAccountDate } from "@/lib/fractal-plan/ensure-daily"
import {
	getDailyHawksBias,
	getHawksDailyOrdinal,
} from "@/lib/hawks/account-context"
import type { DailyPlan } from "@/db/schema"

interface CommandCenterPageProps {
	params: Promise<{ locale: string }>
	searchParams: Promise<{ date?: string }>
}

const isSameDay = (a: Date, b: Date): boolean =>
	a.getFullYear() === b.getFullYear() &&
	a.getMonth() === b.getMonth() &&
	a.getDate() === b.getDate()

const CommandCenterPage = async ({
	params,
	searchParams,
}: CommandCenterPageProps) => {
	const { locale } = await params
	const { date: dateParam } = await searchParams
	setRequestLocale(locale)

	const account = await getCurrentAccount()

	// Resolve view date: URL param → real now
	const urlDate = dateParam ? new Date(dateParam + "T12:00:00") : undefined
	const effectiveDate = getEffectiveDateWithOverride(account, urlDate)
	const isToday = !dateParam || isSameDay(effectiveDate, new Date())
	const viewDateStr = formatDateKey(effectiveDate)

	// Pass date to date-sensitive actions (undefined = today's effective date)
	const dateArg = isToday ? undefined : effectiveDate

	// Fetch all initial data server-side in parallel
	const dailyPlanPromise: Promise<DailyPlan | null> = account?.id
		? ensureDailyPlanForAccountDate(account.id, effectiveDate).then((r) =>
				r.status === "ok" ? r.dayRow : null
			)
		: Promise.resolve(null)

	const [
		completionsResult,
		initialDailyPlan,
		assetSettingsResult,
		circuitBreakerResult,
		summaryResult,
		assetsResult,
		strategiesResult,
		liveTradingStatusResult,
		initialHawksBias,
		hawksDailyOrdinal,
	] = await Promise.all([
		getTodayCompletions(dateArg),
		dailyPlanPromise,
		getAccountAssetSettings(),
		getCircuitBreakerStatus(dateArg),
		getDailySummary(dateArg),
		getActiveAssets().catch(() => []),
		getStrategies(),
		getLiveTradingStatus(dateArg),
		getDailyHawksBias(viewDateStr),
		getHawksDailyOrdinal(viewDateStr),
	])

	const initialCompletions =
		completionsResult.status === "success" && completionsResult.data
			? completionsResult.data
			: []
	const initialAssetSettings =
		assetSettingsResult.status === "success" && assetSettingsResult.data
			? assetSettingsResult.data
			: []
	const initialCircuitBreaker =
		circuitBreakerResult.status === "success"
			? (circuitBreakerResult.data ?? null)
			: null
	const initialSummary =
		summaryResult.status === "success" ? (summaryResult.data ?? null) : null
	const availableAssets = assetsResult || []
	const initialStrategies =
		strategiesResult.status === "success" && strategiesResult.data
			? strategiesResult.data
			: []
	const initialLiveTradingStatus =
		liveTradingStatusResult.status === "success"
			? (liveTradingStatusResult.data ?? null)
			: null

	// Account settings: derived from circuit-breaker resolver output (Phase 4b)
	const accountSettings = {
		defaultRiskPerTrade: initialCircuitBreaker?.recommendedRiskCents
			? String(fromCents(initialCircuitBreaker.recommendedRiskCents))
			: null,
		maxDailyLoss: initialCircuitBreaker?.dailyLossLimitCents ?? null,
	}

	return (
		<div className="flex h-full flex-col">
			<CommandCenterTabs
				initialCompletions={initialCompletions}
				initialDailyPlan={initialDailyPlan}
				initialAssetSettings={initialAssetSettings}
				initialCircuitBreaker={initialCircuitBreaker}
				initialSummary={initialSummary}
				availableAssets={availableAssets}
				account={account}
				calculatorAssets={availableAssets}
				accountSettings={accountSettings}
				strategies={initialStrategies}
				assetSettings={initialAssetSettings}
				viewDate={viewDateStr}
				isToday={isToday}
				initialLiveTradingStatus={initialLiveTradingStatus}
				initialHawksBias={initialHawksBias}
				hawksDailyOrdinal={hawksDailyOrdinal}
			/>
		</div>
	)
}

export { CommandCenterPage as default }
