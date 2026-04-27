"use client"

import { useState, useTransition, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TimeframeForm } from "./timeframe-form"
import {
	deleteTimeframe,
	toggleTimeframeActive,
} from "@/app/actions/timeframes"
import type { Timeframe } from "@/db/schema"
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
import {
	Plus,
	Pencil,
	Trash2,
	ToggleLeft,
	ToggleRight,
	Loader2,
	Clock,
	BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useUrlParams } from "@/hooks/use-url-params"

const formatUnit = (unit: string, value: number): string => {
	const singular = unit.replace(/s$/, "")
	return value === 1 ? singular : unit
}

interface TimeframeListProps {
	timeframes: Timeframe[]
}

const TimeframeList = ({ timeframes }: TimeframeListProps) => {
	const t = useTranslations("settings.timeframes")
	const tCommon = useTranslations("common")
	const urlParams = useUrlParams()

	const filterType = (urlParams.get("tfType") ?? "all") as
		| "all"
		| "time_based"
		| "renko"
	const setFilterType = (value: "all" | "time_based" | "renko") => {
		urlParams.set({ tfType: value === "all" ? null : value })
	}

	const showInactive = urlParams.getBoolean("inactive")
	const setShowInactive = (value: boolean) => {
		urlParams.set({ inactive: value })
	}

	const [formOpen, setFormOpen] = useState(false)
	const [editingTimeframe, setEditingTimeframe] = useState<Timeframe | null>(
		null
	)
	const [isPending, startTransition] = useTransition()
	const [pendingId, setPendingId] = useState<string | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<Timeframe | null>(null)

	const filteredTimeframes = useMemo(() => timeframes.filter((tf) => {
		const matchesType = filterType === "all" || tf.type === filterType
		const matchesActive = showInactive || tf.isActive
		return matchesType && matchesActive
	}), [timeframes, filterType, showInactive])

	const handleEdit = (timeframe: Timeframe) => {
		setEditingTimeframe(timeframe)
		setFormOpen(true)
	}

	const handleToggleActive = (timeframe: Timeframe) => {
		setPendingId(timeframe.id)
		startTransition(async () => {
			await toggleTimeframeActive(timeframe.id, !timeframe.isActive)
			setPendingId(null)
		})
	}

	const handleDelete = (timeframe: Timeframe) => {
		setDeleteTarget(timeframe)
	}

	const handleConfirmDelete = () => {
		if (!deleteTarget) return
		const timeframe = deleteTarget
		setPendingId(timeframe.id)
		startTransition(async () => {
			await deleteTimeframe(timeframe.id)
			setPendingId(null)
			setDeleteTarget(null)
		})
	}

	const handleFormClose = () => {
		setFormOpen(false)
		setEditingTimeframe(null)
	}

	return (
		<div id="settings-timeframes" className="space-y-m-400">
			{/* Header */}
			<div className="gap-m-400 flex flex-wrap items-center justify-between">
				<div className="gap-s-300 flex items-center">
					<Badge
						id="badge-timeframe-filter-all"
						variant={filterType === "all" ? "default" : "outline"}
						className="cursor-pointer"
						tabIndex={0}
						role="button"
						aria-pressed={filterType === "all"}
						onClick={() => setFilterType("all")}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") setFilterType("all")
						}}
					>
						{tCommon("all")}
					</Badge>
					<Badge
						id="badge-timeframe-filter-time-based"
						variant={filterType === "time_based" ? "default" : "outline"}
						className="cursor-pointer"
						tabIndex={0}
						role="button"
						aria-pressed={filterType === "time_based"}
						onClick={() => setFilterType("time_based")}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ")
								setFilterType("time_based")
						}}
					>
						<Clock className="mr-s-100 h-3 w-3" />
						{t("timeBased")}
					</Badge>
					<Badge
						id="badge-timeframe-filter-renko"
						variant={filterType === "renko" ? "default" : "outline"}
						className="cursor-pointer"
						tabIndex={0}
						role="button"
						aria-pressed={filterType === "renko"}
						onClick={() => setFilterType("renko")}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") setFilterType("renko")
						}}
					>
						<BarChart3 className="mr-s-100 h-3 w-3" />
						{t("renko")}
					</Badge>
				</div>
				<div className="gap-s-300 flex items-center">
					<Button
						id="timeframe-toggle-inactive"
						variant="ghost"
						size="sm"
						onClick={() => setShowInactive(!showInactive)}
						className="text-txt-200"
					>
						{showInactive ? (
							<ToggleRight className="mr-s-200 h-4 w-4" />
						) : (
							<ToggleLeft className="mr-s-200 h-4 w-4" />
						)}
						{showInactive ? t("showingInactive") : t("hidingInactive")}
					</Button>
					<Button id="timeframe-add-new" onClick={() => setFormOpen(true)}>
						<Plus className="mr-s-200 h-4 w-4" />
						{t("addTimeframe")}
					</Button>
				</div>
			</div>

			{/* Timeframes Grid */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
				{filteredTimeframes.length === 0 ? (
					<div className="border-bg-300 bg-bg-200 p-l-700 text-txt-300 col-span-full rounded-lg border text-center">
						{t("noTimeframes")}
					</div>
				) : (
					filteredTimeframes.map((timeframe) => (
						<div
							key={timeframe.id}
							className={cn(
								"border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border transition-colors",
								!timeframe.isActive && "opacity-50"
							)}
						>
							<div className="flex items-start justify-between">
								<div className="gap-s-200 flex items-center">
									{timeframe.type === "time_based" ? (
										<Clock className="text-acc-100 h-5 w-5" />
									) : (
										<BarChart3 className="text-acc-200 h-5 w-5" />
									)}
									<div>
										<div className="gap-s-200 flex items-center">
											<span className="text-small text-acc-100 font-mono font-medium">
												{timeframe.code}
											</span>
											<Badge
												id={`badge-timeframe-status-${timeframe.id}`}
												variant={timeframe.isActive ? "default" : "secondary"}
												className="text-tiny"
											>
												{timeframe.isActive ? t("active") : t("inactive")}
											</Badge>
										</div>
										<p className="text-body text-txt-100 font-medium">
											{timeframe.name}
										</p>
									</div>
								</div>
							</div>

							<div className="mt-m-400 flex items-center justify-between">
								<div className="text-small text-txt-200">
									{timeframe.value}{" "}
									{formatUnit(timeframe.unit, timeframe.value)}
								</div>
								<div className="gap-s-200 flex items-center">
									{isPending && pendingId === timeframe.id ? (
										<Loader2 className="text-txt-300 h-4 w-4 animate-spin motion-reduce:animate-none" />
									) : (
										<>
											<Button
												id={`timeframe-edit-${timeframe.id}`}
												variant="ghost"
												size="sm"
												onClick={() => handleEdit(timeframe)}
												className="h-9 w-9 p-0"
												aria-label={t("editTimeframe", {
													name: timeframe.name,
												})}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Button
												id={`timeframe-toggle-active-${timeframe.id}`}
												variant="ghost"
												size="sm"
												onClick={() => handleToggleActive(timeframe)}
												className="h-9 w-9 p-0"
												aria-label={
													timeframe.isActive
														? t("deactivate", { name: timeframe.name })
														: t("activate", { name: timeframe.name })
												}
											>
												{timeframe.isActive ? (
													<ToggleRight className="text-trade-buy h-4 w-4" />
												) : (
													<ToggleLeft className="text-txt-300 h-4 w-4" />
												)}
											</Button>
											<Button
												id={`timeframe-delete-${timeframe.id}`}
												variant="ghost"
												size="sm"
												onClick={() => handleDelete(timeframe)}
												className="text-fb-error hover:text-fb-error h-9 w-9 p-0"
												aria-label={t("deleteTimeframe", {
													name: timeframe.name,
												})}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</>
									)}
								</div>
							</div>
						</div>
					))
				)}
			</div>

			{/* Timeframe Form Dialog */}
			<TimeframeForm
				timeframe={editingTimeframe}
				open={formOpen}
				onOpenChange={handleFormClose}
			/>

			{/* Delete Confirm Dialog */}
			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={(open) => {
					if (!open && !isPending) setDeleteTarget(null)
				}}
			>
				<AlertDialogContent id="delete-timeframe-confirm">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("confirmDelete", { name: deleteTarget?.name ?? "" })}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{tCommon("actionCannotBeUndone")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel
							id="delete-timeframe-cancel"
							disabled={isPending}
						>
							{tCommon("cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							id="delete-timeframe-confirm-btn"
							variant="destructive"
							disabled={isPending}
							onClick={(e) => {
								e.preventDefault()
								handleConfirmDelete()
							}}
						>
							{isPending ? (
								<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
							) : null}
							{tCommon("delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

export { TimeframeList }
