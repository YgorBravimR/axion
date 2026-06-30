import { setRequestLocale } from "next-intl/server"
import { getHawksFullWindow } from "@/app/actions/hawks-chart-data"
import { listDrawings } from "@/app/actions/hawks-chart-drawings"
import { HawksChartWorkspace } from "@/components/hawks-chart/hawks-chart-workspace"
import { requireAuth } from "@/app/actions/auth"

interface HawksChartPageProps {
	params: Promise<{ locale: string }>
}

// Default asset = WIN. WDO support comes after a UI asset switcher (out of
// scope for v1 — for now the page is WIN-only, which matches every other
// hawks-* page in the repo).
const DEFAULT_ASSET = "WIN"

const HawksChartPage = async ({ params }: HawksChartPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)
	await requireAuth()

	const [windowResult, drawingsResult] = await Promise.all([
		getHawksFullWindow(DEFAULT_ASSET),
		listDrawings(DEFAULT_ASSET),
	])

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 space-y-m-400 flex-1 overflow-auto">
				<HawksChartWorkspace
					assetSymbol={DEFAULT_ASSET}
					initialWindow={windowResult}
					initialDrawings={
						drawingsResult.status === "success" ? drawingsResult.drawings : []
					}
				/>
			</div>
		</div>
	)
}

export { HawksChartPage as default }
