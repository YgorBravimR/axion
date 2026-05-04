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
  const suggestedCents = Math.round(currentMonthNetPnl * (withdrawalTargetPercent / 100))
  const suggestedBRL = suggestedCents / 100

  const [amount, setAmount] = useState(suggestedBRL.toFixed(2))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (currentMonthNetPnl <= 0 || withdrawalTargetPercent <= 0) return null

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
      <div className="rounded-md border border-trade-buy/30 bg-trade-buy/10 px-4 py-3 text-sm text-trade-buy">
        Withdrawal logged successfully.
      </div>
    )
  }

  return (
    <div className="rounded-md border border-acc-100/30 bg-bg-200 px-4 py-4 space-y-3">
      <p className="text-sm text-txt-200">
        Based on your{" "}
        <span className="font-medium text-acc-100">{withdrawalTargetPercent}%</span>{" "}
        withdrawal target, consider withdrawing{" "}
        <span className="font-mono font-medium text-txt-100">
          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(suggestedBRL)}
        </span>
        .
      </p>

      <form onSubmit={handleLog} className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end">
        <div>
          <label htmlFor="wd-amount" className="mb-1 block text-xs text-txt-300">
            Amount (R$)
          </label>
          <input
            id="wd-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-bg-300 bg-bg-100 px-3 py-2 text-sm font-mono text-txt-100 focus:outline-none focus:ring-1 focus:ring-acc-100"
          />
        </div>

        <div>
          <label htmlFor="wd-date" className="mb-1 block text-xs text-txt-300">
            Date
          </label>
          <input
            id="wd-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-bg-300 bg-bg-100 px-3 py-2 text-sm text-txt-100 focus:outline-none focus:ring-1 focus:ring-acc-100"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-acc-100 px-4 py-2 text-sm font-medium text-bg-100 hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? "Logging…" : "Log Withdrawal"}
        </button>

        {error && <p className="col-span-full text-xs text-trade-sell">{error}</p>}
      </form>
    </div>
  )
}

export { WithdrawalCalculator }
