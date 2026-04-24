"use client"

import { useState, useTransition, useMemo, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { IndicatorGroupForm } from "./indicator-group-form"
import { IndicatorDefinitionForm } from "./indicator-definition-form"
import { IndicatorGroupCards } from "./indicator-group-cards"
import { IndicatorDefinitionTable } from "./indicator-definition-table"
import type { DefinitionRow } from "./indicator-definition-table"
import {
	createIndicatorGroup,
	updateIndicatorGroup,
	deleteIndicatorGroup,
	toggleIndicatorGroupActive,
	createIndicatorDefinition,
	updateIndicatorDefinition,
	deleteIndicatorDefinition,
	toggleIndicatorDefinitionActive,
} from "@/app/actions/indicators"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import type { IndicatorGroupWithDefinitions } from "@/types/indicator"
import type { IndicatorDefinition } from "@/db/schema"
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
	Search,
	Loader2,
} from "lucide-react"

interface IndicatorListProps {
	groups: IndicatorGroupWithDefinitions[]
}

const IndicatorList = ({ groups }: IndicatorListProps) => {
	const tCommon = useTranslations("common")
	const tInd = useTranslations("settings.indicators")
	const { showToast } = useToast()
	const { value: search, setValue: setSearch } = useDebouncedSearch("indQ")

	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
	const [groupFormOpen, setGroupFormOpen] = useState(false)
	const [editingGroup, setEditingGroup] =
		useState<IndicatorGroupWithDefinitions | null>(null)
	const [definitionFormOpen, setDefinitionFormOpen] = useState(false)
	const [editingDefinition, setEditingDefinition] =
		useState<IndicatorDefinition | null>(null)
	const [isPending, startTransition] = useTransition()
	const [pendingId, setPendingId] = useState<string | null>(null)
	const [deleteGroupTarget, setDeleteGroupTarget] =
		useState<IndicatorGroupWithDefinitions | null>(null)
	const [deleteDefinitionTarget, setDeleteDefinitionTarget] =
		useState<IndicatorDefinition | null>(null)

	/* ────── All definitions flat list ────── */
	const allDefinitions = useMemo(() => {
		const definitions: DefinitionRow[] = []
		for (const group of groups) {
			for (const indicator of group.indicators) {
				definitions.push({
					...indicator,
					groupDisplayName: group.displayName,
				})
			}
		}
		return definitions
	}, [groups])

	/* ────── Filtered definitions ────── */
	const filteredDefinitions = useMemo(() => {
		let filtered = allDefinitions

		if (selectedGroupId) {
			filtered = filtered.filter((def) => def.groupId === selectedGroupId)
		}

		if (search) {
			const lowerSearch = search.toLowerCase()
			filtered = filtered.filter(
				(def) =>
					def.key.toLowerCase().includes(lowerSearch) ||
					def.displayName.toLowerCase().includes(lowerSearch) ||
					def.groupDisplayName.toLowerCase().includes(lowerSearch) ||
					(def.csvHeader?.toLowerCase().includes(lowerSearch) ?? false)
			)
		}

		return filtered
	}, [allDefinitions, selectedGroupId, search])

	/* ────── Group handlers ────── */
	const handleEditGroup = (group: IndicatorGroupWithDefinitions) => {
		setEditingGroup(group)
		setGroupFormOpen(true)
	}

	const handleAddGroup = () => {
		setEditingGroup(null)
		setGroupFormOpen(true)
	}

	const handleGroupFormClose = () => {
		setGroupFormOpen(false)
		setEditingGroup(null)
	}

	const handleGroupSubmit = useCallback(async (data: {
		key: string
		displayName: string
		description?: string
	}) => {
		if (editingGroup) {
			const result = await updateIndicatorGroup(editingGroup.id, data)
			if (result.success) {
				showToast("success", tInd("toast.groupUpdated"))
			}
			return result
		}
		const result = await createIndicatorGroup(data)
		if (result.success) {
			showToast("success", tInd("toast.groupCreated"))
		}
		return result
	}, [editingGroup, showToast, tInd])

	const handleToggleGroupActive = (group: IndicatorGroupWithDefinitions) => {
		setPendingId(group.id)
		startTransition(async () => {
			const result = await toggleIndicatorGroupActive(
				group.id,
				!group.isActive
			)
			if (result.success) {
				showToast(
					"success",
					tInd("toast.groupToggled", {
						name: group.displayName,
						status: group.isActive ? tInd("toast.deactivated") : tInd("toast.activated"),
					})
				)
			} else {
				showToast("error", result.error ?? tInd("toast.groupToggleError"))
			}
			setPendingId(null)
		})
	}

	const handleDeleteGroup = (group: IndicatorGroupWithDefinitions) => {
		setDeleteGroupTarget(group)
	}

	const handleConfirmDeleteGroup = () => {
		if (!deleteGroupTarget) return
		const group = deleteGroupTarget
		setPendingId(group.id)
		startTransition(async () => {
			const result = await deleteIndicatorGroup(group.id)
			if (result.success) {
				showToast("success", tInd("toast.groupDeleted", { name: group.displayName }))
				if (selectedGroupId === group.id) {
					setSelectedGroupId(null)
				}
			} else {
				showToast("error", result.error ?? tInd("toast.groupDeleteError"))
			}
			setPendingId(null)
			setDeleteGroupTarget(null)
		})
	}

	const handleSelectGroup = (groupId: string) => {
		setSelectedGroupId(selectedGroupId === groupId ? null : groupId)
	}

	/* ────── Definition handlers ────── */
	const handleEditDefinition = useCallback((definition: IndicatorDefinition) => {
		setEditingDefinition(definition)
		setDefinitionFormOpen(true)
	}, [])

	const handleAddDefinition = () => {
		setEditingDefinition(null)
		setDefinitionFormOpen(true)
	}

	const handleDefinitionFormClose = () => {
		setDefinitionFormOpen(false)
		setEditingDefinition(null)
	}

	const handleDefinitionSubmit = useCallback(async (data: {
		key: string
		displayName: string
		groupId: string
		csvHeader?: string
		sortOrder: number
	}) => {
		if (editingDefinition) {
			const result = await updateIndicatorDefinition(editingDefinition.id, data)
			if (result.success) {
				showToast("success", tInd("toast.definitionUpdated"))
			}
			return result
		}
		const result = await createIndicatorDefinition(data)
		if (result.success) {
			showToast("success", tInd("toast.definitionCreated"))
		}
		return result
	}, [editingDefinition, showToast, tInd])

	const handleToggleDefinitionActive = useCallback((
		definition: DefinitionRow
	) => {
		setPendingId(definition.id)
		startTransition(async () => {
			const result = await toggleIndicatorDefinitionActive(
				definition.id,
				!definition.isActive
			)
			if (result.success) {
				showToast(
					"success",
					tInd("toast.definitionToggled", {
						name: definition.displayName,
						status: definition.isActive ? tInd("toast.deactivated") : tInd("toast.activated"),
					})
				)
			} else {
				showToast(
					"error",
					result.error ?? tInd("toast.definitionToggleError")
				)
			}
			setPendingId(null)
		})
	}, [showToast, startTransition, tInd])

	const handleDeleteDefinition = useCallback((
		definition: DefinitionRow
	) => {
		setDeleteDefinitionTarget(definition)
	}, [])

	const handleConfirmDeleteDefinition = () => {
		if (!deleteDefinitionTarget) return
		const definition = deleteDefinitionTarget
		setPendingId(definition.id)
		startTransition(async () => {
			const result = await deleteIndicatorDefinition(definition.id)
			if (result.success) {
				showToast("success", tInd("toast.definitionDeleted", { name: definition.displayName }))
			} else {
				showToast("error", result.error ?? tInd("toast.definitionDeleteError"))
			}
			setPendingId(null)
			setDeleteDefinitionTarget(null)
		})
	}

	return (
		<div id="settings-indicators" className="space-y-m-500">
			{/* ════════ Indicator Groups Section ════════ */}
			<section className="space-y-m-400">
				<div className="flex flex-wrap items-center justify-between gap-m-400">
					<h3 className="text-heading-3 font-semibold text-txt-100">
						{tInd("groups")}
					</h3>
					<Button id="indicator-group-add-new" onClick={handleAddGroup}>
						<Plus className="mr-2 h-4 w-4" />
						{tInd("addGroup")}
					</Button>
				</div>

				<IndicatorGroupCards
					groups={groups}
					selectedGroupId={selectedGroupId}
					isPending={isPending}
					pendingId={pendingId}
					onSelect={handleSelectGroup}
					onEdit={handleEditGroup}
					onToggleActive={handleToggleGroupActive}
					onDelete={handleDeleteGroup}
				/>
			</section>

			{/* ════════ Indicator Definitions Section ════════ */}
			<section className="space-y-m-400">
				<div className="flex flex-wrap items-center justify-between gap-m-400">
					<div className="flex items-center gap-s-300">
						<h3 className="text-heading-3 font-semibold text-txt-100">
							{tInd("definitions")}
						</h3>
						{selectedGroupId && (
							<Badge
								id="badge-indicator-filter-group"
								variant="default"
								className="cursor-pointer"
								tabIndex={0}
								role="button"
								aria-label={tInd("clearGroupFilter")}
								onClick={() => setSelectedGroupId(null)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ")
										setSelectedGroupId(null)
								}}
							>
								{groups.find((g) => g.id === selectedGroupId)?.displayName} &times;
							</Badge>
						)}
					</div>
					<div className="flex items-center gap-s-300">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-300" />
							<Input
								id="indicator-search"
								placeholder={tInd("searchPlaceholder")}
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className="w-full pl-9 sm:w-64"
							/>
						</div>
						<Button
							id="indicator-definition-add-new"
							onClick={handleAddDefinition}
						>
							<Plus className="mr-2 h-4 w-4" />
							{tInd("addIndicator")}
						</Button>
					</div>
				</div>

				<IndicatorDefinitionTable
					definitions={filteredDefinitions}
					isPending={isPending}
					pendingId={pendingId}
					emptyMessage={tInd("noDefinitions")}
					onEdit={handleEditDefinition}
					onToggleActive={handleToggleDefinitionActive}
					onDelete={handleDeleteDefinition}
				/>
			</section>

			{/* ════════ Dialogs ════════ */}
			<IndicatorGroupForm
				group={editingGroup}
				open={groupFormOpen}
				onOpenChange={handleGroupFormClose}
				onSubmit={handleGroupSubmit}
			/>

			<IndicatorDefinitionForm
				definition={editingDefinition}
				groups={groups}
				open={definitionFormOpen}
				onOpenChange={handleDefinitionFormClose}
				onSubmit={handleDefinitionSubmit}
			/>

			{/* ════════ Delete Group Confirm ════════ */}
			<AlertDialog
				open={!!deleteGroupTarget}
				onOpenChange={(open) => {
					if (!open && !isPending) setDeleteGroupTarget(null)
				}}
			>
				<AlertDialogContent id="delete-indicator-group-confirm">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{tInd("deleteGroup.title", { name: deleteGroupTarget?.displayName ?? "" })}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{tInd("deleteGroup.description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel
							id="delete-indicator-group-cancel"
							disabled={isPending}
						>
							{tCommon("cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							id="delete-indicator-group-confirm-btn"
							variant="destructive"
							disabled={isPending}
							onClick={(e) => {
								e.preventDefault()
								handleConfirmDeleteGroup()
							}}
						>
							{isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
							) : null}
							{tCommon("delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* ════════ Delete Definition Confirm ════════ */}
			<AlertDialog
				open={!!deleteDefinitionTarget}
				onOpenChange={(open) => {
					if (!open && !isPending) setDeleteDefinitionTarget(null)
				}}
			>
				<AlertDialogContent id="delete-indicator-definition-confirm">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{tInd("deleteDefinition.title", { name: deleteDefinitionTarget?.displayName ?? "" })}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{tInd("deleteDefinition.description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel
							id="delete-indicator-definition-cancel"
							disabled={isPending}
						>
							{tCommon("cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							id="delete-indicator-definition-confirm-btn"
							variant="destructive"
							disabled={isPending}
							onClick={(e) => {
								e.preventDefault()
								handleConfirmDeleteDefinition()
							}}
						>
							{isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
							) : null}
							{tCommon("delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

export { IndicatorList }
