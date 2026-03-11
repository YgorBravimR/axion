"use client"

import { useState } from "react"
import { Plus, Trash2, GripVertical, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog"
import { createChecklist, updateChecklist, deleteChecklist } from "@/app/actions/command-center"
import type { DailyChecklist } from "@/db/schema"
import type { ChecklistItem } from "@/lib/validations/command-center"

interface ChecklistManagerProps {
	open: boolean
	onClose: () => void
	checklist?: DailyChecklist | null
	onSuccess: () => void
}

const generateId = () => crypto.randomUUID()

export const ChecklistManager = ({
	open,
	onClose,
	checklist,
	onSuccess,
}: ChecklistManagerProps) => {
	const t = useTranslations("commandCenter.checklistManager")
	const tCommon = useTranslations("common")
	const isEditing = !!checklist

	const initialItems: ChecklistItem[] = checklist
		? JSON.parse(checklist.items)
		: [{ id: generateId(), label: "", order: 0 }]

	const [name, setName] = useState(checklist?.name || "")
	const [items, setItems] = useState<ChecklistItem[]>(initialItems)
	const [saving, setSaving] = useState(false)
	const [deleting, setDeleting] = useState(false)

	const handleAddItem = () => {
		setItems([
			...items,
			{ id: generateId(), label: "", order: items.length },
		])
	}

	const handleRemoveItem = (id: string) => {
		if (items.length <= 1) return
		setItems(items.filter((item) => item.id !== id).map((item, idx) => ({ ...item, order: idx })))
	}

	const handleItemChange = (id: string, label: string) => {
		setItems(items.map((item) => (item.id === id ? { ...item, label } : item)))
	}

	const handleMoveItem = (fromIndex: number, toIndex: number) => {
		if (toIndex < 0 || toIndex >= items.length) return
		const newItems = [...items]
		const [removed] = newItems.splice(fromIndex, 1)
		newItems.splice(toIndex, 0, removed)
		setItems(newItems.map((item, idx) => ({ ...item, order: idx })))
	}

	const handleSave = async () => {
		if (!name.trim()) return
		const validItems = items.filter((item) => item.label.trim())
		if (validItems.length === 0) return

		setSaving(true)
		try {
			if (isEditing && checklist) {
				await updateChecklist(checklist.id, {
					name: name.trim(),
					items: validItems,
				})
			} else {
				await createChecklist({
					name: name.trim(),
					items: validItems,
					isActive: true,
				})
			}
			onSuccess()
			onClose()
		} catch (error) {
			console.error("Failed to save checklist:", error)
		} finally {
			setSaving(false)
		}
	}

	const handleDelete = async () => {
		if (!checklist) return

		setDeleting(true)
		try {
			await deleteChecklist(checklist.id)
			onSuccess()
			onClose()
		} catch (error) {
			console.error("Failed to delete checklist:", error)
		} finally {
			setDeleting(false)
		}
	}

	const canSave = name.trim() && items.some((item) => item.label.trim())

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent id="checklist-manager-dialog" className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? t("editTitle") : t("createTitle")}
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-m-500 py-m-400">
					{/* Checklist Name */}
					<div>
						<label className="mb-s-200 block text-small text-txt-200">
							{t("nameLabel")}
						</label>
						<Input
							id="checklist-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder={t("namePlaceholder")}
							className="w-full"
						/>
					</div>

					{/* Checklist Items */}
					<div>
						<label className="mb-s-200 block text-small text-txt-200">
							{t("itemsLabel")}
						</label>
						<div className="space-y-s-200">
							{items.map((item, index) => (
								<div key={item.id} className="flex items-center gap-s-200">
									<button
										type="button"
										className="cursor-grab text-txt-300 hover:text-txt-200 active:cursor-grabbing"
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => {
											// Simple move up/down on click for now
											// Full drag-and-drop could be added with a library
										}}
										aria-label={tCommon("dragToReorder")}
									>
										<GripVertical className="h-4 w-4" />
									</button>
									<div className="flex gap-s-100">
										<Button
											id={`checklist-item-move-up-${item.id}`}
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => handleMoveItem(index, index - 1)}
											disabled={index === 0}
											className="h-8 w-8 p-0 text-txt-300"
										>
											&uarr;
										</Button>
										<Button
											id={`checklist-item-move-down-${item.id}`}
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => handleMoveItem(index, index + 1)}
											disabled={index === items.length - 1}
											className="h-8 w-8 p-0 text-txt-300"
										>
											&darr;
										</Button>
									</div>
									<Input
										id={`checklist-item-${item.id}`}
										value={item.label}
										onChange={(e) => handleItemChange(item.id, e.target.value)}
										placeholder={t("itemPlaceholder")}
										className="flex-1"
									/>
									<Button
										id={`checklist-item-delete-${item.id}`}
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => handleRemoveItem(item.id)}
										disabled={items.length <= 1}
										className={cn(
											"h-8 w-8 p-0",
											items.length <= 1
												? "text-txt-400"
												: "text-txt-300 hover:text-fb-error"
										)}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							))}
						</div>
						<Button id="checklist-add-item"
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleAddItem}
							className="mt-s-200 text-accent-primary"
						>
							<Plus className="mr-s-100 h-4 w-4" />
							{t("addItem")}
						</Button>
					</div>
				</div>

				<DialogFooter className="flex items-center justify-between">
					<div>
						{isEditing && (
							<Button id="checklist-delete"
								type="button"
								variant="ghost"
								onClick={handleDelete}
								disabled={deleting || saving}
								className="text-fb-error hover:bg-fb-error/10 hover:text-fb-error"
							>
								<Trash2 className="mr-s-100 h-4 w-4" />
								{deleting ? t("deleting") : t("delete")}
							</Button>
						)}
					</div>
					<div className="flex gap-s-200">
						<Button id="checklist-cancel" type="button" variant="outline" onClick={onClose} disabled={saving}>
							{t("cancel")}
						</Button>
						<Button id="checklist-save" type="button" onClick={handleSave} disabled={!canSave || saving}>
							{saving ? t("saving") : isEditing ? t("update") : t("create")}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
