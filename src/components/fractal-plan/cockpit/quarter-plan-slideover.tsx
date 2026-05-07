"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { QuarterlyPlanEditor } from "@/components/fractal-plan/quarterly-plan-editor"

interface QuarterPlanSlideoverProps {
	open: boolean
	onOpenChange: (next: boolean) => void
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
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				id={`quarter-slideover-${quarterlyPlanId}`}
				side="right"
				className="flex w-full flex-col overflow-hidden border-l px-0 pb-0 pt-0 sm:max-w-xl"
			>
				<SheetHeader className="border-b border-bg-300 px-m-400 py-s-300">
					<SheetTitle>Editar trimestre · {quarterLabel}</SheetTitle>
					<SheetDescription>
						Meta, reflexão e pós-mortem do trimestre. As metas mensais ficam no card do mês.
					</SheetDescription>
				</SheetHeader>
				<div className="flex-1 overflow-y-auto px-m-400 py-m-400">
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
