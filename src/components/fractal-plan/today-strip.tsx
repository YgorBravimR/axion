import { resolveDay } from "@/lib/fractal-plan/resolver"
import { isFractalPlanDualWriteEnabled } from "@/lib/flags/fractal-plan"
import { ProvenanceBadge } from "./provenance-badge"

interface TodayStripProps {
	accountId: string
	now: Date
	locale: string
}

const TodayStrip = async ({ accountId, now, locale }: TodayStripProps) => {
	if (!isFractalPlanDualWriteEnabled()) return null

	const r = await resolveDay(accountId, now)
	if (!r) return null

	const year = now.getFullYear()
	const month = now.getMonth() + 1
	const quarter = Math.ceil(month / 3)

	// ISO week number (UTC-anchored)
	const jan4 = new Date(Date.UTC(year, 0, 4))
	const dayOfWeek = (jan4.getUTCDay() + 6) % 7
	const week1Monday = new Date(jan4)
	week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek)
	const msPerWeek = 7 * 24 * 60 * 60 * 1000
	const nowUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
	const isoWeek = Math.floor((nowUtc.getTime() - week1Monday.getTime()) / msPerWeek) + 1

	const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
	const href = `/${locale}/plan/${year}/${quarter}/${month}/${isoWeek}/${dateStr}`

	const formatR = (v: string | null | undefined) => {
		if (v == null) return "—"
		const n = Number(v)
		return Number.isFinite(n) ? `${n.toFixed(2)}R` : "—"
	}

	return (
		<div className="mb-m-400 flex items-center justify-between rounded-lg border border-bg-300 bg-bg-200 px-m-400 py-m-300">
			<div className="flex items-center gap-m-300">
				<span className="text-sm text-text-200">Today&apos;s plan</span>
				<span className="font-mono text-text-100">
					Loss: {formatR(r.dailyLossR.value)}
				</span>
				<ProvenanceBadge level={r.dailyLossR.source} />
				<span className="font-mono text-text-100">
					Target: {formatR(r.dailyTargetR.value)}
				</span>
				<ProvenanceBadge level={r.dailyTargetR.source} />
			</div>
			<a href={href} className="text-sm text-acc-100 hover:underline">
				Open day view →
			</a>
		</div>
	)
}

export type { TodayStripProps }
export { TodayStrip }
