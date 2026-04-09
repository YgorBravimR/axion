"use client"

import { useState, useTransition, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/ui/data-table"
import { useToast } from "@/components/ui/toast"
import { IndicatorGroupForm } from "./indicator-group-form"
import { IndicatorDefinitionForm } from "./indicator-definition-form"
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
import type { ColumnDef } from "@tanstack/react-table"
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
	Pencil,
	Trash2,
	ToggleLeft,
	ToggleRight,
	Loader2,
	Layers,
} from "lucide-react"

interface IndicatorListProps {
	groups: IndicatorGroupWithDefinitions[]
}

const IndicatorList = ({ groups }: IndicatorListProps) => {
	const tCommon = useTranslations("common")
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
		const definitions: (IndicatorDefinition & { groupDisplayName: string })[] =
			[]
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

	const handleGroupSubmit = async (data: {
		key: string
		displayName: string
		description?: string
	}) => {
		if (editingGroup) {
			const result = await updateIndicatorGroup(editingGroup.id, data)
			if (result.success) {
				showToast("success", "Indicator group updated successfully.")
			}
			return result
		}
		const result = await createIndicatorGroup(data)
		if (result.success) {
			showToast("success", "Indicator group created successfully.")
		}
		return result
	}

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
					`Group "${group.displayName}" ${group.isActive ? "deactivated" : "activated"}.`
				)
			} else {
				showToast("error", result.error ?? "Failed to toggle group status.")
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
				showToast("success", `Group "${group.displayName}" deleted.`)
				if (selectedGroupId === group.id) {
					setSelectedGroupId(null)
				}
			} else {
				showToast("error", result.error ?? "Failed to delete group.")
			}
			setPendingId(null)
			setDeleteGroupTarget(null)
		})
	}

	const handleSelectGroup = (groupId: string) => {
		setSelectedGroupId(selectedGroupId === groupId ? null : groupId)
	}

	/* ────── Definition handlers ────── */
	const handleEditDefinition = (definition: IndicatorDefinition) => {
		setEditingDefinition(definition)
		setDefinitionFormOpen(true)
	}

	const handleAddDefinition = () => {
		setEditingDefinition(null)
		setDefinitionFormOpen(true)
	}

	const handleDefinitionFormClose = () => {
		setDefinitionFormOpen(false)
		setEditingDefinition(null)
	}

	const handleDefinitionSubmit = async (data: {
		key: string
		displayName: string
		groupId: string
		csvHeader?: string
		sortOrder: number
	}) => {
		if (editingDefinition) {
			const result = await updateIndicatorDefinition(editingDefinition.id, data)
			if (result.success) {
				showToast("success", "Indicator definition updated successfully.")
			}
			return result
		}
		const result = await createIndicatorDefinition(data)
		if (result.success) {
			showToast("success", "Indicator definition created successfully.")
		}
		return result
	}

	const handleToggleDefinitionActive = (
		definition: IndicatorDefinition & { groupDisplayName: string }
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
					`"${definition.displayName}" ${definition.isActive ? "deactivated" : "activated"}.`
				)
			} else {
				showToast(
					"error",
					result.error ?? "Failed to toggle indicator status."
				)
			}
			setPendingId(null)
		})
	}

	const handleDeleteDefinition = (
		definition: IndicatorDefinition & { groupDisplayName: string }
	) => {
		setDeleteDefinitionTarget(definition)
	}

	const handleConfirmDeleteDefinition = () => {
		if (!deleteDefinitionTarget) return
		const definition = deleteDefinitionTarget
		setPendingId(definition.id)
		startTransition(async () => {
			const result = await deleteIndicatorDefinition(definition.id)
			if (result.success) {
				showToast("success", `"${definition.displayName}" deleted.`)
			} else {
				showToast("error", result.error ?? "Failed to delete indicator.")
			}
			setPendingId(null)
			setDeleteDefinitionTarget(null)
		})
	}

	/* ────── Table columns ────── */
	type DefinitionRow = IndicatorDefinition & { groupDisplayName: string }

	const columns: ColumnDef<DefinitionRow>[] = useMemo(
		() => [
			{
				accessorKey: "key",
				header: "Key",
				cell: ({ row }) => (
					<span className="whitespace-nowrap font-mono font-medium text-acc-100">
						{row.original.key}
					</span>
				),
			},
			{
				accessorKey: "displayName",
				header: "Display Name",
				cell: ({ row }) => (
					<span className="text-txt-100">{row.original.displayName}</span>
				),
			},
			{
				accessorKey: "groupDisplayName",
				header: "Group",
				cell: ({ row }) => (
					<Badge
						id={`badge-indicator-group-${row.original.id}`}
						variant="outline"
						className="text-tiny"
					>
						{row.original.groupDisplayName}
					</Badge>
				),
				enableSorting: false,
			},
			{
				accessorKey: "csvHeader",
				header: "CSV Header",
				meta: {
					headerClassName: "hidden md:table-cell",
					cellClassName: "hidden md:table-cell",
				},
				cell: ({ row }) => (
					<span className="font-mono text-tiny text-txt-300">
						{row.original.csvHeader ?? "-"}
					</span>
				),
				enableSorting: false,
			},
			{
				id: "status",
				header: () => (
					<span className="flex justify-center">{tCommon("status")}</span>
				),
				cell: ({ row }) => (
					<span className="flex justify-center">
						<Badge
							id={`badge-indicator-status-${row.original.id}`}
							variant={row.original.isActive ? "default" : "secondary"}
							className="text-tiny"
						>
							{row.original.isActive ? "Active" : "Inactive"}
						</Badge>
					</span>
				),
				enableSorting: false,
			},
			{
				id: "actions",
				header: () => (
					<span className="flex justify-end">{tCommon("actions")}</span>
				),
				cell: ({ row }) => {
					const definition = row.original
					return (
						<div className="flex items-center justify-end gap-s-200">
							{isPending && pendingId === definition.id ? (
								<Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-txt-300" />
							) : (
								<>
									<Button
										id={`indicator-edit-${definition.id}`}
										variant="ghost"
										size="sm"
										onClick={() => handleEditDefinition(definition)}
										className="h-8 w-8 p-0"
										aria-label={`${tCommon("edit")} ${definition.displayName}`}
									>
										<Pencil className="h-4 w-4" aria-hidden="true" />
									</Button>
									<Button
										id={`indicator-toggle-active-${definition.id}`}
										variant="ghost"
										size="sm"
										onClick={() => handleToggleDefinitionActive(definition)}
										className="h-8 w-8 p-0"
										aria-label={
											definition.isActive
												? `Deactivate ${definition.displayName}`
												: `Activate ${definition.displayName}`
										}
									>
										{definition.isActive ? (
											<ToggleRight
												className="h-4 w-4 text-trade-buy"
												aria-hidden="true"
											/>
										) : (
											<ToggleLeft
												className="h-4 w-4 text-txt-300"
												aria-hidden="true"
											/>
										)}
									</Button>
									<Button
										id={`indicator-delete-${definition.id}`}
										variant="ghost"
										size="sm"
										onClick={() => handleDeleteDefinition(definition)}
										className="h-8 w-8 p-0 text-fb-error hover:text-fb-error"
										aria-label={`${tCommon("delete")} ${definition.displayName}`}
									>
										<Trash2 className="h-4 w-4" aria-hidden="true" />
									</Button>
								</>
							)}
						</div>
					)
				},
				enableSorting: false,
			},
		],
		[tCommon, isPending, pendingId]
	)

	return (
		<div id="settings-indicators" className="space-y-m-500">
			{/* ════════ Indicator Groups Section ════════ */}
			<section className="space-y-m-400">
				<div className="flex flex-wrap items-center justify-between gap-m-400">
					<h3 className="text-heading-3 font-semibold text-txt-100">
						Indicator Groups
					</h3>
					<Button id="indicator-group-add-new" onClick={handleAddGroup}>
						<Plus className="mr-2 h-4 w-4" />
						Add Group
					</Button>
				</div>

				{groups.length === 0 ? (
					<div className="rounded-lg border border-bg-300 bg-bg-200 p-l-700 text-center text-txt-300">
						No indicator groups configured yet.
					</div>
				) : (
					<div className="grid grid-cols-1 gap-s-300 md:grid-cols-2 lg:grid-cols-3">
						{groups.map((group) => {
							const isSelected = selectedGroupId === group.id
							const indicatorCount = group.indicators.length
							return (
								<div
									key={group.id}
									role="button"
									tabIndex={0}
									aria-pressed={isSelected}
									aria-label={`Select group ${group.displayName}`}
									onClick={() => handleSelectGroup(group.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault()
											handleSelectGroup(group.id)
										}
									}}
									className={`cursor-pointer rounded-lg border p-s-300 sm:p-m-400 transition-colors ${
										isSelected
											? "border-acc-100/50 bg-acc-100/5"
											: "border-bg-300 bg-bg-200 hover:border-bg-400"
									}`}
								>
									<div className="flex items-start justify-between">
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-s-200">
												<Layers
													className="h-4 w-4 shrink-0 text-acc-100"
													aria-hidden="true"
												/>
												<p className="text-body font-medium text-txt-100 truncate">
													{group.displayName}
												</p>
											</div>
											<div className="mt-s-100 flex flex-wrap items-center gap-s-200">
												<Badge
													id={`badge-group-key-${group.id}`}
													variant="outline"
													className="font-mono text-tiny"
												>
													{group.key}
												</Badge>
												<Badge
													id={`badge-group-status-${group.id}`}
													variant={group.isActive ? "default" : "secondary"}
													className="text-tiny"
												>
													{group.isActive ? "Active" : "Inactive"}
												</Badge>
												<span className="text-tiny text-txt-300">
													{indicatorCount}{" "}
													{indicatorCount === 1 ? "indicator" : "indicators"}
												</span>
											</div>
											{group.description && (
												<p className="mt-s-200 text-small text-txt-300 line-clamp-2">
													{group.description}
												</p>
											)}
										</div>
										<div className="ml-s-200 flex shrink-0 items-center gap-s-100">
											{isPending && pendingId === group.id ? (
												<Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-txt-300" />
											) : (
												<>
													<Button
														id={`group-edit-${group.id}`}
														variant="ghost"
														size="sm"
														onClick={(e) => {
															e.stopPropagation()
															handleEditGroup(group)
														}}
														className="h-8 w-8 p-0"
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
															handleToggleGroupActive(group)
														}}
														className="h-8 w-8 p-0"
														aria-label={
															group.isActive
																? `Deactivate ${group.displayName}`
																: `Activate ${group.displayName}`
														}
													>
														{group.isActive ? (
															<ToggleRight
																className="h-4 w-4 text-trade-buy"
																aria-hidden="true"
															/>
														) : (
															<ToggleLeft
																className="h-4 w-4 text-txt-300"
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
															handleDeleteGroup(group)
														}}
														className="h-8 w-8 p-0 text-fb-error hover:text-fb-error"
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
				)}
			</section>

			{/* ════════ Indicator Definitions Section ════════ */}
			<section className="space-y-m-400">
				<div className="flex flex-wrap items-center justify-between gap-m-400">
					<div className="flex items-center gap-s-300">
						<h3 className="text-heading-3 font-semibold text-txt-100">
							Indicator Definitions
						</h3>
						{selectedGroupId && (
							<Badge
								id="badge-indicator-filter-group"
								variant="default"
								className="cursor-pointer"
								tabIndex={0}
								role="button"
								aria-label="Clear group filter"
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
								placeholder="Search indicators..."
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
							Add Indicator
						</Button>
					</div>
				</div>

				<DataTable
					columns={columns}
					data={filteredDefinitions}
					emptyMessage="No indicator definitions found."
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
							Delete &ldquo;{deleteGroupTarget?.displayName}&rdquo;?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This will unlink all its indicator definitions. This action cannot
							be undone.
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
							Delete &ldquo;{deleteDefinitionTarget?.displayName}&rdquo;?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone.
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
