"use client"

import { useState, useTransition, useEffect, type FormEvent } from "react"
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
import { Loader2 } from "lucide-react"
import type { IndicatorGroupWithDefinitions } from "@/types/indicator"

interface IndicatorGroupFormProps {
	group?: IndicatorGroupWithDefinitions | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onSubmit: (data: {
		key: string
		displayName: string
		description?: string
	}) => Promise<{ success: boolean; error?: string }>
}

const IndicatorGroupForm = ({
	group,
	open,
	onOpenChange,
	onSubmit,
}: IndicatorGroupFormProps) => {
	const tCommon = useTranslations("common")
	const tInd = useTranslations("settings.indicators")
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)

	const isEdit = !!group

	const [formData, setFormData] = useState({
		key: group?.key ?? "",
		displayName: group?.displayName ?? "",
		description: group?.description ?? "",
	})

	useEffect(() => {
		if (group) {
			setFormData({
				key: group.key,
				displayName: group.displayName,
				description: group.description ?? "",
			})
		} else {
			setFormData({
				key: "",
				displayName: "",
				description: "",
			})
		}
	}, [group])

	const handleSubmit = (eventForm: FormEvent) => {
		eventForm.preventDefault()
		setError(null)

		startTransition(async () => {
			const result = await onSubmit({
				key: formData.key.trim(),
				displayName: formData.displayName.trim(),
				description: formData.description.trim() || undefined,
			})

			if (result.success) {
				onOpenChange(false)
				setFormData({ key: "", displayName: "", description: "" })
			} else {
				setError(result.error ?? tCommon("error"))
			}
		})
	}

	const handleChange = (field: keyof typeof formData, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
	}

	const handleKeyChange = (value: string) => {
		const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, "_")
		handleChange("key", sanitized)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent id="indicator-group-form-dialog" className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? tInd("groupForm.editTitle") : tInd("groupForm.addTitle")}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? tInd("groupForm.editDescription")
							: tInd("groupForm.addDescription")}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-m-400">
					{error && (
						<div className="rounded-md bg-fb-error/10 p-s-300 text-small text-fb-error">
							{error}
						</div>
					)}

					<div className="space-y-s-200">
						<Label
							id="label-indicator-group-key"
							htmlFor="indicatorGroupKey"
							required
							filled={!!formData.key.trim()}
						>
							{tInd("key")}
						</Label>
						<Input
							id="indicatorGroupKey"
							placeholder={tInd("groupForm.keyPlaceholder")}
							value={formData.key}
							onChange={(e) => handleKeyChange(e.target.value)}
							maxLength={50}
							required
						/>
						<p className="text-tiny text-txt-300">
							{tInd("groupForm.keyHelper")}
						</p>
					</div>

					<div className="space-y-s-200">
						<Label
							id="label-indicator-group-display-name"
							htmlFor="indicatorGroupDisplayName"
							required
							filled={!!formData.displayName.trim()}
						>
							{tInd("displayName")}
						</Label>
						<Input
							id="indicatorGroupDisplayName"
							placeholder={tInd("groupForm.displayNamePlaceholder")}
							value={formData.displayName}
							onChange={(e) => handleChange("displayName", e.target.value)}
							maxLength={100}
							required
						/>
					</div>

					<div className="space-y-s-200">
						<Label
							id="label-indicator-group-description"
							htmlFor="indicatorGroupDescription"
						>
							{tInd("description")}
						</Label>
						<Textarea
							id="indicatorGroupDescription"
							placeholder={tInd("groupForm.descriptionPlaceholder")}
							value={formData.description}
							onChange={(e) => handleChange("description", e.target.value)}
							maxLength={500}
							rows={2}
						/>
					</div>

					<DialogFooter>
						<Button
							id="indicator-group-form-cancel"
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{tCommon("cancel")}
						</Button>
						<Button
							id="indicator-group-form-submit"
							type="submit"
							disabled={isPending}
						>
							{isPending && (
								<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
							)}
							{isEdit ? tCommon("saveChanges") : tInd("addGroup")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

export { IndicatorGroupForm }
