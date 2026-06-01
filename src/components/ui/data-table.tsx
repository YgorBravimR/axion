"use client"

import { useState } from "react"
import {
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	getPaginationRowModel,
	useReactTable,
	type ColumnDef,
	type SortingState,
} from "@tanstack/react-table"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useTranslations } from "next-intl"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const coreRowModel = getCoreRowModel()
const sortedRowModel = getSortedRowModel()
const paginationRowModel = getPaginationRowModel()

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[]
	data: TData[]
	emptyMessage?: string
	pageSize?: number
	striped?: boolean
}

const DataTable = <TData, TValue>({
	columns,
	data,
	emptyMessage,
	pageSize = 10,
	striped = true,
}: DataTableProps<TData, TValue>) => {
	const t = useTranslations("common")
	const [sorting, setSorting] = useState<SortingState>([])

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: coreRowModel,
		getSortedRowModel: sortedRowModel,
		getPaginationRowModel: paginationRowModel,
		onSortingChange: setSorting,
		state: { sorting },
		initialState: { pagination: { pageSize } },
	})

	return (
		<div className="space-y-4">
			<div className="border-bg-300 overflow-hidden rounded-lg border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow
								key={headerGroup.id}
								className="bg-bg-300 hover:bg-bg-300"
							>
								{headerGroup.headers.map((header) => {
									const isSortable = header.column.getCanSort()
									const sorted = header.column.getIsSorted()
									const headerMeta = header.column.columnDef.meta as
										| { headerClassName?: string; ariaLabel?: string }
										| undefined
									const headerDef = header.column.columnDef.header
									const columnLabel =
										headerMeta?.ariaLabel ??
										(typeof headerDef === "string"
											? headerDef
											: header.column.id)

									return (
										<TableHead
											key={header.id}
											className={headerMeta?.headerClassName}
										>
											{header.isPlaceholder ? null : isSortable ? (
												<button
													type="button"
													className="gap-s-100 hover:text-txt-100 flex items-center transition-colors"
													onClick={header.column.getToggleSortingHandler()}
													aria-label={t("sortBy", { column: columnLabel })}
												>
													{flexRender(
														header.column.columnDef.header,
														header.getContext()
													)}
													{sorted === "asc" ? (
														<ArrowUp className="h-3.5 w-3.5" />
													) : sorted === "desc" ? (
														<ArrowDown className="h-3.5 w-3.5" />
													) : (
														<ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
													)}
												</button>
											) : (
												flexRender(
													header.column.columnDef.header,
													header.getContext()
												)
											)}
										</TableHead>
									)
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.length ? (
							table.getRowModel().rows.map((row, index) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() && "selected"}
									className={cn(striped && index % 2 === 1 && "bg-bg-stripe")}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											className={
												(
													cell.column.columnDef.meta as
														| Record<string, string>
														| undefined
												)?.cellClassName
											}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="text-txt-300 h-24 text-center"
								>
									{emptyMessage ?? t("noResultsSimple")}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{/* Pagination */}
			{table.getPageCount() > 1 && (
				<div className="px-s-200 flex items-center justify-between">
					<p className="text-small text-txt-300">
						{t("pagination.pageOf", {
							current: table.getState().pagination.pageIndex + 1,
							total: table.getPageCount(),
						})}
					</p>
					<div className="gap-s-200 flex items-center">
						<Button
							id="data-table-prev"
							variant="outline"
							size="sm"
							onClick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
						>
							{t("previous")}
						</Button>
						<Button
							id="data-table-next"
							variant="outline"
							size="sm"
							onClick={() => table.nextPage()}
							disabled={!table.getCanNextPage()}
						>
							{t("next")}
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

export { DataTable, type DataTableProps }
