import { setRequestLocale } from "next-intl/server"
import { JournalContent } from "@/components/journal"

// Force dynamic rendering to ensure account-specific data
export const dynamic = "force-dynamic"

interface JournalPageProps {
	params: Promise<{ locale: string }>
}

const JournalPage = async ({ params }: JournalPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600">
				<JournalContent />
			</div>
		</div>
	)
}

export default JournalPage
