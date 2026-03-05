"use client"

import { useState, useTransition, useEffect, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { DatePicker } from "@/components/ui/date-picker"
import { createExecution, updateExecution } from "@/app/actions/executions"
import type { TradeExecution } from "@/db/schema"
import { Loader2 } from "lucide-react"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import { formatDateKey, formatBrtTimeInput, BRT_OFFSET } from "@/lib/dates"

interface ExecutionFormProps {
	tradeId: string
	execution?: TradeExecution | null
	existingExecutions?: TradeExecution[]
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess?: () => void
}

/**
 * Derive smart default date/time from the most recent execution.
 * Falls back to effective date if no executions exist.
 */
const getSmartDefaults = (existingExecutions: TradeExecution[], now: Date) => {
	if (existingExecutions.length === 0) {
		return {
			date: formatDateKey(now),
			time: formatBrtTimeInput(now),
		}
	}

	// Find the most recent execution by date
	const mostRecent = existingExecutions.reduce((latest, e) =>
		new Date(e.executionDate) > new Date(latest.executionDate) ? e : latest
	)

	const recentDate = new Date(mostRecent.executionDate)
	return {
		date: formatDateKey(recentDate),
		time: formatBrtTimeInput(recentDate),
	}
}

/** Build the blank form state for a new execution */
const buildNewExecutionState = (
	existingExecutions: TradeExecution[],
	now: Date
) => {
	const defaults = getSmartDefaults(existingExecutions, now)
	return {
		executionType: "entry",
		executionDate: defaults.date,
		executionTime: defaults.time,
		price: "",
		quantity: "",
		orderType: "market",
		commission: "0",
		fees: "0",
		slippage: "0",
		notes: "",
	}
}

/** Build form state from an existing execution for editing */
const buildEditExecutionState = (execution: TradeExecution) => ({
	executionType: execution.executionType ?? "entry",
	executionDate: formatDateKey(new Date(execution.executionDate)),
	executionTime: formatBrtTimeInput(new Date(execution.executionDate)),
	price: execution.price ?? "",
	quantity: execution.quantity ?? "",
	orderType: execution.orderType ?? "market",
	commission: execution.commission?.toString() ?? "0",
	fees: execution.fees?.toString() ?? "0",
	slippage: execution.slippage?.toString() ?? "0",
	notes: execution.notes ?? "",
})

export const ExecutionForm = ({
	tradeId,
	execution,
	existingExecutions = [],
	open,
	onOpenChange,
	onSuccess,
}: ExecutionFormProps) => {
	const t = useTranslations("execution")
	const tCommon = useTranslations("common")
	const effectiveDate = useEffectiveDate()
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)

	const isEdit = !!execution

	const [formData, setFormData] = useState(
		execution
			? buildEditExecutionState(execution)
			: buildNewExecutionState(existingExecutions, effectiveDate)
	)

	// Update form data when execution prop changes (for edit mode)
	useEffect(() => {
		setFormData(
			execution
				? buildEditExecutionState(execution)
				: buildNewExecutionState(existingExecutions, effectiveDate)
		)
	}, [execution, existingExecutions, effectiveDate])

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		setError(null)

		startTransition(async () => {
			// Combine date and time with BRT offset (user enters times in BRT)
			const timeValue =
				formData.executionTime.length === 5
					? `${formData.executionTime}:00`
					: formData.executionTime
			const executionDate = new Date(
				`${formData.executionDate}T${timeValue}${BRT_OFFSET}`
			)

			const data = {
				tradeId,
				executionType: formData.executionType as "entry" | "exit",
				executionDate,
				price: parseFloat(formData.price.toString()),
				quantity: parseFloat(formData.quantity.toString()),
				orderType: formData.orderType as
					| "market"
					| "limit"
					| "stop"
					| "stop_limit"
					| null,
				commission: parseInt(formData.commission) || 0,
				fees: parseInt(formData.fees) || 0,
				slippage: parseInt(formData.slippage) || 0,
				notes: formData.notes || undefined,
			}

			const result = isEdit
				? await updateExecution(execution.id, data)
				: await createExecution(data)

			if (result.status === "success") {
				onOpenChange(false)
				onSuccess?.()
				setFormData(buildNewExecutionState(existingExecutions, effectiveDate))
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
			<DialogContent id="execution-form-dialog" className="max-w-md">
				<DialogHeader>
					<DialogTitle>{isEdit ? t("edit") : t("add")}</DialogTitle>
					<DialogDescription>
						{isEdit ? t("editDescription") : t("addDescription")}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-m-400">
					{error && (
						<div className="bg-fb-error/10 p-s-300 text-small text-fb-error rounded-md">
							{error}
						</div>
					)}

					{/* Execution Type */}
					<div className="space-y-s-200">
						<Label id="label-execution-type">{t("type")}</Label>
						<RadioGroup
							id="execution-type-group"
							value={formData.executionType}
							onValueChange={(value) => handleChange("executionType", value)}
							className="gap-m-400 flex"
						>
							<div className="flex items-center space-x-2">
								<RadioGroupItem value="entry" id="entry" />
								<Label
									id="label-execution-entry"
									htmlFor="entry"
									className="text-trade-buy cursor-pointer font-normal"
								>
									{t("entry")}
								</Label>
							</div>
							<div className="flex items-center space-x-2">
								<RadioGroupItem value="exit" id="exit" />
								<Label
									id="label-execution-exit"
									htmlFor="exit"
									className="text-trade-sell cursor-pointer font-normal"
								>
									{t("exit")}
								</Label>
							</div>
						</RadioGroup>
					</div>

					{/* Date and Time */}
					<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2">
						<div className="space-y-s-200">
							<Label id="label-execution-date" htmlFor="executionDate">
								{t("date")}
							</Label>
							<DatePicker
								id="executionDate"
								value={formData.executionDate ? new Date(formData.executionDate + "T12:00:00") : undefined}
								onChange={(date) => handleChange("executionDate", date ? formatDateKey(date) : "")}
								maxDate={effectiveDate}
							/>
						</div>
						<div className="space-y-s-200">
							<Label id="label-execution-time" htmlFor="executionTime">
								{t("time")}
							</Label>
							<Input
								id="executionTime"
								type="time"
								step="1"
								value={formData.executionTime}
								onChange={(e) => handleChange("executionTime", e.target.value)}
								required
							/>
						</div>
					</div>

					{/* Price and Quantity */}
					<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2">
						<div className="space-y-s-200">
							<Label id="label-execution-price" htmlFor="price">
								{t("price")}
							</Label>
							<Input
								id="price"
								type="number"
								step="any"
								placeholder="128000"
								value={formData.price}
								onChange={(e) => handleChange("price", e.target.value)}
								required
							/>
						</div>
						<div className="space-y-s-200">
							<Label id="label-execution-quantity" htmlFor="quantity">
								{t("quantity")}
							</Label>
							<Input
								id="quantity"
								type="number"
								step="any"
								placeholder="2"
								value={formData.quantity}
								onChange={(e) => handleChange("quantity", e.target.value)}
								required
							/>
						</div>
					</div>

					{/* Order Type */}
					<div className="space-y-s-200">
						<Label id="label-execution-order-type" htmlFor="orderType">
							{t("orderType")}
						</Label>
						<Select
							value={formData.orderType ?? "market"}
							onValueChange={(value) => handleChange("orderType", value)}
						>
							<SelectTrigger id="orderType">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="market">{t("market")}</SelectItem>
								<SelectItem value="limit">{t("limit")}</SelectItem>
								<SelectItem value="stop">{t("stop")}</SelectItem>
								<SelectItem value="stop_limit">{t("stopLimit")}</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Costs */}
					<div className="gap-s-300 grid grid-cols-1 sm:grid-cols-3">
						<div className="space-y-s-200">
							<Label
								id="label-execution-commission"
								htmlFor="commission"
								className="text-small"
							>
								{t("commission")}
							</Label>
							<Input
								id="commission"
								type="number"
								step="1"
								placeholder="0"
								value={formData.commission}
								onChange={(e) => handleChange("commission", e.target.value)}
								className="text-small h-8"
							/>
						</div>
						<div className="space-y-s-200">
							<Label
								id="label-execution-fees"
								htmlFor="fees"
								className="text-small"
							>
								{t("fees")}
							</Label>
							<Input
								id="fees"
								type="number"
								step="1"
								placeholder="0"
								value={formData.fees}
								onChange={(e) => handleChange("fees", e.target.value)}
								className="text-small h-8"
							/>
						</div>
						<div className="space-y-s-200">
							<Label
								id="label-execution-slippage"
								htmlFor="slippage"
								className="text-small"
							>
								{t("slippage")}
							</Label>
							<Input
								id="slippage"
								type="number"
								step="1"
								placeholder="0"
								value={formData.slippage}
								onChange={(e) => handleChange("slippage", e.target.value)}
								className="text-small h-8"
							/>
						</div>
					</div>

					{/* Notes */}
					<div className="space-y-s-200">
						<Label id="label-execution-notes" htmlFor="notes">
							{t("notes")}
						</Label>
						<Textarea
							id="notes"
							placeholder={t("notesPlaceholder")}
							value={formData.notes}
							onChange={(e) => handleChange("notes", e.target.value)}
							rows={2}
						/>
					</div>

					<DialogFooter>
						<Button
							id="execution-form-cancel"
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{tCommon("cancel")}
						</Button>
						<Button
							id="execution-form-submit"
							type="submit"
							disabled={isPending}
						>
							{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{isEdit ? tCommon("saveChanges") : t("addExecution")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
