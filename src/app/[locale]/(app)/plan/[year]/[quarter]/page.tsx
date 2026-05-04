import { redirect } from "next/navigation"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string }>
}

const PlanQuarterPage = async ({ params }: PageProps) => {
	const { locale, year, quarter } = await params
	const q = Number(quarter)
	if (![1, 2, 3, 4].includes(q)) {
		redirect(`/${locale}/plan/${year}`)
	}
	// First month of the quarter
	const month = (q - 1) * 3 + 1
	redirect(`/${locale}/plan/${year}/${q}/${month}`)
}

export { PlanQuarterPage as default }
