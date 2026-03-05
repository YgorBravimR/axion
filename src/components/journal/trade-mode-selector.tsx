"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Layers, BarChart3 } from "lucide-react"

export type TradeMode = "simple" | "scaled"

interface TradeModeSelectorProps {
	value: TradeMode
	onChange: (mode: TradeMode) => void
	disabled?: boolean
}

export const TradeModeSelector = ({
	value,
	onChange,
	disabled = false,
}: TradeModeSelectorProps) => {
	const t = useTranslations("trade.mode")

	return (
		<div className="space-y-s-200">
			<label className="text-small text-txt-100 font-medium">{t("label")}</label>
			<div className="gap-s-300 grid grid-cols-2">
				<button
					type="button"
					onClick={() => onChange("simple")}
					disabled={disabled}
					className={cn(
						"gap-s-200 p-s-300 sm:p-m-400 flex flex-col items-center rounded-lg border-2 transition-colors",
						value === "simple"
							? "border-brand-500 bg-brand-500/10 text-brand-500"
							: "border-bg-300 text-txt-200 hover:border-brand-500/50",
						disabled && "cursor-not-allowed opacity-50"
					)}
				>
					<BarChart3 className="h-5 w-5" />
					<div className="text-center">
						<p className="text-small font-medium">{t("simple")}</p>
						<p className="text-tiny text-txt-300">{t("simpleDescription")}</p>
					</div>
				</button>
				<button
					type="button"
					onClick={() => onChange("scaled")}
					disabled={disabled}
					className={cn(
						"gap-s-200 p-s-300 sm:p-m-400 flex flex-col items-center rounded-lg border-2 transition-colors",
						value === "scaled"
							? "border-brand-500 bg-brand-500/10 text-brand-500"
							: "border-bg-300 text-txt-200 hover:border-brand-500/50",
						disabled && "cursor-not-allowed opacity-50"
					)}
				>
					<Layers className="h-5 w-5" />
					<div className="text-center">
						<p className="text-small font-medium">{t("scaled")}</p>
						<p className="text-tiny text-txt-300">{t("scaledDescription")}</p>
					</div>
				</button>
			</div>
		</div>
	)
}
