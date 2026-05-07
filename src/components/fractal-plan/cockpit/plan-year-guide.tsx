"use client"

import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { planYearGuide } from "@/components/ui/page-guide/guide-configs/plan-year"

const PlanYearGuide = (): null => {
	useRegisterPageGuide(planYearGuide)
	return null
}

export { PlanYearGuide }
