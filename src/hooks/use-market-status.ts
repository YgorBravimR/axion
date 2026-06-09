"use client"

import { useEffect, useState } from "react"
import {
	computeMarketStatuses,
	type MarketStatus,
} from "@/components/market/market-status-panel"

const POLL_INTERVAL_MS = 60_000

/**
 * Subscribes to the B3 futures market status with a 60s refresh cadence.
 *
 * Returns `null` during SSR and the first render so the server-rendered HTML
 * doesn't try to compute a wall-clock-dependent state — `computeMarketStatuses`
 * relies on `Intl.DateTimeFormat` with timezone info, which is browser-only and
 * would hydrate-mismatch if rendered during SSR.
 */
const useMarketStatus = (id: string = "b3futures"): MarketStatus | null => {
	const [status, setStatus] = useState<MarketStatus | null>(null)

	useEffect(() => {
		const tick = (): void => {
			const found = computeMarketStatuses().find((s) => s.id === id) ?? null
			setStatus(found)
		}
		tick()
		const interval = window.setInterval(tick, POLL_INTERVAL_MS)
		return () => window.clearInterval(interval)
	}, [id])

	return status
}

export { useMarketStatus }
