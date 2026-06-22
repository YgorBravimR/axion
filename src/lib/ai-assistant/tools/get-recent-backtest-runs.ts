/**
 * Tool: `get_recent_backtest_runs`
 *
 * NOTE: Axion does NOT persist backtest runs in the DB today — they live in
 * browser session storage and `OptimizationRun[]` arrays. This tool returns
 * an "unavailable" payload so the agent can narrate "I can't see your
 * recent backtest runs from this surface" instead of inventing one.
 *
 * When a `backtest_runs` table ships (see backlog), this tool becomes a
 * thin scoped read. The contract stays the same.
 */
import { z } from "zod"
import { requireAuth } from "@/app/actions/auth"

const inputSchema = z.object({
	limit: z.number().int().min(1).max(20).default(5),
})

type Input = z.infer<typeof inputSchema>

interface Output {
	available: false
	reason: string
	runs: never[]
}

const getRecentBacktestRuns = async (rawInput: Input): Promise<Output> => {
	inputSchema.parse(rawInput)
	// Still call requireAuth — keeps the access pattern consistent and
	// rejects unauthenticated tool calls.
	await requireAuth()
	return {
		available: false,
		reason:
			"Backtest runs are not persisted server-side. Ask the user to open /backtest if they want to discuss a specific run.",
		runs: [],
	}
}

export { getRecentBacktestRuns, inputSchema }
export type { Input, Output }
