import type { UserEntry } from "@/types/backtest"

interface CatalogBundle {
	readonly key: string // e.g. "2026-05-13" or "all"
	readonly label: string // human label for the dropdown
	readonly count: number // entry count, surfaced in the label
	readonly catalog: UserEntry[]
}

export type { CatalogBundle }
