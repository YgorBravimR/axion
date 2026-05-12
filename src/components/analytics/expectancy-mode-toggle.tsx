"use client"

import { Info } from "lucide-react"
import { useTranslations } from "next-intl"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type ExpectancyMode = "edge" | "capital"

interface ExpectancyModeToggleProps {
	mode: ExpectancyMode
	onModeChange: (_mode: ExpectancyMode) => void
}

const ExpectancyModeToggle = ({
	mode,
	onModeChange,
}: ExpectancyModeToggleProps) => {
	const t = useTranslations("analytics")

	return (
		<div className="gap-s-200 flex items-center">
			<div className="border-bg-300 bg-bg-100 flex rounded-md border">
				<button
					type="button"
					aria-label={t("expectancyEdgeAriaLabel")}
					className={cn(
						"px-s-300 py-s-100 text-tiny rounded-l-md transition-colors",
						mode === "edge"
							? "bg-acc-100 text-bg-100"
							: "text-txt-300 hover:text-txt-100"
					)}
					onClick={() => onModeChange("edge")}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							onModeChange("edge")
						}
					}}
				>
					R
				</button>
				<button
					type="button"
					aria-label={t("expectancyCapitalAriaLabel")}
					className={cn(
						"px-s-300 py-s-100 text-tiny rounded-r-md transition-colors",
						mode === "capital"
							? "bg-acc-100 text-bg-100"
							: "text-txt-300 hover:text-txt-100"
					)}
					onClick={() => onModeChange("capital")}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							onModeChange("capital")
						}
					}}
				>
					$
				</button>
			</div>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={t("expectancyTooltipTitle")}
						className="text-txt-300 hover:text-txt-100 transition-colors"
					>
						<Info className="h-3.5 w-3.5" aria-hidden="true" />
					</button>
				</TooltipTrigger>
				<TooltipContent
					id="tooltip-expectancy-mode"
					side="bottom"
					className="border-bg-300 bg-bg-100 text-txt-200 p-m-400 max-w-sm border shadow-lg"
				>
					<p className="text-small text-txt-100 mb-s-200 font-semibold">
						{t("expectancyTooltipTitle")}
					</p>
					<div className="space-y-s-200 text-tiny">
						<p>
							<span className="text-txt-100 font-semibold">R</span> —{" "}
							{t("expectancyTooltipR")}
						</p>
						<p>
							<span className="text-txt-100 font-semibold">$</span> —{" "}
							{t("expectancyTooltipCapital")}
						</p>
						<p className="text-txt-300 italic">
							{t("expectancyTooltipDiffer")}
						</p>
					</div>
				</TooltipContent>
			</Tooltip>
		</div>
	)
}

export {
	ExpectancyModeToggle,
	type ExpectancyMode,
	type ExpectancyModeToggleProps,
}
