import { setRequestLocale } from "next-intl/server"
import { requireAuth } from "@/app/actions/auth"
import { resolveDay } from "@/lib/fractal-plan/resolver"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { ProvenanceBadge } from "@/components/fractal-plan/provenance-badge"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string; month: string; week: string; date: string }>
}

const formatR = (n: string | null | undefined): string => {
	if (n == null) return "—"
	const num = Number(n)
	return Number.isFinite(num) ? `${num.toFixed(2)}R` : "—"
}

const PlanDayPage = async ({ params }: PageProps) => {
	const { locale, date } = await params
	setRequestLocale(locale)

	// Parse date safely (avoid TZ issues with new Date(string))
	const [y, m, d] = date.split("-").map(Number)
	const day = new Date(y, m - 1, d)
	if (Number.isNaN(day.getTime())) {
		return (
			<PlanSection title="Invalid date">
				<p className="text-text-200">Date must be ISO yyyy-MM-dd.</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()
	const r = await resolveDay(accountId, day)

	if (!r) {
		return (
			<PlanSection title={date} subtitle="No yearly plan found for this date">
				<p className="text-text-200">Create a yearly plan to see cascade-resolved limits.</p>
			</PlanSection>
		)
	}

	return (
		<PlanSection title={date} subtitle="Day-level cascade-resolved limits">
			<dl className="grid grid-cols-1 gap-m-300 sm:grid-cols-2">
				<div>
					<dt className="text-sm text-text-200">Daily loss R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.dailyLossR.value)}</span>
						<ProvenanceBadge level={r.dailyLossR.source} isOverride={r.dailyLossR.source === "day"} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Daily target R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.dailyTargetR.value)}</span>
						<ProvenanceBadge level={r.dailyTargetR.source} isOverride={r.dailyTargetR.source === "day"} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Weekly loss R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.weeklyLossR.value)}</span>
						<ProvenanceBadge level={r.weeklyLossR.source} isOverride={r.weeklyLossR.source === "week"} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Monthly loss R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.monthlyLossR.value)}</span>
						<ProvenanceBadge level={r.monthlyLossR.source} isOverride={r.monthlyLossR.source === "month"} />
					</dd>
				</div>
			</dl>
		</PlanSection>
	)
}

export { PlanDayPage as default }
