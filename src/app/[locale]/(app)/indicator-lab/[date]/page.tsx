import { fetchHawksIsolationData } from "@/app/actions/hawks-isolation-data"
import { HawksIsolationCharts } from "@/components/dev/hawks-isolation-charts"
import { requireRole } from "@/lib/auth-utils"

const IndicatorLabDatePage = async ({
	params,
}: {
	params: Promise<{ locale: string; date: string }>
}): Promise<React.ReactElement> => {
	await requireRole("admin")
	const { locale, date } = await params
	const data = await fetchHawksIsolationData(date)

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600">
			<HawksIsolationCharts data={data} locale={locale} />
		</div>
	)
}

export { IndicatorLabDatePage as default }
