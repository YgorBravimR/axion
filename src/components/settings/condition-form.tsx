"use client"

import type { FormEvent } from "react"
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
import { createCondition, updateCondition } from "@/app/actions/trading-conditions"
import type { TradingCondition } from "@/db/schema"
import type { ConditionCategory } from "@/types/trading-condition"
import { Loader2 } from "lucide-react"

interface ConditionFormProps {
	condition?: TradingCondition | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess?: () => void
}

export const ConditionForm = ({
	condition,
	open,
	onOpenChange,
	onSuccess,
}: ConditionFormProps) => {
	const t = useTranslations("settings.conditions")
	const tCommon = useTranslations("common")
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)

	const isEdit = !!condition

	const [formData, setFormData] = useState({
		name: condition?.name ?? "",
		category: (condition?.category ?? "indicator") as ConditionCategory,
		description: condition?.description ?? "",
	})

	useEffect(() => {
		if (condition) {
			setFormData({
				name: condition.name,
				category: condition.category as ConditionCategory,
				description: condition.description ?? "",
			})
		} else {
			setFormData({
				name: "",
				category: "indicator",
				description: "",
			})
		}
	}, [condition])

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		setError(null)

		startTransition(async () => {
			const input = {
				name: formData.name.trim(),
				category: formData.category,
				description: formData.description.trim() || undefined,
			}

			const result = isEdit
				? await updateCondition(condition.id, input)
				: await createCondition(input)

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
			<DialogContent id="condition-form-dialog" className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? t("editCondition") : t("addCondition")}
					</DialogTitle>
					<DialogDescription>
						{isEdit ? t("editConditionDescription") : t("addConditionDescription")}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-m-400">
					{error && (
						<div className="text-small text-fb-error rounded-md bg-fb-error/10 p-s-300">
							{error}
						</div>
					)}

					{/* Name */}
					<div className="space-y-s-200">
						<Label id="label-condition-name" htmlFor="conditionName" required filled={!!formData.name.trim()}>
							{t("name")}
						</Label>
						<Input
							id="conditionName"
							placeholder={t("namePlaceholder")}
							value={formData.name}
							onChange={(e) => handleChange("name", e.target.value)}
							maxLength={100}
							required
						/>
					</div>

					{/* Category */}
					<div className="space-y-s-200">
						<Label id="label-condition-category" htmlFor="conditionCategory" required filled={!!formData.category}>
							{t("category")}
						</Label>
						<Select
							value={formData.category}
							onValueChange={(value) => handleChange("category", value)}
						>
							<SelectTrigger id="conditionCategory">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="indicator">{t("categoryIndicator")}</SelectItem>
								<SelectItem value="price_action">{t("categoryPriceAction")}</SelectItem>
								<SelectItem value="market_context">{t("categoryMarketContext")}</SelectItem>
								<SelectItem value="custom">{t("categoryCustom")}</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Description */}
					<div className="space-y-s-200">
						<Label id="label-condition-description" htmlFor="conditionDescription">
							{t("description")}
						</Label>
						<Textarea
							id="conditionDescription"
							placeholder={t("descriptionPlaceholder")}
							value={formData.description}
							onChange={(e) => handleChange("description", e.target.value)}
							maxLength={500}
							rows={2}
						/>
					</div>

					<DialogFooter>
						<Button
							id="condition-form-cancel"
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{tCommon("cancel")}
						</Button>
						<Button id="condition-form-submit" type="submit" disabled={isPending}>
							{isPending && <Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />}
							{isEdit ? tCommon("saveChanges") : t("createCondition")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
