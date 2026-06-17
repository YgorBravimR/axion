"use client"

import { useState, useCallback } from "react"
import { useRouter } from "@/i18n/routing"
import { useTranslations } from "next-intl"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { commitTrade, abandonDryRun } from "@/app/actions/enrichment"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogClose,
} from "@/components/ui/dialog"
import type { DryRunSnapshotHydrated } from "@/app/actions/enrichment.types"
import { useEnrichShortcuts } from "@/hooks/use-enrich-shortcuts"
import { EnrichSidebar } from "./enrich-sidebar"
import { EnrichSuccessScreen } from "./enrich-success-screen"
import { EnrichTradeCard } from "./enrich-trade-card"

interface EnrichReviewProps {
	runId: string
	initialSnapshots: DryRunSnapshotHydrated[]
}

export const EnrichReview = ({
	runId,
	initialSnapshots,
}: EnrichReviewProps) => {
	const router = useRouter()
	const t = useTranslations("journal.enrichment.review")
	const { showToast } = useToast()

	// Review state
	const [currentIndex, setCurrentIndex] = useState(0)
	const [snapshots, setSnapshots] = useState(initialSnapshots)
	const [isCommitting, setIsCommitting] = useState(false)
	const [isSkipping, setIsSkipping] = useState(false)
	const [isAbandonDialogOpen, setIsAbandonDialogOpen] = useState(false)
	const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false)

	// Per-snapshot field selections: Map from snapshotId -> { accepted, rejected }
	const [fieldSelections, setFieldSelections] = useState<
		Map<string, { accepted: Set<string>; rejected: Set<string> }>
	>(() => {
		const map = new Map()
		for (const snap of initialSnapshots) {
			map.set(snap.snapshotId, { accepted: new Set(), rejected: new Set() })
		}
		return map
	})

	const currentSnapshot = snapshots[currentIndex]
	const currentSelection = fieldSelections.get(currentSnapshot.snapshotId) || {
		accepted: new Set(),
		rejected: new Set(),
	}

	const totalCount = snapshots.length

	// Navigation handlers
	const handleNext = useCallback(() => {
		if (currentIndex < snapshots.length - 1) {
			setCurrentIndex(currentIndex + 1)
		}
	}, [currentIndex, snapshots.length])

	const handlePrev = useCallback(() => {
		if (currentIndex > 0) {
			setCurrentIndex(currentIndex - 1)
		}
	}, [currentIndex])

	const handleToggleField = useCallback(
		(fieldName: string, state: "accepted" | "rejected" | "neither") => {
			const snapshotId = currentSnapshot.snapshotId
			setFieldSelections((prev) => {
				const selection = prev.get(snapshotId) ?? {
					accepted: new Set<string>(),
					rejected: new Set<string>(),
				}
				const newSelection = {
					accepted: new Set(selection.accepted),
					rejected: new Set(selection.rejected),
				}
				if (state === "accepted") {
					newSelection.accepted.add(fieldName)
					newSelection.rejected.delete(fieldName)
				} else if (state === "rejected") {
					newSelection.rejected.add(fieldName)
					newSelection.accepted.delete(fieldName)
				} else {
					newSelection.accepted.delete(fieldName)
					newSelection.rejected.delete(fieldName)
				}
				const map = new Map(prev)
				map.set(snapshotId, newSelection)
				return map
			})
		},
		[currentSnapshot.snapshotId]
	)

	// Save & next handler
	const handleSave = useCallback(async () => {
		setIsCommitting(true)

		try {
			const result = await commitTrade({
				runId,
				tradeId: currentSnapshot.tradeId,
				acceptedFields: Array.from(currentSelection.accepted),
				rejectedFields: Array.from(currentSelection.rejected),
			})

			if (result.status === "error" || !result.data) {
				showToast("error", t("commitError"))
				return
			}

			// Check for staleness conflicts
			if (result.data.staleness.length > 0) {
				// For v1, show a banner and block advancement
				// Future: allow per-field override
				showToast(
					"warning",
					t("stalenessTitle") + ": " + result.data.staleness.length
				)
				return
			}

			// Mark snapshot as committed locally
			setSnapshots((prev) =>
				prev.map((s) =>
					s.snapshotId === currentSnapshot.snapshotId
						? { ...s, status: "committed" as const }
						: s
				)
			)

			// Clear this snapshot's selection for next review
			setFieldSelections((prev) => {
				const map = new Map(prev)
				map.set(currentSnapshot.snapshotId, {
					accepted: new Set(),
					rejected: new Set(),
				})
				return map
			})

			showToast("success", t("commitSuccess"))

			// Advance to next trade. If this was the last, stay put — the
			// "all reviewed" derived state will swap the screen to the success view.
			if (currentIndex < snapshots.length - 1) {
				setCurrentIndex(currentIndex + 1)
			}
		} finally {
			setIsCommitting(false)
		}
	}, [
		runId,
		currentSnapshot,
		currentSelection,
		currentIndex,
		snapshots.length,
		t,
		showToast,
	])

	// Skip handler
	const handleSkip = useCallback(async () => {
		setIsSkipping(true)

		try {
			// Mark locally as skipped (future enrichments will see this as draft)
			setSnapshots((prev) =>
				prev.map((s) =>
					s.snapshotId === currentSnapshot.snapshotId
						? { ...s, status: "draft" as const }
						: s
				)
			)

			// Clear selection
			setFieldSelections((prev) => {
				const map = new Map(prev)
				map.set(currentSnapshot.snapshotId, {
					accepted: new Set(),
					rejected: new Set(),
				})
				return map
			})

			showToast("info", "Trade skipped")

			// Advance to next
			if (currentIndex < snapshots.length - 1) {
				setCurrentIndex(currentIndex + 1)
			}
		} finally {
			setIsSkipping(false)
		}
	}, [currentIndex, currentSnapshot, snapshots.length, showToast])

	// Abandon handler
	const handleAbandon = useCallback(async () => {
		setIsAbandonDialogOpen(false)

		try {
			const result = await abandonDryRun({ runId })

			if (result.status === "error") {
				showToast("error", t("abandonError"))
				return
			}

			showToast("success", t("abandonedToast"))
			router.push("/journal/enrich")
		} catch {
			showToast("error", t("abandonError"))
		}
	}, [runId, t, showToast, router])

	// Accept all handler
	const handleAcceptAll = useCallback(() => {
		const snapshotId = currentSnapshot.snapshotId
		const mergedFields = Object.keys(currentSnapshot.dryRun.mergedFields)

		setFieldSelections((prev) => {
			const next = new Map(prev)
			next.set(snapshotId, {
				accepted: new Set(mergedFields),
				rejected: new Set(),
			})
			return next
		})
	}, [currentSnapshot])

	// Reject all handler
	const handleRejectAll = useCallback(() => {
		const snapshotId = currentSnapshot.snapshotId

		setFieldSelections((prev) => {
			const next = new Map(prev)
			next.set(snapshotId, {
				accepted: new Set(),
				rejected: new Set(),
			})
			return next
		})
	}, [currentSnapshot])

	// Setup keyboard shortcuts
	useEnrichShortcuts({
		onNext: handleNext,
		onPrev: handlePrev,
		onSave: handleSave,
		onSkip: handleSkip,
		onAcceptAll: handleAcceptAll,
		onRejectAll: handleRejectAll,
		onEdit: () => {
			// TODO: open edit mode
		},
		onHelp: () => setIsHelpDialogOpen(true),
		enabled: !isCommitting && !isSkipping,
	})

	const committedCount = snapshots.filter(
		(s) => s.status === "committed"
	).length
	const skippedCount = snapshots.filter((s) => s.status === "skipped").length
	const reviewedCount = committedCount + skippedCount
	const isAllReviewed = reviewedCount === totalCount && totalCount > 0

	if (isAllReviewed) {
		return (
			<EnrichSuccessScreen
				_runId={runId}
				stats={{ committedCount, skippedCount }}
			/>
		)
	}

	return (
		<div className="bg-bg-100 flex h-screen flex-col overflow-hidden">
			{/* Header */}
			<div className="bg-bg-200 border-bg-300 px-m-500 py-m-400 gap-s-300 flex items-center justify-between border-b">
				<div className="gap-s-100 flex flex-col">
					<h1 className="text-h3 leading-none font-bold">{t("header")}</h1>
					<p className="text-small text-txt-300">
						{t("tradeOf", {
							current: currentIndex + 1,
							total: totalCount,
						})}
					</p>
				</div>
				<div className="text-tiny text-txt-300 gap-s-300 flex items-center">
					<span>
						{reviewedCount}/{totalCount}
					</span>
					<div
						className="bg-bg-300 h-1 w-32 overflow-hidden rounded-full"
						aria-hidden="true"
					>
						<div
							className="bg-acc-100 h-full transition-[width]"
							style={{
								width: `${(reviewedCount / Math.max(totalCount, 1)) * 100}%`,
							}}
						/>
					</div>
				</div>
			</div>

			{/* Main layout: sidebar + content */}
			<div className="flex flex-1 overflow-hidden">
				{/* Sidebar */}
				<div className="bg-bg-200 border-bg-300 w-64 border-r">
					<EnrichSidebar
						snapshots={snapshots}
						currentIndex={currentIndex}
						onSelect={setCurrentIndex}
					/>
				</div>

				{/* Content area */}
				<div className="flex flex-1 flex-col overflow-y-auto">
					<div className="flex-1 p-6">
						<div className="mx-auto max-w-3xl">
							<EnrichTradeCard
								snapshot={currentSnapshot}
								acceptedFields={currentSelection.accepted}
								rejectedFields={currentSelection.rejected}
								onToggleField={handleToggleField}
								onAcceptAll={handleAcceptAll}
								onRejectAll={handleRejectAll}
							/>
						</div>
					</div>

					{/* Action bar */}
					<div className="bg-bg-200 border-bg-300 px-m-500 py-m-400 gap-s-300 flex items-center justify-between border-t">
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={handlePrev}
								disabled={currentIndex === 0}
								title="k / ↑"
							>
								<ChevronLeft className="mr-1 h-4 w-4" />
								{t("prev")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={handleNext}
								disabled={currentIndex === snapshots.length - 1}
								title="j / ↓"
							>
								{t("next")}
								<ChevronRight className="ml-1 h-4 w-4" />
							</Button>
						</div>

						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setIsHelpDialogOpen(true)}
								title="?"
							>
								?
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={handleSkip}
								disabled={isCommitting || isSkipping}
								title="s"
							>
								{isSkipping && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{t("skip")}
							</Button>
							<Button
								size="sm"
								onClick={handleSave}
								disabled={
									isCommitting ||
									isSkipping ||
									currentSnapshot.status === "committed"
								}
								title="enter"
							>
								{isCommitting && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{t("saveAndNext")}
							</Button>
						</div>

						<Button
							variant="destructive"
							size="sm"
							onClick={() => setIsAbandonDialogOpen(true)}
						>
							{t("abandonRun")}
						</Button>
					</div>
				</div>
			</div>

			{/* Abandon confirmation dialog */}
			<AlertDialog
				open={isAbandonDialogOpen}
				onOpenChange={setIsAbandonDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Abandon dry-run?</AlertDialogTitle>
						<AlertDialogDescription>
							All draft enrichments in this run will be discarded. This cannot
							be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="flex justify-end gap-2">
						<AlertDialogCancel>Keep reviewing</AlertDialogCancel>
						<AlertDialogAction onClick={handleAbandon}>
							Abandon
						</AlertDialogAction>
					</div>
				</AlertDialogContent>
			</AlertDialog>

			{/* Help overlay */}
			<Dialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("helpTitle")}</DialogTitle>
						<DialogClose />
					</DialogHeader>
					<div className="text-small space-y-3">
						<div>
							<div className="font-medium">j / ↓</div>
							<div className="text-muted-foreground">
								{t("shortcuts.nextLabel")}
							</div>
						</div>
						<div>
							<div className="font-medium">k / ↑</div>
							<div className="text-muted-foreground">
								{t("shortcuts.prevLabel")}
							</div>
						</div>
						<div>
							<div className="font-medium">enter</div>
							<div className="text-muted-foreground">
								{t("shortcuts.saveLabel")}
							</div>
						</div>
						<div>
							<div className="font-medium">s</div>
							<div className="text-muted-foreground">
								{t("shortcuts.skipLabel")}
							</div>
						</div>
						<div>
							<div className="font-medium">a</div>
							<div className="text-muted-foreground">
								{t("shortcuts.acceptAllLabel")}
							</div>
						</div>
						<div>
							<div className="font-medium">r</div>
							<div className="text-muted-foreground">
								{t("shortcuts.rejectAllLabel")}
							</div>
						</div>
						<div>
							<div className="font-medium">e</div>
							<div className="text-muted-foreground">
								{t("shortcuts.editLabel")}
							</div>
						</div>
						<div>
							<div className="font-medium">?</div>
							<div className="text-muted-foreground">
								{t("shortcuts.helpLabel")}
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
