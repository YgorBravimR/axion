import { NewTradeTabs } from "@/components/journal"
import { getStrategies } from "@/app/actions/strategies"
import { getTags } from "@/app/actions/tags"
import { getActiveAssets } from "@/app/actions/assets"
import { getActiveTimeframes } from "@/app/actions/timeframes"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { getCurrentAccount } from "@/app/actions/auth"
import { requireRole } from "@/lib/auth-utils"
import { getActiveAccountModeForUser } from "@/lib/hawks/account-context"

interface NewTradePageProps {
	searchParams: Promise<{ returnTo?: string; asset?: string }>
}

const NewTradePage = async ({ searchParams }: NewTradePageProps) => {
	await requireRole("trader")
	const { returnTo, asset } = await searchParams

	const [
		strategiesResult,
		tagsResult,
		assets,
		timeframes,
		effectiveDate,
		account,
		accountMode,
	] = await Promise.all([
		getStrategies(),
		getTags(),
		getActiveAssets().catch(() => []),
		getActiveTimeframes().catch(() => []),
		getServerEffectiveNow(),
		getCurrentAccount(),
		getActiveAccountModeForUser(),
	])

	const strategies =
		strategiesResult.status === "success" ? strategiesResult.data || [] : []
	const tags = tagsResult.status === "success" ? tagsResult.data || [] : []

	// URL query param takes priority, then account's default asset
	const resolvedDefaultAsset = asset || account?.defaultAsset || undefined

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-auto">
				<div className="mx-auto max-w-5xl">
					<div className="border-bg-300 bg-bg-200 p-m-400 sm:p-m-500 lg:p-m-600 rounded-lg border">
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
					</div>
				</div>
			</div>
		</div>
	)
}

export { NewTradePage as default }
