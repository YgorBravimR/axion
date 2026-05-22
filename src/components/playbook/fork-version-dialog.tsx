"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { GitFork } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { createStrategyVersion } from "@/app/actions/strategies"
import type { StrategyVersionSnapshot } from "@/app/actions/strategies.types"
import type { StrategyConditionInput } from "@/types/trading-condition"

interface ForkVersionDialogProps {
	readonly strategyId: string
	readonly sourceVersion: number
	readonly nextVersion: number
	readonly source: StrategyVersionSnapshot
	readonly conditions: readonly StrategyConditionInput[]
	readonly open: boolean
	readonly onOpenChange: (_next: boolean) => void
	readonly onSuccess?: () => void
}

/**
 * Confirmation dialog for forking a locked strategy version. Renders a brief
 * preview of what the new version inherits (name + condition count) plus a
 * one-paragraph explanation of the trade-anchoring semantics, then submits
 * createStrategyVersion. On success the caller decides what to do next via
 * `onSuccess` — typical choice is `router.refresh()` for in-place updates or
 * `router.push("/playbook/<id>/edit")` for the header entry point.
 */
const ForkVersionDialog = ({
	strategyId,
	sourceVersion,
	nextVersion,
	source,
	conditions,
	open,
	onOpenChange,
	onSuccess,
}: ForkVersionDialogProps) => {
	const t = useTranslations("playbook.versioning.fork")
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [errorMessage, setErrorMessage] = useState<string | null>(null)

	const handleClose = (): void => {
		if (isPending) {
			return
		}
		setErrorMessage(null)
		onOpenChange(false)
	}

	const handleConfirm = (): void => {
		setErrorMessage(null)
		startTransition(async () => {
			const result = await createStrategyVersion(strategyId, {
				name: source.name,
				description: source.description,
				entryCriteria: source.entryCriteria,
				exitCriteria: source.exitCriteria,
				riskRules: source.riskRules,
				finalR: source.finalR,
				maxRiskPercent: source.maxRiskPercent,
				screenshotUrl: source.screenshotUrl,
				screenshotS3Key: source.screenshotS3Key,
				notes: source.notes,
				conditions: conditions.map((c) => ({
					conditionId: c.conditionId,
					tier: c.tier,
					sortOrder: c.sortOrder,
				})),
			})

			if (result.status === "success") {
				showToast("success", t("successToast", { nextVersion }))
				onOpenChange(false)
				if (onSuccess) {
					onSuccess()
				} else {
					router.refresh()
				}
				return
			}

			setErrorMessage(result.message || t("errorToast"))
		})
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent id="strategy-fork-dialog">
				<DialogHeader>
					<DialogTitle>{t("dialogTitle", { nextVersion })}</DialogTitle>
					<DialogDescription>
						{t("dialogDescription", { sourceVersion, nextVersion })}
					</DialogDescription>
				</DialogHeader>

				<div className="gap-s-200 border-bg-300 bg-bg-100 p-s-300 flex flex-col rounded-md border">
					<div className="text-tiny text-txt-300 tracking-wide uppercase">
						{t("previewLabel")}
					</div>
					<div className="text-small text-txt-100">
						{t("previewName", { name: source.name })}
					</div>
					<div className="text-small text-txt-200">
						{t("previewConditions", { count: conditions.length })}
					</div>
				</div>

				{errorMessage ? (
					<div
						id="strategy-fork-dialog-error"
						role="alert"
						className="text-small text-fb-error bg-fb-error/10 border-fb-error/30 p-s-300 rounded-md border"
					>
						{errorMessage}
					</div>
				) : null}

				<DialogFooter>
					<Button
						id="strategy-fork-dialog-cancel"
						variant="outline"
						type="button"
						onClick={handleClose}
						disabled={isPending}
					>
						{t("cancel")}
					</Button>
					<Button
						id="strategy-fork-dialog-confirm"
						type="button"
						onClick={handleConfirm}
						disabled={isPending}
						className="gap-s-200 inline-flex items-center"
					>
						<GitFork className="h-3.5 w-3.5" aria-hidden="true" />
						{isPending ? t("submitting") : t("submit", { nextVersion })}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export { ForkVersionDialog }
