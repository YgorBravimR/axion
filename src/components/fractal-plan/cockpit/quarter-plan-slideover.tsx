"use client"

import { useTranslations } from "next-intl"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet"
import { QuarterlyPlanEditor } from "@/components/fractal-plan/quarterly-plan-editor"

interface QuarterPlanSlideoverProps {
	open: boolean
	onOpenChange: (_next: boolean) => void
	quarterLabel: string
	quarterlyPlanId: string
	existing: {
		goalCents: number | null
		reflectionNotes: string | null
		postMortemNotes: string | null
	}
}

const QuarterPlanSlideover = ({
	open,
	onOpenChange,
	quarterLabel,
	quarterlyPlanId,
	existing,
}: QuarterPlanSlideoverProps) => {
	const t = useTranslations("plan.slideovers")
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				id={`quarter-slideover-${quarterlyPlanId}`}
				side="right"
				className="flex w-full flex-col overflow-hidden border-l px-0 pt-0 pb-0 sm:max-w-xl"
			>
				<SheetHeader className="border-bg-300 px-m-400 py-s-300 border-b">
					<SheetTitle>{t("quarterlyTitle", { quarterLabel })}</SheetTitle>
					<SheetDescription>{t("quarterlyDescription")}</SheetDescription>
				</SheetHeader>
				<div className="px-m-400 py-m-400 flex-1 overflow-y-auto">
					<QuarterlyPlanEditor
						quarterlyPlanId={quarterlyPlanId}
						existing={existing}
					/>
				</div>
			</SheetContent>
		</Sheet>
	)
}

export { QuarterPlanSlideover }
export type { QuarterPlanSlideoverProps }
