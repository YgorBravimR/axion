import { loadHawksEngineLabData } from "@/app/actions/hawks-engine-lab-data"
import { HawksEngineLab } from "@/components/dev/hawks-engine-lab"
import { requireRole } from "@/lib/auth-utils"

const DEFAULT_FROM = "2026-05-01"
const DEFAULT_TO = "2026-05-30"

const HawksEngineLabPage = async () => {
	await requireRole("admin")
	const initial = await loadHawksEngineLabData(DEFAULT_FROM, DEFAULT_TO)

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 container mx-auto max-w-screen-2xl">
			<HawksEngineLab
				initialData={initial}
				initialFrom={DEFAULT_FROM}
				initialTo={DEFAULT_TO}
			/>
		</div>
	)
}

export { HawksEngineLabPage as default }
