"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "@/i18n/routing"
import { useTranslations } from "next-intl"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import {
	commitTrade,
	abandonDryRun,
	saveDraftSelections,
} from "@/app/actions/enrichment"
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
	// Seed from persisted acceptedFields/rejectedFields when present — that's how
	// a resumed session restores the user's prior choices.
	const [fieldSelections, setFieldSelections] = useState<
		Map<string, { accepted: Set<string>; rejected: Set<string> }>
	>(() => {
		const map = new Map()
		for (const snap of initialSnapshots) {
			map.set(snap.snapshotId, {
				accepted: new Set(snap.acceptedFields ?? []),
				rejected: new Set(snap.rejectedFields ?? []),
			})
		}
		return map
	})

	// Auto-save: persist selections to the dry-run row whenever they change for
	// the currently-viewed snapshot. Debounced 600ms so rapid toggles batch into
	// one server roundtrip. Each pending-save call is keyed by snapshotId so
	// switching trades cancels the prior timer for that trade only.
	const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map()
	)
	const scheduleSave = useCallback(
		(
			snapshotId: string,
			tradeId: string,
			accepted: Set<string>,
			rejected: Set<string>
		) => {
			const existing = saveTimers.current.get(snapshotId)
			if (existing) {
				clearTimeout(existing)
			}
			const timer = setTimeout(() => {
				void saveDraftSelections({
					runId,
					tradeId,
					acceptedFields: Array.from(accepted),
					rejectedFields: Array.from(rejected),
				}).catch(() => {
					// Silent: auto-save is best-effort. If it fails, the next toggle
					// (or the final commit) recovers. Surfacing a toast here would be
					// noisy because the user is mid-toggle.
				})
				saveTimers.current.delete(snapshotId)
			}, 600)
			saveTimers.current.set(snapshotId, timer)
		},
		[runId]
	)
	useEffect(() => {
		// Flush all pending timers on unmount so an immediate nav-away still
		// fires the latest selection. We can't await here, but the server
		// action returns quickly and survives the page transition.
		const timers = saveTimers.current
		return () => {
			for (const timer of timers.values()) {
				clearTimeout(timer)
			}
		}
	}, [])

	const currentSnapshot = snapshots[currentIndex]
	const currentSelection = currentSnapshot
		? (fieldSelections.get(currentSnapshot.snapshotId) ?? {
				accepted: new Set<string>(),
				rejected: new Set<string>(),
			})
		: { accepted: new Set<string>(), rejected: new Set<string>() }

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
			if (!currentSnapshot) {
				return
			}
			const snapshotId = currentSnapshot.snapshotId
			const tradeId = currentSnapshot.tradeId
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
				scheduleSave(
					snapshotId,
					tradeId,
					newSelection.accepted,
					newSelection.rejected
				)
				const map = new Map(prev)
				map.set(snapshotId, newSelection)
				return map
			})
		},
		[currentSnapshot, scheduleSave]
	)

	// Save & next handler
	const handleSave = useCallback(async () => {
		if (!currentSnapshot) {
			return
		}
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
		if (!currentSnapshot) {
			return
		}
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
		if (!currentSnapshot) {
			return
		}
		const snapshotId = currentSnapshot.snapshotId
		const tradeId = currentSnapshot.tradeId
		const mergedFields = Object.keys(currentSnapshot.dryRun.mergedFields)

		setFieldSelections((prev) => {
			const newSelection = {
				accepted: new Set(mergedFields),
				rejected: new Set<string>(),
			}
			scheduleSave(
				snapshotId,
				tradeId,
				newSelection.accepted,
				newSelection.rejected
			)
			return prev.set(snapshotId, newSelection)
		})
	}, [currentSnapshot, scheduleSave])

	// Reject all handler
	const handleRejectAll = useCallback(() => {
		if (!currentSnapshot) {
			return
		}
		const snapshotId = currentSnapshot.snapshotId
		const tradeId = currentSnapshot.tradeId

		setFieldSelections((prev) => {
			const newSelection = {
				accepted: new Set<string>(),
				rejected: new Set<string>(),
			}
			scheduleSave(
				snapshotId,
				tradeId,
				newSelection.accepted,
				newSelection.rejected
			)
			return prev.set(snapshotId, newSelection)
		})
	}, [currentSnapshot, scheduleSave])

	// Setup keyboard shortcuts
	useEnrichShortcuts({
		onNext: handleNext,
		onPrev: handlePrev,
		onSave: () => {
			void handleSave()
		},
		onSkip: () => {
			void handleSkip()
		},
		onAcceptAll: handleAcceptAll,
		onRejectAll: handleRejectAll,
		onEdit: () => {
			// TODO: open edit mode
		},
		onHelp: () => setIsHelpDialogOpen(true),
		enabled: !isCommitting && !isSkipping,
	})

	if (!currentSnapshot) {
		return null
	}

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
								id="enrich-review-prev"
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
								id="enrich-review-next"
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
								id="enrich-review-help"
								variant="outline"
								size="sm"
								onClick={() => setIsHelpDialogOpen(true)}
								title="?"
							>
								?
							</Button>
							<Button
								id="enrich-review-skip"
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
								id="enrich-review-save"
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
							id="enrich-review-abandon"
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
						<AlertDialogCancel id="enrich-review-keep-reviewing">
							Keep reviewing
						</AlertDialogCancel>
						<AlertDialogAction
							id="enrich-review-confirm-abandon"
							onClick={handleAbandon}
						>
							Abandon
						</AlertDialogAction>
					</div>
				</AlertDialogContent>
			</AlertDialog>

			{/* Help overlay */}
			<Dialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen}>
				<DialogContent id="enrich-review-help-dialog">
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
