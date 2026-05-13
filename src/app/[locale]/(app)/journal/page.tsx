import { Suspense } from "react"
import { setRequestLocale } from "next-intl/server"
import { JournalContent } from "@/components/journal"
import { LoadingSpinner } from "@/components/shared"
import { DailyBiasPanel } from "@/components/hawks/daily-bias-panel"

interface JournalPageProps {
	params: Promise<{ locale: string }>
}

const JournalPage = async ({ params }: JournalPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 space-y-m-400 sm:space-y-m-500 flex-1 overflow-auto">
				<Suspense fallback={null}>
					<DailyBiasPanel />
				</Suspense>
				<Suspense fallback={<LoadingSpinner size="md" className="h-50" />}>
					<JournalContent />
				</Suspense>
			</div>
		</div>
	)
}

export { JournalPage as default }
