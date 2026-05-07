"use client"

import { useTranslations } from "next-intl"
import { Lightbulb } from "lucide-react"
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip"
import { usePageGuide } from "./page-guide-provider"

/**
 * Header-level trigger for the page guide. Reads registeredConfig from context.
 * Only renders when a page has registered a guide via useRegisterPageGuide.
 */
const PageGuideTrigger = () => {
	const t = useTranslations("pageGuide")
	const { startGuide, registeredConfig } = usePageGuide()

	if (!registeredConfig) {
		return null
	}

	const handleClick = () => {
		startGuide(registeredConfig)
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleClick}
					aria-label={t("triggerLabel")}
					className="bg-guide/15 group focus-visible:ring-guide relative flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200 hover:scale-110 focus-visible:ring-2 focus-visible:outline-none"
				>
					{/* Glow backdrop */}
					<span
						className="bg-guide/40 absolute inset-0 rounded-md opacity-0 transition-opacity duration-200 group-hover:opacity-100"
						aria-hidden="true"
					/>
					<Lightbulb className="text-guide group-hover:text-guide relative h-[18px] w-[18px] transition-colors duration-200" />
				</button>
			</TooltipTrigger>
			<TooltipContent id="page-guide-tooltip" side="bottom">
				{t("triggerLabel")}
			</TooltipContent>
		</Tooltip>
	)
}

export { PageGuideTrigger }
