import { runHawksAuditDebug } from "@/app/actions/hawks-audit-debug"
import { HawksAuditDebugger } from "@/components/dev/hawks-audit-debugger"
import { requireRole } from "@/lib/auth-utils"

const DEFAULT_FROM = "2026-03-02"
const DEFAULT_TO = "2026-05-13"

const HawksAuditPage = async () => {
	await requireRole("admin")
	const initial = await runHawksAuditDebug(DEFAULT_FROM, DEFAULT_TO)

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 container mx-auto max-w-screen-2xl">
			<HawksAuditDebugger
				initialResult={initial}
				initialFromDate={DEFAULT_FROM}
				initialToDate={DEFAULT_TO}
			/>
		</div>
	)
}

export { HawksAuditPage as default }
