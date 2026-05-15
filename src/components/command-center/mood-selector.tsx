"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import {
	SegmentedToggle,
	type SegmentedOption,
} from "@/components/ui/segmented-toggle"
import type { MoodType } from "@/lib/validations/command-center"

interface MoodSelectorProps {
	value: MoodType | null | undefined
	onChange: (_mood: MoodType) => void
	disabled?: boolean
}

interface MoodConfig {
	value: MoodType
	labelKey: string
	tone: "positive" | "neutral" | "negative"
}

const moods: MoodConfig[] = [
	{ value: "focused", labelKey: "focused", tone: "positive" },
	{ value: "neutral", labelKey: "neutral", tone: "neutral" },
	{ value: "distracted", labelKey: "distracted", tone: "negative" },
	{ value: "risk_off", labelKey: "risk_off", tone: "negative" },
]

const TONE_INDICATOR: Record<MoodConfig["tone"], string> = {
	positive: "bg-acc-100",
	neutral: "bg-txt-300",
	negative: "bg-warning",
}

export const MoodSelector = ({
	value,
	onChange,
	disabled = false,
}: MoodSelectorProps) => {
	const t = useTranslations("commandCenter.notes.moods")

	const options = useMemo<SegmentedOption<MoodType>[]>(
		() =>
			moods.map((mood) => ({
				value: mood.value,
				label: (
					<span className="gap-s-200 flex items-center justify-center">
						<span
							aria-hidden="true"
							className={cn(
								"h-1.5 w-1.5 shrink-0 rounded-full",
								TONE_INDICATOR[mood.tone]
							)}
						/>
						<span>{t(mood.labelKey)}</span>
					</span>
				),
			})),
		[t]
	)

	return (
		<SegmentedToggle
			value={value ?? null}
			options={options}
			onChange={onChange}
			disabled={disabled}
			aria-label={t("ariaLabel")}
			className="w-full"
		/>
	)
}
