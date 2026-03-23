import { getTranslations, setRequestLocale } from "next-intl/server"
import { PlaybookContent } from "@/components/playbook"
import { getStrategies, getComplianceOverview } from "@/app/actions/strategies"


interface PlaybookPageProps {
	params: Promise<{ locale: string }>
}

const PlaybookPage = async ({ params }: PlaybookPageProps) => {
	const pageStart = performance.now()

	const { locale } = await params
	setRequestLocale(locale)

	const t = await getTranslations("playbook")

	const [strategiesResult, complianceResult] = await Promise.all([
		getStrategies(),
		getComplianceOverview(),
	])

	const strategies = strategiesResult.status === "success" ? strategiesResult.data || [] : []
	const compliance = complianceResult.status === "success" ? complianceResult.data || null : null

	const pageMs = (performance.now() - pageStart).toFixed(1)
	console.log(`[YGORDEV:playbook] SSR: ${pageMs}ms | queries: 2`)

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 p-m-400 sm:p-m-500 lg:p-m-600">
				<PlaybookContent
					initialStrategies={strategies}
					initialCompliance={compliance}
				/>
			</div>
		</div>
	)
}

export default PlaybookPage
