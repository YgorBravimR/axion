"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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

	// Countdown timer — pauses when the tab is hidden
	useEffect(() => {
		const timerRef = { current: null as ReturnType<typeof setInterval> | null }

		const startCountdown = () => {
			if (timerRef.current) return
			timerRef.current = setInterval(() => {
				setSecondsLeft((prev) => (prev <= 1 ? intervalSeconds : prev - 1))
			}, 1000)
		}

		const stopCountdown = () => {
			if (timerRef.current) {
				clearInterval(timerRef.current)
				timerRef.current = null
			}
		}

		const handleVisibilityChange = () => {
			if (document.hidden) {
				stopCountdown()
			} else {
				startCountdown()
			}
		}

		startCountdown()
		document.addEventListener("visibilitychange", handleVisibilityChange)

		return () => {
			stopCountdown()
			document.removeEventListener("visibilitychange", handleVisibilityChange)
		}
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
		<div className="flex items-center gap-s-300 text-tiny">
			{/* Pulsing dot */}
			<div className="flex items-center gap-1.5">
				<span
					className={cn(
						"inline-block h-2 w-2 rounded-full",
						isLoading
							? "animate-pulse motion-reduce:animate-none bg-warning"
							: "bg-trade-buy"
					)}
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
				className="text-txt-200 inline-flex items-center gap-s-100 px-s-200 py-s-100"
				aria-label={t("refreshNow")}
			>
				<RefreshCw
					className={cn(
						"h-3.5 w-3.5",
						isLoading && "animate-spin motion-reduce:animate-none"
					)}
				/>
				<span>{t("refreshNow")}</span>
			</Button>
		</div>
	)
}
