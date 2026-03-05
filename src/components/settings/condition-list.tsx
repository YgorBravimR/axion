"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConditionForm } from "./condition-form"
import {
	getConditions,
	deleteCondition,
} from "@/app/actions/trading-conditions"
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

export const ConditionList = () => {
	const t = useTranslations("settings.conditions")
	const tCommon = useTranslations("common")
	const [conditions, setConditions] = useState<TradingCondition[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [filterCategory, setFilterCategory] = useState<FilterCategory>("all")
	const [formOpen, setFormOpen] = useState(false)
	const [editingCondition, setEditingCondition] =
		useState<TradingCondition | null>(null)
	const [isPending, startTransition] = useTransition()
	const [deletingId, setDeletingId] = useState<string | null>(null)

	const loadConditions = async () => {
		setIsLoading(true)
		const result = await getConditions()
		if (result.status === "success" && result.data) {
			setConditions(result.data)
		}
		setIsLoading(false)
	}

	useEffect(() => {
		loadConditions()
	}, [])

	const categoryCounts = {
		all: conditions.length,
		indicator: conditions.filter((c) => c.category === "indicator").length,
		price_action: conditions.filter((c) => c.category === "price_action")
			.length,
		market_context: conditions.filter((c) => c.category === "market_context")
			.length,
		custom: conditions.filter((c) => c.category === "custom").length,
	}

	const filteredConditions = conditions.filter(
		(c) => filterCategory === "all" || c.category === filterCategory
	)

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
		loadConditions()
	}

	const handleAddNew = () => {
		setEditingCondition(null)
		setFormOpen(true)
	}

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
				<Loader2 className="text-txt-300 h-6 w-6 animate-spin" />
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
		<div className="space-y-m-400">
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
								if (e.key === "Enter" || e.key === " ")
									setFilterCategory(badge.key)
							}}
						>
							{badge.label} ({categoryCounts[badge.key]})
						</Badge>
					))}
				</div>
				<Button id="condition-add-new" onClick={handleAddNew}>
					<Plus className="mr-2 h-4 w-4" />
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
											"text-caption",
											getCategoryColor(condition.category)
										)}
									>
										{getCategoryLabel(condition.category)}
									</span>
								</div>
								<div className="gap-s-100 ml-s-200 flex shrink-0 items-center">
									{isPending && deletingId === condition.id ? (
										<Loader2 className="text-txt-300 h-4 w-4 animate-spin" />
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
