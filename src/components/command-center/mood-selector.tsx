"use client"

import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import type { MoodType } from "@/lib/validations/command-center"

interface MoodSelectorProps {
	value: MoodType | null | undefined
	onChange: (mood: MoodType) => void
	disabled?: boolean
}

const moods: { value: MoodType; emoji: string; labelKey: string }[] = [
	{ value: "great", emoji: "\u{1F60D}", labelKey: "great" },
	{ value: "good", emoji: "\u{1F60A}", labelKey: "good" },
	{ value: "neutral", emoji: "\u{1F610}", labelKey: "neutral" },
	{ value: "bad", emoji: "\u{1F61E}", labelKey: "bad" },
	{ value: "terrible", emoji: "\u{1F62D}", labelKey: "terrible" },
]

export const MoodSelector = ({ value, onChange, disabled = false }: MoodSelectorProps) => {
	const t = useTranslations("commandCenter.notes.moods")

	return (
		<div className="flex flex-wrap items-center gap-s-200">
			{moods.map((mood) => (
				<button
					key={mood.value}
					type="button"
					onClick={() => onChange(mood.value)}
					disabled={disabled}
					className={cn(
						"flex flex-col items-center gap-s-100 rounded-lg p-s-200 transition-colors",
						"hover:bg-bg-300 focus:outline-none focus:ring-2 focus:ring-accent-primary",
						value === mood.value && "bg-bg-300 ring-2 ring-accent-primary",
						disabled && "cursor-not-allowed opacity-50"
					)}
					aria-label={t(mood.labelKey)}
					aria-pressed={value === mood.value}
				>
					<span className="text-2xl">{mood.emoji}</span>
					<span className="text-tiny text-txt-300">{t(mood.labelKey)}</span>
				</button>
			))}
		</div>
	)
}
