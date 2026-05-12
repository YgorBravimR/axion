import type { DailyPlan } from "@/db/schema"

type FetchByDateResult =
	| { kind: "ok"; dayRow: DailyPlan }
	| { kind: "no-account" }
	| { kind: "no-yearly-plan" }
	| { kind: "incomplete-cascade"; missing: "quarter" | "month" | "week" }

export type { FetchByDateResult }
