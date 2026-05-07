"use client"

import { useTranslations } from "next-intl"
import type { EconomicEvent, EventImpact } from "@/types/market"
import { cn } from "@/lib/utils"
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table"

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
 * Stable Intl.DateTimeFormat instance — created once at module scope.
 * Always formats in Brazil time (America/Sao_Paulo) regardless of browser timezone.
 */
const EVENT_TIME_FORMATTER = new Intl.DateTimeFormat([], {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "America/Sao_Paulo",
})

/**
 * Formats an ISO date string to Brazil time (HH:MM).
 * Always uses America/Sao_Paulo regardless of the user's browser timezone.
 */
const formatEventTime = (isoDate: string): string => {
	const date = new Date(isoDate)
	if (Number.isNaN(date.getTime())) {
		return isoDate
	}
	return EVENT_TIME_FORMATTER.format(date)
}

const ImpactDot = ({ impact }: { impact: EventImpact }) => {
	const t = useTranslations("market.calendar")
	const label = t(impact)

	return (
		<div className="flex items-center gap-1.5">
			<span
				className={cn(
					"inline-block h-2.5 w-2.5 shrink-0 rounded-full",
					impact === "high" && "bg-fb-error",
					impact === "medium" && "bg-warning",
					impact === "low" && "bg-txt-300"
				)}
				aria-hidden="true"
			/>
			{/* Always present for screen readers; visually shown from sm up */}
			<span className="text-tiny text-txt-300 sr-only sm:not-sr-only">
				{label}
			</span>
		</div>
	)
}

export const EconomicCalendar = ({ events }: EconomicCalendarProps) => {
	const t = useTranslations("market.calendar")

	return (
		<div className="border-bg-300 bg-bg-200 flex h-full flex-col overflow-hidden rounded-lg border">
			{/* Fixed header */}
			<div className="border-bg-300 px-m-400 py-s-300 flex shrink-0 justify-between border-b">
				<h3 className="text-small text-txt-100 font-semibold">{t("title")}</h3>
				<span className="text-txt-300 text-small">{t("timezone")}</span>
			</div>

			{events.length === 0 ? (
				<div className="text-small text-txt-300 px-m-400 py-l-700 flex flex-1 items-center justify-center text-center">
					{t("noEvents")}
				</div>
			) : (
				<div className="min-h-0 w-full flex-1 overflow-y-auto">
					<Table className="w-full" role="table" aria-label={t("title")}>
						<TableHeader className="bg-bg-200 sticky top-0 z-10">
							<TableRow className="text-tiny text-txt-300 border-bg-300/50 border-b">
								<TableHead className="px-m-400 py-s-200 text-left font-medium">
									{t("time")}
								</TableHead>
								<TableHead className="px-s-300 py-s-200 hidden text-left font-medium sm:table-cell">
									{t("country")}
								</TableHead>
								<TableHead className="px-s-300 py-s-200 text-left font-medium">
									{t("event")}
								</TableHead>
								<TableHead className="px-s-300 py-s-200 hidden text-left font-medium sm:table-cell">
									{t("impact")}
								</TableHead>
								<TableHead className="px-s-300 py-s-200 text-right font-medium">
									{t("actual")}
								</TableHead>
								<TableHead className="px-s-300 py-s-200 hidden text-right font-medium sm:table-cell">
									{t("forecast")}
								</TableHead>
								<TableHead className="px-m-400 py-s-200 hidden text-right font-medium sm:table-cell">
									{t("previous")}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{events.map((event) => (
								<TableRow
									key={event.id}
									className="border-bg-300/50 hover:bg-bg-300/30 border-b transition-colors last:border-b-0"
								>
									<TableCell className="text-small text-txt-100 px-m-400 py-2.5 whitespace-nowrap">
										{formatEventTime(event.time)}
									</TableCell>
									<TableCell className="px-s-300 hidden py-2.5 sm:table-cell">
										<span className="text-body" aria-label={event.country}>
											{COUNTRY_FLAGS[event.country] || event.country}
										</span>
									</TableCell>
									<TableCell className="text-small text-txt-100 px-s-300 max-w-[150px] truncate py-2.5 sm:max-w-none">
										{event.event}
									</TableCell>
									<TableCell className="px-s-300 hidden py-2.5 sm:table-cell">
										<ImpactDot impact={event.impact} />
									</TableCell>
									<TableCell
										className={cn(
											"text-small px-s-300 py-2.5 text-right whitespace-nowrap",
											event.actual ? "text-txt-100" : "text-txt-300"
										)}
									>
										{event.actual || "—"}
									</TableCell>
									<TableCell className="text-small text-txt-200 px-s-300 hidden py-2.5 text-right whitespace-nowrap sm:table-cell">
										{event.forecast || "—"}
									</TableCell>
									<TableCell className="text-small text-txt-300 px-m-400 hidden py-2.5 text-right whitespace-nowrap sm:table-cell">
										{event.previous || "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	)
}
