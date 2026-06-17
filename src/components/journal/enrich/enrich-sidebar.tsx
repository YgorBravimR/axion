"use client"

import { useMemo } from "react"
import type { DryRunSnapshotHydrated } from "@/app/actions/enrichment.types"
import { formatTimeForReview, getStatusIcon } from "@/lib/enrichment/ui-helpers"

interface EnrichSidebarProps {
	snapshots: DryRunSnapshotHydrated[]
	currentIndex: number
	onSelect: (_index: number) => void
}

interface DayGroup {
	date: string // ISO date string (BRT local)
	trades: Array<{
		index: number
		timestamp: string // HH:mm format
		status: "draft" | "committed" | "abandoned"
	}>
}

/**
 * Sidebar for the enrichment review screen.
 * Groups snapshots by date (BRT), shows status icons, and allows clicking to jump between trades.
 */
export const EnrichSidebar = ({
	snapshots,
	currentIndex,
	onSelect,
}: EnrichSidebarProps) => {
	// Group snapshots by date (entry date in BRT)
	const dayGroups = useMemo(() => {
		const groups: Map<string, DayGroup> = new Map()

		for (let i = 0; i < snapshots.length; i++) {
			const snapshot = snapshots[i]!
			const entryDate = snapshot.dryRun.trade.entryDate
			const dateStr =
				entryDate instanceof Date ? entryDate.toISOString().split("T")[0] : ""

			if (!dateStr) {
				continue
			}

			if (!groups.has(dateStr)) {
				groups.set(dateStr, { date: dateStr, trades: [] })
			}

			const group = groups.get(dateStr)!
			group.trades.push({
				index: i,
				timestamp: formatTimeForReview(entryDate),
				status: snapshot.status,
			})
		}

		// Sort by date descending, each day's trades by timestamp
		return Array.from(groups.values())
			.sort((a, b) => b.date.localeCompare(a.date))
			.map((group) => ({
				...group,
				trades: group.trades.sort((a, b) =>
					a.timestamp.localeCompare(b.timestamp)
				),
			}))
	}, [snapshots])

	return (
		<div className="p-m-400 h-full w-full overflow-y-auto">
			<div className="space-y-m-400">
				{dayGroups.map((dayGroup) => (
					<div key={dayGroup.date} className="space-y-s-200">
						{/* Day header */}
						<div className="text-tiny text-txt-300 px-s-200 font-semibold tracking-wide uppercase">
							{new Date(dayGroup.date).toLocaleDateString("pt-BR", {
								weekday: "short",
								day: "2-digit",
								month: "short",
							})}
						</div>

						{/* Trade rows for this day */}
						<div className="space-y-s-100">
							{dayGroup.trades.map((trade) => {
								const isCurrent = currentIndex === trade.index
								const icon = getStatusIcon(isCurrent ? "current" : trade.status)

								return (
									<button
										key={trade.index}
										onClick={() => onSelect(trade.index)}
										className={`text-small px-s-300 py-s-200 gap-s-200 flex w-full items-center rounded-md text-left transition-colors ${
											isCurrent
												? "bg-acc-100/15 text-txt-100 font-medium"
												: "text-txt-300 hover:bg-bg-300 hover:text-txt-100"
										}`}
										title={`Trade ${trade.index + 1}: ${trade.timestamp}`}
									>
										<span className="text-tiny">{icon}</span>
										<span className="tabular-nums">{trade.timestamp}</span>
									</button>
								)
							})}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
