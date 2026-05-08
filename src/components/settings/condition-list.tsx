"use client"

import { useState, useTransition, useEffect, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConditionForm } from "./condition-form"
import {
	getConditions,
	deleteCondition,
} from "@/app/actions/trading-conditions"
import { useUrlParams } from "@/hooks/use-url-params"
import type { TradingCondition } from "@/db/schema"
import type { ConditionCategory } from "@/types/trading-condition"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type FilterCategory = "all" | ConditionCategory

const getCategoryColor = (category: string): string => {
	switch (category) {
		case "indicator":
			return "text-acc-100"
		case "price_action":
			return "text-action-buy"
		case "market_context":
			return "text-warning"
		case "custom":
			return "text-txt-200"
		default:
			return "text-txt-300"
	}
}

export const ConditionList = () => {
	const t = useTranslations("settings.conditions")
	const tCommon = useTranslations("common")
	const urlParams = useUrlParams()
	const filterCategory = (urlParams.get("conditionCat") ??
		"all") as FilterCategory
	const setFilterCategory = (value: FilterCategory) => {
		urlParams.set({ conditionCat: value === "all" ? null : value })
	}

	const [conditions, setConditions] = useState<TradingCondition[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [formOpen, setFormOpen] = useState(false)
	const [editingCondition, setEditingCondition] =
		useState<TradingCondition | null>(null)
	const [isPending, startTransition] = useTransition()
	const [deletingId, setDeletingId] = useState<string | null>(null)

	const loadConditions = useCallback(async () => {
		setIsLoading(true)
		const result = await getConditions()
		if (result.status === "success" && result.data) {
			setConditions(result.data)
		}
		setIsLoading(false)
	}, [])

	useEffect(() => {
		void loadConditions()
	}, [loadConditions])

	const { categoryCounts, filteredConditions } = useMemo(() => {
		const counts = {
			all: 0,
			indicator: 0,
			price_action: 0,
			market_context: 0,
			custom: 0,
		}
		const filtered: TradingCondition[] = []

		for (const condition of conditions) {
			counts.all++
			if (condition.category === "indicator") {
				counts.indicator++
			} else if (condition.category === "price_action") {
				counts.price_action++
			} else if (condition.category === "market_context") {
				counts.market_context++
			} else if (condition.category === "custom") {
				counts.custom++
			}

			if (filterCategory === "all" || condition.category === filterCategory) {
				filtered.push(condition)
			}
		}

		return { categoryCounts: counts, filteredConditions: filtered }
	}, [conditions, filterCategory])

	const handleEdit = (condition: TradingCondition) => {
		setEditingCondition(condition)
		setFormOpen(true)
	}

	const handleDelete = (conditionId: string) => {
		setDeletingId(conditionId)
		startTransition(async () => {
			await deleteCondition(conditionId)
			await loadConditions()
			setDeletingId(null)
		})
	}

	const handleFormClose = () => {
		setFormOpen(false)
		setEditingCondition(null)
	}

	const handleFormSuccess = () => {
		handleFormClose()
		void loadConditions()
	}

	const handleAddNew = () => {
		setEditingCondition(null)
		setFormOpen(true)
	}

	const getCategoryLabel = (category: string): string => {
		switch (category) {
			case "indicator":
				return t("categoryIndicator")
			case "price_action":
				return t("categoryPriceAction")
			case "market_context":
				return t("categoryMarketContext")
			case "custom":
				return t("categoryCustom")
			default:
				return category
		}
	}

	if (isLoading) {
		return (
			<div className="p-l-700 flex items-center justify-center">
				<Loader2 className="text-txt-300 h-6 w-6 animate-spin motion-reduce:animate-none" />
			</div>
		)
	}

	const filterBadges: { key: FilterCategory; label: string }[] = [
		{ key: "all", label: tCommon("all") },
		{ key: "indicator", label: t("categoryIndicator") },
		{ key: "price_action", label: t("categoryPriceAction") },
		{ key: "market_context", label: t("categoryMarketContext") },
		{ key: "custom", label: t("categoryCustom") },
	]

	return (
		<div id="settings-conditions" className="space-y-m-400">
			{/* Header */}
			<div className="gap-m-400 flex flex-wrap items-center justify-between">
				<div className="gap-s-300 flex flex-wrap items-center">
					{filterBadges.map((badge) => (
						<Badge
							key={badge.key}
							id={`badge-condition-filter-${badge.key}`}
							variant={filterCategory === badge.key ? "default" : "outline"}
							className="cursor-pointer"
							tabIndex={0}
							role="button"
							aria-pressed={filterCategory === badge.key}
							onClick={() => setFilterCategory(badge.key)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									setFilterCategory(badge.key)
								}
							}}
						>
							{badge.label} ({categoryCounts[badge.key]})
						</Badge>
					))}
				</div>
				<Button id="condition-add-new" onClick={handleAddNew}>
					<Plus className="mr-s-200 h-4 w-4" />
					{t("addCondition")}
				</Button>
			</div>

			{/* Conditions Grid */}
			<div className="gap-s-300 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
				{filteredConditions.length === 0 ? (
					<div className="border-bg-300 bg-bg-200 p-l-700 text-txt-300 col-span-full rounded-lg border text-center">
						{conditions.length === 0
							? t("noConditions")
							: t("noConditionsInFilter")}
					</div>
				) : (
					filteredConditions.map((condition) => (
						<div
							key={condition.id}
							className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border transition-colors"
						>
							<div className="flex items-start justify-between">
								<div className="min-w-0 flex-1">
									<p className="text-body text-txt-100 font-medium">
										{condition.name}
									</p>
									<span
										className={cn(
											"text-tiny",
											getCategoryColor(condition.category)
										)}
									>
										{getCategoryLabel(condition.category)}
									</span>
								</div>
								<div className="gap-s-100 ml-s-200 flex shrink-0 items-center">
									{isPending && deletingId === condition.id ? (
										<Loader2 className="text-txt-300 h-4 w-4 animate-spin motion-reduce:animate-none" />
									) : (
										<>
											<Button
												id={`condition-edit-${condition.id}`}
												variant="ghost"
												size="sm"
												onClick={() => handleEdit(condition)}
												className="h-8 w-8 p-0"
												aria-label={`${tCommon("edit")} ${condition.name}`}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button
														id={`condition-delete-${condition.id}`}
														variant="ghost"
														size="sm"
														className="text-fb-error hover:text-fb-error h-8 w-8 p-0"
														aria-label={`${tCommon("delete")} ${condition.name}`}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>
															{t("deleteTitle")}
														</AlertDialogTitle>
														<AlertDialogDescription>
															{t("deleteDescription", { name: condition.name })}
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel
															id={`condition-delete-cancel-${condition.id}`}
														>
															{tCommon("cancel")}
														</AlertDialogCancel>
														<AlertDialogAction
															id={`condition-delete-confirm-${condition.id}`}
															className="bg-fb-error hover:bg-fb-error/90"
															onClick={() => handleDelete(condition.id)}
														>
															{tCommon("delete")}
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</>
									)}
								</div>
							</div>
							{condition.description && (
								<p className="mt-s-200 text-small text-txt-300">
									{condition.description}
								</p>
							)}
						</div>
					))
				)}
			</div>

			{/* Condition Form Dialog */}
			<ConditionForm
				condition={editingCondition}
				open={formOpen}
				onOpenChange={handleFormClose}
				onSuccess={handleFormSuccess}
			/>
		</div>
	)
}
