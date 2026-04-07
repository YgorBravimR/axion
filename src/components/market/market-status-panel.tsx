"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { B3TradingCalendar } from "./b3-trading-calendar"

// ── Types ────────────────────────────────────────────────────────────────────

type MarketState = "open" | "closed" | "opening"

export interface MarketStatus {
	id: string
	state: MarketState
	minutesUntilOpen: number | null
}

interface MarketStatusPanelProps {
	statuses: MarketStatus[]
}

type PanelTab = "status" | "calendar" | "links"

interface PanelTabConfig {
	id: PanelTab
	labelKey: string
}

const PANEL_TABS: PanelTabConfig[] = [
	{ id: "status", labelKey: "status.title" },
	{ id: "calendar", labelKey: "tradingCalendar.title" },
	{ id: "links", labelKey: "links.title" },
]

// ── Important links for Brazilian futures traders ────────────────────────────

interface QuickLink {
	emoji: string
	labelKey: string
	url: string
}

const QUICK_LINKS: QuickLink[] = [
	{ emoji: "📅", labelKey: "economicCalendar", url: "https://br.investing.com/economic-calendar" },
	{ emoji: "💱", labelKey: "brlFutures", url: "https://www.cmegroup.com/markets/fx/emerging-market/brazilian-real.quotes.html" },
	{ emoji: "📊", labelKey: "bcbStats", url: "https://www.bcb.gov.br/estatisticas" },
	{ emoji: "🏛️", labelKey: "bcbPortal", url: "https://www.bcb.gov.br/" },
	{ emoji: "📰", labelKey: "infomoney", url: "https://www.infomoney.com.br/mercados/" },
]

// Header-inline status IDs — shown as dots in the page header
export const HEADER_MARKET_IDS = ["b3futures", "b3cash"] as const

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format countdown as "Opens in XXh" — always 2-digit hours, rounded.
 * No minutes shown. Round to nearest hour.
 */
const formatCountdown = (
	minutes: number | null,
	t: ReturnType<typeof useTranslations>
): string => {
	if (minutes === null || minutes <= 0) return ""
	const hours = Math.round(minutes / 60)
	const paddedHours = String(Math.max(hours, 1)).padStart(2, "0")
	return t("status.opensIn", { hours: paddedHours })
}

// ── Component ────────────────────────────────────────────────────────────────

