import { permanentRedirect } from "next/navigation"

interface PageProps {
	params: Promise<{ locale: string }>
}

const YearlyPlanRedirect = async ({ params }: PageProps) => {
	const { locale } = await params
	const currentYear = new Date().getFullYear()
	permanentRedirect(`/${locale}/plan/${currentYear}`)
}

export { YearlyPlanRedirect as default }
