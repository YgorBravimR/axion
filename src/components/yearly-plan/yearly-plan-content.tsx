// src/components/yearly-plan/yearly-plan-content.tsx
"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { YearlyPlanOnboarding } from "@/components/yearly-plan/yearly-plan-onboarding"
import { YearGrid } from "@/components/yearly-plan/year-grid"
import { CapitalLadder } from "@/components/yearly-plan/capital-ladder"
import { ExitConventionForm } from "@/components/yearly-plan/exit-convention-form"
import { PayoffMatrix } from "@/components/yearly-plan/payoff-matrix"
import type { YearlyPlan, WeeklyTarget } from "@/db/schema"
import type { YearlyPlanWithWeeks } from "@/types/yearly-plan"
import type { YearlyPlanInput, WeeklyTargetInput } from "@/lib/validations/yearly-plan"
import { upsertYearlyPlan, upsertWeeklyTargets, syncWeeklyActuals } from "@/app/actions/yearly-plan"
import { getIsoWeekOfDate } from "@/lib/calendar/iso-week"

type ActiveTab = "grid" | "ladder" | "exits" | "payoff"

interface YearlyPlanContentProps {
  initialPlan: YearlyPlanWithWeeks | null
  year: number
}

const YearlyPlanContent = ({ initialPlan, year }: YearlyPlanContentProps) => {
  const [planData, setPlanData] = useState<YearlyPlanWithWeeks | null>(initialPlan)
  const [activeTab, setActiveTab] = useState<ActiveTab>("grid")

  const handleOnboardingComplete = (newPlan: YearlyPlanWithWeeks) => {
    setPlanData(newPlan)
  }

  const handlePlanUpdate = async (updates: Partial<YearlyPlanInput>) => {
    if (!planData) return
    const input: YearlyPlanInput = {
      year,
      initialCapitalCents: planData.plan.initialCapitalCents,
      valorPorContratoCents: planData.plan.valorPorContratoCents,
      irTaxRate: parseFloat(String(planData.plan.irTaxRate)),
      tradingDaysPerWeek: planData.plan.tradingDaysPerWeek,
      ladderRules: planData.plan.ladderRules,
      exitParcialPts: parseFloat(String(planData.plan.exitParcialPts)),
      exitFinalPts: parseFloat(String(planData.plan.exitFinalPts)),
      exitStopPts: parseFloat(String(planData.plan.exitStopPts)),
      exitProtPts: parseFloat(String(planData.plan.exitProtPts)),
      exitParcialProportion: parseFloat(String(planData.plan.exitParcialProportion)),
      exitFinalProportion: parseFloat(String(planData.plan.exitFinalProportion)),
      startWeek: planData.plan.startWeek,
      ...updates,
    }
    const result = await upsertYearlyPlan(input)
    if (result.status === "success" && result.data) {
      setPlanData((prev) => prev ? { ...prev, plan: result.data as YearlyPlan } : prev)
    }
  }

  const handleWeekUpdate = async (weekInput: WeeklyTargetInput) => {
    if (!planData) return
    const result = await upsertWeeklyTargets(planData.plan.id, [weekInput])
    if (result.status === "success" && result.data) {
      setPlanData((prev) => {
        if (!prev) return prev
        const updated = result.data as WeeklyTarget[]
        const map = new Map(updated.map((w) => [w.id, w]))
        return {
          ...prev,
          weeklyTargets: prev.weeklyTargets.map((w) => map.get(w.id) ?? w),
        }
      })
    }
  }

  const handleSyncWeek = async (isoWeek: number) => {
    if (!planData) return
    const result = await syncWeeklyActuals(planData.plan.id, [isoWeek])
    if (result.status === "success" && result.data) {
      const synced = result.data.weeks
      setPlanData((prev) => {
        if (!prev) return prev
        const map = new Map(synced.map((w) => [w.id, w]))
        return {
          ...prev,
          weeklyTargets: prev.weeklyTargets.map((w) => map.get(w.id) ?? w),
        }
      })
    }
  }

  const currentIsoWeek = getIsoWeekOfDate(new Date())

  if (!planData) {
    return (
      <div data-testid="yearly-plan-onboarding">
        <YearlyPlanOnboarding year={year} onComplete={handleOnboardingComplete} />
      </div>
    )
  }

  const exitConvention = {
    parcialPts: parseFloat(String(planData.plan.exitParcialPts)),
    finalPts: parseFloat(String(planData.plan.exitFinalPts)),
    stopPts: parseFloat(String(planData.plan.exitStopPts)),
    protPts: parseFloat(String(planData.plan.exitProtPts)),
    parcialProportion: parseFloat(String(planData.plan.exitParcialProportion)),
    finalProportion: parseFloat(String(planData.plan.exitFinalProportion)),
  }

  const currentContracts = planData.weeklyTargets.find(
    (w) => w.isoWeek === currentIsoWeek
  )?.contracts ?? 1

  return (
    <div className="space-y-s-400">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-t-700 font-semibold text-text-100">Plano Anual {year}</h1>
          <p className="text-t-400 text-text-200 mt-s-100">
            Capital inicial: R$ {(planData.plan.initialCapitalCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
        <TabsList>
          <TabsTrigger value="grid">Grade Semanal</TabsTrigger>
          <TabsTrigger value="ladder">Escada de Capital</TabsTrigger>
          <TabsTrigger value="exits">Convenção de Saída</TabsTrigger>
          <TabsTrigger value="payoff">Matriz de Payoff</TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="mt-m-400">
          <YearGrid
            weeks={planData.weeklyTargets}
            plan={planData.plan}
            onWeekUpdate={handleWeekUpdate}
            onSyncWeek={handleSyncWeek}
            currentIsoWeek={currentIsoWeek}
          />
        </TabsContent>

        <TabsContent value="ladder" className="mt-m-400">
          <CapitalLadder plan={planData.plan} onUpdate={handlePlanUpdate} />
        </TabsContent>

        <TabsContent value="exits" className="mt-m-400">
          <ExitConventionForm plan={planData.plan} onUpdate={handlePlanUpdate} />
        </TabsContent>

        <TabsContent value="payoff" className="mt-m-400">
          <PayoffMatrix exitConvention={exitConvention} contracts={currentContracts} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export { YearlyPlanContent }