export const MarketStatusPanel = ({ statuses }: MarketStatusPanelProps) => {
	const t = useTranslations("market")
	const [activeTab, setActiveTab] = useState<PanelTab>("status")

	const handleTabChange = (tab: PanelTab) => setActiveTab(tab)

	if (statuses.length === 0) return null

	return (
		<div className="border-bg-300 bg-bg-200 flex h-full flex-col rounded-lg border">
			{/* Tab bar */}
			<div
				className="border-bg-300 flex shrink-0 items-center gap-1 border-b px-3 py-2"
				role="tablist"
			>
				{PANEL_TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => handleTabChange(tab.id)}
						className={cn(
							"text-tiny shrink-0 rounded-md px-3 py-1.5 font-medium transition-colors",
							activeTab === tab.id
								? "bg-acc-100 text-bg-100"
								: "text-txt-300 hover:text-txt-100 hover:bg-bg-300/50"
						)}
						aria-selected={activeTab === tab.id}
						role="tab"
					>
						{t(tab.labelKey)}
					</button>
				))}
			</div>

			{/* Tab content */}
			<div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
				{activeTab === "status" ? (
					<div className="space-y-2.5 p-4">
						{statuses.map((market) => {
							const label = t(`status.${market.id}`)
							const countdown =
								market.state === "closed" && market.minutesUntilOpen
									? formatCountdown(market.minutesUntilOpen, t)
									: ""

							return (
								<div
									key={market.id}
									className="flex items-center justify-between"
									role="status"
									aria-label={`${label}: ${market.state}`}
								>
									<div className="flex items-center gap-2">
										<span
											className={cn(
												"h-2 w-2 rounded-full",
												market.state === "open" && "bg-trade-buy",
												market.state === "opening" &&
													"bg-warning animate-pulse motion-reduce:animate-none",
												market.state === "closed" && "bg-txt-300/40"
											)}
											aria-hidden="true"
										/>
										<span className="text-small text-txt-100">{label}</span>
									</div>
									<div className="flex items-center gap-2">
										{countdown ? (
											<span className="text-tiny text-txt-300">
												{countdown}
											</span>
										) : null}
										{market.state === "open" ? (
											<span className="text-tiny text-trade-buy font-medium">
												{t("status.open")}
											</span>
										) : null}
										{market.state === "opening" ? (
											<span className="text-tiny text-warning font-medium">
												{t("status.opening")}
											</span>
										) : null}
									</div>
								</div>
							)
						})}
					</div>
				) : null}

				{activeTab === "calendar" ? <B3TradingCalendar /> : null}

				{activeTab === "links" ? (
					<div className="flex flex-col gap-1 p-3">
						{QUICK_LINKS.map((link) => (
							<a
								key={link.url}
								href={link.url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-txt-200 hover:bg-bg-300/50 hover:text-txt-100 flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors"
								aria-label={t(`links.${link.labelKey}`)}
							>
								<span className="shrink-0 text-base" aria-hidden="true">
									{link.emoji}
								</span>
								<span className="text-small flex-1">
									{t(`links.${link.labelKey}`)}
								</span>
								<ExternalLink className="text-txt-300 h-3 w-3 shrink-0" aria-hidden="true" />
							</a>
						))}
					</div>
				) : null}
			</div>
		</div>
	)
}

// ── Market Status Computation ────────────────────────────────────────────────

interface TimeInZone {
	hour: number
	minute: number
	dayOfWeek: number
}

const getTimeInZone = (timezone: string): TimeInZone => {
	const now = new Date()
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		hour: "numeric",
		minute: "numeric",
		weekday: "short",
		hour12: false,
	}).formatToParts(now)

	const dayMap: Record<string, number> = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6,
	}

	return {
		hour: parseInt(parts.find((p) => p.type === "hour")?.value ?? "0") % 24,
		minute: parseInt(parts.find((p) => p.type === "minute")?.value ?? "0"),
		dayOfWeek:
			dayMap[parts.find((p) => p.type === "weekday")?.value ?? "Mon"] ?? 1,
	}
}

const isWeekday = (day: number): boolean => day >= 1 && day <= 5

const toMinutes = (h: number, m: number): number => h * 60 + m

const isInRange = (
	hour: number,
	minute: number,
	openHour: number,
	openMinute: number,
	closeHour: number,
	closeMinute: number
): boolean => {
	const current = toMinutes(hour, minute)
	return current >= toMinutes(openHour, openMinute) && current < toMinutes(closeHour, closeMinute)
}

/**
 * Compute minutes until a market opens.
 * If the market opens later today, returns the difference.
 * If the market already closed today or it's a weekend, returns minutes until next weekday open.
 */
const computeMinutesUntilOpen = (
	time: TimeInZone,
	openHour: number,
	openMinute: number,
	closeHour: number,
	closeMinute: number
): number | null => {
	const currentMin = toMinutes(time.hour, time.minute)
	const openMin = toMinutes(openHour, openMinute)
	const closeMin = toMinutes(closeHour, closeMinute)

	// Currently open — no countdown
	if (
		isWeekday(time.dayOfWeek) &&
		currentMin >= openMin &&
		currentMin < closeMin
	) {
		return null
	}

	// Before open today (weekday) — count down to today's open
	if (isWeekday(time.dayOfWeek) && currentMin < openMin) {
		return openMin - currentMin
	}

	// After close today (weekday) — count down to tomorrow's open
	if (isWeekday(time.dayOfWeek) && currentMin >= closeMin) {
		const minutesLeftToday = 24 * 60 - currentMin
		// If Friday after close, add weekend (Sat + Sun = 2 days)
		if (time.dayOfWeek === 5) {
			return minutesLeftToday + 2 * 24 * 60 + openMin
		}
		return minutesLeftToday + openMin
	}

	// Weekend — compute days until Monday
	const daysUntilMonday = time.dayOfWeek === 0 ? 1 : 7 - time.dayOfWeek + 1
	const minutesLeftToday = 24 * 60 - currentMin
	return minutesLeftToday + (daysUntilMonday - 1) * 24 * 60 + openMin
}

