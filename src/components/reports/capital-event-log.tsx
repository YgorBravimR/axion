// src/components/reports/capital-event-log.tsx
"use client"

import { useState, useTransition } from "react"
import type { CapitalEvent } from "@/types/integration"
import { recordCapitalEvent, deleteCapitalEvent } from "@/app/actions/annual-reports"

interface CapitalEventLogProps {
  events: CapitalEvent[]
  year: number
  onEventDeleted: () => void
  onEventAdded: () => void
}

const CapitalEventLog = ({ events, year, onEventDeleted, onEventAdded }: CapitalEventLogProps) => {
  const [isPending, startTransition] = useTransition()
  const [formType, setFormType] = useState<"deposit" | "withdrawal">("deposit")
  const [formAmount, setFormAmount] = useState("")
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formNotes, setFormNotes] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteCapitalEvent(id)
      if (result.status === "success") onEventDeleted()
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const amountBRL = parseFloat(formAmount.replace(",", "."))
    if (isNaN(amountBRL) || amountBRL <= 0) {
      setFormError("Amount must be greater than zero")
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
        setFormError(result.message ?? "Failed to record event")
      }
    })
  }

  const yearEvents = events.filter((e) => e.eventDate.startsWith(String(year)))

  return (
    <details className="group">
      <summary className="cursor-pointer list-none flex items-center justify-between py-2 text-sm font-medium text-txt-200 hover:text-txt-100 transition-colors">
        <span>Capital Events ({yearEvents.length})</span>
        <span className="text-txt-300 text-xs group-open:rotate-180 transition-transform">▼</span>
      </summary>

      <div className="mt-3 space-y-4">
        {/* Add event form */}
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-4 items-end">
          <div className="flex rounded-md overflow-hidden border border-bg-300 col-span-1">
            <button
              type="button"
              onClick={() => setFormType("deposit")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                formType === "deposit" ? "bg-trade-buy text-bg-100" : "bg-bg-200 text-txt-300 hover:text-txt-100"
              }`}
              aria-pressed={formType === "deposit"}
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setFormType("withdrawal")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                formType === "withdrawal" ? "bg-acc-100 text-bg-100" : "bg-bg-200 text-txt-300 hover:text-txt-100"
              }`}
              aria-pressed={formType === "withdrawal"}
            >
              Withdrawal
            </button>
          </div>

          <input
            type="text"
            inputMode="decimal"
            placeholder="Amount (R$)"
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
            className="rounded-md border border-bg-300 bg-bg-200 px-3 py-2 text-xs text-txt-100 placeholder:text-txt-300 focus:outline-none focus:ring-1 focus:ring-acc-100"
            aria-label="Amount in BRL"
            required
          />

          <input
            type="date"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="rounded-md border border-bg-300 bg-bg-200 px-3 py-2 text-xs text-txt-100 focus:outline-none focus:ring-1 focus:ring-acc-100"
            aria-label="Event date"
          />

          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-acc-100 px-4 py-2 text-xs font-medium text-bg-100 hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? "Saving…" : "Log"}
          </button>

          {formError && (
            <p className="col-span-full text-xs text-trade-sell">{formError}</p>
          )}
        </form>

        {/* Event list */}
        {yearEvents.length === 0 ? (
          <p className="text-xs text-txt-300">No deposits or withdrawals recorded for {year}.</p>
        ) : (
          <ul className="space-y-1" aria-label={`Capital events for ${year}`}>
            {[...yearEvents].reverse().map((ev) => (
              <li
                key={ev.id}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 bg-bg-300/30 text-xs"
              >
                <span className="text-txt-300 font-mono">{ev.eventDate}</span>
                <span
                  className={`rounded-sm px-2 py-0.5 text-xs font-medium ${
                    ev.eventType === "deposit" ? "bg-trade-buy/20 text-trade-buy" : "bg-acc-100/20 text-acc-100"
                  }`}
                >
                  {ev.eventType === "deposit" ? "Depósito" : "Retirada"}
                </span>
                <span className="font-mono text-txt-100 tabular-nums ml-auto">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(ev.amountCents / 100)}
                </span>
                {ev.notes && <span className="text-txt-300 truncate max-w-[120px]">{ev.notes}</span>}
                <button
                  type="button"
                  onClick={() => handleDelete(ev.id)}
                  disabled={isPending}
                  className="ml-2 text-txt-300 hover:text-trade-sell transition-colors disabled:opacity-50"
                  aria-label={`Delete ${ev.eventType} on ${ev.eventDate}`}
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
