"use client"

import { useTranslations } from "next-intl"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet"
import { MonthlyPlanEditor } from "@/components/fractal-plan/monthly-plan-editor"
import type { RiskManagementProfile } from "@/types/risk-profile"

interface MonthlyPlanSlideoverProps {
	open: boolean
	onOpenChange: (_next: boolean) => void
	monthLabel: string
	monthlyPlanId: string
	riskProfiles: RiskManagementProfile[]
	existing: {
		monthlyGoalCents: number | null
		intentNotes: string | null
		postMortemNotes: string | null
		overrideRiskProfileId: string | null
	}
}

const MonthlyPlanSlideover = ({
	open,
	onOpenChange,
	monthLabel,
	monthlyPlanId,
	riskProfiles,
	existing,
}: MonthlyPlanSlideoverProps) => {
	const t = useTranslations("plan.slideovers")
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				id={`monthly-slideover-${monthlyPlanId}`}
				side="right"
				className="flex w-full flex-col overflow-hidden border-l px-0 pt-0 pb-0 sm:max-w-xl"
			>
				<SheetHeader className="border-bg-300 px-m-400 py-s-300 border-b">
					<SheetTitle>{t("monthlyTitle", { monthLabel })}</SheetTitle>
					<SheetDescription>{t("monthlyDescription")}</SheetDescription>
				</SheetHeader>
				<div className="px-m-400 py-m-400 flex-1 overflow-y-auto">
					<MonthlyPlanEditor
						monthlyPlanId={monthlyPlanId}
						riskProfiles={riskProfiles}
						existing={existing}
					/>
				</div>
			</SheetContent>
		</Sheet>
	)
}

export { MonthlyPlanSlideover }
export type { MonthlyPlanSlideoverProps }
