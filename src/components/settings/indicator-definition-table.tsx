"use client"

import { memo, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { Pencil, Trash2, ToggleLeft, ToggleRight, Loader2 } from "lucide-react"
import type { IndicatorDefinition } from "@/db/schema"
import type { ColumnDef } from "@tanstack/react-table"

type DefinitionRow = IndicatorDefinition & { groupDisplayName: string }

interface IndicatorDefinitionTableProps {
	definitions: DefinitionRow[]
	isPending: boolean
	pendingId: string | null
	emptyMessage: string
	onEdit: (_definition: IndicatorDefinition) => void
	onToggleActive: (_definition: DefinitionRow) => void
	onDelete: (_definition: DefinitionRow) => void
}

const IndicatorDefinitionTable = memo(
	({
		definitions,
		isPending,
		pendingId,
		emptyMessage,
		onEdit,
		onToggleActive,
		onDelete,
	}: IndicatorDefinitionTableProps) => {
		const tCommon = useTranslations("common")
		const tInd = useTranslations("settings.indicators")

		const columns: ColumnDef<DefinitionRow>[] = useMemo(
			() => [
				{
					accessorKey: "key",
					header: tInd("key"),
					cell: ({ row }) => (
						<span className="text-acc-100 font-mono font-medium whitespace-nowrap">
							{row.original.key}
						</span>
					),
				},
				{
					accessorKey: "displayName",
					header: tInd("displayName"),
					cell: ({ row }) => (
						<span className="text-txt-100">{row.original.displayName}</span>
					),
				},
				{
					accessorKey: "groupDisplayName",
					header: tInd("group"),
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
					header: tInd("csvHeader"),
					meta: {
						headerClassName: "hidden md:table-cell",
						cellClassName: "hidden md:table-cell",
					},
					cell: ({ row }) => (
						<span className="text-tiny text-txt-300 font-mono">
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
								{row.original.isActive
									? tCommon("active")
									: tCommon("inactive")}
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
							<div className="gap-s-200 flex items-center justify-end">
								{isPending && pendingId === definition.id ? (
									<Loader2 className="text-txt-300 h-4 w-4 animate-spin motion-reduce:animate-none" />
								) : (
									<>
										<Button
											id={`indicator-edit-${definition.id}`}
											variant="ghost"
											size="sm"
											onClick={() => onEdit(definition)}
											className="h-11 w-11 p-0"
											aria-label={`${tCommon("edit")} ${definition.displayName}`}
										>
											<Pencil className="h-4 w-4" aria-hidden="true" />
										</Button>
										<Button
											id={`indicator-toggle-active-${definition.id}`}
											variant="ghost"
											size="sm"
											onClick={() => onToggleActive(definition)}
											className="h-11 w-11 p-0"
											aria-label={
												definition.isActive
													? tInd("deactivateAriaLabel", {
															name: definition.displayName,
														})
													: tInd("activateAriaLabel", {
															name: definition.displayName,
														})
											}
										>
											{definition.isActive ? (
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
											id={`indicator-delete-${definition.id}`}
											variant="ghost"
											size="sm"
											onClick={() => onDelete(definition)}
											className="text-fb-error hover:text-fb-error h-9 w-9 p-0"
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
			[tCommon, tInd, isPending, pendingId, onEdit, onToggleActive, onDelete]
		)

		return (
			<DataTable
				columns={columns}
				data={definitions}
				emptyMessage={emptyMessage}
			/>
		)
	}
)

export type { IndicatorDefinitionTableProps, DefinitionRow }
export { IndicatorDefinitionTable }
