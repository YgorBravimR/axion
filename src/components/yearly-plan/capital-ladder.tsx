// src/components/yearly-plan/capital-ladder.tsx
"use client"

import { useMemo } from "react"
import { buildCapitalLadder } from "@/lib/yearly-plan/capital-ladder"
import type { YearlyPlan } from "@/db/schema"
import type { YearlyPlanInput } from "@/lib/validations/yearly-plan"
import { cn } from "@/lib/utils"

interface CapitalLadderProps {
  plan: YearlyPlan
  onUpdate: (updates: Partial<YearlyPlanInput>) => void
}

const CapitalLadder = ({ plan }: CapitalLadderProps) => {
  const ladder = useMemo(
    () => buildCapitalLadder(plan.ladderRules, plan.valorPorContratoCents),
    [plan.ladderRules, plan.valorPorContratoCents]
  )

  const TIER_COLORS = ["text-text-100", "text-acc-200", "text-acc-100", "text-purple-400"]

  return (
    <div className="space-y-m-300">
      <div className="flex items-center justify-between">
        <h3 className="text-t-500 font-semibold text-text-100">Escada de Capital</h3>
        <span className="text-t-300 text-text-200">
          R$ {(plan.valorPorContratoCents / 100).toLocaleString("pt-BR")}/contrato
        </span>
      </div>
      <div className="rounded-md border border-border-100 overflow-hidden">
        <table className="w-full text-t-300 font-mono" aria-label="Capital ladder table">
          <thead className="bg-bg-200">
            <tr>
              <th className="p-s-300 text-left text-text-200">Contratos</th>
              <th className="p-s-300 text-right text-text-200">Valor Operacional</th>
              <th className="p-s-300 text-right text-text-200">Tier</th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((level) => (
              <tr
                key={level.contracts}
                role="row"
                className={cn(
                  "border-t border-border-100",
                  level.tier % 2 === 0 ? "bg-bg-100" : "bg-bg-200"
                )}
              >
                <td className="p-s-300 text-text-100">{level.contracts}</td>
                <td className="p-s-300 text-right text-text-100">
                  R$ {(level.valorOperacionalCents / 100).toLocaleString("pt-BR")}
                </td>
                <td className={cn("p-s-300 text-right font-semibold", TIER_COLORS[level.tier] ?? "text-text-100")}>
                  {level.multiplier}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export { CapitalLadder }
