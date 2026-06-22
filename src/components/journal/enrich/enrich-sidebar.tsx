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
		status: "draft" | "committed" | "skipped"
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
			const dateStr = entryDate.toISOString().split("T")[0]

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
				status: snapshot.status === "abandoned" ? "skipped" : snapshot.status,
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
		<div className="bg-background h-full w-full overflow-y-auto border-r p-4">
			<div className="space-y-4">
				{dayGroups.map((dayGroup) => (
					<div key={dayGroup.date} className="space-y-2">
						{/* Day header */}
						<div className="text-small text-muted-foreground font-medium">
							{new Date(dayGroup.date).toLocaleDateString("en-US", {
								weekday: "short",
								month: "2-digit",
								day: "2-digit",
							})}
						</div>

						{/* Trade rows for this day */}
						<div className="space-y-1">
							{dayGroup.trades.map((trade) => {
								const isCurrent = currentIndex === trade.index
								const icon = getStatusIcon(isCurrent ? "current" : trade.status)

								return (
									<button
										key={trade.index}
										onClick={() => onSelect(trade.index)}
										className={`text-small w-full rounded-sm px-3 py-2 text-left transition-colors ${
											isCurrent
												? "bg-accent text-accent-foreground font-medium"
												: "hover:bg-muted text-muted-foreground hover:text-foreground"
										}`}
										title={`Trade ${trade.index + 1}: ${trade.timestamp}`}
									>
										<span className="mr-2">{icon}</span>
										<span>{trade.timestamp}</span>
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
