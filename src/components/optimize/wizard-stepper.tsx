"use client"

import { useTranslations } from "next-intl"
import { Check } from "lucide-react"

interface WizardStepDef {
	key: string
	labelKey: string
}

interface WizardStepperProps {
	steps: WizardStepDef[]
	activeStep: string
	completedSteps: Set<string>
	onStepClick: (stepKey: string) => void
}

const WizardStepper = ({ steps, activeStep, completedSteps, onStepClick }: WizardStepperProps) => {
	const t = useTranslations("optimize")

	const activeIndex = steps.findIndex((s) => s.key === activeStep)

	return (
		<nav aria-label="Optimization wizard" className="flex items-center justify-center">
			{steps.map((step, index) => {
				const isCompleted = completedSteps.has(step.key)
				const isActive = step.key === activeStep
				const isPast = index < activeIndex
				const isClickable = isCompleted || isPast || isActive

				return (
					<div key={step.key} className="flex items-center">
						<button
							type="button"
							onClick={() => isClickable && onStepClick(step.key)}
							disabled={!isClickable}
							className={`group flex flex-col items-center gap-s-100 ${
								isClickable ? "cursor-pointer" : "cursor-default opacity-50"
							}`}
							aria-current={isActive ? "step" : undefined}
							aria-label={`${t(step.labelKey)} — ${
								isActive ? t("wizard.stepStatusCurrent") : isCompleted ? t("wizard.stepStatusCompleted") : t("wizard.stepStatusUpcoming")
							}`}
							tabIndex={isClickable ? 0 : -1}
						>
							{/* Circle */}
							<div
								className={`flex h-8 w-8 items-center justify-center rounded-full text-small font-semibold transition-colors ${
									isActive
										? "bg-acc-100 text-bg-100"
										: isCompleted
											? "bg-trade-buy/20 text-trade-buy"
											: "bg-bg-300 text-txt-300"
								} ${isClickable && !isActive ? "group-hover:ring-acc-100/40 group-hover:ring-2" : ""}`}
							>
								{isCompleted && !isActive ? (
									<Check className="h-4 w-4" />
								) : (
									index + 1
								)}
							</div>
							{/* Label — hidden on very small screens */}
							<span
								className={`text-tiny hidden whitespace-nowrap transition-colors sm:block ${
									isActive
										? "text-acc-100 font-medium"
										: isCompleted
											? "text-txt-200"
											: "text-txt-300"
								}`}
							>
								{t(step.labelKey)}
							</span>
						</button>

						{/* Connector line */}
						{index < steps.length - 1 && (
							<div
								className={`mx-s-200 h-px w-10 sm:mx-s-300 sm:w-16 transition-colors ${
									index < activeIndex ? "bg-trade-buy/40" : "bg-bg-300"
								}`}
								aria-hidden="true"
							/>
						)}
					</div>
				)
			})}
		</nav>
	)
}

export { WizardStepper }
export type { WizardStepDef }
