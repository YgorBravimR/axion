// src/components/yearly-plan/year-grid.tsx
"use client"

import { useState } from "react"
import { WeekCell } from "@/components/yearly-plan/week-cell"
import { MonthRollup } from "@/components/yearly-plan/month-rollup"
import type { WeeklyTarget, YearlyPlan } from "@/db/schema"
import type { WeeklyTargetInput } from "@/lib/validations/yearly-plan"
import { groupWeeksByMonth } from "@/lib/calendar/iso-week"

const MONTH_NAMES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

interface YearGridProps {
  weeks: WeeklyTarget[]
  plan: YearlyPlan
  onWeekUpdate: (week: WeeklyTargetInput) => Promise<void>
  onSyncWeek: (isoWeek: number) => void
  currentIsoWeek: number
}

const YearGrid = ({
  weeks,
  plan,
  onWeekUpdate,
  onSyncWeek,
  currentIsoWeek,
}: YearGridProps) => {
  const [editingWeek, setEditingWeek] = useState<number | null>(null)

  // Group weeks by calendar month (1-12)
  const byMonth = groupWeeksByMonth(weeks, plan.year)

  let cumulativeFinancialCents = 0
  let cumulativePoints = 0

  return (
    <div className="space-y-m-600">
      {MONTH_NAMES_PT.map((monthName, idx) => {
        const month = idx + 1
        const monthWeeks = byMonth[month] ?? []

        const rollupNode = (
          <MonthRollup
            weeks={monthWeeks}
            plan={plan}
            cumulativeFinancialCents={cumulativeFinancialCents}
            cumulativePoints={cumulativePoints}
            monthName={monthName}
          />
        )

        // Accumulate for next month
        const monthPts = monthWeeks.reduce(
          (sum, w) => sum + (w.ptsFeito != null ? parseFloat(String(w.ptsFeito)) : 0),
          0
        )
        const monthGross = monthWeeks.reduce((sum, w) => sum + (w.metaBrutoCents ?? 0), 0)
        cumulativeFinancialCents += monthGross
        cumulativePoints += monthPts

        return (
          <section key={month} aria-label={monthName} role="region">
            <h3 className="text-t-400 font-semibold text-text-100 mb-s-300">{monthName}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-s-300">
              {monthWeeks.length === 0 && (
                <p className="col-span-5 text-t-300 text-text-200 py-s-200">
                  Sem semanas neste mês.
                </p>
              )}
              {monthWeeks.map((week) => (
                <WeekCell
                  key={week.id}
                  week={week}
                  isCurrentWeek={week.isoWeek === currentIsoWeek}
                  isEditing={editingWeek === week.isoWeek}
                  onEdit={() => setEditingWeek(week.isoWeek)}
                  onSave={async (data) => {
                    await onWeekUpdate(data)
                    setEditingWeek(null)
                  }}
                  onSyncActuals={() => onSyncWeek(week.isoWeek)}
                />
              ))}
            </div>
            {rollupNode}
          </section>
        )
      })}
    </div>
  )
}

export { YearGrid }
