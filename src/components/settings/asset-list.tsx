"use client"

import { useState, useTransition, useMemo, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/ui/data-table"
import { AssetForm } from "./asset-form"
import {
	deleteAsset,
	toggleAssetActive,
	type AssetWithType,
} from "@/app/actions/assets"
import { useUrlParams } from "@/hooks/use-url-params"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import type { AssetType } from "@/db/schema"
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
} from "lucide-react"
import { fromCents } from "@/lib/money"

interface AssetListProps {
	assets: AssetWithType[]
	assetTypes: AssetType[]
}

const AssetList = ({ assets, assetTypes }: AssetListProps) => {
	const t = useTranslations("settings.assets")
	const tCommon = useTranslations("common")
	const urlParams = useUrlParams()
	const { value: search, setValue: setSearch } = useDebouncedSearch("assetQ")

	const filterType = urlParams.get("assetType")
	const setFilterType = (value: string | null) => {
		urlParams.set({ assetType: value })
	}

	const showInactive = urlParams.getBoolean("inactive")
	const setShowInactive = (value: boolean) => {
		urlParams.set({ inactive: value })
	}

	const [formOpen, setFormOpen] = useState(false)
	const [editingAsset, setEditingAsset] = useState<AssetWithType | null>(null)
	const [isPending, startTransition] = useTransition()
	const [pendingId, setPendingId] = useState<string | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<AssetWithType | null>(null)

	const filteredAssets = useMemo(
		() =>
			assets.filter((asset) => {
				const matchesSearch =
					asset.symbol.toLowerCase().includes(search.toLowerCase()) ||
					asset.name.toLowerCase().includes(search.toLowerCase())
				const matchesType = !filterType || asset.assetTypeId === filterType
				const matchesActive = showInactive || asset.isActive
				return matchesSearch && matchesType && matchesActive
			}),
		[assets, search, filterType, showInactive]
	)

	const handleEdit = useCallback((asset: AssetWithType) => {
		setEditingAsset(asset)
		setFormOpen(true)
	}, [])

	const handleToggleActive = useCallback((asset: AssetWithType) => {
		setPendingId(asset.id)
		startTransition(async () => {
			await toggleAssetActive(asset.id, !asset.isActive)
			setPendingId(null)
		})
	}, [])

	const handleDelete = useCallback((asset: AssetWithType) => {
		setDeleteTarget(asset)
	}, [])

	const handleConfirmDelete = useCallback(() => {
		if (!deleteTarget) {
			return
		}
		const asset = deleteTarget
		setPendingId(asset.id)
		startTransition(async () => {
			await deleteAsset(asset.id)
			setPendingId(null)
			setDeleteTarget(null)
		})
	}, [deleteTarget])

	const handleFormClose = () => {
		setFormOpen(false)
		setEditingAsset(null)
	}

	const columns: ColumnDef<AssetWithType>[] = useMemo(
		() => [
			{
				accessorKey: "symbol",
				header: t("symbol"),
				cell: ({ row }) => (
					<span className="text-acc-100 font-mono font-medium whitespace-nowrap">
						{row.original.symbol}
					</span>
				),
			},
			{
				accessorKey: "name",
				header: t("name"),
				cell: ({ row }) => (
					<span className="text-txt-100">{row.original.name}</span>
				),
			},
			{
				accessorKey: "assetType.name",
				header: t("type"),
				cell: ({ row }) => (
					<Badge
						id={`badge-asset-type-${row.original.id}`}
						variant="outline"
						className="text-tiny"
					>
						{row.original.assetType.name}
					</Badge>
				),
				enableSorting: false,
			},
			{
				accessorKey: "tickSize",
				meta: {
					headerClassName: "hidden sm:table-cell",
					cellClassName: "hidden sm:table-cell",
				},
				header: () => <span className="flex justify-end">{t("tickSize")}</span>,
				cell: ({ row }) => (
					<span className="text-txt-200 flex justify-end font-mono">
						{parseFloat(row.original.tickSize)}
					</span>
				),
			},
			{
				accessorKey: "tickValue",
				meta: {
					headerClassName: "hidden sm:table-cell",
					cellClassName: "hidden sm:table-cell",
				},
				header: () => (
					<span className="flex justify-end">{t("tickValue")}</span>
				),
				cell: ({ row }) => (
					<span className="text-txt-200 flex justify-end font-mono">
						{fromCents(row.original.tickValue)}
					</span>
				),
			},
			{
				accessorKey: "currency",
				meta: {
					headerClassName: "hidden sm:table-cell",
					cellClassName: "hidden sm:table-cell",
				},
				header: () => (
					<span className="flex justify-center">{t("currency")}</span>
				),
				cell: ({ row }) => (
					<span className="text-txt-200 flex justify-center">
						{row.original.currency}
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
							id={`badge-asset-status-${row.original.id}`}
							variant={row.original.isActive ? "default" : "secondary"}
							className="text-tiny"
						>
							{row.original.isActive ? t("active") : t("inactive")}
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
					const asset = row.original
					return (
						<div className="gap-s-200 flex items-center justify-end">
							{isPending && pendingId === asset.id ? (
								<Loader2 className="text-txt-300 h-4 w-4 animate-spin motion-reduce:animate-none" />
							) : (
								<>
									<Button
										id={`asset-edit-${asset.id}`}
										variant="ghost"
										size="sm"
										onClick={() => handleEdit(asset)}
										className="h-9 w-9 p-0"
										aria-label={`${tCommon("edit")} ${asset.symbol}`}
									>
										<Pencil className="h-4 w-4" aria-hidden="true" />
									</Button>
									<Button
										id={`asset-toggle-active-${asset.id}`}
										variant="ghost"
										size="sm"
										onClick={() => handleToggleActive(asset)}
										className="h-9 w-9 p-0"
										aria-label={
											asset.isActive ? t("deactivate") : t("activate")
										}
									>
										{asset.isActive ? (
											<ToggleRight
												className="text-trade-buy h-4 w-4"
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
										id={`asset-delete-${asset.id}`}
										variant="ghost"
										size="sm"
										onClick={() => handleDelete(asset)}
										className="text-fb-error hover:text-fb-error h-9 w-9 p-0"
										aria-label={`${tCommon("delete")} ${asset.symbol}`}
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
		[
			t,
			tCommon,
			isPending,
			pendingId,
			handleEdit,
			handleToggleActive,
			handleDelete,
			handleConfirmDelete,
		]
	)

	return (
		<div id="settings-assets" className="space-y-m-400">
			{/* Header */}
			<div className="gap-m-400 flex flex-wrap items-center justify-between">
				<div className="gap-s-300 flex items-center">
					<div className="relative">
						<Search className="text-txt-300 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
						<Input
							id="asset-search"
							placeholder={t("searchAssets")}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="w-full pl-9 sm:w-64"
						/>
					</div>
					<div className="gap-s-200 scrollbar-none flex overflow-x-auto">
						<Badge
							id="badge-asset-filter-all"
							variant={filterType === null ? "default" : "outline"}
							className="cursor-pointer whitespace-nowrap"
							tabIndex={0}
							role="button"
							aria-pressed={filterType === null}
							onClick={() => setFilterType(null)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									setFilterType(null)
								}
							}}
						>
							{tCommon("all")}
						</Badge>
						{assetTypes.map((type) => (
							<Badge
								id={`badge-asset-filter-${type.id}`}
								key={type.id}
								variant={filterType === type.id ? "default" : "outline"}
								className="cursor-pointer whitespace-nowrap"
								tabIndex={0}
								role="button"
								aria-pressed={filterType === type.id}
								onClick={() =>
									setFilterType(filterType === type.id ? null : type.id)
								}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										setFilterType(filterType === type.id ? null : type.id)
									}
								}}
							>
								{type.name}
							</Badge>
						))}
					</div>
				</div>
				<div className="gap-s-300 flex items-center">
					<Button
						id="asset-toggle-inactive"
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
					<Button id="asset-add-new" onClick={() => setFormOpen(true)}>
						<Plus className="mr-s-200 h-4 w-4" />
						{t("addAsset")}
					</Button>
				</div>
			</div>

			{/* Assets Table */}
			<DataTable
				columns={columns}
				data={filteredAssets}
				emptyMessage={t("noAssets")}
			/>

			{/* Asset Form Dialog */}
			<AssetForm
				asset={editingAsset}
				assetTypes={assetTypes}
				open={formOpen}
				onOpenChange={handleFormClose}
			/>

			{/* Delete Confirm Dialog */}
			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={(open) => {
					if (!open && !isPending) {
						setDeleteTarget(null)
					}
				}}
			>
				<AlertDialogContent id="delete-asset-confirm">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("confirmDelete", { symbol: deleteTarget?.symbol ?? "" })}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{tCommon("actionCannotBeUndone")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel id="delete-asset-cancel" disabled={isPending}>
							{tCommon("cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							id="delete-asset-confirm-btn"
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

export { AssetList }
