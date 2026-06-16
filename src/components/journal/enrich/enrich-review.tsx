"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
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
import { EnrichTradeCard } from "./enrich-trade-card"

interface EnrichReviewProps {
	runId: string
	initialSnapshots: DryRunSnapshotHydrated[]
}

/**
 * Main review screen for enriched trades.
 * Displays a sidebar with trade list and main area with enrichment details.
 * Supports keyboard shortcuts for navigation and actions.
 */
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

			// Advance to next trade
			if (currentIndex < snapshots.length - 1) {
				setCurrentIndex(currentIndex + 1)
			} else {
				// All trades committed — show success screen
				// TODO: render EnrichSuccessScreen (from sibling 5.D)
				showToast("success", "All trades reviewed!")
				router.push("/journal/enrich")
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
		router,
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
			const newSelection = {
				accepted: new Set(mergedFields),
				rejected: new Set(),
			}
			return prev.set(snapshotId, newSelection)
		})
	}, [currentSnapshot])

	// Reject all handler
	const handleRejectAll = useCallback(() => {
		const snapshotId = currentSnapshot.snapshotId

		setFieldSelections((prev) => {
			const newSelection = {
				accepted: new Set(),
				rejected: new Set(),
			}
			return prev.set(snapshotId, newSelection)
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
			/* TODO: open edit mode (5.D) */
		},
		onHelp: () => setIsHelpDialogOpen(true),
		enabled: !isCommitting && !isSkipping,
	})

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			{/* Header */}
			<div className="bg-background border-b px-6 py-4">
				<h1 className="text-lg font-semibold">
					{t("header")} ·{" "}
					{t("tradeOf", {
						current: currentIndex + 1,
						total: totalCount,
					})}
				</h1>
			</div>

			{/* Main layout: sidebar + content */}
			<div className="flex flex-1 overflow-hidden">
				{/* Sidebar */}
				<div className="bg-muted w-64">
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
					<div className="bg-background flex items-center justify-between gap-3 border-t px-6 py-4">
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
								Next
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
								disabled={isCommitting || isSkipping}
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
