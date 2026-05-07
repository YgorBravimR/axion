"use client"

import { useState, useEffect, useTransition, useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import { CurrencyInput } from "@/components/ui/currency-input"
import { useToast } from "@/components/ui/toast"
import { getAccountLifecycle, updateAccountLifecycle } from "@/app/actions/settings"

const AnnualReportingSettings = () => {
  const t = useTranslations("settings.profile")
  const locale = useLocale()
  const { showToast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  const monthNames = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: "long" })
    return Array.from({ length: 12 }, (_, i) => {
      const name = formatter.format(new Date(2000, i, 1))
      return name.charAt(0).toUpperCase() + name.slice(1)
    })
  }, [locale])

  const [startMonth, setStartMonth] = useState<number | null>(null)
  const [startYear, setStartYear] = useState<number | null>(null)
  const [startingBalanceCents, setStartingBalanceCents] = useState<number | null>(null)
  const [withdrawalTarget, setWithdrawalTarget] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const result = await getAccountLifecycle()
      if (!mounted) return
      if (result.status === "success" && result.data) {
        setStartMonth(result.data.accountStartMonth)
        setStartYear(result.data.accountStartYear)
        setStartingBalanceCents(result.data.startingBalanceCents)
        setWithdrawalTarget(result.data.withdrawalTargetPercent)
      }
      setIsLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  const handleSave = () => {
    const cents = startingBalanceCents != null ? Math.round(startingBalanceCents) : null

    startTransition(async () => {
      const result = await updateAccountLifecycle({
        accountStartMonth: startMonth,
        accountStartYear: startYear,
        startingBalanceCents: cents,
        withdrawalTargetPercent: withdrawalTarget,
      })
      if (result.status === "success") {
        showToast("success", t("annualSettingsSaved"))
      } else {
        showToast("error", result.message ?? t("annualSettingsSaveError"))
      }
    })
  }

  if (isLoading) return null

  const currentYear = new Date().getFullYear()

  return (
    <fieldset className="space-y-m-400 border border-bg-300 rounded-md p-m-400">
      <legend className="text-xs font-medium text-txt-300 uppercase tracking-wider px-s-200">
        {t("annualReporting")}
      </legend>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-m-400">
        <div>
          <label htmlFor="account-start-month" className="mb-s-100 block text-xs text-txt-300">
            {t("accountStartMonth")}
          </label>
          <select
            id="account-start-month"
            value={startMonth ?? ""}
            onChange={(e) => setStartMonth(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full rounded-md border border-bg-300 bg-bg-200 px-s-300 py-s-200 text-sm text-txt-100 focus:outline-none focus:ring-1 focus:ring-acc-100"
            aria-label={t("accountStartMonth")}
          >
            <option value="">{t("notSet")}</option>
            {monthNames.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="account-start-year" className="mb-s-100 block text-xs text-txt-300">
            {t("accountStartYear")}
          </label>
          <input
            id="account-start-year"
            type="number"
            min={2000}
            max={currentYear}
            value={startYear ?? ""}
            onChange={(e) => setStartYear(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full rounded-md border border-bg-300 bg-bg-200 px-s-300 py-s-200 text-sm font-mono text-txt-100 focus:outline-none focus:ring-1 focus:ring-acc-100"
            aria-label={t("accountStartYear")}
            placeholder={t("yearPlaceholder")}
          />
        </div>

        <div>
          <label htmlFor="starting-balance" className="mb-s-100 block text-xs text-txt-300">
            {t("openingBalance")}
          </label>
          <CurrencyInput
            id="starting-balance"
            value={startingBalanceCents}
            onValueChange={setStartingBalanceCents}
            decimals={2}
            unit="cents"
            aria-label={t("openingBalance")}
            placeholder={t("openingBalancePlaceholder")}
          />
        </div>

        <div>
          <label htmlFor="withdrawal-target" className="mb-s-100 block text-xs text-txt-300">
            {t("monthlyWithdrawalTarget")}
          </label>
          <input
            id="withdrawal-target"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={withdrawalTarget ?? ""}
            onChange={(e) => setWithdrawalTarget(e.target.value ? parseFloat(e.target.value) : null)}
            className="w-full rounded-md border border-bg-300 bg-bg-200 px-s-300 py-s-200 text-sm font-mono text-txt-100 focus:outline-none focus:ring-1 focus:ring-acc-100"
            aria-label={t("monthlyWithdrawalTarget")}
            placeholder={t("monthlyWithdrawalTargetPlaceholder")}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="rounded-md bg-acc-100 px-m-400 py-s-200 text-sm font-medium text-bg-100 hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? t("saving") : t("saveAnnualSettings")}
      </button>
    </fieldset>
  )
}

export { AnnualReportingSettings }
