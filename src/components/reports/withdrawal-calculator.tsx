"use client"

import { useState, useTransition } from "react"
import { recordCapitalEvent } from "@/app/actions/annual-reports"

interface WithdrawalCalculatorProps {
	currentMonthNetPnl: number // in cents
	withdrawalTargetPercent: number // e.g. 30 for 30%
	onLogged: () => void
}

const WithdrawalCalculator = ({
	currentMonthNetPnl,
	withdrawalTargetPercent,
	onLogged,
}: WithdrawalCalculatorProps) => {
	const suggestedCents = Math.round(
		currentMonthNetPnl * (withdrawalTargetPercent / 100)
	)
	const suggestedBRL = suggestedCents / 100

	const [amount, setAmount] = useState(suggestedBRL.toFixed(2))
	const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)
	const [isPending, startTransition] = useTransition()

	if (currentMonthNetPnl <= 0 || withdrawalTargetPercent <= 0) {
		return null
	}

	const handleLog = (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)
		const amountBRL = parseFloat(amount.replace(",", "."))
		if (isNaN(amountBRL) || amountBRL <= 0) {
			setError("Enter a valid amount greater than zero")
			return
		}
		const amountCents = Math.round(amountBRL * 100)
		startTransition(async () => {
			const result = await recordCapitalEvent({
				eventType: "withdrawal",
				amountCents,
				eventDate: date,
			})
			if (result.status === "success") {
				setSuccess(true)
				onLogged()
			} else {
				setError(result.message ?? "Failed to log withdrawal")
			}
		})
	}

	if (success) {
		return (
			<div className="border-trade-buy/30 bg-trade-buy/10 text-trade-buy rounded-md border px-4 py-3 text-sm">
				Withdrawal logged successfully.
			</div>
		)
	}

	return (
		<div className="border-acc-100/30 bg-bg-200 space-y-3 rounded-md border px-4 py-4">
			<p className="text-txt-200 text-sm">
				Based on your{" "}
				<span className="text-acc-100 font-medium">
					{withdrawalTargetPercent}%
				</span>{" "}
				withdrawal target, consider withdrawing{" "}
				<span className="text-txt-100 font-mono font-medium">
					{new Intl.NumberFormat("pt-BR", {
						style: "currency",
						currency: "BRL",
					}).format(suggestedBRL)}
				</span>
				.
			</p>

			<form
				onSubmit={handleLog}
				className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end"
			>
				<div>
					<label
						htmlFor="wd-amount"
						className="text-txt-300 mb-1 block text-xs"
					>
						Amount (R$)
					</label>
					<input
						id="wd-amount"
						type="text"
						inputMode="decimal"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						className="border-bg-300 bg-bg-100 text-txt-100 focus:ring-acc-100 w-full rounded-md border px-3 py-2 font-mono text-sm focus:ring-1 focus:outline-none"
					/>
				</div>

				<div>
					<label htmlFor="wd-date" className="text-txt-300 mb-1 block text-xs">
						Date
					</label>
					<input
						id="wd-date"
						type="date"
						value={date}
						onChange={(e) => setDate(e.target.value)}
						max={new Date().toISOString().slice(0, 10)}
						className="border-bg-300 bg-bg-100 text-txt-100 focus:ring-acc-100 w-full rounded-md border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
					/>
				</div>

				<button
					type="submit"
					disabled={isPending}
					className="bg-acc-100 text-bg-100 rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{isPending ? "Logging…" : "Log Withdrawal"}
				</button>

				{error && (
					<p className="text-trade-sell col-span-full text-xs">{error}</p>
				)}
			</form>
		</div>
	)
}

export { WithdrawalCalculator }
