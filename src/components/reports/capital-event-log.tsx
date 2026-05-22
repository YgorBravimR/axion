// src/components/reports/capital-event-log.tsx
"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useFormatting } from "@/hooks/use-formatting"
import type { CapitalEvent } from "@/types/integration"
import { Input } from "@/components/ui/input"
import {
	recordCapitalEvent,
	deleteCapitalEvent,
} from "@/app/actions/annual-reports"

interface CapitalEventLogProps {
	events: CapitalEvent[]
	year: number
	onEventDeleted: () => void
	onEventAdded: () => void
}

const CapitalEventLog = ({
	events,
	year,
	onEventDeleted,
	onEventAdded,
}: CapitalEventLogProps) => {
	const t = useTranslations("reports.capitalEventLog")
	const [isPending, startTransition] = useTransition()
	const [formType, setFormType] = useState<"deposit" | "withdrawal">("deposit")
	const [formAmount, setFormAmount] = useState("")
	const [formDate, setFormDate] = useState(
		new Date().toISOString().slice(0, 10)
	)
	const [formNotes, setFormNotes] = useState("")
	const [formError, setFormError] = useState<string | null>(null)

	const handleDelete = (id: string) => {
		startTransition(async () => {
			const result = await deleteCapitalEvent(id)
			if (result.status === "success") {
				onEventDeleted()
			}
		})
	}

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		setFormError(null)
		const amountBRL = parseFloat(formAmount.replace(",", "."))
		if (isNaN(amountBRL) || amountBRL <= 0) {
			setFormError(t("amountError"))
			return
		}
		const amountCents = Math.round(amountBRL * 100)
		startTransition(async () => {
			const result = await recordCapitalEvent({
				eventType: formType,
				amountCents,
				eventDate: formDate,
				notes: formNotes || undefined,
			})
			if (result.status === "success") {
				setFormAmount("")
				setFormNotes("")
				onEventAdded()
			} else {
				setFormError(result.message ?? t("failedToRecord"))
			}
		})
	}

	const { formatCurrency } = useFormatting()
	const yearEvents = events.filter((e) => e.eventDate.startsWith(String(year)))

	return (
		<details className="group">
			<summary className="text-txt-200 hover:text-txt-100 text-small flex cursor-pointer list-none items-center justify-between py-2 font-medium transition-colors">
				<span>
					{t("capitalEvents")} ({yearEvents.length})
				</span>
				<span className="text-txt-300 text-tiny transition-transform group-open:rotate-180">
					▼
				</span>
			</summary>

			<div className="mt-3 space-y-4">
				{/* Add event form */}
				<form
					onSubmit={handleSubmit}
					className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4"
				>
					<div className="border-bg-300 col-span-1 flex overflow-hidden rounded-md border">
						<button
							type="button"
							onClick={() => setFormType("deposit")}
							className={`text-tiny flex-1 px-3 py-2 font-medium transition-colors ${
								formType === "deposit"
									? "bg-bg-100 text-txt-100"
									: "bg-bg-200 text-txt-300 hover:text-txt-100"
							}`}
							aria-pressed={formType === "deposit"}
						>
							{t("deposit")}
						</button>
						<button
							type="button"
							onClick={() => setFormType("withdrawal")}
							className={`text-tiny flex-1 px-3 py-2 font-medium transition-colors ${
								formType === "withdrawal"
									? "bg-bg-100 text-txt-100"
									: "bg-bg-200 text-txt-300 hover:text-txt-100"
							}`}
							aria-pressed={formType === "withdrawal"}
						>
							{t("withdrawal")}
						</button>
					</div>

					<Input
						id="capital-amount"
						type="text"
						inputMode="decimal"
						placeholder={t("amountPlaceholder")}
						value={formAmount}
						onChange={(e) => setFormAmount(e.target.value)}
						className="text-tiny"
						aria-label={t("amountAriaLabel")}
						required
					/>

					<Input
						id="capital-date"
						type="date"
						value={formDate}
						onChange={(e) => setFormDate(e.target.value)}
						max={new Date().toISOString().slice(0, 10)}
						className="text-tiny"
						aria-label={t("eventDateAriaLabel")}
					/>

					<button
						type="submit"
						disabled={isPending}
						className="bg-acc-100 text-bg-100 text-tiny rounded-md px-4 py-2 font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{isPending ? t("saving") : t("log")}
					</button>

					{formError && (
						<p className="text-fb-error text-tiny col-span-full">{formError}</p>
					)}
				</form>

				{/* Event list */}
				{yearEvents.length === 0 ? (
					<p className="text-txt-300 text-tiny">{t("noEvents", { year })}</p>
				) : (
					<ul className="space-y-1" aria-label={t("listAriaLabel", { year })}>
						{[...yearEvents].reverse().map((ev) => (
							<li
								key={ev.id}
								className="bg-bg-300/30 text-tiny flex items-center justify-between gap-3 rounded-md px-3 py-2"
							>
								<span className="text-txt-300 font-mono">{ev.eventDate}</span>
								<span className="bg-bg-100 text-txt-200 text-tiny rounded-sm px-2 py-0.5 font-medium">
									{ev.eventType === "deposit"
										? t("depositLabel")
										: t("withdrawalLabel")}
								</span>
								<span className="text-txt-100 ml-auto font-mono tabular-nums">
									{formatCurrency(ev.amountCents / 100, "BRL")}
								</span>
								{ev.notes && (
									<span className="text-txt-300 max-w-[120px] truncate">
										{ev.notes}
									</span>
								)}
								<button
									type="button"
									onClick={() => handleDelete(ev.id)}
									disabled={isPending}
									className="text-txt-300 hover:text-trade-sell ml-2 transition-colors disabled:opacity-50"
									aria-label={t("deleteAriaLabel", {
										eventType: ev.eventType,
										date: ev.eventDate,
									})}
								>
									×
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</details>
	)
}

export { CapitalEventLog }
