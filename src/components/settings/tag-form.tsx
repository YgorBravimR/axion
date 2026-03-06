"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { createTag, updateTag } from "@/app/actions/tags"
import type { Tag } from "@/db/schema"
import type { TagType } from "@/types"
import { Loader2 } from "lucide-react"

const TAG_COLORS = [
	"#3B82F6", // blue
	"#10B981", // emerald
	"#F59E0B", // amber
	"#EF4444", // red
	"#8B5CF6", // violet
	"#EC4899", // pink
	"#06B6D4", // cyan
	"#F97316", // orange
]

interface TagFormProps {
	tag?: Tag | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess?: () => void
}

export const TagForm = ({
	tag,
	open,
	onOpenChange,
	onSuccess,
}: TagFormProps) => {
	const t = useTranslations("settings.tags")
	const tCommon = useTranslations("common")
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)

	const isEdit = !!tag

	const [formData, setFormData] = useState({
		name: tag?.name ?? "",
		type: (tag?.type ?? "general") as TagType,
		color: tag?.color ?? TAG_COLORS[0],
		description: tag?.description ?? "",
	})

	useEffect(() => {
		if (tag) {
			setFormData({
				name: tag.name,
				type: tag.type as TagType,
				color: tag.color ?? TAG_COLORS[0],
				description: tag.description ?? "",
			})
		} else {
			setFormData({
				name: "",
				type: "general",
				color: TAG_COLORS[0],
				description: "",
			})
		}
	}, [tag])

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)

		startTransition(async () => {
			const input = {
				name: formData.name.trim(),
				type: formData.type,
				color: formData.color,
				description: formData.description.trim() || undefined,
			}

			const result = isEdit
				? await updateTag(tag.id, input)
				: await createTag(input)

			if (result.status === "success") {
				onOpenChange(false)
				onSuccess?.()
			} else {
				setError(result.message ?? tCommon("error"))
			}
		})
	}

	const handleChange = (field: keyof typeof formData, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent id="tag-form-dialog" className="max-w-md">
				<DialogHeader>
					<DialogTitle>{isEdit ? t("editTag") : t("addTag")}</DialogTitle>
					<DialogDescription>
						{isEdit ? t("editTagDescription") : t("addTagDescription")}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-m-400">
					{error && (
						<div className="rounded-md bg-fb-error/10 p-s-300 text-small text-fb-error">
							{error}
						</div>
					)}

					{/* Name */}
					<div className="space-y-s-200">
						<Label id="label-tag-name" htmlFor="tagName">{t("name")}</Label>
						<Input
							id="tagName"
							placeholder={t("namePlaceholder")}
							value={formData.name}
							onChange={(e) => handleChange("name", e.target.value)}
							maxLength={50}
							required
						/>
					</div>

					{/* Type */}
					<div className="space-y-s-200">
						<Label id="label-tag-type" htmlFor="tagType">{t("type")}</Label>
						<Select
							value={formData.type}
							onValueChange={(value) => handleChange("type", value)}
						>
							<SelectTrigger id="tagType">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="setup">{t("typeSetup")}</SelectItem>
								<SelectItem value="mistake">{t("typeMistake")}</SelectItem>
								<SelectItem value="general">{t("typeGeneral")}</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Color */}
					<div className="space-y-s-200">
						<Label id="label-tag-color">{t("color")}</Label>
						<div className="flex flex-wrap gap-s-200">
							{TAG_COLORS.map((color) => (
								<button
									key={color}
									type="button"
									onClick={() => handleChange("color", color)}
									className="size-10 sm:size-8 rounded-full border-2 transition-transform hover:scale-110"
									style={{
										backgroundColor: color,
										borderColor: formData.color === color ? "white" : "transparent",
									}}
									aria-label={`Select color ${color}`}
									aria-pressed={formData.color === color}
								/>
							))}
						</div>
					</div>

					{/* Description */}
					<div className="space-y-s-200">
						<Label id="label-tag-description" htmlFor="tagDescription">{t("description")}</Label>
						<Textarea
							id="tagDescription"
							placeholder={t("descriptionPlaceholder")}
							value={formData.description}
							onChange={(e) => handleChange("description", e.target.value)}
							maxLength={500}
							rows={2}
						/>
					</div>

					<DialogFooter>
						<Button
							id="tag-form-cancel"
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{tCommon("cancel")}
						</Button>
						<Button id="tag-form-submit" type="submit" disabled={isPending}>
							{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{isEdit ? tCommon("saveChanges") : t("createTag")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
