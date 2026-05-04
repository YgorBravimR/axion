// src/components/yearly-plan/payoff-matrix.tsx
"use client"

import { useMemo, useState } from "react"
import { buildPayoffMatrix } from "@/lib/yearly-plan/payoff-matrix"
import type { ExitConvention } from "@/lib/yearly-plan/exit-convention"
import { cn } from "@/lib/utils"

interface PayoffMatrixProps {
  exitConvention: ExitConvention
  contracts: number
}

type DisplayMode = "ev" | "label"

const PayoffMatrix = ({ exitConvention, contracts }: PayoffMatrixProps) => {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("ev")

  const matrix = useMemo(
    () => buildPayoffMatrix(exitConvention, contracts, 10),
    [exitConvention, contracts]
  )

  // Find global max columns needed (N=10 has 11 combos)
  const maxCols = 11

  return (
    <div className="space-y-m-300">
      <div className="flex items-center justify-between">
        <h3 className="text-t-500 font-semibold text-text-100">Matriz de Payoff</h3>
        <div className="flex gap-s-200">
          <button
            className={cn("text-t-300 px-s-300 py-s-100 rounded-sm transition-colors",
              displayMode === "ev" ? "bg-acc-100/20 text-acc-100" : "text-text-200 hover:text-text-100")}
            onClick={() => setDisplayMode("ev")}
            aria-pressed={displayMode === "ev"}
          >
            EV (pts)
          </button>
          <button
            className={cn("text-t-300 px-s-300 py-s-100 rounded-sm transition-colors",
              displayMode === "label" ? "bg-acc-100/20 text-acc-100" : "text-text-200 hover:text-text-100")}
            onClick={() => setDisplayMode("label")}
            aria-pressed={displayMode === "label"}
          >
            Combo
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-t-300 font-mono w-full min-w-[600px]" aria-label="Payoff matrix">
          <thead className="bg-bg-200">
            <tr>
              <th className="p-s-200 text-left text-text-200 w-12">N ops</th>
              {Array.from({ length: maxCols }, (_, i) => (
                <th key={i} className="p-s-200 text-right text-text-200 min-w-[70px]">
                  C{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const maxEv = Math.max(...row.combinations.map((c) => c.evPoints))

              return (
                <tr key={row.nOps} className="border-t border-border-100">
                  <td className="p-s-200 text-text-200">{row.nOps}</td>
                  {Array.from({ length: maxCols }, (_, colIdx) => {
                    const entry = row.combinations[colIdx]
                    if (!entry) return <td key={colIdx} className="p-s-200" />

                    const isMax = entry.evPoints === maxEv && maxEv > 0
                    const isNeg = entry.evPoints < 0

                    return (
                      <td
                        key={colIdx}
                        className={cn(
                          "p-s-200 text-right",
                          isMax && "text-acc-100 font-semibold",
                          isNeg && "text-red-400",
                          !isMax && !isNeg && "text-text-100"
                        )}
                        title={entry.label}
                      >
                        {displayMode === "ev"
                          ? entry.evPoints.toFixed(1)
                          : entry.label}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-t-200 text-text-200">
        EV por op: {(exitConvention.parcialPts * exitConvention.parcialProportion + exitConvention.finalPts * exitConvention.finalProportion).toFixed(2)} pts
        · Stop: -{exitConvention.stopPts} pts
        · {contracts} contrato{contracts !== 1 ? "s" : ""}
      </p>
    </div>
  )
}

export { PayoffMatrix }
