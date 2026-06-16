import { Suspense } from "react"
import { setRequestLocale } from "next-intl/server"
import { eq, and, inArray, sql } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { trades, tradeEnrichmentSnapshots } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { EnrichLanding } from "@/components/journal/enrich/enrich-landing"
import { LoadingSpinner } from "@/components/shared"

interface EnrichPageProps {
	params: Promise<{ locale: string }>
}

const EnrichPage = async ({ params }: EnrichPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	const authContext = await requireAuth()
	const accountIds = authContext.showAllAccounts
		? authContext.allAccountIds
		: [authContext.accountId]

	// Query for draft snapshots belonging to user's accounts
	const draftSnapshot = await db.query.tradeEnrichmentSnapshots.findFirst({
		where: and(
			eq(tradeEnrichmentSnapshots.status, "draft"),
			inArray(
				tradeEnrichmentSnapshots.tradeId,
				db
					.select({ id: trades.id })
					.from(trades)
					.where(inArray(trades.accountId, accountIds))
			)
		),
		columns: {
			runId: true,
		},
	})

	const resumeRunId = draftSnapshot?.runId ?? null

	const [pendingCountResult] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(trades)
		.where(
			and(
				inArray(trades.accountId, accountIds),
				eq(trades.enrichmentStatus, "pending"),
				eq(trades.isArchived, false)
			)
		)

	const pendingCount = pendingCountResult?.count ?? 0

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 space-y-m-400 sm:space-y-m-500 flex-1 overflow-auto">
				<Suspense fallback={<LoadingSpinner size="md" className="min-h-48" />}>
					<EnrichLanding
						pendingCount={pendingCount}
						resumeRunId={resumeRunId}
					/>
				</Suspense>
			</div>
		</div>
	)
}

export { EnrichPage as default }
