import { setRequestLocale } from "next-intl/server"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { getYearlyPlan } from "@/app/actions/yearly-plan"
import { YearlyPlanContent } from "@/components/yearly-plan"

interface YearlyPlanPageProps {
  params: Promise<{ locale: string }>
}

const YearlyPlanPage = async ({ params }: YearlyPlanPageProps) => {
  const { locale } = await params
  setRequestLocale(locale)

  const effectiveNow = await getServerEffectiveNow()
  const currentYear = effectiveNow.getFullYear()

  const planResult = await getYearlyPlan(currentYear)
  const initialPlan = planResult.status === "success" ? planResult.data ?? null : null

  return (
    <div className="min-h-dvh bg-bg-100">
      <main className="mx-auto max-w-7xl p-m-400 sm:p-m-500 lg:p-m-600">
        <YearlyPlanContent initialPlan={initialPlan} year={currentYear} />
      </main>
    </div>
  )
}

export { YearlyPlanPage as default }
