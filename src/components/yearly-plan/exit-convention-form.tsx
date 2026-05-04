// src/components/yearly-plan/exit-convention-form.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { computeGainEv } from "@/lib/yearly-plan/exit-convention"
import type { YearlyPlan } from "@/db/schema"
import type { YearlyPlanInput } from "@/lib/validations/yearly-plan"

interface ExitConventionFormProps {
  plan: YearlyPlan
  onUpdate: (updates: Partial<YearlyPlanInput>) => void
}

const ExitConventionForm = ({ plan, onUpdate }: ExitConventionFormProps) => {
  const [parcial, setParcial] = useState(parseFloat(String(plan.exitParcialPts)))
  const [final, setFinal] = useState(parseFloat(String(plan.exitFinalPts)))
  const [stop, setStop] = useState(parseFloat(String(plan.exitStopPts)))
  const [prot, setProt] = useState(parseFloat(String(plan.exitProtPts)))
  const [saving, setSaving] = useState(false)

  const gainEv = computeGainEv({
    parcialPts: parcial,
    finalPts: final,
    stopPts: stop,
    protPts: prot,
    parcialProportion: 0.70,
    finalProportion: 0.30,
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      onUpdate({
        exitParcialPts: parcial,
        exitFinalPts: final,
        exitStopPts: stop,
        exitProtPts: prot,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-md space-y-m-400">
      <h3 className="text-t-500 font-semibold text-text-100">Convenção de Saída</h3>

      <div className="grid grid-cols-2 gap-m-300">
        {[
          { id: "exit-parcial", label: "Parcial (pts)", value: parcial, setter: setParcial },
          { id: "exit-final", label: "Final (pts)", value: final, setter: setFinal },
          { id: "exit-stop", label: "Stop (pts, mag.)", value: stop, setter: setStop },
          { id: "exit-prot", label: "Proteção (pts)", value: prot, setter: setProt },
        ].map(({ id, label, value, setter }) => (
          <div key={id} className="space-y-s-100">
            <Label id={`${id}-label`} htmlFor={id}>{label}</Label>
            <Input
              id={id}
              type="number"
              min={0}
              step={0.5}
              value={value}
              onChange={(e) => setter(parseFloat(e.target.value) || 0)}
              aria-label={label}
            />
          </div>
        ))}
      </div>

      <div className="rounded-md bg-bg-200 border border-border-100 px-m-300 py-s-300">
        <p className="text-t-300 text-text-200">EV por operação ganha:</p>
        <p className="text-t-500 font-mono font-semibold text-acc-100">
          {gainEv.toFixed(2)} pts
        </p>
        <p className="text-t-200 text-text-200 mt-s-100">
          {parcial} × 70% + {final} × 30% = {gainEv.toFixed(2)}
        </p>
      </div>

      <Button id="exit-convention-save" onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Salvando..." : "Salvar Convenção"}
      </Button>
    </div>
  )
}

export { ExitConventionForm }
