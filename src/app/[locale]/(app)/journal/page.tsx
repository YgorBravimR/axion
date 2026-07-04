import { Suspense } from "react"
import { setRequestLocale } from "next-intl/server"
import { JournalContent } from "@/components/journal"
import { LoadingSpinner } from "@/components/shared"

interface JournalPageProps {
	params: Promise<{ locale: string }>
}

const JournalPage = async ({ params }: JournalPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	// "Viés do dia" panel intentionally NOT rendered here — it lives only in
	// the Command Center now to keep the journal focused on the trade list.
	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 space-y-m-400 sm:space-y-m-500 flex-1 overflow-auto">
				<Suspense fallback={<LoadingSpinner size="md" className="min-h-48" />}>
					<JournalContent />
				</Suspense>
			</div>
		</div>
	)
}

export { JournalPage as default }
