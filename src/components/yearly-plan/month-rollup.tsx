// src/components/yearly-plan/month-rollup.tsx
"use client"

import type { WeeklyTarget, YearlyPlan } from "@/db/schema"
import { computeMonthRollup } from "@/lib/yearly-plan/weekly-rollups"

interface MonthRollupProps {
  weeks: WeeklyTarget[]
  plan: YearlyPlan
  cumulativeFinancialCents: number
  cumulativePoints: number
  monthName: string
}

const MonthRollup = ({
  weeks,
  plan,
  cumulativeFinancialCents,
  cumulativePoints,
  monthName,
}: MonthRollupProps) => {
  const rollup = computeMonthRollup(
    weeks,
    {
      irTaxRate: String(plan.irTaxRate),
      tradingDaysPerWeek: plan.tradingDaysPerWeek,
      valorPorContratoCents: plan.valorPorContratoCents,
    },
    cumulativeFinancialCents,
    cumulativePoints
  )

  return (
    <div className="rounded-md bg-bg-300 border border-border-100 px-m-300 py-s-300 mt-s-200">
      <p className="text-t-300 font-semibold text-text-100 mb-s-100">{monthName}</p>
      <div className="grid grid-cols-4 gap-m-200 text-t-300 font-mono">
        <div>
          <p className="text-text-200 text-t-200">Alvo</p>
          <p className="text-text-100">{rollup.totalPtsAlvo.toFixed(1)} pts</p>
        </div>
        <div>
          <p className="text-text-200 text-t-200">Feito</p>
          <p className="text-text-100">{rollup.totalPtsFeito.toFixed(1)} pts</p>
        </div>
        <div>
          <p className="text-text-200 text-t-200">Média/Sem</p>
          <p className="text-text-100">{rollup.avgPtsPerWeek.toFixed(1)} pts</p>
        </div>
        <div>
          <p className="text-text-200 text-t-200">Acum. pts</p>
          <p className="text-acc-100">{rollup.cumulativePoints.toFixed(1)}</p>
        </div>
      </div>
    </div>
  )
}

export { MonthRollup }
