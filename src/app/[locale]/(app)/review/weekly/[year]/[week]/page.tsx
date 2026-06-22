import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { getWeeklyReviewPayload } from "@/app/actions/weekly-review"
import { WeeklyReviewFlow } from "@/components/review/weekly-review-flow"
import { AskButton } from "@/components/ai-assistant/ask-button"

interface PageProps {
	params: Promise<{ locale: string; year: string; week: string }>
}

const WeeklyReviewPage = async ({ params }: PageProps) => {
	const { locale, year, week } = await params
	setRequestLocale(locale)

	const isoYear = Number(year)
	const isoWeek = Number(week)
	if (
		!Number.isFinite(isoYear) ||
		!Number.isFinite(isoWeek) ||
		isoWeek < 1 ||
		isoWeek > 53
	) {
		notFound()
	}

	const result = await getWeeklyReviewPayload(isoYear, isoWeek)
	if (result.status !== "success" || !result.data) {
		notFound()
	}

	// AskButton is a server component — it gates server-side and returns null
	// when access is denied (no DOM, no hydration cost). We pass it as a slot
	// so the client WeeklyReviewFlow can place it in the header.
	const contextRefId = `${isoYear}-W${String(isoWeek).padStart(2, "0")}`
	const assistantSlot = (
		<AskButton surface="weekly_review" contextRefId={contextRefId} />
	)

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-auto">
				<WeeklyReviewFlow payload={result.data} assistantSlot={assistantSlot} />
			</div>
		</div>
	)
}

export { WeeklyReviewPage as default }
