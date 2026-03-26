"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { recalculateAllTradesPnL } from "@/app/actions/trades"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export const RecalculatePnLButton = () => {
	const t = useTranslations("settings.general")
	const tOverlay = useTranslations("overlay")
	const { showLoading, hideLoading } = useLoadingOverlay()
	const [isPending, startTransition] = useTransition()
	const [result, setResult] = useState<{
		message: string
		status: "success" | "error"
	} | null>(null)

	const handleRecalculate = () => {
		setResult(null)
		showLoading({ message: tOverlay("recalculatingPnL") })
		startTransition(async () => {
			const response = await recalculateAllTradesPnL()
			hideLoading()
			setResult({
				message: response.message,
				status: response.status,
			})
		})
	}

	return (
		<div className="space-y-m-400">
			<Button
				id="recalculate-pnl"
				type="button"
				onClick={handleRecalculate}
				disabled={isPending}
				aria-label={t("recalculatePnLButton")}
				className="bg-acc-100 px-m-400 py-s-200 text-small font-medium text-bg-100"
			>
				{isPending ? t("recalculatingPnL") : t("recalculatePnLButton")}
			</Button>
			{result && (
				<p
					className={cn(
						"text-small",
						result.status === "success" ? "text-trade-buy" : "text-trade-sell"
					)}
				>
					{result.message}
				</p>
			)}
		</div>
	)
}
