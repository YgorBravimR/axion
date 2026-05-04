// src/components/yearly-plan/week-cell.tsx
"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { WeeklyTarget } from "@/db/schema"
import type { WeeklyTargetInput } from "@/lib/validations/yearly-plan"
import { cn } from "@/lib/utils"

interface WeekCellProps {
  week: WeeklyTarget
  isCurrentWeek: boolean
  isEditing: boolean
  onEdit: () => void
  onSave: (data: WeeklyTargetInput) => Promise<void>
  onSyncActuals: () => void
}

const WeekCell = ({
  week,
  isCurrentWeek,
  isEditing,
  onEdit,
  onSave,
  onSyncActuals,
}: WeekCellProps) => {
  const [ptsFeitoStr, setPtsFeitoStr] = useState(week.ptsFeito != null ? String(week.ptsFeito) : "")
  const [saving, setSaving] = useState(false)

  const ptsAlvo = week.ptsAlvo != null ? parseFloat(String(week.ptsAlvo)) : null
  const ptsFeito = week.ptsFeito != null ? parseFloat(String(week.ptsFeito)) : null
  const isAhead = ptsFeito != null && ptsAlvo != null && ptsFeito >= ptsAlvo

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        isoWeek: week.isoWeek,
        isoYear: week.isoYear,
        ptsFeito: ptsFeitoStr ? parseFloat(ptsFeitoStr) : null,
        ptsSource: "manual",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border p-s-300 space-y-s-100 cursor-pointer transition-colors",
        isCurrentWeek
          ? "border-acc-100 bg-acc-100/5"
          : "border-border-100 bg-bg-200 hover:border-border-200",
        isEditing && "ring-1 ring-acc-100"
      )}
      onClick={!isEditing ? onEdit : undefined}
      role="button"
      tabIndex={0}
      aria-label={`Semana ${week.isoWeek} — ${isEditing ? "editando" : "clique para editar"}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onEdit() }}
    >
      <div className="flex items-center justify-between">
        <span className="text-t-300 font-mono text-text-200">Sem {week.isoWeek}</span>
        <div className="flex items-center gap-s-100">
          <span className={cn(
            "text-t-200 px-s-100 py-0 rounded-sm",
            week.ptsSource === "auto"
              ? "bg-acc-200/20 text-acc-200"
              : "bg-text-200/20 text-text-200"
          )}>
            {week.ptsSource === "auto" ? "auto" : "manual"}
          </span>
          {isCurrentWeek && (
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={(e) => { e.stopPropagation(); onSyncActuals() }}
              aria-label="Sincronizar pontos do semana"
            >
              <RefreshCw className="size-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-s-100 text-t-300 font-mono">
        <div>
          <span className="text-text-200">Alvo </span>
          <span className="text-text-100">{ptsAlvo?.toFixed(1) ?? "—"}</span>
        </div>
        <div>
          <span className="text-text-200">Feito </span>
          <span className={cn("font-semibold", isAhead ? "text-green-400" : ptsFeito != null ? "text-red-400" : "text-text-200")}>
            {ptsFeito?.toFixed(1) ?? "—"}
          </span>
        </div>
        <div className="col-span-2">
          <span className="text-text-200">Cnt </span>
          <span className="text-acc-100">{week.contracts}</span>
          <span className="text-text-200 ml-s-200">R$ {(week.valorOperacionalCents / 100).toLocaleString("pt-BR")}</span>
        </div>
      </div>

      {isEditing && (
        <div className="pt-s-200 space-y-s-200" onClick={(e) => e.stopPropagation()}>
          <Input
            type="number"
            step={0.5}
            placeholder="Pts Feito"
            value={ptsFeitoStr}
            onChange={(e) => setPtsFeitoStr(e.target.value)}
            aria-label="Pontos feitos na semana"
          />
          <Button size="sm" className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      )}
    </div>
  )
}

export { WeekCell }
