"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { X } from "lucide-react"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import { formatDateKey } from "@/lib/dates"

export interface ExecutionRowData {
	id: string
	executionType: "entry" | "exit"
	date: string
	time: string
	price: string
	quantity: string
	commission: string
}

interface InlineExecutionRowProps {
	data: ExecutionRowData
	onChange: (id: string, field: keyof ExecutionRowData, value: string) => void
	onRemove: (id: string) => void
	canRemove: boolean
	currency?: string
}

export const InlineExecutionRow = ({
	data,
	onChange,
	onRemove,
	canRemove,
	currency = "$",
}: InlineExecutionRowProps) => {
	const t = useTranslations("execution")
	const effectiveDate = useEffectiveDate()
	const todayDateString = formatDateKey(effectiveDate)

	return (
		<div className="gap-s-200 grid min-w-[480px] grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr] items-center">
			<DatePicker
				id={`execution-${data.id}-date`}
				value={data.date ? new Date(data.date + "T12:00:00") : undefined}
				onChange={(date) => onChange(data.id, "date", date ? formatDateKey(date) : "")}
				maxDate={new Date(todayDateString + "T23:59:59")}
				formatStr="P"
				className="text-small h-8"
			/>
			<Input
				id={`execution-${data.id}-time`}
				type="time"
				value={data.time}
				onChange={(e) => onChange(data.id, "time", e.target.value)}
				className="text-small h-8"
			/>
			<Input
				id={`execution-${data.id}-price`}
				type="number"
				step="any"
				placeholder={t("price")}
				value={data.price}
				onChange={(e) => onChange(data.id, "price", e.target.value)}
				className="text-small h-8"
			/>
			<Input
				id={`execution-${data.id}-quantity`}
				type="number"
				step="any"
				placeholder={t("quantity")}
				value={data.quantity}
				onChange={(e) => onChange(data.id, "quantity", e.target.value)}
				className="text-small h-8"
			/>
			<div className="relative">
				<span className="text-tiny text-txt-300 pointer-events-none absolute top-1/2 left-2 -translate-y-1/2">
					{currency}
				</span>
				<Input
					id={`execution-${data.id}-commission`}
					type="number"
					step="0.01"
					placeholder="0.00"
					value={data.commission}
					onChange={(e) => onChange(data.id, "commission", e.target.value)}
					className="text-small h-8 pl-10"
				/>
			</div>
			<Button
				id={`inline-execution-remove-${data.id}`}
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => onRemove(data.id)}
				disabled={!canRemove}
				aria-label={t("remove")}
				className="text-txt-300 hover:text-fb-error h-8 w-8 p-0"
			>
				<X className="h-4 w-4" aria-hidden="true" />
			</Button>
		</div>
	)
}
