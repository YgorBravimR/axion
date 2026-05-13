"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Crosshair } from "lucide-react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

interface HawksDailyCapBannerProps {
	ordinal: number
	cap?: number
}

const HAWKS_DAILY_CAP = 3

const HawksDailyCapBanner = ({
	ordinal,
	cap = HAWKS_DAILY_CAP,
}: HawksDailyCapBannerProps) => {
	const t = useTranslations("hawks.dailyCap")
	const [acknowledged, setAcknowledged] = useState(false)

	if (acknowledged) {
		return (
			<div
				role="alert"
				aria-live="polite"
				className="border-warning/20 bg-warning/5 p-s-300 gap-s-300 flex items-center rounded-lg border"
			>
				<Crosshair
					className="text-warning h-4 w-4 shrink-0"
					aria-hidden="true"
				/>
				<span className="text-small text-warning">
					{t("acknowledgedBadge", { ordinal, cap })}
				</span>
			</div>
		)
	}

	return (
		<div
			role="alert"
			aria-label={t("ariaLabel")}
			className="border-warning/30 bg-warning/5 p-s-300 sm:p-m-400 space-y-s-300 rounded-lg border"
		>
			<div className="gap-s-300 flex items-start">
				<AlertTriangle
					className="text-warning mt-0.5 h-5 w-5 shrink-0"
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1">
					<h3 className="text-small text-txt-100 font-semibold">
						{t("title")}
					</h3>
					<p className="text-tiny text-txt-200 mt-s-100">
						{t("description", { ordinal, cap })}
					</p>
				</div>
				<span
					className={cn(
						"text-micro shrink-0 rounded-sm px-1.5 py-0.5 font-medium",
						ordinal >= cap
							? "bg-destructive/20 text-destructive"
							: "bg-warning/20 text-warning"
					)}
				>
					{ordinal}/{cap}
				</span>
			</div>

			<div className="gap-s-300 pl-m-500 flex items-start">
				<Checkbox
					id="hawks-cap-acknowledge"
					checked={acknowledged}
					onCheckedChange={(checked) => setAcknowledged(checked === true)}
					className="mt-0.5"
				/>
				<label
					htmlFor="hawks-cap-acknowledge"
					className="text-tiny text-txt-200 cursor-pointer"
				>
					{t("acknowledge")}
				</label>
			</div>
		</div>
	)
}

export { HawksDailyCapBanner }
