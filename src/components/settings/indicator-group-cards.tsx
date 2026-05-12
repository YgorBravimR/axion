"use client"

import { memo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
	Pencil,
	Trash2,
	ToggleLeft,
	ToggleRight,
	Loader2,
	Layers,
} from "lucide-react"
import type { IndicatorGroupWithDefinitions } from "@/types/indicator"

interface IndicatorGroupCardsProps {
	groups: IndicatorGroupWithDefinitions[]
	selectedGroupId: string | null
	isPending: boolean
	pendingId: string | null
	onSelect: (_groupId: string) => void
	onEdit: (_group: IndicatorGroupWithDefinitions) => void
	onToggleActive: (_group: IndicatorGroupWithDefinitions) => void
	onDelete: (_group: IndicatorGroupWithDefinitions) => void
}

const IndicatorGroupCards = memo(
	({
		groups,
		selectedGroupId,
		isPending,
		pendingId,
		onSelect,
		onEdit,
		onToggleActive,
		onDelete,
	}: IndicatorGroupCardsProps) => {
		const tCommon = useTranslations("common")
		const tInd = useTranslations("settings.indicators")

		if (groups.length === 0) {
			return (
				<div className="border-bg-300 bg-bg-200 p-l-700 text-txt-300 rounded-lg border text-center">
					{tInd("noGroups")}
				</div>
			)
		}

		return (
			<div className="gap-s-300 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
				{groups.map((group) => {
					const isSelected = selectedGroupId === group.id
					const indicatorCount = group.indicators.length
					return (
						<div
							key={group.id}
							role="button"
							tabIndex={0}
							aria-pressed={isSelected}
							aria-label={tInd("selectGroupAriaLabel", {
								name: group.displayName,
							})}
							onClick={() => onSelect(group.id)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault()
									onSelect(group.id)
								}
							}}
							className={`p-s-300 sm:p-m-400 cursor-pointer rounded-lg border transition-colors ${
								isSelected
									? "border-acc-100/50 bg-acc-100/5"
									: "border-bg-300 bg-bg-200 hover:border-txt-300/30"
							}`}
						>
							<div className="flex items-start justify-between">
								<div className="min-w-0 flex-1">
									<div className="gap-s-200 flex items-center">
										<Layers
											className="text-acc-100 h-4 w-4 shrink-0"
											aria-hidden="true"
										/>
										<p className="text-body text-txt-100 truncate font-medium">
											{group.displayName}
										</p>
									</div>
									<div className="mt-s-100 gap-s-200 flex flex-wrap items-center">
										<Badge
											id={`badge-group-key-${group.id}`}
											variant="outline"
											className="text-tiny font-mono"
										>
											{group.key}
										</Badge>
										<Badge
											id={`badge-group-status-${group.id}`}
											variant={group.isActive ? "default" : "secondary"}
											className="text-tiny"
										>
											{group.isActive ? tCommon("active") : tCommon("inactive")}
										</Badge>
										<span className="text-tiny text-txt-300">
											{tInd("indicatorCount", { count: indicatorCount })}
										</span>
									</div>
									{group.description && (
										<p className="mt-s-200 text-small text-txt-300 line-clamp-2">
											{group.description}
										</p>
									)}
								</div>
								<div className="ml-s-200 gap-s-100 flex shrink-0 items-center">
									{isPending && pendingId === group.id ? (
										<Loader2 className="text-txt-300 h-4 w-4 animate-spin motion-reduce:animate-none" />
									) : (
										<>
											<Button
												id={`group-edit-${group.id}`}
												variant="ghost"
												size="sm"
												onClick={(e) => {
													e.stopPropagation()
													onEdit(group)
												}}
												className="h-9 w-9 p-0"
												aria-label={`${tCommon("edit")} ${group.displayName}`}
											>
												<Pencil className="h-4 w-4" aria-hidden="true" />
											</Button>
											<Button
												id={`group-toggle-active-${group.id}`}
												variant="ghost"
												size="sm"
												onClick={(e) => {
													e.stopPropagation()
													onToggleActive(group)
												}}
												className="h-9 w-9 p-0"
												aria-label={
													group.isActive
														? tInd("deactivateAriaLabel", {
																name: group.displayName,
															})
														: tInd("activateAriaLabel", {
																name: group.displayName,
															})
												}
											>
												{group.isActive ? (
													<ToggleRight
														className="text-fb-success h-4 w-4"
														aria-hidden="true"
													/>
												) : (
													<ToggleLeft
														className="text-txt-300 h-4 w-4"
														aria-hidden="true"
													/>
												)}
											</Button>
											<Button
												id={`group-delete-${group.id}`}
												variant="ghost"
												size="sm"
												onClick={(e) => {
													e.stopPropagation()
													onDelete(group)
												}}
												className="text-fb-error hover:text-fb-error h-9 w-9 p-0"
												aria-label={`${tCommon("delete")} ${group.displayName}`}
											>
												<Trash2 className="h-4 w-4" aria-hidden="true" />
											</Button>
										</>
									)}
								</div>
							</div>
						</div>
					)
				})}
			</div>
		)
	}
)

export type { IndicatorGroupCardsProps }
export { IndicatorGroupCards }
