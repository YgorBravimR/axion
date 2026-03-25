"use client"

import { useState } from "react"
import { Check, Settings } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { toggleChecklistItem } from "@/app/actions/command-center"
import type { ChecklistWithCompletion } from "@/app/actions/command-center"

interface DailyChecklistProps {
	checklists: ChecklistWithCompletion[]
	onManageClick: () => void
	onRefresh: () => void
	isReadOnly?: boolean
}

export const DailyChecklist = ({
	checklists,
	onManageClick,
	onRefresh,
	isReadOnly = false,
}: DailyChecklistProps) => {
	const t = useTranslations("commandCenter.checklist")
	const [loading, setLoading] = useState<string | null>(null)

	/**
	 * Handles toggling a checklist item's completion status.
	 * Uses optimistic UI by calling onRefresh after successful toggle.
	 */
	const handleToggle = async (checklistId: string, itemId: string, completed: boolean) => {
		if (isReadOnly) return
		setLoading(`${checklistId}-${itemId}`)
		try {
			await toggleChecklistItem(checklistId, itemId, completed)
			onRefresh()
		} catch {
			// Error is silently handled - user will see item didn't toggle
		} finally {
			setLoading(null)
		}
	}

	if (checklists.length === 0) {
		return (
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<div className="mb-s-300 sm:mb-m-400 flex items-center justify-between">
					<h3 className="text-small sm:text-body font-semibold text-txt-100">{t("title")}</h3>
					{!isReadOnly && (
						<Button id="daily-checklist-manage" variant="ghost" size="sm" onClick={onManageClick}>
							<Settings className="mr-s-100 h-4 w-4" />
							{t("editChecklist")}
						</Button>
					)}
				</div>
				<p className="text-small text-txt-300">{t("noItems")}</p>
			</div>
		)
	}

	return (
		<div id="cc-daily-checklist" className="space-y-s-300 sm:space-y-m-400">
			{checklists.map((checklist) => {
				const completedCount = checklist.completedItemIds.length
				const totalCount = checklist.parsedItems.length
				const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
				const isComplete = completedCount === totalCount && totalCount > 0

				return (
					<div
						key={checklist.id}
						className={cn(
							"rounded-lg border bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 transition-colors",
							isComplete ? "border-trade-buy/50" : "border-bg-300"
						)}
					>
						{/* Header */}
						<div className="mb-s-300 sm:mb-m-400 flex items-center justify-between">
							<div className="flex items-center gap-s-200">
								<h3 className="text-small sm:text-body font-semibold text-txt-100">
									{checklist.name}
								</h3>
								{isComplete && (
									<span className="flex items-center gap-s-100 text-tiny text-trade-buy">
										<Check className="h-3 w-3" />
										{t("completed")}
									</span>
								)}
							</div>
							{!isReadOnly && (
								<Button id={`daily-checklist-settings-${checklist.id}`} variant="ghost" size="sm" onClick={onManageClick}>
									<Settings className="h-4 w-4" />
								</Button>
							)}
						</div>

						{/* Progress bar */}
						<div className="mb-s-300 sm:mb-m-400">
							<div className="mb-s-100 flex items-center justify-between">
								<span className="text-tiny text-txt-300">
									{completedCount} / {totalCount}
								</span>
								<span className="text-tiny text-txt-300">
									{Math.round(progress)}%
								</span>
							</div>
							<div className="h-1.5 overflow-hidden rounded-full bg-bg-300">
								<div
									className={cn(
										"h-full transition-[width] duration-300",
										isComplete ? "bg-trade-buy" : "bg-acc-100"
									)}
									style={{ width: `${progress}%` }}
								/>
							</div>
						</div>

						{/* Items */}
						<div className="space-y-s-200">
							{checklist.parsedItems
								.toSorted((a, b) => a.order - b.order)
								.map((item) => {
									const isChecked = checklist.completedItemIds.includes(item.id)
									const isLoading = loading === `${checklist.id}-${item.id}`

									return (
										<label
											key={item.id}
											className={cn(
												"flex items-center gap-s-300 rounded-md p-s-200 transition-colors",
												isReadOnly ? "cursor-default" : "cursor-pointer hover:bg-bg-300 active:bg-bg-300/70",
												isLoading && "opacity-50"
											)}
										>
											<Checkbox
												id={`checklist-item-${checklist.id}-${item.id}`}
												checked={isChecked}
												onCheckedChange={(checked) =>
													handleToggle(checklist.id, item.id, !!checked)
												}
												disabled={isReadOnly || isLoading}
												aria-label={item.label}
											/>
											<span
												className={cn(
													"text-small transition-colors",
													isChecked
														? "text-txt-300 line-through"
														: "text-txt-100"
												)}
											>
												{item.label}
											</span>
										</label>
									)
								})}
						</div>
					</div>
				)
			})}
		</div>
	)
}
