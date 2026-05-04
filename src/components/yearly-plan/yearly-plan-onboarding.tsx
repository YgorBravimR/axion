// src/components/yearly-plan/yearly-plan-onboarding.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { upsertYearlyPlan } from "@/app/actions/yearly-plan"
import { buildCapitalLadder } from "@/lib/yearly-plan/capital-ladder"
import type { YearlyPlanWithWeeks } from "@/types/yearly-plan"
import type { LadderRule } from "@/db/schema"

const DEFAULT_LADDER_RULES: LadderRule[] = [
  { minContracts: 1,  maxContracts: 5,  multiplier: 1 },
  { minContracts: 6,  maxContracts: 10, multiplier: 2 },
  { minContracts: 11, maxContracts: 15, multiplier: 3 },
  { minContracts: 16, maxContracts: 20, multiplier: 4 },
]

interface YearlyPlanOnboardingProps {
  year: number
  onComplete: (plan: YearlyPlanWithWeeks) => void
}

type Step = 1 | 2 | 3

const YearlyPlanOnboarding = ({ year, onComplete }: YearlyPlanOnboardingProps) => {
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [capitalBRL, setCapitalBRL] = useState("")
  const [valorPorContratoStr, setValorPorContratoStr] = useState("3000")
  const [tradingDays, setTradingDays] = useState(5)
  const [ladderRules] = useState<LadderRule[]>(DEFAULT_LADDER_RULES)
  const [exitParcial, setExitParcial] = useState(5.0)
  const [exitFinal, setExitFinal] = useState(10.0)
  const [exitStop, setExitStop] = useState(3.5)
  const [exitProt, setExitProt] = useState(1.0)

  const capitalCents = Math.round(parseFloat(capitalBRL || "0") * 100)
  const valorPorContratoCents = Math.round(parseFloat(valorPorContratoStr || "3000") * 100)

  const ladder = buildCapitalLadder(ladderRules, valorPorContratoCents)

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const result = await upsertYearlyPlan({
        year,
        initialCapitalCents: capitalCents,
        valorPorContratoCents,
        irTaxRate: 30,
        tradingDaysPerWeek: tradingDays,
        ladderRules,
        exitParcialPts: exitParcial,
        exitFinalPts: exitFinal,
        exitStopPts: exitStop,
        exitProtPts: exitProt,
        exitParcialProportion: 0.70,
        exitFinalProportion: 0.30,
        startWeek: 1,
      })
      if (result.status === "success" && result.data) {
        onComplete({ plan: result.data, weeklyTargets: [] })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-m-500">
      <div className="text-center space-y-s-200">
        <h2 className="text-t-600 font-semibold text-text-100">Configurar Plano Anual {year}</h2>
        <p className="text-t-400 text-text-200">Passo {step} de 3</p>
      </div>

      {step === 1 && (
        <div className="space-y-m-400">
          <div className="space-y-s-200">
            <Label htmlFor="capital-input" aria-label="Capital inicial">Capital Inicial (R$)</Label>
            <Input
              id="capital-input"
              type="number"
              min={0}
              step={1000}
              placeholder="3000"
              value={capitalBRL}
              onChange={(e) => setCapitalBRL(e.target.value)}
              aria-label="Capital inicial"
            />
          </div>
          <div className="space-y-s-200">
            <Label>Dias de operação por semana</Label>
            <Input
              type="number"
              min={1}
              max={7}
              value={tradingDays}
              onChange={(e) => setTradingDays(Number(e.target.value))}
            />
          </div>
          <Button
            disabled={capitalCents <= 0}
            onClick={() => setStep(2)}
            className="w-full"
          >
            Próximo
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-m-400">
          <div className="space-y-s-200">
            <Label>Valor por Contrato (R$)</Label>
            <Input
              type="number"
              min={100}
              step={100}
              value={valorPorContratoStr}
              onChange={(e) => setValorPorContratoStr(e.target.value)}
            />
          </div>
          <div className="rounded-md border border-border-100 overflow-hidden">
            <table className="w-full text-t-300 font-mono">
              <thead className="bg-bg-200">
                <tr>
                  <th className="p-s-200 text-left text-text-200">Contratos</th>
                  <th className="p-s-200 text-right text-text-200">Valor Op.</th>
                  <th className="p-s-200 text-right text-text-200">Tier</th>
                </tr>
              </thead>
              <tbody>
                {ladder.slice(0, 10).map((level) => (
                  <tr key={level.contracts} className="border-t border-border-100">
                    <td className="p-s-200 text-text-100">{level.contracts}</td>
                    <td className="p-s-200 text-right text-text-100">
                      R$ {(level.valorOperacionalCents / 100).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-s-200 text-right text-acc-100">{level.multiplier}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-s-300">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Voltar</Button>
            <Button onClick={() => setStep(3)} className="flex-1">Próximo</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-m-400">
          <div className="grid grid-cols-2 gap-m-300">
            {[
              { label: "Parcial (pts)", value: exitParcial, setter: setExitParcial },
              { label: "Final (pts)", value: exitFinal, setter: setExitFinal },
              { label: "Stop (pts)", value: exitStop, setter: setExitStop },
              { label: "Proteção (pts)", value: exitProt, setter: setExitProt },
            ].map(({ label, value, setter }) => (
              <div key={label} className="space-y-s-100">
                <Label>{label}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={value}
                  onChange={(e) => setter(parseFloat(e.target.value))}
                />
              </div>
            ))}
          </div>
          <p className="text-t-300 text-text-200">
            EV por op: {(exitParcial * 0.7 + exitFinal * 0.3).toFixed(2)} pts
          </p>
          <div className="flex gap-s-300">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Voltar</Button>
            <Button onClick={handleSubmit} disabled={saving} className="flex-1">
              {saving ? "Salvando..." : "Criar Plano"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { YearlyPlanOnboarding }
