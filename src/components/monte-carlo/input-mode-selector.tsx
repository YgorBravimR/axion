"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

interface InputModeSelectorProps {
	mode: "auto" | "manual"
	onModeChange: (mode: "auto" | "manual") => void
}

export const InputModeSelector = ({
	mode,
	onModeChange,
}: InputModeSelectorProps) => {
	const t = useTranslations("monteCarlo.inputMode")

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
			<h3 className="mb-s-300 text-small text-txt-200 font-medium">
				{t("title")}
			</h3>
			<div className="gap-s-300 flex">
				<button
					type="button"
					onClick={() => onModeChange("auto")}
					aria-pressed={mode === "auto"}
					className={cn(
						"px-m-400 py-s-300 text-small flex-1 rounded-md border font-medium transition-colors",
						mode === "auto"
							? "border-accent-primary bg-accent-primary/10 text-accent-primary"
							: "border-bg-300 bg-bg-100 text-txt-200 hover:border-bg-400"
					)}
				>
					{t("auto")}
				</button>
				<button
					type="button"
					onClick={() => onModeChange("manual")}
					aria-pressed={mode === "manual"}
					className={cn(
						"px-m-400 py-s-300 text-small flex-1 rounded-md border font-medium transition-colors",
						mode === "manual"
							? "border-accent-primary bg-accent-primary/10 text-accent-primary"
							: "border-bg-300 bg-bg-100 text-txt-200 hover:border-bg-400"
					)}
				>
					{t("manual")}
				</button>
			</div>
		</div>
	)
}
