import { useTranslations } from "next-intl"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"

interface CapitalProvenanceBadgeProps {
	isRealCarryForward: boolean
}

const CapitalProvenanceBadge = ({
	isRealCarryForward,
}: CapitalProvenanceBadgeProps) => {
	const t = useTranslations("plan.capital")

	if (isRealCarryForward) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="bg-trade-buy/15 text-micro text-trade-buy px-s-200 inline-flex items-center rounded-md py-px tracking-wide uppercase">
						{t("realCarryForward")}
					</span>
				</TooltipTrigger>
				<TooltipContent
					id="tooltip-capital-real-carry-forward"
					side="top"
					className="text-tiny max-w-xs"
				>
					{t("realCarryForwardTooltip")}
				</TooltipContent>
			</Tooltip>
		)
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="bg-txt-300/15 text-micro text-txt-300 px-s-200 inline-flex items-center rounded-md py-px tracking-wide uppercase">
					{t("snapshotFallback")}
				</span>
			</TooltipTrigger>
			<TooltipContent
				id="tooltip-capital-snapshot-fallback"
				side="top"
				className="text-tiny max-w-xs"
			>
				{t("snapshotFallbackTooltip")}
			</TooltipContent>
		</Tooltip>
	)
}

export { CapitalProvenanceBadge }
export type { CapitalProvenanceBadgeProps }
