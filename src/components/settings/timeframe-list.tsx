"use client"

import { useState, useTransition } from "react"
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

interface TimeframeListProps {
	timeframes: Timeframe[]
}

export const TimeframeList = ({ timeframes }: TimeframeListProps) => {
	const t = useTranslations("settings.timeframes")
	const tCommon = useTranslations("common")
	const [filterType, setFilterType] = useState<"all" | "time_based" | "renko">(
		"all"
	)
	const [showInactive, setShowInactive] = useState(false)
	const [formOpen, setFormOpen] = useState(false)
	const [editingTimeframe, setEditingTimeframe] = useState<Timeframe | null>(
		null
	)
	const [isPending, startTransition] = useTransition()
	const [pendingId, setPendingId] = useState<string | null>(null)

	const filteredTimeframes = timeframes.filter((tf) => {
		const matchesType = filterType === "all" || tf.type === filterType
		const matchesActive = showInactive || tf.isActive
		return matchesType && matchesActive
	})

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
		if (!confirm(`Delete ${timeframe.name}?`)) return
		setPendingId(timeframe.id)
		startTransition(async () => {
			await deleteTimeframe(timeframe.id)
			setPendingId(null)
		})
	}

	const handleFormClose = () => {
		setFormOpen(false)
		setEditingTimeframe(null)
	}

	const formatUnit = (unit: string, value: number): string => {
		const singular = unit.replace(/s$/, "")
		return value === 1 ? singular : unit
	}

	return (
		<div className="space-y-m-400">
			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-m-400">
				<div className="flex items-center gap-s-300">
					<Badge
						id="badge-timeframe-filter-all"
						variant={filterType === "all" ? "default" : "outline"}
						className="cursor-pointer"
						onClick={() => setFilterType("all")}
					>
						{tCommon("all")}
					</Badge>
					<Badge
						id="badge-timeframe-filter-time-based"
						variant={filterType === "time_based" ? "default" : "outline"}
						className="cursor-pointer"
						onClick={() => setFilterType("time_based")}
					>
						<Clock className="mr-1 h-3 w-3" />
						{t("timeBased")}
					</Badge>
					<Badge
						id="badge-timeframe-filter-renko"
						variant={filterType === "renko" ? "default" : "outline"}
						className="cursor-pointer"
						onClick={() => setFilterType("renko")}
					>
						<BarChart3 className="mr-1 h-3 w-3" />
						{t("renko")}
					</Badge>
				</div>
				<div className="flex items-center gap-s-300">
					<Button
						id="timeframe-toggle-inactive"
						variant="ghost"
						size="sm"
						onClick={() => setShowInactive(!showInactive)}
						className="text-txt-200"
					>
						{showInactive ? (
							<ToggleRight className="mr-2 h-4 w-4" />
						) : (
							<ToggleLeft className="mr-2 h-4 w-4" />
						)}
						{showInactive ? t("showingInactive") : t("hidingInactive")}
					</Button>
					<Button id="timeframe-add-new" onClick={() => setFormOpen(true)}>
						<Plus className="mr-2 h-4 w-4" />
						{t("addTimeframe")}
					</Button>
				</div>
			</div>

			{/* Timeframes Grid */}
			<div className="grid grid-cols-1 gap-s-300 sm:gap-m-400 md:grid-cols-2 lg:grid-cols-3">
				{filteredTimeframes.length === 0 ? (
					<div className="col-span-full rounded-lg border border-bg-300 bg-bg-200 p-l-700 text-center text-txt-300">
						{t("noTimeframes")}
					</div>
				) : (
					filteredTimeframes.map((timeframe) => (
						<div
							key={timeframe.id}
							className={cn(
								"rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 transition-colors",
								!timeframe.isActive && "opacity-50"
							)}
						>
							<div className="flex items-start justify-between">
								<div className="flex items-center gap-s-200">
									{timeframe.type === "time_based" ? (
										<Clock className="h-5 w-5 text-acc-100" />
									) : (
										<BarChart3 className="h-5 w-5 text-acc-200" />
									)}
									<div>
										<div className="flex items-center gap-s-200">
											<span className="font-mono text-small font-medium text-acc-100">
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
										<p className="text-body font-medium text-txt-100">
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
								<div className="flex items-center gap-s-200">
									{isPending && pendingId === timeframe.id ? (
										<Loader2 className="h-4 w-4 animate-spin text-txt-300" />
									) : (
										<>
											<Button
												id={`timeframe-edit-${timeframe.id}`}
												variant="ghost"
												size="sm"
												onClick={() => handleEdit(timeframe)}
												className="h-8 w-8 p-0"
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Button
												id={`timeframe-toggle-active-${timeframe.id}`}
												variant="ghost"
												size="sm"
												onClick={() => handleToggleActive(timeframe)}
												className="h-8 w-8 p-0"
											>
												{timeframe.isActive ? (
													<ToggleRight className="h-4 w-4 text-trade-buy" />
												) : (
													<ToggleLeft className="h-4 w-4 text-txt-300" />
												)}
											</Button>
											<Button
												id={`timeframe-delete-${timeframe.id}`}
												variant="ghost"
												size="sm"
												onClick={() => handleDelete(timeframe)}
												className="h-8 w-8 p-0 text-fb-error hover:text-fb-error"
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
		</div>
	)
}
