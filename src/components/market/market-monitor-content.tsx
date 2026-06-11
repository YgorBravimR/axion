"use client"

import {
	useState,
	useEffect,
	useCallback,
	useRef,
	useMemo,
	type KeyboardEvent,
} from "react"
import { useTranslations } from "next-intl"
import { Activity, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
	QuoteGroup,
	EconomicEvent,
	MarketQuote,
	QuotesResponse,
	CalendarResponse,
} from "@/types/market"
import type { ActionResponse } from "@/types"
import { HERO_SYMBOLS, getCompanionSymbols } from "@/lib/market/registry"
import { QuoteCard } from "./quote-row"
import { HeroQuoteCard } from "./hero-quote-card"
import { EconomicCalendar } from "./economic-calendar"
import {
	MarketStatusPanel,
	HEADER_MARKET_IDS,
	computeMarketStatuses,
	type MarketStatus,
} from "./market-status-panel"

const REFRESH_INTERVAL_MS = 60_000

const formatTime = (isoString: string): string => {
	const date = new Date(isoString)
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	})
}

export const MarketMonitorContent = () => {
	const t = useTranslations("market")
	// Hold a stable ref to `t` so fetchData has no deps and never re-creates,
	// preventing the double initial fetch caused by useEffect re-running when
	// fetchData changes identity between renders.
	const tRef = useRef(t)
	tRef.current = t

	// ── Data state ───────────────────────────────────────────────────────────
	const [groups, setGroups] = useState<QuoteGroup[]>([])
	const [companions, setCompanions] = useState<Record<string, MarketQuote>>({})
	const [events, setEvents] = useState<EconomicEvent[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [lastUpdated, setLastUpdated] = useState<string | null>(null)
	const isFirstLoad = useRef(true)

	// ── UI state ─────────────────────────────────────────────────────────────
	const [activeTab, setActiveTab] = useState("trader")
	const [marketStatuses, setMarketStatuses] = useState<MarketStatus[]>([])

	// ── B3 → ADR symbol mapping ──────────────────────────────────────────────
	const companionSymbols = useMemo(() => getCompanionSymbols(), [])

	// ── Derived data ─────────────────────────────────────────────────────────

	// H19: O(1) lookup map for market statuses keyed by id
	const marketStatusMap = useMemo(
		() => new Map(marketStatuses.map((s) => [s.id, s])),
		[marketStatuses]
	)

	const heroQuotes = useMemo(() => {
		const allQuotes = groups.flatMap((g) => g.quotes)
		return HERO_SYMBOLS.map((symbol) =>
			allQuotes.find((q) => q.symbol === symbol)
		).filter((q): q is MarketQuote => q !== undefined)
	}, [groups])

	const activeGroup = useMemo(
		() => groups.find((g) => g.id === activeTab),
		[groups, activeTab]
	)

	// ── Data fetching ────────────────────────────────────────────────────────
	const fetchData = useCallback(async () => {
		try {
			const [quotesRes, calendarRes] = await Promise.allSettled([
				fetch("/api/market/quotes"),
				fetch("/api/market/calendar"),
			])

			let quotesSucceeded = false
			let calendarSucceeded = false

			if (quotesRes.status === "fulfilled" && quotesRes.value.ok) {
				const quotesJson =
					(await quotesRes.value.json()) as ActionResponse<QuotesResponse>
				if (quotesJson.status === "success" && quotesJson.data) {
					setGroups(quotesJson.data.groups)
					setCompanions(quotesJson.data.companions ?? {})
					setLastUpdated(quotesJson.data.lastUpdated)
					quotesSucceeded = true
				}
			}

			if (calendarRes.status === "fulfilled" && calendarRes.value.ok) {
				const calendarJson =
					(await calendarRes.value.json()) as ActionResponse<CalendarResponse>
				if (calendarJson.status === "success" && calendarJson.data) {
					setEvents(calendarJson.data.events)
					calendarSucceeded = true
					if (!quotesSucceeded && calendarJson.data.lastUpdated) {
						setLastUpdated(calendarJson.data.lastUpdated)
					}
				}
			}

			if (!quotesSucceeded && !calendarSucceeded && isFirstLoad.current) {
				setError(tRef.current("quote.error"))
			}

			if (quotesSucceeded || calendarSucceeded) {
				setError(null)
			}
		} catch (err) {
			console.error("[MarketMonitor] poll failed", err)
			if (isFirstLoad.current) {
				setError(tRef.current("quote.error"))
			}
		} finally {
			if (isFirstLoad.current) {
				isFirstLoad.current = false
				setIsLoading(false)
			}
		}
	}, [])

	// Refs to hold interval IDs so the visibility handler can clear/restart them
	const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const startIntervals = useCallback(() => {
		if (!pollIntervalRef.current) {
			pollIntervalRef.current = setInterval(() => {
				void fetchData()
			}, REFRESH_INTERVAL_MS)
		}
		if (!statusIntervalRef.current) {
			statusIntervalRef.current = setInterval(() => {
				setMarketStatuses(computeMarketStatuses())
			}, 60_000)
		}
	}, [fetchData])

	const stopIntervals = useCallback(() => {
		if (pollIntervalRef.current) {
			clearInterval(pollIntervalRef.current)
			pollIntervalRef.current = null
		}
		if (statusIntervalRef.current) {
			clearInterval(statusIntervalRef.current)
			statusIntervalRef.current = null
		}
	}, [])

	// Initial fetch
	useEffect(() => {
		void fetchData()
	}, [fetchData])

	// Start intervals and pause/resume based on tab visibility
	useEffect(() => {
		setMarketStatuses(computeMarketStatuses())
		startIntervals()

		const handleVisibilityChange = () => {
			if (document.hidden) {
				stopIntervals()
			} else {
				setMarketStatuses(computeMarketStatuses())
				startIntervals()
			}
		}

		document.addEventListener("visibilitychange", handleVisibilityChange)

		return () => {
			stopIntervals()
			document.removeEventListener("visibilitychange", handleVisibilityChange)
		}
	}, [startIntervals, stopIntervals])

	const handleRefresh = fetchData
	const handleTabChange = useCallback(
		(tabId: string) => setActiveTab(tabId),
		[]
	)

	const handleTabListKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
				return
			}
			const ids = groups.map((g) => g.id)
			const currentIndex = ids.indexOf(activeTab)
			if (currentIndex === -1) {
				return
			}
			const nextIndex =
				event.key === "ArrowRight"
					? (currentIndex + 1) % ids.length
					: (currentIndex - 1 + ids.length) % ids.length
			const nextId = ids[nextIndex]
			if (nextId) {
				setActiveTab(nextId)
				document.getElementById(`market-tab-${nextId}`)?.focus()
			}
		},
		[groups, activeTab]
	)

	// ── Loading state ────────────────────────────────────────────────────────
	if (isLoading && groups.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20">
				<Activity
					className="text-acc-100 mb-m-400 h-8 w-8 animate-pulse motion-reduce:animate-none"
					aria-hidden="true"
				/>
				<p className="text-small text-txt-200">{t("quote.loading")}</p>
			</div>
		)
	}

	// ── Error state ──────────────────────────────────────────────────────────
	if (error && groups.length === 0 && events.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20">
				<p className="text-small text-fb-error mb-s-200">{error}</p>
				<Button
					id="market-refresh-error"
					type="button"
					variant="ghost"
					size="sm"
					onClick={handleRefresh}
					className="text-acc-100 inline-flex items-center gap-1.5"
					aria-label={t("refreshNow")}
				>
					<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
					{t("refreshNow")}
				</Button>
			</div>
		)
	}

	return (
		<div className="space-y-m-400 sm:space-y-m-500">
			{/* ── Header ──────────────────────────────────────────────────────── */}
			<div>
				<div className="gap-y-s-200 flex flex-wrap items-center justify-between gap-x-2 sm:gap-x-4">
					<h1 className="text-h3 sm:text-h2 text-txt-100 font-semibold">
						{t("title")}
					</h1>
					<div className="gap-m-400 flex items-center">
						{/* Inline market status dots */}
						{marketStatuses.length > 0 ? (
							<div className="gap-s-300 flex items-center">
								{HEADER_MARKET_IDS.map((id) => {
									const status = marketStatusMap.get(id)
									if (!status) {
										return null
									}
									return (
										<span
											key={id}
											className="text-tiny flex items-center gap-1.5"
										>
											<span
												className={cn(
													"h-1.5 w-1.5 rounded-full",
													status.state === "open" && "bg-fb-success",
													status.state === "opening" &&
														"bg-warning animate-pulse motion-reduce:animate-none",
													status.state === "closed" && "bg-txt-300/40"
												)}
												aria-hidden="true"
											/>
											<span className="text-txt-200">
												{t(`status.${id}`)}:{" "}
												<span
													className={cn(
														"font-medium",
														status.state === "open" && "text-fb-success",
														status.state === "opening" && "text-warning",
														status.state === "closed" && "text-txt-300"
													)}
												>
													{t(`status.${status.state}`)}
												</span>
											</span>
										</span>
									)
								})}
							</div>
						) : null}

						{/* Last updated */}
						{lastUpdated ? (
							<div className="gap-s-200 flex items-center">
								<span className="text-tiny text-txt-300">
									{t("lastUpdated")}: {formatTime(lastUpdated)}
								</span>
								<Button
									id="market-refresh"
									type="button"
									variant="ghost"
									size="icon"
									onClick={handleRefresh}
									className="text-txt-300"
									aria-label={t("refreshNow")}
								>
									<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
								</Button>
							</div>
						) : null}
					</div>
				</div>
				<p className="text-small text-txt-200 mt-s-100">{t("subtitle")}</p>
			</div>

			{/* ── Hero quote cards ────────────────────────────────────────────── */}
			{heroQuotes.length > 0 ? (
				<div className="relative">
					<div
						className="gap-s-300 pb-s-100 flex scrollbar-none overflow-x-auto"
						role="list"
						aria-label={t("assets")}
					>
						{heroQuotes.map((quote) => (
							<HeroQuoteCard key={quote.symbol} quote={quote} />
						))}
					</div>
					{/* Right-side fade gradient — indicates more content on scroll */}
					<div
						className="from-bg-100 pointer-events-none absolute top-0 right-0 bottom-1 w-8 bg-gradient-to-l to-transparent"
						aria-hidden="true"
					/>
				</div>
			) : null}

			{/* ── Info panels — Calendar + Market Status, same height ──────────── */}
			<div className="gap-s-300 sm:gap-m-400 grid min-h-[22rem] grid-cols-1 grid-rows-[1fr] items-stretch lg:h-[22rem] lg:grid-cols-[1fr_340px] lg:overflow-hidden">
				<div className="min-h-0 lg:overflow-y-auto">
					<EconomicCalendar events={events} />
				</div>
				<div className="min-h-0 lg:overflow-y-auto">
					<MarketStatusPanel statuses={marketStatuses} />
				</div>
			</div>

			{/* ── Tabbed asset panel — full width ─────────────────────────────── */}
			<div className="border-bg-300 bg-bg-200 overflow-hidden rounded-lg border">
				{/* Tab bar */}
				<div className="relative">
					<div
						className="border-bg-300 gap-s-100 px-s-300 py-s-200 flex items-center overflow-x-auto border-b"
						role="tablist"
						tabIndex={0}
						onKeyDown={handleTabListKeyDown}
					>
						{groups.map((group) => (
							<button
								key={group.id}
								id={`market-tab-${group.id}`}
								type="button"
								onClick={() => handleTabChange(group.id)}
								className={cn(
									"text-tiny px-s-300 py-s-200 min-h-[44px] min-w-[44px] shrink-0 rounded-md font-medium transition-colors",
									activeTab === group.id
										? "bg-acc-100 text-bg-100"
										: "text-txt-300 hover:text-txt-100 hover:bg-bg-300/50"
								)}
								aria-selected={activeTab === group.id}
								aria-controls={`market-tabpanel-${group.id}`}
								role="tab"
								tabIndex={activeTab === group.id ? 0 : -1}
							>
								{t(group.labelKey)}
							</button>
						))}
					</div>
					<div className="from-bg-200 pointer-events-none absolute top-0 right-0 bottom-0 w-8 bg-linear-to-l to-transparent sm:hidden" />
				</div>

				{/* Tab content */}
				<div
					id={`market-tabpanel-${activeTab}`}
					className="p-s-200"
					role="tabpanel"
					aria-labelledby={`market-tab-${activeTab}`}
				>
					{activeGroup && activeGroup.quotes.length > 0 ? (
						<div
							className="gap-s-100 flex flex-col"
							role="list"
							aria-label={t(activeGroup.labelKey)}
						>
							{activeGroup.quotes.map((quote) => {
								const isB3Tab = activeTab === "b3"
								const adrSymbol = isB3Tab
									? companionSymbols.get(quote.symbol)
									: undefined
								const adrQuote = adrSymbol ? companions[adrSymbol] : undefined

								return (
									<QuoteCard
										key={quote.symbol}
										quote={quote}
										showAdr={isB3Tab}
										adrQuote={adrQuote}
									/>
								)
							})}
						</div>
					) : (
						<div className="flex flex-col items-center justify-center py-10">
							<Activity
								className="text-txt-300 mb-s-300 h-5 w-5"
								aria-hidden="true"
							/>
							<p className="text-small text-txt-300">{t("quote.emptyGroup")}</p>
							<Button
								id="market-refresh-empty"
								type="button"
								variant="ghost"
								size="sm"
								onClick={handleRefresh}
								className="text-tiny text-acc-100 mt-s-200 gap-s-100 inline-flex items-center"
								aria-label={t("refreshNow")}
							>
								<RefreshCw className="h-3 w-3" aria-hidden="true" />
								{t("refreshNow")}
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
