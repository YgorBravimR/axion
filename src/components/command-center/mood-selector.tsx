"use client"

import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import type { MoodType } from "@/lib/validations/command-center"

interface MoodSelectorProps {
	value: MoodType | null | undefined
	onChange: (_mood: MoodType) => void
	disabled?: boolean
}

interface MoodOption {
	value: MoodType
	labelKey: string
	tone: "positive" | "neutral" | "negative"
}

const moods: MoodOption[] = [
	{ value: "focused", labelKey: "focused", tone: "positive" },
	{ value: "neutral", labelKey: "neutral", tone: "neutral" },
	{ value: "distracted", labelKey: "distracted", tone: "negative" },
	{ value: "risk_off", labelKey: "risk_off", tone: "negative" },
]

const TONE_INDICATOR: Record<MoodOption["tone"], string> = {
	positive: "bg-trade-buy",
	neutral: "bg-txt-300",
	negative: "bg-trade-sell",
}

export const MoodSelector = ({
	value,
	onChange,
	disabled = false,
}: MoodSelectorProps) => {
	const t = useTranslations("commandCenter.notes.moods")

	return (
		<div
			role="radiogroup"
			aria-label={t("ariaLabel")}
			className="gap-s-100 border-bg-300 bg-bg-100 p-s-100 inline-flex w-full flex-wrap items-stretch rounded-md border"
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
							"gap-s-200 px-s-300 py-s-200 text-small relative flex flex-1 items-center justify-center rounded-sm font-medium transition-colors",
							"text-txt-200 hover:text-txt-100 hover:bg-bg-200",
							"focus-visible:ring-acc-100/40 focus-visible:ring-2 focus-visible:outline-none",
							isActive && "bg-bg-200 text-txt-100",
							disabled && "cursor-not-allowed opacity-50"
						)}
					>
						<span
							aria-hidden="true"
							className={cn(
								"h-1.5 w-1.5 rounded-full transition-opacity",
								TONE_INDICATOR[mood.tone],
								isActive ? "opacity-100" : "opacity-50"
							)}
						/>
						<span>{t(mood.labelKey)}</span>
					</button>
				)
			})}
		</div>
	)
}
