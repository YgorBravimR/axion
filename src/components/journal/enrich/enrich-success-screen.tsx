"use client"

import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle } from "lucide-react"

interface EnrichSuccessScreenProps {
	_runId: string
	stats: { committedCount: number; skippedCount: number }
}

export const EnrichSuccessScreen = ({
	_runId,
	stats,
}: EnrichSuccessScreenProps) => {
	const t = useTranslations()
	const router = useRouter()

	const handleViewDashboard = () => {
		router.push("/dashboard")
	}

	const handleBackToJournal = () => {
		router.push("/journal")
	}

	return (
		<div className="bg-bg-100 px-m-400 flex min-h-screen items-center justify-center">
			<Card id="success-screen" className="w-full max-w-lg">
				<CardHeader className="text-center">
					<div className="mb-m-400 flex justify-center">
						<CheckCircle
							className="size-16"
							style={{ color: "var(--color-trade-buy)" }}
						/>
					</div>
					<CardTitle className="text-center text-lg">
						{stats.committedCount > 0 &&
							t("journal.enrichment.success.enriched", {
								count: stats.committedCount,
							})}
						{stats.skippedCount > 0 && (
							<>
								{stats.committedCount > 0 && " · "}
								{t("journal.enrichment.success.skipped", {
									count: stats.skippedCount,
								})}
							</>
						)}
					</CardTitle>
					<CardDescription className="mt-s-300 text-center">
						{t("journal.enrichment.success.snapshotSaved")}
					</CardDescription>
				</CardHeader>

				<CardContent className="gap-s-300 flex justify-center">
					<Button
						id="success-view-dashboard"
						variant="default"
						onClick={handleViewDashboard}
					>
						{t("journal.enrichment.success.viewDashboard")}
					</Button>
					<Button
						id="success-back-to-journal"
						variant="outline"
						onClick={handleBackToJournal}
					>
						{t("journal.enrichment.success.backToJournal")}
					</Button>
				</CardContent>
			</Card>
		</div>
	)
}