const OPENING_THRESHOLD_MINUTES = 5

/**
 * Resolve open/closed/opening state with countdown.
 */
const resolveState = (
	time: TimeInZone,
	openHour: number,
	openMinute: number,
	closeHour: number,
	closeMinute: number
): { state: MarketState; minutesUntilOpen: number | null } => {
	const minutesUntilOpen = computeMinutesUntilOpen(
		time,
		openHour,
		openMinute,
		closeHour,
		closeMinute
	)

	if (minutesUntilOpen === null) {
		return { state: "open", minutesUntilOpen: null }
	}

	if (minutesUntilOpen <= OPENING_THRESHOLD_MINUTES && minutesUntilOpen > 0) {
		return { state: "opening", minutesUntilOpen }
	}

	return { state: "closed", minutesUntilOpen }
}

/**
 * Computes the current open/closed/opening status for markets relevant to Brazilian traders.
 * Uses Intl.DateTimeFormat for timezone-aware checks — no hardcoded UTC offsets.
 */
export const computeMarketStatuses = (): MarketStatus[] => {
	const sp = getTimeInZone("America/Sao_Paulo")
	const ny = getTimeInZone("America/New_York")
	const ct = getTimeInZone("America/Chicago")
	const ldn = getTimeInZone("Europe/London")
	const tky = getTimeInZone("Asia/Tokyo")

	// B3 Futuros: Mon-Fri 09:00-17:55 BRT
	const b3futures = resolveState(sp, 9, 0, 17, 55)

	// B3 A Vista: Mon-Fri 10:00-17:00 BRT
	const b3cash = resolveState(sp, 10, 0, 17, 0)

	// NYSE/NASDAQ: Mon-Fri 9:30-16:00 ET
	const nyse = resolveState(ny, 9, 30, 16, 0)

	// London (LSE): Mon-Fri 8:00-16:30 GMT/BST
	const london = resolveState(ldn, 8, 0, 16, 30)

	// Tokyo (TSE): Mon-Fri 9:00-15:00 JST
	const tokyo = resolveState(tky, 9, 0, 15, 0)

	// CME Globex: complex overnight schedule — Sun 17:00 CT → Fri 16:00 CT, daily break 16:00-17:00 CT
	const cmeIsOpen = (() => {
		if (ct.dayOfWeek === 6) return false
		if (ct.dayOfWeek === 0) return ct.hour >= 17
		if (ct.dayOfWeek === 5) return ct.hour < 16
		return !isInRange(ct.hour, ct.minute, 16, 0, 17, 0)
	})()

	// Forex: Sun 17:00 ET → Fri 17:00 ET (24/5)
	const forexIsOpen = (() => {
		if (ny.dayOfWeek === 6) return false
		if (ny.dayOfWeek === 0) return ny.hour >= 17
		if (ny.dayOfWeek === 5) return ny.hour < 17
		return true
	})()

	return [
		{ id: "b3futures", ...b3futures },
		{ id: "b3cash", ...b3cash },
		{ id: "nyse", ...nyse },
		{
			id: "cme",
			state: cmeIsOpen ? "open" : "closed",
			minutesUntilOpen: cmeIsOpen
				? null
				: computeMinutesUntilOpen(ct, 17, 0, 16, 0),
		},
		{ id: "london", ...london },
		{ id: "tokyo", ...tokyo },
		{
			id: "forex",
			state: forexIsOpen ? "open" : "closed",
			minutesUntilOpen: null,
		},
	]
}
