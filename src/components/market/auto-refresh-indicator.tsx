"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AutoRefreshIndicatorProps {
	intervalSeconds: number
	lastUpdated: string | null
	onRefresh: () => void
	isLoading: boolean
}

export const AutoRefreshIndicator = ({
	intervalSeconds,
	lastUpdated,
	onRefresh,
	isLoading,
}: AutoRefreshIndicatorProps) => {
	const t = useTranslations("market")
	const [secondsLeft, setSecondsLeft] = useState(intervalSeconds)

	const resetCountdown = useCallback(() => {
		setSecondsLeft(intervalSeconds)
	}, [intervalSeconds])

	// Countdown timer
	useEffect(() => {
		const timer = setInterval(() => {
			setSecondsLeft((prev) => {
				if (prev <= 1) {
					return intervalSeconds
				}
				return prev - 1
			})
		}, 1000)

		return () => clearInterval(timer)
	}, [intervalSeconds])

	// Reset countdown when lastUpdated changes (data was refreshed)
	useEffect(() => {
		resetCountdown()
	}, [lastUpdated, resetCountdown])

	const handleRefresh = () => {
		onRefresh()
		resetCountdown()
	}

	const formattedTime = lastUpdated
		? new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
		: "--:--:--"

	return (
		<div className="flex items-center gap-3 text-tiny">
			{/* Pulsing dot */}
			<div className="flex items-center gap-1.5">
				<span
					className={`inline-block h-2 w-2 rounded-full ${
						isLoading ? "animate-pulse bg-warning" : "bg-trade-buy"
					}`}
					aria-hidden="true"
				/>
				<span className="text-txt-200">
					{t("autoRefresh")}: {secondsLeft}s
				</span>
			</div>

			{/* Last updated time */}
			<span className="text-txt-300">
				{t("lastUpdated")}: {formattedTime}
			</span>

			{/* Manual refresh button */}
			<Button
				id="auto-refresh-now"
				type="button"
				variant="ghost"
				size="sm"
				onClick={handleRefresh}
				disabled={isLoading}
				className="text-txt-200 inline-flex items-center gap-1 px-2 py-1"
				aria-label={t("refreshNow")}
			>
				<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
				<span>{t("refreshNow")}</span>
			</Button>
		</div>
	)
}
