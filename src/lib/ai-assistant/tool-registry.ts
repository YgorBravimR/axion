/**
 * AI Assistant — tool registry.
 *
 * Single source of truth for the 5 read-only tools the agent can call.
 * Exports:
 *   - `TOOL_SCHEMAS` — Anthropic-shape tool definitions for the API.
 *   - `dispatchTool(name, args)` — runs the named tool with the args the
 *     LLM returned. Auth + account-scoping happens INSIDE each tool via
 *     `requireAuth()`. No tool here accepts `userId` or `accountId` from
 *     the LLM (CI lint enforces this in PR 2.4).
 *
 * Adding a new tool: implement under `tools/`, register the schema below,
 * add a case to the dispatcher. The lint will fail if the new tool's input
 * schema includes `userId` or `accountId`.
 */
import { getAccountContext } from "./tools/get-account-context"
import { getEngineReplayForTrade } from "./tools/get-engine-replay-for-trade"
import { getRecentBacktestRuns } from "./tools/get-recent-backtest-runs"
import { getTradeWithEnrichment } from "./tools/get-trade-with-enrichment"
import { getUserTradeAggregates } from "./tools/get-user-trade-aggregates"
import { getWeeklyReviewPayloadTool } from "./tools/get-weekly-review-payload"

type ToolName =
	| "get_trade_with_enrichment"
	| "get_user_trade_aggregates"
	| "get_account_context"
	| "get_recent_backtest_runs"
	| "get_engine_replay_for_trade"
	| "get_weekly_review_payload"

interface AnthropicToolSchema {
	name: ToolName
	description: string
	input_schema: {
		type: "object"
		properties: Record<string, unknown>
		required: string[]
		additionalProperties: false
	}
}

const TOOL_SCHEMAS: AnthropicToolSchema[] = [
	{
		name: "get_trade_with_enrichment",
		description:
			"Read one trade by id + its latest committed enrichment snapshot. Use this first whenever the user is asking about a specific trade.",
		input_schema: {
			type: "object",
			properties: {
				tradeId: {
					type: "string",
					description: "UUID of the trade to read.",
				},
			},
			required: ["tradeId"],
			additionalProperties: false,
		},
	},
	{
		name: "get_user_trade_aggregates",
		description:
			"Aggregate stats over the user's recent trades (windowDays, optional direction + asset filters). Use to give the current trade context — 'how does this compare to your other trades like it'. Refuse to narrate cohort patterns when totalTrades < 10.",
		input_schema: {
			type: "object",
			properties: {
				windowDays: {
					type: "integer",
					minimum: 1,
					maximum: 365,
					description: "Window in days (default 90).",
				},
				direction: {
					type: "string",
					enum: ["long", "short"],
					description: "Optional direction filter.",
				},
				asset: {
					type: "string",
					description: "Optional asset symbol filter.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
	{
		name: "get_account_context",
		description:
			"Active account framing: currency, starting balance, latest yearly plan (initial capital + ladder). Use to anchor R-values in the user's real capital. Never propose ladder changes — that is the deterministic Ladder Assistant's job.",
		input_schema: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: false,
		},
	},
	{
		name: "get_recent_backtest_runs",
		description:
			"List recent backtest runs. NOTE: today this returns 'available: false' because backtest runs are not persisted server-side. Treat that as authoritative — do not invent a run.",
		input_schema: {
			type: "object",
			properties: {
				limit: {
					type: "integer",
					minimum: 1,
					maximum: 20,
					description: "Max runs to return (default 5).",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
	{
		name: "get_engine_replay_for_trade",
		description:
			"Hawks indicator readout at the trade's entry brick (15m gate, 60m gate, MACD, VWAPs, AJUSTE) from the committed enrichment snapshot. Use to explain why the engine scored this trade the way it did.",
		input_schema: {
			type: "object",
			properties: {
				tradeId: {
					type: "string",
					description: "UUID of the trade.",
				},
			},
			required: ["tradeId"],
			additionalProperties: false,
		},
	},
	{
		name: "get_weekly_review_payload",
		description:
			"Deterministic weekly-review aggregate for a specific ISO week: trades, plan-adherence (followed vs. deviated count + deviation rate), segmented metrics, recurring-mistake rollup (this-week count × last-90-day count), and B3 risco flags (consecutive-loss streak, worst-day P&L). Use ONLY on the weekly_review surface. Refuse to narrate cross-trade patterns when totalTrades < 10.",
		input_schema: {
			type: "object",
			properties: {
				isoYear: {
					type: "integer",
					minimum: 2000,
					maximum: 2100,
					description: "ISO week-year (e.g. 2026).",
				},
				isoWeek: {
					type: "integer",
					minimum: 1,
					maximum: 53,
					description: "ISO week number (1–53).",
				},
			},
			required: ["isoYear", "isoWeek"],
			additionalProperties: false,
		},
	},
]

const isToolName = (name: string): name is ToolName =>
	TOOL_SCHEMAS.some((t) => t.name === name)

const dispatchTool = async (
	name: string,
	args: Record<string, unknown>
): Promise<unknown> => {
	if (!isToolName(name)) {
		throw new Error(`Unknown tool: ${name}`)
	}
	switch (name) {
		case "get_trade_with_enrichment":
			return getTradeWithEnrichment(args as never)
		case "get_user_trade_aggregates":
			return getUserTradeAggregates(args as never)
		case "get_account_context":
			return getAccountContext(args as never)
		case "get_recent_backtest_runs":
			return getRecentBacktestRuns(args as never)
		case "get_engine_replay_for_trade":
			return getEngineReplayForTrade(args as never)
		case "get_weekly_review_payload":
			return getWeeklyReviewPayloadTool(args as never)
	}
}

export { TOOL_SCHEMAS, dispatchTool, isToolName }
export type { ToolName, AnthropicToolSchema }
