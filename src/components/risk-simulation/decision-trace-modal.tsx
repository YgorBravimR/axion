"use client"

import { useTranslations } from "next-intl"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { ColoredValue } from "@/components/shared/colored-value"
import { fromCents } from "@/lib/money"
import { DayTraceCard } from "./day-trace-card"
import type { WeekTrace } from "@/types/risk-simulation"

interface DecisionTraceModalProps {
	open: boolean
	onOpenChange: (_open: boolean) => void
	weeks: WeekTrace[]
}

const DecisionTraceModal = ({
	open,
	onOpenChange,
	weeks,
}: DecisionTraceModalProps) => {
	const t = useTranslations("riskSimulation.trace")

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				id="risk-sim-trace-sheet"
				side="right"
				className="bg-bg-100 border-bg-300 px-m-400 pt-m-400 pb-m-500 w-full overflow-y-auto border-l sm:max-w-2xl"
				aria-describedby={undefined}
			>
				<SheetHeader className="mb-m-400">
					<SheetTitle className="text-body sm:text-h3 text-txt-100">
						{t("title")}
					</SheetTitle>
				</SheetHeader>

				{open && (
					<div className="space-y-m-400 sm:space-y-m-500">
						{weeks.map((week) => (
							<div key={week.weekKey}>
								{/* Week header */}
								<div className="bg-bg-200 mb-s-300 sticky top-0 z-10 flex items-center justify-between">
									<h3 className="text-small text-txt-100 font-semibold">
										{t("weekOf", { label: week.weekLabel })}
									</h3>
									<ColoredValue
										value={fromCents(week.weekPnlCents)}
										type="currency"
										showSign
										size="sm"
									/>
								</div>

								{/* Day cards */}
								<div className="space-y-s-300">
									{week.days.map((day) => (
										<DayTraceCard key={day.dayKey} day={day} />
									))}
								</div>
							</div>
						))}

						{weeks.length === 0 && (
							<p className="text-small text-txt-300 py-l-700 text-center">
								{t("noData")}
							</p>
						)}
					</div>
				)}
			</SheetContent>
		</Sheet>
	)
}

export { DecisionTraceModal }
