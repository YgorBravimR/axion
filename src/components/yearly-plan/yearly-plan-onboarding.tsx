// src/components/yearly-plan/yearly-plan-onboarding.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2 } from "lucide-react"
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
  const [ladderRules, setLadderRules] = useState<LadderRule[]>(DEFAULT_LADDER_RULES)

  const handleRuleChange = (index: number, field: keyof LadderRule, value: number) => {
    setLadderRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule)),
    )
  }

  const handleAddRule = () => {
    setLadderRules((prev) => {
      const last = prev[prev.length - 1]
      const nextMin = last ? last.maxContracts + 1 : 1
      return [
        ...prev,
        {
          minContracts: nextMin,
          maxContracts: nextMin + 4,
          multiplier: (last?.multiplier ?? 0) + 1,
        },
      ]
    })
  }

  const handleRemoveRule = (index: number) => {
    setLadderRules((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  const ladderValidationError = ((): string | null => {
    for (let i = 0; i < ladderRules.length; i++) {
      const rule = ladderRules[i]
      if (rule.minContracts < 1) return `Tier ${i + 1}: contrato mínimo deve ser ≥ 1`
      if (rule.maxContracts < rule.minContracts) return `Tier ${i + 1}: máximo deve ser ≥ mínimo`
      if (rule.multiplier <= 0) return `Tier ${i + 1}: tier deve ser > 0`
      if (i > 0 && rule.minContracts <= ladderRules[i - 1].maxContracts) {
        return `Tier ${i + 1}: faixa sobrepõe o tier anterior`
      }
    }
    return null
  })()
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
            <Label htmlFor="valor-contrato-input">Valor por Contrato (R$)</Label>
            <Input
              id="valor-contrato-input"
              type="number"
              min={100}
              step={100}
              value={valorPorContratoStr}
              onChange={(e) => setValorPorContratoStr(e.target.value)}
            />
          </div>

          <div className="space-y-s-300">
            <div className="flex items-center justify-between">
              <Label id="ladder-tiers-label">Tiers de Multiplicador</Label>
              <Button
                id="ladder-add-tier"
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRule}
                aria-label="Adicionar tier"
              >
                <Plus className="h-3.5 w-3.5 mr-s-100" />
                Adicionar tier
              </Button>
            </div>
            <div className="rounded-md border border-border-100 overflow-hidden">
              <table className="w-full text-t-300">
                <thead className="bg-bg-200">
                  <tr>
                    <th className="p-s-200 text-left text-text-200 text-xs uppercase tracking-wide">De</th>
                    <th className="p-s-200 text-left text-text-200 text-xs uppercase tracking-wide">Até</th>
                    <th className="p-s-200 text-left text-text-200 text-xs uppercase tracking-wide">Tier</th>
                    <th className="p-s-200 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {ladderRules.map((rule, index) => (
                    <tr key={index} className="border-t border-border-100">
                      <td className="p-s-100">
                        <Input
                          id={`ladder-rule-${index}-min`}
                          type="number"
                          min={1}
                          step={1}
                          value={rule.minContracts}
                          onChange={(e) =>
                            handleRuleChange(index, "minContracts", Number(e.target.value))
                          }
                          className="font-mono h-8"
                          aria-label={`Tier ${index + 1} contratos mínimos`}
                        />
                      </td>
                      <td className="p-s-100">
                        <Input
                          id={`ladder-rule-${index}-max`}
                          type="number"
                          min={1}
                          step={1}
                          value={rule.maxContracts}
                          onChange={(e) =>
                            handleRuleChange(index, "maxContracts", Number(e.target.value))
                          }
                          className="font-mono h-8"
                          aria-label={`Tier ${index + 1} contratos máximos`}
                        />
                      </td>
                      <td className="p-s-100">
                        <Input
                          id={`ladder-rule-${index}-multiplier`}
                          type="number"
                          min={1}
                          step={1}
                          value={rule.multiplier}
                          onChange={(e) =>
                            handleRuleChange(index, "multiplier", Number(e.target.value))
                          }
                          className="font-mono h-8 text-acc-100"
                          aria-label={`Tier ${index + 1} multiplicador`}
                        />
                      </td>
                      <td className="p-s-100 text-right">
                        <Button
                          id={`ladder-rule-${index}-remove`}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveRule(index)}
                          disabled={ladderRules.length <= 1}
                          aria-label={`Remover tier ${index + 1}`}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ladderValidationError && (
              <p role="alert" className="text-tiny text-fb-error">{ladderValidationError}</p>
            )}
          </div>

          <div className="space-y-s-200">
            <Label>Prévia (10 primeiros contratos)</Label>
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
          </div>

          <div className="flex gap-s-300">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Voltar</Button>
            <Button
              onClick={() => setStep(3)}
              disabled={Boolean(ladderValidationError)}
              className="flex-1"
            >
              Próximo
            </Button>
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
