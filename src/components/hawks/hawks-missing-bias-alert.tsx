"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { CheckCircle2 } from "lucide-react"
import { DailyBiasForm } from "./daily-bias-form"
import type { DailyHawksBias } from "@/db/schema"

interface HawksMissingBiasAlertProps {
	tradingDay: string
	initialBias: DailyHawksBias | null
}

const HawksMissingBiasAlert = ({
	tradingDay,
	initialBias,
}: HawksMissingBiasAlertProps) => {
	const t = useTranslations("hawks.missingBias")
	const [succeeded, setSucceeded] = useState(false)

	return (
		<div role="alert" aria-label={t("ariaLabel")}>
			{succeeded ? (
				<div className="border-bg-300 border-l-acc-100 bg-bg-200 p-m-400 gap-s-300 flex items-center rounded-lg border border-l-4">
					<CheckCircle2
						className="text-acc-100 h-5 w-5 shrink-0"
						aria-hidden="true"
					/>
					<p className="text-small text-txt-100 font-medium">
						{t("successMessage")}
					</p>
				</div>
			) : (
				<DailyBiasForm
					tradingDay={tradingDay}
					initialBias={initialBias}
					className="border-l-acc-100 border-l-4"
					onSuccess={() => setSucceeded(true)}
				/>
			)}
		</div>
	)
}

export { HawksMissingBiasAlert }
