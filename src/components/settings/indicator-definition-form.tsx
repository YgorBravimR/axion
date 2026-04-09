"use client"

import { useState, useTransition, useEffect, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import type { IndicatorDefinition } from "@/db/schema"
import type { IndicatorGroupWithDefinitions } from "@/types/indicator"

interface IndicatorDefinitionFormProps {
	definition?: IndicatorDefinition | null
	groups: IndicatorGroupWithDefinitions[]
	open: boolean
	onOpenChange: (open: boolean) => void
	onSubmit: (data: {
		key: string
		displayName: string
		groupId: string
		csvHeader?: string
		sortOrder: number
	}) => Promise<{ success: boolean; error?: string }>
}

const IndicatorDefinitionForm = ({
	definition,
	groups,
	open,
	onOpenChange,
	onSubmit,
}: IndicatorDefinitionFormProps) => {
	const tCommon = useTranslations("common")
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)

	const isEdit = !!definition

	const [formData, setFormData] = useState({
		key: definition?.key ?? "",
		displayName: definition?.displayName ?? "",
		groupId: definition?.groupId ?? "",
		csvHeader: definition?.csvHeader ?? "",
		sortOrder: definition?.sortOrder?.toString() ?? "0",
	})

	useEffect(() => {
		if (definition) {
			setFormData({
				key: definition.key,
				displayName: definition.displayName,
				groupId: definition.groupId ?? "",
				csvHeader: definition.csvHeader ?? "",
				sortOrder: definition.sortOrder?.toString() ?? "0",
			})
		} else {
			setFormData({
				key: "",
				displayName: "",
				groupId: "",
				csvHeader: "",
				sortOrder: "0",
			})
		}
	}, [definition])

	const handleSubmit = (eventForm: FormEvent) => {
		eventForm.preventDefault()
		setError(null)

		startTransition(async () => {
			const result = await onSubmit({
				key: formData.key.trim(),
				displayName: formData.displayName.trim(),
				groupId: formData.groupId,
				csvHeader: formData.csvHeader.trim() || undefined,
				sortOrder: parseInt(formData.sortOrder, 10) || 0,
			})

			if (result.success) {
				onOpenChange(false)
				setFormData({
					key: "",
					displayName: "",
					groupId: "",
					csvHeader: "",
					sortOrder: "0",
				})
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

	const activeGroups = groups.filter(
		(group) => group.isActive || (isEdit && group.id === definition?.groupId)
	)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent id="indicator-definition-form-dialog" className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Edit Indicator Definition" : "Add Indicator Definition"}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Update the indicator definition details."
							: "Create a new indicator definition within a group."}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-m-400">
					{error && (
						<div className="rounded-md bg-fb-error/10 p-s-300 text-small text-fb-error">
							{error}
						</div>
					)}

					<div className="grid grid-cols-1 gap-m-400 sm:grid-cols-2">
						<div className="space-y-s-200">
							<Label
								id="label-indicator-def-key"
								htmlFor="indicatorDefKey"
								required
								filled={!!formData.key.trim()}
							>
								Key
							</Label>
							<Input
								id="indicatorDefKey"
								placeholder="e.g. vwap_d, trava_0"
								value={formData.key}
								onChange={(e) => handleKeyChange(e.target.value)}
								maxLength={50}
								required
							/>
						</div>

						<div className="space-y-s-200">
							<Label
								id="label-indicator-def-sort-order"
								htmlFor="indicatorDefSortOrder"
							>
								Sort Order
							</Label>
							<Input
								id="indicatorDefSortOrder"
								type="number"
								placeholder="0"
								value={formData.sortOrder}
								onChange={(e) => handleChange("sortOrder", e.target.value)}
							/>
						</div>
					</div>

					<div className="space-y-s-200">
						<Label
							id="label-indicator-def-display-name"
							htmlFor="indicatorDefDisplayName"
							required
							filled={!!formData.displayName.trim()}
						>
							Display Name
						</Label>
						<Input
							id="indicatorDefDisplayName"
							placeholder="e.g. VWAP Diario, EMA 200"
							value={formData.displayName}
							onChange={(e) => handleChange("displayName", e.target.value)}
							maxLength={100}
							required
						/>
					</div>

					<div className="space-y-s-200">
						<Label
							id="label-indicator-def-group"
							htmlFor="indicatorDefGroupId"
							required
							filled={!!formData.groupId}
						>
							Group
						</Label>
						<Select
							value={formData.groupId}
							onValueChange={(value) => handleChange("groupId", value)}
							required
						>
							<SelectTrigger id="indicatorDefGroupId">
								<SelectValue placeholder="Select a group" />
							</SelectTrigger>
							<SelectContent>
								{activeGroups.map((group) => (
									<SelectItem key={group.id} value={group.id}>
										{group.displayName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-s-200">
						<Label
							id="label-indicator-def-csv-header"
							htmlFor="indicatorDefCsvHeader"
						>
							CSV Header
						</Label>
						<Input
							id="indicatorDefCsvHeader"
							placeholder="e.g. VWAP D, Media Movel E [200]"
							value={formData.csvHeader}
							onChange={(e) => handleChange("csvHeader", e.target.value)}
							maxLength={100}
						/>
						<p className="text-tiny text-txt-300">
							The original column name in imported CSV files.
						</p>
					</div>

					<DialogFooter>
						<Button
							id="indicator-definition-form-cancel"
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{tCommon("cancel")}
						</Button>
						<Button
							id="indicator-definition-form-submit"
							type="submit"
							disabled={isPending}
						>
							{isPending && (
								<Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
							)}
							{isEdit ? tCommon("saveChanges") : "Add Indicator"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

export { IndicatorDefinitionForm }
