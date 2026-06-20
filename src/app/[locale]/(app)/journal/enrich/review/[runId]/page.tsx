import { Suspense } from "react"
import { setRequestLocale } from "next-intl/server"
import { redirect } from "next/navigation"
import { requireAuth } from "@/app/actions/auth"
import { getDryRun } from "@/app/actions/enrichment"
import { EnrichReview } from "@/components/journal/enrich/enrich-review"
import { LoadingSpinner } from "@/components/shared"

interface EnrichReviewPageProps {
	params: Promise<{ locale: string; runId: string }>
}

const EnrichReviewPage = async ({ params }: EnrichReviewPageProps) => {
	const { locale, runId } = await params
	setRequestLocale(locale)

	await requireAuth()

	const result = await getDryRun(runId)

	if (result.status === "error" || !result.data?.snapshots?.length) {
		redirect("/journal/enrich")
	}

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 space-y-m-400 sm:space-y-m-500 flex-1 overflow-auto">
				<Suspense fallback={<LoadingSpinner size="md" className="min-h-48" />}>
					<EnrichReview
						runId={runId}
						initialSnapshots={result.data.snapshots}
					/>
				</Suspense>
			</div>
		</div>
	)
}

export { EnrichReviewPage as default }
