"use client"

import { useTranslations } from "next-intl"
import type { EconomicEvent, EventImpact } from "@/types/market"
import { cn } from "@/lib/utils"

interface EconomicCalendarProps {
	events: EconomicEvent[]
}

const COUNTRY_FLAGS: Record<string, string> = {
	US: "🇺🇸",
	BR: "🇧🇷",
	EU: "🇪🇺",
	CN: "🇨🇳",
}

/**
 * Formats an ISO date string to Brazil time (HH:MM).
 * Always uses America/Sao_Paulo regardless of the user's browser timezone.
 */
const formatEventTime = (isoDate: string): string => {
	const date = new Date(isoDate)
	if (Number.isNaN(date.getTime())) return isoDate

	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "America/Sao_Paulo",
	})
}

const ImpactDot = ({ impact }: { impact: EventImpact }) => {
	const t = useTranslations("market.calendar")

	return (
		<div className="flex items-center gap-1.5" aria-label={t(impact)}>
			<span
				className={cn(
					"inline-block h-2.5 w-2.5 rounded-full",
					impact === "high" && "bg-fb-error",
					impact === "medium" && "bg-warning",
					impact === "low" && "bg-txt-300"
				)}
				aria-hidden="true"
			/>
			<span className="text-tiny text-txt-300 hidden sm:inline">{t(impact)}</span>
		</div>
	)
}

export const EconomicCalendar = ({ events }: EconomicCalendarProps) => {
	const t = useTranslations("market.calendar")

	return (
		<div className="border-bg-300 bg-bg-200 flex h-full flex-col overflow-hidden rounded-lg border">
			{/* Fixed header */}
			<div className="border-bg-300 flex shrink-0 justify-between border-b px-4 py-3">
				<h3 className="text-small text-txt-100 font-semibold">{t("title")}</h3>
				<span className="text-txt-300 text-sm">{t("timezone")}</span>
			</div>

			{events.length === 0 ? (
				<div className="text-small text-txt-300 flex flex-1 items-center justify-center px-4 py-8 text-center">
					{t("noEvents")}
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
					<table className="w-full" role="table" aria-label={t("title")}>
						<thead className="bg-bg-200 sticky top-0 z-10">
							<tr className="text-tiny text-txt-300 border-bg-300/50 border-b">
								<th className="px-4 py-2 text-left font-medium">{t("time")}</th>
								<th className="hidden px-3 py-2 text-left font-medium sm:table-cell">
									{t("country")}
								</th>
								<th className="px-3 py-2 text-left font-medium">
									{t("event")}
								</th>
								<th className="hidden px-3 py-2 text-left font-medium sm:table-cell">
									{t("impact")}
								</th>
								<th className="px-3 py-2 text-right font-medium">
									{t("actual")}
								</th>
								<th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
									{t("forecast")}
								</th>
								<th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
									{t("previous")}
								</th>
							</tr>
						</thead>
						<tbody>
							{events.map((event) => (
								<tr
									key={event.id}
									className="border-bg-300/50 hover:bg-bg-300/30 border-b transition-colors last:border-b-0"
								>
									<td className="text-small text-txt-100 px-4 py-2.5 whitespace-nowrap">
										{formatEventTime(event.time)}
									</td>
									<td className="hidden px-3 py-2.5 sm:table-cell">
										<span className="text-body" aria-label={event.country}>
											{COUNTRY_FLAGS[event.country] || event.country}
										</span>
									</td>
									<td className="text-small text-txt-100 max-w-[200px] truncate px-3 py-2.5 sm:max-w-none">
										{event.event}
									</td>
									<td className="hidden px-3 py-2.5 sm:table-cell">
										<ImpactDot impact={event.impact} />
									</td>
									<td
										className={cn(
											"text-small px-3 py-2.5 text-right whitespace-nowrap",
											event.actual ? "text-txt-100" : "text-txt-300"
										)}
									>
										{event.actual || "—"}
									</td>
									<td className="text-small text-txt-200 hidden px-3 py-2.5 text-right whitespace-nowrap sm:table-cell">
										{event.forecast || "—"}
									</td>
									<td className="text-small text-txt-300 hidden px-4 py-2.5 text-right whitespace-nowrap sm:table-cell">
										{event.previous || "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	)
}
