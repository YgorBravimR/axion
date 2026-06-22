/**
 * Tool: `get_weekly_review_payload`
 *
 * Read the deterministic weekly-review aggregate for a specific ISO week:
 * trades, plan-adherence, segmented metrics + pattern detector output,
 * mistake recurrence (this week × last 90d), and B3 risco flags.
 *
 * Scope: caller's active account, enforced inside the underlying action via
 * `requireAuth()` — this tool never accepts userId or accountId from the
 * LLM (isolation spec §B.1).
 *
 * "Not found" payload: same shape whether the week has no trades or sits
 * outside the user's data range. Indistinguishable.
 */
import { z } from "zod"
import { getWeeklyReviewPayload } from "@/app/actions/weekly-review"
import type { WeeklyReviewPayload } from "@/app/actions/weekly-review.types"

const inputSchema = z.object({
	isoYear: z.number().int().min(2000).max(2100),
	isoWeek: z.number().int().min(1).max(53),
})

type Input = z.infer<typeof inputSchema>

type Output =
	| { found: true; payload: WeeklyReviewPayload }
	| { found: false; reason: "no_data" | "out_of_range" }

const getWeeklyReviewPayloadTool = async (rawInput: Input): Promise<Output> => {
	const { isoYear, isoWeek } = inputSchema.parse(rawInput)
	const result = await getWeeklyReviewPayload(isoYear, isoWeek)
	if (result.status !== "success" || !result.data) {
		return { found: false, reason: "out_of_range" }
	}
	if (!result.data.hasTrades && result.data.saved.completedAt === null) {
		return { found: false, reason: "no_data" }
	}
	return { found: true, payload: result.data }
}

export { getWeeklyReviewPayloadTool, inputSchema }
export type { Input, Output }
