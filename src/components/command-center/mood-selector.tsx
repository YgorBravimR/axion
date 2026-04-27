"use client"

import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import type { MoodType } from "@/lib/validations/command-center"

interface MoodSelectorProps {
	value: MoodType | null | undefined
	onChange: (mood: MoodType) => void
	disabled?: boolean
}

interface MoodOption {
	value: MoodType
	labelKey: string
	tone: "positive" | "neutral" | "negative"
}

const moods: MoodOption[] = [
	{ value: "great", labelKey: "great", tone: "positive" },
	{ value: "good", labelKey: "good", tone: "positive" },
	{ value: "neutral", labelKey: "neutral", tone: "neutral" },
	{ value: "bad", labelKey: "bad", tone: "negative" },
	{ value: "terrible", labelKey: "terrible", tone: "negative" },
]

const TONE_INDICATOR: Record<MoodOption["tone"], string> = {
	positive: "bg-trade-buy",
	neutral: "bg-txt-300",
	negative: "bg-trade-sell",
}

export const MoodSelector = ({ value, onChange, disabled = false }: MoodSelectorProps) => {
	const t = useTranslations("commandCenter.notes.moods")

	return (
		<div
			role="radiogroup"
			aria-label={t("ariaLabel")}
			className="inline-flex w-full flex-wrap items-stretch gap-s-100 rounded-md border border-bg-300 bg-bg-100 p-s-100"
		>
			{moods.map((mood) => {
				const isActive = value === mood.value
				return (
					<button
						key={mood.value}
						type="button"
						role="radio"
						aria-checked={isActive}
						aria-label={t(mood.labelKey)}
						disabled={disabled}
						onClick={() => onChange(mood.value)}
						className={cn(
							"relative flex flex-1 items-center justify-center gap-s-200 rounded-sm px-s-300 py-s-200 text-small font-medium transition-colors",
							"text-txt-200 hover:text-txt-100 hover:bg-bg-200",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-100/40",
							isActive && "bg-bg-200 text-txt-100",
							disabled && "cursor-not-allowed opacity-50",
						)}
					>
						<span
							aria-hidden="true"
							className={cn(
								"h-1.5 w-1.5 rounded-full transition-opacity",
								TONE_INDICATOR[mood.tone],
								isActive ? "opacity-100" : "opacity-50",
							)}
						/>
						<span>{t(mood.labelKey)}</span>
					</button>
				)
			})}
		</div>
	)
}
