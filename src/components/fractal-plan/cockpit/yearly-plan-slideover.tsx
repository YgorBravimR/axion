"use client"

import { useTranslations } from "next-intl"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet"
import { YearlyPlanEditor } from "@/components/fractal-plan/yearly-plan-editor"
import { usePageGuide } from "@/components/ui/page-guide"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"
import type { RiskManagementProfile } from "@/types/risk-profile"

interface YearlyPlanSlideoverProps {
	accountId: string
	open: boolean
	onOpenChange: (_next: boolean) => void
	year: number
	riskProfiles: RiskManagementProfile[]
	existing: {
		initialCapitalCents: number
		ladderRules: LadderRuleR[]
		tradingDaysPerWeek: number
		defaultAssertivityPercent: string | null
		defaultDailyLossR: string | null
		defaultDailyWinR: string | null
		defaultWeeklyLossR: string | null
		defaultWeeklyWinR: string | null
		defaultMonthlyLossR: string | null
		defaultMonthlyWinR: string | null
		defaultRiskProfileId: string | null
		notes: string | null
	} | null
	defaultInitialCapitalCents: number | null
}

const YearlyPlanSlideover = ({
	accountId,
	open,
	onOpenChange,
	year,
	riskProfiles,
	existing,
	defaultInitialCapitalCents,
}: YearlyPlanSlideoverProps) => {
	const t = useTranslations("plan.slideovers")
	const { isActive: guideActive } = usePageGuide()
	const handleOpenChange = (next: boolean): void => {
		if (guideActive && !next) {
			return
		}
		onOpenChange(next)
	}
	return (
		<Sheet open={open} onOpenChange={handleOpenChange} modal={!guideActive}>
			<SheetContent
				id={`yearly-slideover-${year}`}
				side="right"
				className="flex w-full flex-col overflow-hidden border-l px-0 pt-0 pb-0 sm:max-w-2xl"
				onPointerDownOutside={(event) => {
					if (guideActive) {
						event.preventDefault()
					}
				}}
				onInteractOutside={(event) => {
					if (guideActive) {
						event.preventDefault()
					}
				}}
				onEscapeKeyDown={(event) => {
					if (guideActive) {
						event.preventDefault()
					}
				}}
			>
				<SheetHeader className="border-bg-300 px-m-400 py-s-300 border-b">
					<SheetTitle>
						{existing
							? t("yearlyEditTitle", { year })
							: t("yearlyCreateTitle", { year })}
					</SheetTitle>
					<SheetDescription>{t("yearlyDescription")}</SheetDescription>
				</SheetHeader>
				<div className="px-m-400 py-m-400 flex-1 overflow-y-auto">
					<YearlyPlanEditor
						accountId={accountId}
						year={year}
						existing={existing}
						riskProfiles={riskProfiles}
						defaultInitialCapitalCents={defaultInitialCapitalCents}
					/>
				</div>
			</SheetContent>
		</Sheet>
	)
}

export { YearlyPlanSlideover }
export type { YearlyPlanSlideoverProps }
