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
import { createTimeframe, updateTimeframe } from "@/app/actions/timeframes"
import type { Timeframe } from "@/db/schema"
import { Loader2 } from "lucide-react"

interface TimeframeFormProps {
	timeframe?: Timeframe | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess?: () => void
}

export const TimeframeForm = ({
	timeframe,
	open,
	onOpenChange,
	onSuccess,
}: TimeframeFormProps) => {
	const t = useTranslations("settings.timeframes")
	const tCommon = useTranslations("common")
	const tUnits = useTranslations("timeframeUnits")
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)

	const [formData, setFormData] = useState({
		code: timeframe?.code ?? "",
		name: timeframe?.name ?? "",
		type: timeframe?.type ?? "time_based",
		value: timeframe?.value?.toString() ?? "",
		unit: timeframe?.unit ?? "minutes",
		sortOrder: timeframe?.sortOrder?.toString() ?? "0",
	})

	useEffect(() => {
		if (timeframe) {
			setFormData({
				code: timeframe.code,
				name: timeframe.name,
				type: timeframe.type,
				value: timeframe.value.toString(),
				unit: timeframe.unit,
				sortOrder: timeframe.sortOrder?.toString() ?? "0",
			})
		} else {
			setFormData({
				code: "",
				name: "",
				type: "time_based",
				value: "",
				unit: "minutes",
				sortOrder: "0",
			})
		}
	}, [timeframe])

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		setError(null)

		startTransition(async () => {
			const data = {
				code: formData.code,
				name: formData.name,
				type: formData.type as "time_based" | "renko",
				value: parseInt(formData.value, 10),
				unit: formData.unit as
					| "minutes"
					| "hours"
					| "days"
					| "weeks"
					| "ticks"
					| "points",
				sortOrder: parseInt(formData.sortOrder, 10),
				isActive: true,
			}

			const result = timeframe
				? await updateTimeframe({ ...data, id: timeframe.id })
				: await createTimeframe(data)

			if (result.success) {
				onOpenChange(false)
				onSuccess?.()
			} else {
				setError(result.error ?? "An error occurred")
			}
		})
	}

	const handleChange = (field: string, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
	}

	const unitOptions =
		formData.type === "time_based"
			? [
					{ value: "minutes", label: tUnits("minutes") },
					{ value: "hours", label: tUnits("hours") },
					{ value: "days", label: tUnits("days") },
					{ value: "weeks", label: tUnits("weeks") },
			  ]
			: [
					{ value: "ticks", label: tUnits("ticks") },
					{ value: "points", label: tUnits("points") },
			  ]

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent id="timeframe-form-dialog" className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{timeframe ? t("editTimeframe") : t("addTimeframe")}
					</DialogTitle>
					<DialogDescription>
						{timeframe ? t("updateTimeframe") : t("addTimeframeDesc")}
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
							<Label id="label-timeframe-code" htmlFor="code">{t("code")}</Label>
							<Input
								id="code"
								placeholder={t("codePlaceholder")}
								value={formData.code}
								onChange={(e) =>
									handleChange("code", e.target.value.toUpperCase())
								}
								required
							/>
						</div>

						<div className="space-y-s-200">
							<Label id="label-timeframe-type" htmlFor="type">{t("type")}</Label>
							<Select
								value={formData.type}
								onValueChange={(value) => {
									handleChange("type", value)
									handleChange(
										"unit",
										value === "time_based" ? "minutes" : "ticks"
									)
								}}
							>
								<SelectTrigger id="type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="time_based">{t("timeBased")}</SelectItem>
									<SelectItem value="renko">{t("renko")}</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="space-y-s-200">
						<Label id="label-timeframe-name" htmlFor="name">{t("name")}</Label>
						<Input
							id="name"
							placeholder={t("namePlaceholder")}
							value={formData.name}
							onChange={(e) => handleChange("name", e.target.value)}
							required
						/>
					</div>

					<div className="grid grid-cols-1 gap-m-400 sm:grid-cols-3">
						<div className="space-y-s-200">
							<Label id="label-timeframe-value" htmlFor="value">{t("value")}</Label>
							<Input
								id="value"
								type="number"
								placeholder="5"
								value={formData.value}
								onChange={(e) => handleChange("value", e.target.value)}
								required
							/>
						</div>

						<div className="space-y-s-200">
							<Label id="label-timeframe-unit" htmlFor="unit">{t("unit")}</Label>
							<Select
								value={formData.unit}
								onValueChange={(value) => handleChange("unit", value)}
							>
								<SelectTrigger id="unit">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{unitOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-s-200">
							<Label id="label-timeframe-sort-order" htmlFor="sortOrder">{t("sortOrder")}</Label>
							<Input
								id="sortOrder"
								type="number"
								placeholder="0"
								value={formData.sortOrder}
								onChange={(e) => handleChange("sortOrder", e.target.value)}
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							id="timeframe-form-cancel"
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{tCommon("cancel")}
						</Button>
						<Button id="timeframe-form-submit" type="submit" disabled={isPending}>
							{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{timeframe ? tCommon("saveChanges") : t("addTimeframe")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
