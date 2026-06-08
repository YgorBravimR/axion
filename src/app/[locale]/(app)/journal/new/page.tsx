import { NewTradeTabs } from "@/components/journal"
import { Panel } from "@/components/ui/panel"
import { getStrategies } from "@/app/actions/strategies"
import { getTags } from "@/app/actions/tags"
import { getActiveAssets } from "@/app/actions/assets"
import { getActiveTimeframes } from "@/app/actions/timeframes"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { getCurrentAccount } from "@/app/actions/auth"
import { requireRole } from "@/lib/auth-utils"
import {
	getActiveAccountModeForUser,
	getHawksDailyOrdinal,
} from "@/lib/hawks/account-context"
import { HawksDailyCapBanner } from "@/components/hawks/hawks-daily-cap-banner"
import { formatDateKey } from "@/lib/dates"

interface NewTradePageProps {
	searchParams: Promise<{ returnTo?: string; asset?: string }>
}

const NewTradePage = async ({ searchParams }: NewTradePageProps) => {
	await requireRole("trader")
	const { returnTo, asset } = await searchParams

	const effectiveDate = await getServerEffectiveNow()
	const viewDateStr = formatDateKey(effectiveDate)

	const [
		strategiesResult,
		tagsResult,
		assets,
		timeframes,
		account,
		accountMode,
		dailyOrdinal,
	] = await Promise.all([
		getStrategies(),
		getTags(),
		getActiveAssets().catch(() => []),
		getActiveTimeframes().catch(() => []),
		getCurrentAccount(),
		getActiveAccountModeForUser(),
		getHawksDailyOrdinal(viewDateStr),
	])

	const strategies =
		strategiesResult.status === "success" ? strategiesResult.data || [] : []
	const tags = tagsResult.status === "success" ? tagsResult.data || [] : []

	// URL query param takes priority, then account's default asset
	const resolvedDefaultAsset = asset || account?.defaultAssetId || undefined

	const isHawksAtCap = accountMode === "hawks" && dailyOrdinal >= 3

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-auto">
				<div className="space-y-m-400">
					{isHawksAtCap && <HawksDailyCapBanner ordinal={dailyOrdinal} />}
					<Panel padding="lg">
						<NewTradeTabs
							strategies={strategies}
							tags={tags}
							assets={assets}
							timeframes={timeframes}
							redirectTo={returnTo}
							defaultAssetId={resolvedDefaultAsset}
							defaultDate={effectiveDate.toISOString()}
							hawksModeActive={accountMode === "hawks"}
						/>
					</Panel>
				</div>
			</div>
		</div>
	)
}

export { NewTradePage as default }
