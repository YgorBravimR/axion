"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Crosshair, Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
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
import { useToast } from "@/components/ui/toast"
import { FeatureStamp } from "@/components/ui/feature-stamp"
import { HelpText } from "@/components/ui/help-text"
import { startHawksMode, stopHawksMode } from "@/app/actions/hawks-mode"

interface HawksSettingsProps {
	initialActive: boolean
}

const HawksSettings = ({ initialActive }: HawksSettingsProps) => {
	const t = useTranslations("hawks.settings")
	const tActions = useTranslations("hawks.actions")
	const tCommon = useTranslations("common")
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [active, setActive] = useState(initialActive)
	const [pendingTarget, setPendingTarget] = useState<boolean | null>(null)

	const handleRequestToggle = useCallback((checked: boolean) => {
		setPendingTarget(checked)
	}, [])

	const handleCancel = useCallback(() => {
		setPendingTarget(null)
	}, [])

	const handleConfirm = useCallback(() => {
		if (pendingTarget === null) {
			return
		}
		const target = pendingTarget
		startTransition(async () => {
			const result = target ? await startHawksMode() : await stopHawksMode()
			if (result.status === "success") {
				setActive(target)
				setPendingTarget(null)
				showToast(
					"success",
					result.message ||
						(target ? tActions("modeStarted") : tActions("modeStopped"))
				)
				router.refresh()
				return
			}
			setPendingTarget(null)
			showToast(
				"error",
				result.message ||
					(target ? tActions("modeStartFailed") : tActions("modeStopFailed"))
			)
		})
	}, [pendingTarget, router, showToast, tActions])

	const handleDialogOpenChange = useCallback(
		(open: boolean) => {
			if (!open && !isPending) {
				setPendingTarget(null)
			}
		},
		[isPending]
	)

	return (
		<div className="space-y-m-400 sm:space-y-m-500 mx-auto max-w-2xl">
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<div className="gap-s-300 flex items-start justify-between">
					<div className="gap-s-300 flex items-start">
						<FeatureStamp icon={Crosshair} />
						<div>
							<h2 className="text-body text-txt-100 font-semibold">
								{t("title")}
							</h2>
							<HelpText
								id="hawks-mode-description"
								className="mt-s-100 max-w-prose"
							>
								{t("description")}
							</HelpText>
							<p className="mt-s-200 text-small text-txt-200">
								<span className="text-txt-300">{tCommon("status")}: </span>
								<span
									aria-live="polite"
									className={
										active ? "text-fb-success font-medium" : "text-txt-200"
									}
								>
									{active ? t("statusActive") : t("statusInactive")}
								</span>
							</p>
						</div>
					</div>
					<div className="gap-s-200 flex items-center">
						{isPending ? (
							<Loader2
								className="text-txt-300 h-4 w-4 animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
						) : null}
						<Switch
							id="hawks-mode-toggle"
							checked={active}
							onCheckedChange={handleRequestToggle}
							disabled={isPending}
							aria-label={t("title")}
							aria-describedby="hawks-mode-description"
						/>
					</div>
				</div>
			</div>

			<AlertDialog
				open={pendingTarget !== null}
				onOpenChange={handleDialogOpenChange}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{pendingTarget
								? t("confirmActivateTitle")
								: t("confirmDeactivateTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingTarget
								? t("confirmActivateDescription")
								: t("confirmDeactivateDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel
							id="hawks-toggle-cancel"
							onClick={handleCancel}
							disabled={isPending}
						>
							{tCommon("cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							id="hawks-toggle-confirm"
							onClick={handleConfirm}
							disabled={isPending}
						>
							{isPending ? (
								<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
							) : null}
							{pendingTarget ? t("activate") : t("deactivate")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

export { HawksSettings }
