import { redirect } from "next/navigation"
import { setRequestLocale } from "next-intl/server"
import { getLatestReviewableWeek } from "@/app/actions/weekly-review"

interface PageProps {
	params: Promise<{ locale: string }>
}

const WeeklyReviewIndexPage = async ({ params }: PageProps) => {
	const { locale } = await params
	setRequestLocale(locale)
	const { isoYear, isoWeek } = await getLatestReviewableWeek()
	redirect(`/${locale}/review/weekly/${isoYear}/${isoWeek}`)
}

export { WeeklyReviewIndexPage as default }
