// src/components/reports/weekly-meta-chart.tsx
"use client"

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts"
import type { WeeklyMetaVsRealData, WeeklyMetaRow } from "@/app/actions/annual-reports"

interface WeeklyMetaChartProps {
  data: WeeklyMetaVsRealData
  className?: string
}

const formatBRL = (cents: number): string => {
  const value = cents / 100
  if (Math.abs(value) >= 1000) return `R$${(value / 1000).toFixed(1)}k`
  return `R$${value.toFixed(0)}`
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  weeks: WeeklyMetaRow[]
}

const CustomTooltip = ({ active, payload, label, weeks }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null
  const weekNum = parseInt(label?.replace("W", "") ?? "0")
  const week = weeks.find((w) => w.isoWeek === weekNum)

  if (week?.disabled) {
    return (
      <div className="rounded-md border border-bg-300 bg-bg-200 px-3 py-2 text-xs text-txt-300">
        Before account start
      </div>
    )
  }

  return (
    <div className="rounded-md border border-bg-300 bg-bg-200 px-3 py-2 text-xs space-y-1">
      <p className="font-mono text-txt-100 font-medium">W{weekNum}</p>
      {week && (
        <p className="text-txt-300">{week.weekStart} → {week.weekEnd}</p>
      )}
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatBRL(entry.value)}
        </p>
      ))}
    </div>
  )
}

const WeeklyMetaChart = ({ data, className }: WeeklyMetaChartProps) => {
  const chartData = data.weeks.map((w) => ({
    name: `W${w.isoWeek}`,
    resultado: w.disabled ? 0 : w.resultado,
    metaBruto: w.metaBruto,
    metaLiquido: w.metaLiquido,
    autoRetirada: w.autoRetirada > 0 ? w.autoRetirada : undefined,
    disabled: w.disabled,
  }))

  return (
    <div className={className} role="img" aria-label={`Weekly Meta vs Real chart for ${data.year}`}>
      {!data.hasPlan && (
        <p className="mb-3 text-xs text-txt-300 border border-bg-300 rounded px-3 py-2">
          No yearly plan found — target lines unavailable. Create a yearly plan to see Meta Bruto and Meta Líquido targets.
        </p>
      )}

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-300)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--txt-300)", fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={formatBRL}
            tick={{ fontSize: 11, fill: "var(--txt-300)", fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip
            content={<CustomTooltip weeks={data.weeks} />}
            cursor={{ fill: "var(--bg-300)", opacity: 0.4 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "var(--txt-300)" }}
          />

          <Bar dataKey="resultado" name="Resultado" radius={[2, 2, 0, 0]} maxBarSize={24}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.disabled
                    ? "var(--bg-300)"
                    : entry.resultado >= 0
                    ? "var(--trade-buy)"
                    : "var(--trade-sell)"
                }
                opacity={entry.disabled ? 0.3 : 1}
              />
            ))}
          </Bar>

          {data.hasPlan && (
            <Line
              dataKey="metaBruto"
              name="Meta Bruto"
              stroke="var(--acc-100)"
              strokeDasharray="6 3"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          )}
          {data.hasPlan && (
            <Line
              dataKey="metaLiquido"
              name="Meta Líquido"
              stroke="var(--acc-200)"
              strokeDasharray="6 3"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          )}
          {data.withdrawalTargetPercent && data.withdrawalTargetPercent > 0 && (
            <Line
              dataKey="autoRetirada"
              name="Retirada Auto"
              stroke="var(--acc-100)"
              strokeDasharray="2 4"
              strokeWidth={1}
              dot={false}
              opacity={0.5}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Accessible tabular fallback for screen readers */}
      <details className="sr-only">
        <summary>Weekly data table</summary>
        <table>
          <caption>Weekly Meta vs Real — {data.year}</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Period</th>
              <th scope="col">Resultado</th>
              <th scope="col">Meta Bruto</th>
              <th scope="col">Meta Líquido</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => (
              <tr key={w.isoWeek}>
                <td>W{w.isoWeek}</td>
                <td>{w.weekStart} to {w.weekEnd}</td>
                <td>{w.disabled ? "—" : formatBRL(w.resultado)}</td>
                <td>{w.metaBruto !== null ? formatBRL(w.metaBruto) : "—"}</td>
                <td>{w.metaLiquido !== null ? formatBRL(w.metaLiquido) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

export { WeeklyMetaChart }
