"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
	Settings2,
	Save,
	Loader2,
	Plus,
	Trash2,
	PlusCircle,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { BiasSelector } from "./bias-selector"
import {
	upsertAssetSettings,
	deleteAssetSettings,
} from "@/app/actions/command-center"
import type { AssetSettingWithAsset } from "@/app/actions/command-center.types"
import type { Asset } from "@/db/schema"
import type { BiasType } from "@/lib/validations/command-center"

interface AssetRulesPanelProps {
	settings: AssetSettingWithAsset[]
	availableAssets: Asset[]
	onRefresh: () => void
}

interface EditingState {
	assetId: string
	bias: BiasType | null
	maxDailyTrades: string
	maxPositionSize: string
	notes: string
}

export const AssetRulesPanel = ({
	settings,
	availableAssets,
	onRefresh,
}: AssetRulesPanelProps) => {
	const t = useTranslations("commandCenter.assetRules")
	const router = useRouter()
	const { showToast } = useToast()

	const [addingAsset, setAddingAsset] = useState(false)
	const [selectedAssetId, setSelectedAssetId] = useState<string>("")
	const [editing, setEditing] = useState<EditingState | null>(null)
	const [saving, setSaving] = useState<string | null>(null)
	const [deleting, setDeleting] = useState<string | null>(null)

	const settingsAssetSet = useMemo(
		() => new Set(settings.map((s) => s.assetId)),
		[settings]
	)
	const availableToAdd = useMemo(
		() => availableAssets.filter((a) => !settingsAssetSet.has(a.id)),
		[availableAssets, settingsAssetSet]
	)

	const handleAddAsset = useCallback(async () => {
		if (!selectedAssetId) {
			return
		}

		setSaving(selectedAssetId)
		try {
			const result = await upsertAssetSettings({
				assetId: selectedAssetId,
				bias: null,
				maxDailyTrades: null,
				maxPositionSize: null,
				notes: null,
				isActive: true,
			})
			if (result.status === "error") {
				showToast("error", result.message)
				return
			}
			setAddingAsset(false)
			setSelectedAssetId("")
			onRefresh()
		} catch {
			showToast("error", t("addError"))
		} finally {
			setSaving(null)
		}
	}, [selectedAssetId, showToast, onRefresh, t])

	const handleStartEdit = useCallback((setting: AssetSettingWithAsset) => {
		setEditing({
			assetId: setting.assetId,
			bias: (setting.bias as BiasType) || null,
			maxDailyTrades: setting.maxDailyTrades?.toString() || "",
			maxPositionSize: setting.maxPositionSize?.toString() || "",
			notes: setting.notes || "",
		})
	}, [])

	const handleSaveEdit = useCallback(async () => {
		if (!editing) {
			return
		}

		setSaving(editing.assetId)
		try {
			const result = await upsertAssetSettings({
				assetId: editing.assetId,
				bias: editing.bias,
				maxDailyTrades: editing.maxDailyTrades
					? parseInt(editing.maxDailyTrades)
					: null,
				maxPositionSize: editing.maxPositionSize
					? parseInt(editing.maxPositionSize)
					: null,
				notes: editing.notes || null,
				isActive: true,
			})
			if (result.status === "error") {
				showToast("error", result.message)
				return
			}
			setEditing(null)
			onRefresh()
		} catch {
			showToast("error", t("saveError"))
		} finally {
			setSaving(null)
		}
	}, [editing, showToast, onRefresh, t])

	const handleBiasChange = useCallback(
		async (assetId: string, bias: BiasType | null) => {
			setSaving(assetId)
			try {
				const setting = settings.find((s) => s.assetId === assetId)
				if (setting) {
					const result = await upsertAssetSettings({
						assetId,
						bias,
						maxDailyTrades: setting.maxDailyTrades,
						maxPositionSize: setting.maxPositionSize,
						notes: setting.notes,
						isActive: true,
					})
					if (result.status === "error") {
						showToast("error", result.message)
						return
					}
					onRefresh()
				}
			} catch {
				showToast("error", t("biasError"))
			} finally {
				setSaving(null)
			}
		},
		[settings, showToast, onRefresh, t]
	)

	const handleDelete = useCallback(
		async (assetId: string) => {
			setDeleting(assetId)
			try {
				const result = await deleteAssetSettings(assetId)
				if (result.status === "error") {
					showToast("error", result.message)
					return
				}
				onRefresh()
			} catch {
				showToast("error", t("deleteError"))
			} finally {
				setDeleting(null)
			}
		},
		[showToast, onRefresh, t]
	)

	const handleAddTrade = useCallback(
		(assetId: string) => {
			router.push(`/journal/new?returnTo=/command-center&asset=${assetId}`)
		},
		[router]
	)

	return (
		<div
			id="cc-asset-rules"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			{/* Header */}
			<div className="mb-s-300 sm:mb-m-400 flex items-center justify-between">
				<div className="gap-s-200 flex items-center">
					<Settings2 className="text-txt-200 h-5 w-5" aria-hidden="true" />
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("title")}
					</h3>
				</div>
				{!addingAsset && availableToAdd.length > 0 && (
					<Button
						id="asset-rules-add-asset"
						variant="ghost"
						size="sm"
						onClick={() => setAddingAsset(true)}
					>
						<Plus className="mr-s-100 h-4 w-4" aria-hidden="true" />
						{t("addAsset")}
					</Button>
				)}
			</div>

			{/* Add Asset Row */}
			{addingAsset && (
				<div className="mb-m-400 gap-s-200 border-bg-300 p-s-300 flex items-center rounded-md border border-dashed">
					<Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
						<SelectTrigger id="asset-rules-asset" className="w-full sm:w-48">
							<SelectValue placeholder={t("selectAsset")} />
						</SelectTrigger>
						<SelectContent>
							{availableToAdd.map((asset) => (
								<SelectItem key={asset.id} value={asset.id}>
									{asset.symbol} - {asset.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						id="asset-rules-confirm-add"
						size="sm"
						onClick={handleAddAsset}
						disabled={!selectedAssetId || saving === selectedAssetId}
					>
						{saving === selectedAssetId ? (
							<Loader2
								className="h-4 w-4 animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
						) : (
							t("add")
						)}
					</Button>
					<Button
						id="asset-rules-cancel-add"
						variant="ghost"
						size="sm"
						onClick={() => setAddingAsset(false)}
					>
						{t("cancel")}
					</Button>
				</div>
			)}

			{/* Settings Table */}
			{settings.length === 0 ? (
				<p className="text-small text-txt-300">{t("noAssets")}</p>
			) : (
				<Table className="w-full">
					<TableHeader>
						<TableRow className="border-bg-300 border-b text-left">
							<TableHead className="pb-s-200 text-tiny text-txt-300 font-medium">
								{t("asset")}
							</TableHead>
							<TableHead className="pb-s-200 text-tiny text-txt-300 font-medium">
								{t("bias")}
							</TableHead>
							<TableHead className="pb-s-200 text-tiny text-txt-300 font-medium">
								{t("maxTrades")}
							</TableHead>
							<TableHead className="pb-s-200 text-tiny text-txt-300 font-medium">
								{t("positionSize")}
							</TableHead>
							<TableHead className="pb-s-200 text-tiny text-txt-300 font-medium">
								{t("notes")}
							</TableHead>
							<TableHead className="pb-s-200 text-tiny text-txt-300 font-medium"></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{settings.map((setting) => {
							const isEditing = editing?.assetId === setting.assetId
							const isSaving = saving === setting.assetId
							const isDeleting = deleting === setting.assetId

							return (
								<TableRow
									key={setting.id}
									className="border-bg-300 border-b last:border-0"
								>
									<TableCell className="py-s-300 pr-m-400">
										<span className="text-small text-txt-100 font-medium">
											{setting.asset.symbol}
										</span>
									</TableCell>
									<TableCell className="py-s-300 pr-m-400">
										{isEditing ? (
											<BiasSelector
												value={editing.bias}
												onChange={(value) =>
													setEditing({ ...editing, bias: value })
												}
												compact
											/>
										) : (
											<BiasSelector
												value={(setting.bias as BiasType) || null}
												onChange={(value) =>
													handleBiasChange(setting.assetId, value)
												}
												disabled={isSaving}
												compact
											/>
										)}
									</TableCell>
									<TableCell className="py-s-300 pr-m-400">
										{isEditing ? (
											<Input
												id={`asset-rules-max-daily-trades-${setting.assetId}`}
												type="number"
												step="1"
												min="0"
												value={editing.maxDailyTrades}
												onChange={(e) =>
													setEditing({
														...editing,
														maxDailyTrades: e.target.value,
													})
												}
												className="h-8 w-full sm:w-20"
											/>
										) : (
											<span className="text-small text-txt-200">
												{setting.maxDailyTrades || "-"}
											</span>
										)}
									</TableCell>
									<TableCell className="py-s-300 pr-m-400">
										{isEditing ? (
											<Input
												id={`asset-rules-max-position-size-${setting.assetId}`}
												type="number"
												step="1"
												min="0"
												value={editing.maxPositionSize}
												onChange={(e) =>
													setEditing({
														...editing,
														maxPositionSize: e.target.value,
													})
												}
												className="h-8 w-full sm:w-20"
											/>
										) : (
											<span className="text-small text-txt-200">
												{setting.maxPositionSize || "-"}
											</span>
										)}
									</TableCell>
									<TableCell className="py-s-300 pr-m-400">
										{isEditing ? (
											<Input
												id={`asset-rules-notes-${setting.assetId}`}
												value={editing.notes}
												onChange={(e) =>
													setEditing({ ...editing, notes: e.target.value })
												}
												className="h-8"
												placeholder={t("notesPlaceholder")}
											/>
										) : (
											<span className="text-small text-txt-300">
												{setting.notes || "-"}
											</span>
										)}
									</TableCell>
									<TableCell className="py-s-300">
										<div className="gap-s-100 flex items-center">
											{isEditing ? (
												<>
													<Button
														id={`asset-rules-save-${setting.assetId}`}
														variant="ghost"
														size="sm"
														onClick={handleSaveEdit}
														disabled={isSaving}
														className="h-8 w-8 p-0"
														aria-label={t("save")}
													>
														{isSaving ? (
															<Loader2
																className="h-4 w-4 animate-spin motion-reduce:animate-none"
																aria-hidden="true"
															/>
														) : (
															<Save
																className="text-trade-buy h-4 w-4"
																aria-hidden="true"
															/>
														)}
													</Button>
													<Button
														id={`asset-rules-cancel-edit-${setting.assetId}`}
														variant="ghost"
														size="sm"
														onClick={() => setEditing(null)}
														className="text-txt-300 h-8 w-8 p-0"
														aria-label={t("cancel")}
													>
														&times;
													</Button>
												</>
											) : (
												<>
													<Button
														id={`asset-rules-add-trade-${setting.assetId}`}
														variant="ghost"
														size="sm"
														onClick={() => handleAddTrade(setting.assetId)}
														className="text-acc-100 hover:text-acc-100/80 h-8 w-8 p-0"
														aria-label={t("addTrade")}
													>
														<PlusCircle
															className="h-4 w-4"
															aria-hidden="true"
														/>
													</Button>
													<Button
														id={`asset-rules-edit-${setting.assetId}`}
														variant="ghost"
														size="sm"
														onClick={() => handleStartEdit(setting)}
														className="text-txt-300 hover:text-txt-100 h-8 w-8 p-0"
														aria-label={t("edit")}
													>
														<Settings2 className="h-4 w-4" aria-hidden="true" />
													</Button>
													<Button
														id={`asset-rules-delete-${setting.assetId}`}
														variant="ghost"
														size="sm"
														onClick={() => handleDelete(setting.assetId)}
														disabled={isDeleting}
														className={cn(
															"h-8 w-8 p-0",
															isDeleting
																? "text-txt-placeholder"
																: "text-txt-300 hover:text-fb-error"
														)}
														aria-label={t("delete")}
													>
														{isDeleting ? (
															<Loader2
																className="h-4 w-4 animate-spin motion-reduce:animate-none"
																aria-hidden="true"
															/>
														) : (
															<Trash2 className="h-4 w-4" aria-hidden="true" />
														)}
													</Button>
												</>
											)}
										</div>
									</TableCell>
								</TableRow>
							)
						})}
					</TableBody>
				</Table>
			)}
		</div>
	)
}
