"use client"

import { useState, useEffect, useTransition } from "react"
import { useToast } from "@/components/ui/toast"
import { getAccountLifecycle, updateAccountLifecycle } from "@/app/actions/settings"

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

const AnnualReportingSettings = () => {
  const { showToast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  const [startMonth, setStartMonth] = useState<number | null>(null)
  const [startYear, setStartYear] = useState<number | null>(null)
  const [startingBalanceBRL, setStartingBalanceBRL] = useState<string>("")
  const [withdrawalTarget, setWithdrawalTarget] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const result = await getAccountLifecycle()
      if (!mounted) return
      if (result.status === "success" && result.data) {
        setStartMonth(result.data.accountStartMonth)
        setStartYear(result.data.accountStartYear)
        setStartingBalanceBRL(
          result.data.startingBalanceCents !== null
            ? (result.data.startingBalanceCents / 100).toFixed(2)
            : ""
        )
        setWithdrawalTarget(result.data.withdrawalTargetPercent)
      }
      setIsLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  const handleSave = () => {
    const startingBalanceCents = startingBalanceBRL
      ? Math.round(parseFloat(startingBalanceBRL.replace(",", ".")) * 100)
      : null

    startTransition(async () => {
      const result = await updateAccountLifecycle({
        accountStartMonth: startMonth,
        accountStartYear: startYear,
        startingBalanceCents,
        withdrawalTargetPercent: withdrawalTarget,
      })
      if (result.status === "success") {
        showToast("success", "Annual settings saved")
      } else {
        showToast("error", result.message ?? "Failed to save annual settings")
      }
    })
  }

  if (isLoading) return null

  const currentYear = new Date().getFullYear()

  return (
    <fieldset className="space-y-m-400 border border-bg-300 rounded-md p-m-400">
      <legend className="text-xs font-medium text-txt-300 uppercase tracking-wider px-s-200">
        Annual Reporting
      </legend>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-m-400">
        <div>
          <label htmlFor="account-start-month" className="mb-s-100 block text-xs text-txt-300">
            Account Start Month
          </label>
          <select
            id="account-start-month"
            value={startMonth ?? ""}
            onChange={(e) => setStartMonth(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full rounded-md border border-bg-300 bg-bg-200 px-m-300 py-s-200 text-sm text-txt-100 focus:outline-none focus:ring-1 focus:ring-acc-100"
            aria-label="Account start month"
          >
            <option value="">— Not set —</option>
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="account-start-year" className="mb-s-100 block text-xs text-txt-300">
            Account Start Year
          </label>
          <input
            id="account-start-year"
            type="number"
            min={2000}
            max={currentYear}
            value={startYear ?? ""}
            onChange={(e) => setStartYear(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full rounded-md border border-bg-300 bg-bg-200 px-m-300 py-s-200 text-sm font-mono text-txt-100 focus:outline-none focus:ring-1 focus:ring-acc-100"
            aria-label="Account start year"
            placeholder="e.g. 2025"
          />
        </div>

        <div>
          <label htmlFor="starting-balance" className="mb-s-100 block text-xs text-txt-300">
            Opening Balance (R$)
          </label>
          <input
            id="starting-balance"
            type="text"
            inputMode="decimal"
            value={startingBalanceBRL}
            onChange={(e) => setStartingBalanceBRL(e.target.value)}
            className="w-full rounded-md border border-bg-300 bg-bg-200 px-m-300 py-s-200 text-sm font-mono text-txt-100 focus:outline-none focus:ring-1 focus:ring-acc-100"
            aria-label="Opening balance in BRL"
            placeholder="e.g. 10000"
          />
        </div>

        <div>
          <label htmlFor="withdrawal-target" className="mb-s-100 block text-xs text-txt-300">
            Monthly Withdrawal Target (%)
          </label>
          <input
            id="withdrawal-target"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={withdrawalTarget ?? ""}
            onChange={(e) => setWithdrawalTarget(e.target.value ? parseFloat(e.target.value) : null)}
            className="w-full rounded-md border border-bg-300 bg-bg-200 px-m-300 py-s-200 text-sm font-mono text-txt-100 focus:outline-none focus:ring-1 focus:ring-acc-100"
            aria-label="Monthly withdrawal target percentage"
            placeholder="30 (0 = disabled)"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="rounded-md bg-acc-100 px-m-400 py-s-200 text-sm font-medium text-bg-100 hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? "Saving…" : "Save Annual Settings"}
      </button>
    </fieldset>
  )
}

export { AnnualReportingSettings }
