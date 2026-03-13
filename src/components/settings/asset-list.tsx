"use client"

import { useState, useTransition, useMemo } from "react"
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
import type { AssetType } from "@/db/schema"
import type { ColumnDef } from "@tanstack/react-table"
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
	const [search, setSearch] = useState("")
	const [filterType, setFilterType] = useState<string | null>(null)
	const [showInactive, setShowInactive] = useState(false)
	const [formOpen, setFormOpen] = useState(false)
	const [editingAsset, setEditingAsset] = useState<AssetWithType | null>(null)
	const [isPending, startTransition] = useTransition()
	const [pendingId, setPendingId] = useState<string | null>(null)

	const filteredAssets = assets.filter((asset) => {
		const matchesSearch =
			asset.symbol.toLowerCase().includes(search.toLowerCase()) ||
			asset.name.toLowerCase().includes(search.toLowerCase())
		const matchesType = !filterType || asset.assetTypeId === filterType
		const matchesActive = showInactive || asset.isActive
		return matchesSearch && matchesType && matchesActive
	})

	const handleEdit = (asset: AssetWithType) => {
		setEditingAsset(asset)
		setFormOpen(true)
	}

	const handleToggleActive = (asset: AssetWithType) => {
		setPendingId(asset.id)
		startTransition(async () => {
			await toggleAssetActive(asset.id, !asset.isActive)
			setPendingId(null)
		})
	}

	const handleDelete = (asset: AssetWithType) => {
		if (!confirm(`Delete ${asset.symbol}?`)) return
		setPendingId(asset.id)
		startTransition(async () => {
			await deleteAsset(asset.id)
			setPendingId(null)
		})
	}

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
					<span className="whitespace-nowrap font-mono font-medium text-acc-100">
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
				meta: { headerClassName: "hidden sm:table-cell", cellClassName: "hidden sm:table-cell" },
				header: () => <span className="flex justify-end">{t("tickSize")}</span>,
				cell: ({ row }) => (
					<span className="flex justify-end font-mono text-txt-200">
						{parseFloat(row.original.tickSize)}
					</span>
				),
			},
			{
				accessorKey: "tickValue",
				meta: { headerClassName: "hidden sm:table-cell", cellClassName: "hidden sm:table-cell" },
				header: () => <span className="flex justify-end">{t("tickValue")}</span>,
				cell: ({ row }) => (
					<span className="flex justify-end font-mono text-txt-200">
						{fromCents(row.original.tickValue)}
					</span>
				),
			},
			{
				accessorKey: "currency",
				meta: { headerClassName: "hidden sm:table-cell", cellClassName: "hidden sm:table-cell" },
				header: () => <span className="flex justify-center">{t("currency")}</span>,
				cell: ({ row }) => (
					<span className="flex justify-center text-txt-200">
						{row.original.currency}
					</span>
				),
				enableSorting: false,
			},
			{
				id: "status",
				header: () => <span className="flex justify-center">{tCommon("status")}</span>,
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
				header: () => <span className="flex justify-end">{tCommon("actions")}</span>,
				cell: ({ row }) => {
					const asset = row.original
					return (
						<div className="flex items-center justify-end gap-s-200">
							{isPending && pendingId === asset.id ? (
								<Loader2 className="h-4 w-4 animate-spin text-txt-300" />
							) : (
								<>
									<Button
										id={`asset-edit-${asset.id}`}
										variant="ghost"
										size="sm"
										onClick={() => handleEdit(asset)}
										className="h-8 w-8 p-0"
										aria-label={`${tCommon("edit")} ${asset.symbol}`}
									>
										<Pencil className="h-4 w-4" aria-hidden="true" />
									</Button>
									<Button
										id={`asset-toggle-active-${asset.id}`}
										variant="ghost"
										size="sm"
										onClick={() => handleToggleActive(asset)}
										className="h-8 w-8 p-0"
										aria-label={
											asset.isActive ? t("deactivate") : t("activate")
										}
									>
										{asset.isActive ? (
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
										id={`asset-delete-${asset.id}`}
										variant="ghost"
										size="sm"
										onClick={() => handleDelete(asset)}
										className="h-8 w-8 p-0 text-fb-error hover:text-fb-error"
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
		[t, tCommon, isPending, pendingId]
	)

	return (
		<div className="space-y-m-400">
			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-m-400">
				<div className="flex items-center gap-s-300">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-300" />
						<Input
							id="asset-search"
							placeholder={t("searchAssets")}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="w-full sm:w-64 pl-9"
						/>
					</div>
					<div className="flex gap-s-200">
						<Badge
							id="badge-asset-filter-all"
							variant={filterType === null ? "default" : "outline"}
							className="cursor-pointer"
							onClick={() => setFilterType(null)}
						>
							{tCommon("all")}
						</Badge>
						{assetTypes.map((type) => (
							<Badge
								id={`badge-asset-filter-${type.id}`}
								key={type.id}
								variant={filterType === type.id ? "default" : "outline"}
								className="cursor-pointer"
								onClick={() =>
									setFilterType(filterType === type.id ? null : type.id)
								}
							>
								{type.name}
							</Badge>
						))}
					</div>
				</div>
				<div className="flex items-center gap-s-300">
					<Button
						id="asset-toggle-inactive"
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
					<Button id="asset-add-new" onClick={() => setFormOpen(true)}>
						<Plus className="mr-2 h-4 w-4" />
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
		</div>
	)
}

export { AssetList }
