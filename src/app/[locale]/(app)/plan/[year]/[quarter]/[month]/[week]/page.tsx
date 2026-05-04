import { redirect } from "next/navigation"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string; month: string; week: string }>
}

const PlanWeekPage = async ({ params }: PageProps) => {
	const { locale, year, quarter, month, week } = await params
	const isoYear = Number(year)
	const isoWeek = Number(week)
	if (!Number.isInteger(isoYear) || !Number.isInteger(isoWeek) || isoWeek < 1 || isoWeek > 53) {
		redirect(`/${locale}/plan/${year}/${quarter}/${month}`)
	}

	// Compute ISO week Monday using UTC-anchored anchor: Jan 4 always in week 1
	const jan4 = new Date(Date.UTC(isoYear, 0, 4))
	const dayOfWeek = (jan4.getUTCDay() + 6) % 7
	const week1Monday = new Date(jan4)
	week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek)
	const targetMonday = new Date(week1Monday)
	targetMonday.setUTCDate(week1Monday.getUTCDate() + (isoWeek - 1) * 7)

	const dayStr = targetMonday.toISOString().slice(0, 10)
	redirect(`/${locale}/plan/${year}/${quarter}/${month}/${week}/${dayStr}`)
}

export { PlanWeekPage as default }
