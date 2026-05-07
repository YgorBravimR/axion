"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Bookmark, Plus, Trash2, Star, Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { useToast } from "@/components/ui/toast"
import {
	listFilterPresets,
	createFilterPreset,
	updateFilterPreset,
	deleteFilterPreset,
} from "@/app/actions/filter-presets"
import {
	savedFilterStateSchema,
	type SavedFilterState,
} from "@/lib/filter-preset-schema"
import type { FilterPreset } from "@/db/schema"

interface PresetSelectorProps {
	currentFilters: SavedFilterState
	onApplyPreset: (filters: SavedFilterState) => void
}

const PresetSelector = ({
	currentFilters,
	onApplyPreset,
}: PresetSelectorProps) => {
	const t = useTranslations("analytics.filters.presets")
	const { showToast } = useToast()
	const [isOpen, setIsOpen] = useState(false)
	const [presets, setPresets] = useState<FilterPreset[]>([])
	const [isLoading, startTransition] = useTransition()
	const [newPresetName, setNewPresetName] = useState("")
	const [isCreating, setIsCreating] = useState(false)
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

	// Load presets when popover opens
	useEffect(() => {
		if (!isOpen) {
			return
		}

		startTransition(async () => {
			const result = await listFilterPresets()
			if (result.status === "success" && result.data) {
				setPresets(result.data)
			}
		})
	}, [isOpen])

	const handleSave = async () => {
		const name = newPresetName.trim()
		if (!name) {
			return
		}

		startTransition(async () => {
			const result = await createFilterPreset({
				name,
				filters: currentFilters,
			})

			if (result.status === "success" && result.data) {
				setPresets((prev) => [result.data!, ...prev])
				setNewPresetName("")
				setIsCreating(false)
				showToast("success", t("saved"))
			} else {
				showToast("error", t("saveError"))
			}
		})
	}

	const handleApply = (preset: FilterPreset) => {
		try {
			const raw = JSON.parse(preset.filters)
			const parsed = savedFilterStateSchema.safeParse(raw)
			if (!parsed.success) {
				showToast("error", t("loadError"))
				return
			}
			onApplyPreset(parsed.data)
			setIsOpen(false)
		} catch {
			showToast("error", t("loadError"))
		}
	}

	const handleSetDefault = async (preset: FilterPreset) => {
		startTransition(async () => {
			const result = await updateFilterPreset(preset.id, {
				isDefault: !preset.isDefault,
			})

			if (result.status === "success") {
				setPresets((prev) =>
					prev.map((p) => ({
						...p,
						isDefault: p.id === preset.id ? !preset.isDefault : false,
					}))
				)
			}
		})
	}

	const handleUpdateFilters = async (preset: FilterPreset) => {
		startTransition(async () => {
			const result = await updateFilterPreset(preset.id, {
				filters: currentFilters,
			})

			if (result.status === "success") {
				setPresets((prev) =>
					prev.map((p) =>
						p.id === preset.id
							? { ...p, filters: JSON.stringify(currentFilters) }
							: p
					)
				)
				showToast("success", t("updated"))
			}
		})
	}

	const handleDelete = async (id: string) => {
		startTransition(async () => {
			const result = await deleteFilterPreset(id)

			if (result.status === "success") {
				setPresets((prev) => prev.filter((p) => p.id !== id))
				setConfirmDeleteId(null)
				showToast("success", t("deleted"))
			}
		})
	}

	const activePresetCount = presets.length

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					tabIndex={0}
					className={cn(
						"gap-s-200 border-bg-300 bg-bg-100 px-s-300 py-s-100 text-tiny text-txt-200 hover:border-txt-300 flex items-center rounded-md border transition-colors",
						activePresetCount > 0 && "border-acc-100/30"
					)}
					aria-label={t("label")}
				>
					<Bookmark className="h-3.5 w-3.5" />
					<span className="hidden sm:inline">{t("label")}</span>
					{activePresetCount > 0 && (
						<span className="bg-acc-100 text-micro text-bg-100 px-s-100 flex h-4 min-w-4 items-center justify-center rounded-full font-bold">
							{activePresetCount}
						</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="border-bg-300 bg-bg-200 w-72 p-0"
				align="end"
				sideOffset={8}
			>
				{/* Header */}
				<div className="border-bg-300 px-s-300 py-s-200 flex items-center justify-between border-b">
					<span className="text-small text-txt-100 font-medium">
						{t("label")}
					</span>
					{!isCreating && (
						<Button
							id="preset-save-new-btn"
							variant="ghost"
							size="sm"
							className="px-s-200 text-tiny h-7"
							onClick={() => setIsCreating(true)}
						>
							<Plus className="mr-s-100 h-3 w-3" />
							{t("saveAs")}
						</Button>
					)}
				</div>

				{/* Create new preset form */}
				{isCreating && (
					<div className="gap-s-200 border-bg-300 px-s-300 py-s-200 flex border-b">
						<Input
							id="preset-name-input"
							value={newPresetName}
							onChange={(e) => setNewPresetName(e.target.value)}
							placeholder={t("namePlaceholder")}
							className="text-tiny h-7"
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									void handleSave()
								}
								if (e.key === "Escape") {
									setIsCreating(false)
									setNewPresetName("")
								}
							}}
							autoFocus
						/>
						<Button
							id="preset-confirm-save-btn"
							variant="ghost"
							size="sm"
							className="px-s-200 h-7 shrink-0"
							onClick={handleSave}
							disabled={!newPresetName.trim() || isLoading}
						>
							{isLoading ? (
								<Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
							) : (
								<Check className="h-3 w-3" />
							)}
						</Button>
					</div>
				)}

				{/* Preset list */}
				<div className="max-h-60 overflow-y-auto">
					{isLoading && presets.length === 0 ? (
						<div className="py-m-400 flex items-center justify-center">
							<Loader2 className="text-txt-300 h-4 w-4 animate-spin motion-reduce:animate-none" />
						</div>
					) : presets.length === 0 ? (
						<p className="py-m-400 text-tiny text-txt-300 text-center">
							{t("noPresets")}
						</p>
					) : (
						presets.map((preset) => (
							<div
								key={preset.id}
								className="group gap-s-200 border-bg-300 px-s-300 py-s-200 hover:bg-bg-100 flex items-center border-b last:border-b-0"
							>
								{/* Apply preset */}
								<button
									type="button"
									tabIndex={0}
									className="focus-visible:ring-acc-100 min-w-0 flex-1 rounded-sm text-left focus-visible:ring-1 focus-visible:outline-none"
									onClick={() => handleApply(preset)}
									aria-label={preset.name}
									title={preset.name}
								>
									<span className="text-small text-txt-100 block truncate">
										{preset.name}
									</span>
								</button>

								{/* Actions (visible on hover) */}
								<div className="gap-s-100 flex shrink-0 items-center sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
									{/* Set as default */}
									<button
										type="button"
										tabIndex={0}
										onClick={() => handleSetDefault(preset)}
										className={cn(
											"p-s-100 rounded-sm transition-colors",
											preset.isDefault
												? "text-acc-100"
												: "text-txt-300 hover:text-acc-100"
										)}
										aria-label={t("setDefault")}
									>
										<Star
											className="h-3 w-3"
											fill={preset.isDefault ? "currentColor" : "none"}
										/>
									</button>

									{/* Update filters */}
									<button
										type="button"
										tabIndex={0}
										onClick={() => handleUpdateFilters(preset)}
										className="p-s-200 text-txt-300 hover:text-txt-100 focus-visible:ring-acc-100 rounded-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
										aria-label={t("overwrite")}
									>
										<Check className="h-3 w-3" />
									</button>

									{/* Delete */}
									{confirmDeleteId === preset.id ? (
										<button
											type="button"
											tabIndex={0}
											onClick={() => handleDelete(preset.id)}
											className="p-s-200 text-trade-sell hover:text-trade-sell/80 focus-visible:ring-acc-100 rounded-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
											aria-label={t("deleteConfirm")}
										>
											<Trash2 className="h-3 w-3" />
										</button>
									) : (
										<button
											type="button"
											tabIndex={0}
											onClick={() => setConfirmDeleteId(preset.id)}
											className="p-s-200 text-txt-300 hover:text-trade-sell focus-visible:ring-acc-100 rounded-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
											aria-label={t("delete")}
										>
											<Trash2 className="h-3 w-3" />
										</button>
									)}
								</div>

								{/* Default badge (always visible) */}
								{preset.isDefault && (
									<span className="bg-acc-100/10 text-acc-100 text-micro shrink-0 rounded-sm px-1.5 py-0.5 font-medium">
										{t("default")}
									</span>
								)}
							</div>
						))
					)}
				</div>
			</PopoverContent>
		</Popover>
	)
}

export { PresetSelector }
