"use client"

import { useState, useCallback } from "react"
import { useRouter } from "@/i18n/routing"
import { useTranslations } from "next-intl"
import { abandonDryRun } from "@/app/actions/enrichment"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface EnrichResumeBannerProps {
	runId: string
}

export const EnrichResumeBanner = ({ runId }: EnrichResumeBannerProps) => {
	const router = useRouter()
	const t = useTranslations("journal.enrichment.resume")
	const { showToast } = useToast()

	const [showAbandonConfirm, setShowAbandonConfirm] = useState(false)
	const [isAbandonPending, setIsAbandonPending] = useState(false)

	const handleResume = useCallback(() => {
		router.push(`/journal/enrich/review/${runId}`)
	}, [router, runId])

	const handleAbandon = useCallback(async () => {
		setIsAbandonPending(true)

		try {
			const result = await abandonDryRun({ runId })

			if (result.status === "success") {
				showToast("success", t("abandonedToast"))
				router.refresh()
			} else {
				showToast("error", result.message || t("abandonError"))
			}
		} catch (error) {
			showToast(
				"error",
				error instanceof Error ? error.message : t("abandonError")
			)
		} finally {
			setIsAbandonPending(false)
			setShowAbandonConfirm(false)
		}
	}, [runId, router, showToast, t])

	return (
		<>
			<div className="border-acc-100/30 bg-acc-100/10 p-m-400 rounded-lg border">
				<div className="gap-m-400 flex flex-col items-start justify-between sm:flex-row sm:items-center">
					<p className="text-body text-txt-100">{t("bannerText")}</p>
					<div className="gap-s-300 flex">
						<Button
							id="enrich-resume-abandon"
							variant="outline"
							size="sm"
							onClick={() => setShowAbandonConfirm(true)}
							disabled={isAbandonPending}
						>
							{t("abandonButton")}
						</Button>
						<Button
							id="enrich-resume-resume"
							size="sm"
							onClick={handleResume}
							disabled={isAbandonPending}
						>
							{t("resumeButton")}
						</Button>
					</div>
				</div>
			</div>

			{/* Abandon confirmation dialog */}
			<AlertDialog
				open={showAbandonConfirm}
				onOpenChange={setShowAbandonConfirm}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("abandonConfirmTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("abandonConfirmBody")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel
							id="enrich-resume-cancel-abandon"
							disabled={isAbandonPending}
						>
							{t("abandonCancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							id="enrich-resume-confirm-abandon"
							onClick={handleAbandon}
							disabled={isAbandonPending}
						>
							{t("abandonConfirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
