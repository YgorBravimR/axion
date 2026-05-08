import { NextResponse } from "next/server"

interface EndpointDoc {
	method: string
	path: string
	description: string
	required?: string[]
	optional?: string[]
	notes?: string
}

interface ApiDocsResponse {
	auth: {
		type: string
		header: string
		envVar: string
		userSelection: string
		envVarEmails: string
		requirements: string
	}
	fuzzyNaming: {
		description: string
		appliesTo: string[]
	}
	responseFormat: {
		success: { status: string; message: string; data: string }
		error: { status: string; message: string; errors: string }
	}
	endpoints: EndpointDoc[]
}

const endpoints: EndpointDoc[] = [
	{
		method: "GET",
		path: "/api/arch/docs",
		description: "Self-documenting API surface (this endpoint). No auth required.",
	},
	{
		method: "GET",
		path: "/api/arch/reference/strategies",
		description: "List all strategies for the authenticated user.",
	},
	{
		method: "GET",
		path: "/api/arch/reference/tags",
		description: "List all tags for the authenticated user.",
	},
	{
		method: "GET",
		path: "/api/arch/reference/timeframes",
		description: "List all available timeframes (global table).",
	},
	{
		method: "GET",
		path: "/api/arch/reference/assets",
		description: "List configured assets (with types) and user's traded symbols.",
	},
	{
		method: "GET",
		path: "/api/arch/trades/list",
		description: "List trades with filtering, pagination, and sorting.",
		optional: [
			"dateFrom",
			"dateTo",
			"assets",
			"directions",
			"outcomes",
			"strategy",
			"tags",
			"timeframe",
			"limit",
			"offset",
			"sortBy",
			"sortOrder",
		],
		notes: "All query params are optional. Defaults: limit=50, offset=0, sortBy=entryDate, sortOrder=desc.",
	},
	{
		method: "GET",
		path: "/api/arch/trades/grouped",
		description: "List trades grouped by date for calendar/daily views.",
		optional: ["dateFrom", "dateTo"],
	},
	{
		method: "GET",
		path: "/api/arch/trades/[id]",
		description: "Get a single trade by ID with full details.",
		required: ["id (path param)"],
	},
	{
		method: "POST",
		path: "/api/arch/trades/create",
		description: "Create a new trade.",
		required: ["asset", "direction", "entryDate", "entryPrice", "positionSize"],
		optional: [
			"exitDate",
			"exitPrice",
			"stopLoss",
			"takeProfit",
			"timeframe",
			"strategy",
			"outcome",
			"pnl",
			"commission",
			"fees",
			"preTradeThoughts",
			"postTradeReflection",
			"lessonLearned",
			"followedPlan",
			"tags",
		],
	},
	{
		method: "POST",
		path: "/api/arch/trades/update",
		description: "Update an existing trade.",
		required: ["id"],
		optional: [
			"asset",
			"direction",
			"entryDate",
			"entryPrice",
			"exitDate",
			"exitPrice",
			"positionSize",
			"stopLoss",
			"takeProfit",
			"timeframe",
			"strategy",
			"outcome",
			"pnl",
			"commission",
			"fees",
			"preTradeThoughts",
			"postTradeReflection",
			"lessonLearned",
			"followedPlan",
		],
	},
	{
		method: "POST",
		path: "/api/arch/trades/delete",
		description: "Delete a trade by ID.",
		required: ["id"],
	},
	{
		method: "POST",
		path: "/api/arch/trades/notes",
		description: "Update note fields on a trade.",
		required: ["id"],
		optional: ["preTradeThoughts", "postTradeReflection", "lessonLearned", "disciplineNotes"],
	},
	{
		method: "POST",
		path: "/api/arch/trades/tags/add",
		description: "Add one or more tags to a trade.",
		required: ["tradeId", "tags"],
		notes: "tags is an array of tag names. Uses fuzzy naming resolution.",
	},
	{
		method: "POST",
		path: "/api/arch/trades/tags/remove",
		description: "Remove a tag from a trade.",
		required: ["tradeId", "tag"],
		notes: "tag is a single tag name. Uses fuzzy naming resolution.",
	},
	{
		method: "GET",
		path: "/api/arch/trades/[id]/executions",
		description: "List all executions for a specific trade.",
		required: ["id (path param)"],
	},
	{
		method: "POST",
		path: "/api/arch/executions/create",
		description: "Create a new execution (entry or exit) for a trade.",
		required: ["tradeId", "executionType", "executionDate", "price", "quantity"],
		optional: ["orderType", "notes", "commission", "fees", "slippage"],
	},
	{
		method: "POST",
		path: "/api/arch/executions/update",
		description: "Update an existing execution.",
		required: ["id"],
		optional: [
			"executionType",
			"executionDate",
			"price",
			"quantity",
			"orderType",
			"notes",
			"commission",
			"fees",
			"slippage",
		],
	},
	{
		method: "POST",
		path: "/api/arch/executions/delete",
		description: "Delete an execution by ID.",
		required: ["id"],
	},
	// ── Analytics ──────────────────────────────────────────────
	{
		method: "GET",
		path: "/api/arch/analytics/stats",
		description: "Overall trading statistics (netPnl, winRate, profitFactor, avgR, etc.).",
		optional: ["dateFrom", "dateTo", "assets", "directions", "outcomes", "strategy", "tags", "timeframe"],
	},
	{
		method: "GET",
		path: "/api/arch/analytics/discipline",
		description: "Discipline/compliance score with trend analysis.",
		optional: ["dateFrom", "dateTo", "assets", "directions", "outcomes", "strategy", "tags", "timeframe"],
	},
	{
		method: "GET",
		path: "/api/arch/analytics/equity-curve",
		description: "Equity curve with drawdown tracking.",
		optional: ["dateFrom", "dateTo", "mode"],
		notes: "mode: 'daily' (default) or 'trade'. Returns EquityPoint[] with date, equity, accountEquity, drawdown.",
	},
	{
		method: "GET",
		path: "/api/arch/analytics/daily-pnl",
		description: "Daily P&L for a specific month (calendar view).",
		required: ["year", "month"],
		notes: "month is 0-indexed (0=January). Returns DailyPnL[] with date, pnl, tradeCount.",
	},
	{
		method: "GET",
		path: "/api/arch/analytics/streaks",
		description: "Win/loss streak data with best/worst day.",
		optional: ["dateFrom", "dateTo", "assets", "directions", "outcomes", "strategy", "tags", "timeframe"],
	},
	{
		method: "GET",
		path: "/api/arch/analytics/performance",
		description: "Performance grouped by variable.",
		required: ["groupBy"],
		optional: ["dateFrom", "dateTo", "assets", "directions", "outcomes", "strategy", "tags", "timeframe"],
		notes: "groupBy: 'asset' | 'timeframe' | 'hour' | 'dayOfWeek' | 'strategy'. Returns PerformanceByGroup[].",
	},
	{
		method: "GET",
		path: "/api/arch/analytics/expected-value",
		description: "Expected value calculation (capital + R-based edge).",
		optional: ["dateFrom", "dateTo", "assets", "directions", "outcomes", "strategy", "tags", "timeframe"],
	},
	{
		method: "GET",
		path: "/api/arch/analytics/r-distribution",
		description: "R-multiple distribution histogram buckets.",
		optional: ["dateFrom", "dateTo", "assets", "directions", "outcomes", "strategy", "tags", "timeframe"],
	},
	// ── Live Trading Status ───────────────────────────────────
	{
		method: "GET",
		path: "/api/arch/live-status",
		description: "Live trading status — risk profile resolution, next trade sizing, stop conditions.",
		optional: ["date"],
		notes: "date: ISO string (defaults to today). Returns hasProfile, status (dayPhase, nextTradeRisk, alerts), tradeSummaries.",
	},
	// ── Monthly Risk Config ─────────────────────────────────────────────────────────────────────────
	{
		method: "GET",
		path: "/api/arch/monthly-risk-config/active",
		description: "Get the active monthly risk config for the current month.",
	},
	{
		method: "GET",
		path: "/api/arch/monthly-risk-config/get",
		description: "Get the monthly risk config for a specific year/month.",
		required: ["year", "month"],
		notes: "month is 1-indexed (1=January).",
	},
	{
		method: "POST",
		path: "/api/arch/monthly-risk-config/upsert",
		description: "Create or update the monthly risk config.",
		required: ["year", "month", "accountBalance", "riskPerTradePercent", "dailyLossPercent", "monthlyLossPercent"],
		optional: ["dailyProfitTargetPercent", "maxDailyTrades", "maxConsecutiveLosses", "riskProfileId", "notes", "weeklyLossPercent", "allowSecondOpAfterLoss", "reduceRiskAfterLoss", "riskReductionFactor", "increaseRiskAfterWin", "capRiskAfterWin", "profitReinvestmentPercent"],
	},
	// ── Command Center ────────────────────────────────────────
	{
		method: "GET",
		path: "/api/arch/command-center/daily-summary",
		description: "Daily summary — P&L, win/loss counts, best/worst trade.",
		optional: ["date"],
	},
	{
		method: "GET",
		path: "/api/arch/command-center/circuit-breaker",
		description: "Circuit breaker status — all stop-trading triggers and risk budgets.",
		optional: ["date"],
		notes: "Returns shouldStopTrading, alerts[], recommendedRiskCents, remaining budgets.",
	},
	{
		method: "GET",
		path: "/api/arch/command-center/notes",
		description: "Get daily notes (pre-market, post-market, mood).",
		optional: ["date"],
	},
	{
		method: "POST",
		path: "/api/arch/command-center/notes",
		description: "Create or update daily notes.",
		required: ["date"],
		optional: ["preMarketNotes", "postMarketNotes", "mood"],
	},
	{
		method: "GET",
		path: "/api/arch/command-center/checklists",
		description: "Get checklists with today's completion status.",
		optional: ["date"],
	},
	// ── Strategies CRUD ───────────────────────────────────────
	{
		method: "GET",
		path: "/api/arch/strategies/list",
		description: "List strategies with performance stats (tradeCount, winRate, profitFactor, avgR, compliance).",
	},
	{
		method: "GET",
		path: "/api/arch/strategies/[id]",
		description: "Get a single strategy with stats, conditions, and scenarios.",
		required: ["id (path param)"],
	},
	{
		method: "POST",
		path: "/api/arch/strategies/create",
		description: "Create a new strategy.",
		required: ["code", "name"],
		optional: ["description", "entryCriteria", "exitCriteria", "riskRules", "finalR", "maxRiskPercent", "notes", "isActive", "conditions"],
	},
	{
		method: "POST",
		path: "/api/arch/strategies/update",
		description: "Update an existing strategy.",
		required: ["id"],
		optional: ["code", "name", "description", "entryCriteria", "exitCriteria", "riskRules", "finalR", "maxRiskPercent", "notes", "isActive", "conditions"],
	},
	// ── Tags CRUD ─────────────────────────────────────────────
	{
		method: "GET",
		path: "/api/arch/tags/list",
		description: "List tags with per-tag performance stats (tradeCount, totalPnl, winRate, avgR).",
	},
	{
		method: "POST",
		path: "/api/arch/tags/create",
		description: "Create a new tag.",
		required: ["name", "type"],
		optional: ["color", "description"],
		notes: "type: 'setup' | 'mistake' | 'general'. color: hex string (#RRGGBB).",
	},
	{
		method: "POST",
		path: "/api/arch/tags/update",
		description: "Update an existing tag.",
		required: ["id"],
		optional: ["name", "type", "color", "description"],
	},
	// ── Accounts ──────────────────────────────────────────────
	{
		method: "GET",
		path: "/api/arch/accounts/list",
		description: "List all trading accounts for the user.",
	},
	{
		method: "GET",
		path: "/api/arch/accounts/[id]",
		description: "Get account detail with asset/timeframe configurations.",
		required: ["id (path param)"],
	},
	{
		method: "POST",
		path: "/api/arch/accounts/switch",
		description: "Switch the default trading account.",
		required: ["accountId"],
	},
	// ── Monte Carlo ───────────────────────────────────────────
	{
		method: "GET",
		path: "/api/arch/monte-carlo/data-sources",
		description: "Available data sources for Monte Carlo simulation.",
	},
	{
		method: "POST",
		path: "/api/arch/monte-carlo/stats",
		description: "Pre-simulation statistics for a data source.",
		required: ["type"],
		optional: ["strategyId"],
		notes: "type: 'strategy' | 'all_strategies' | 'universal'. strategyId required when type=strategy.",
	},
	{
		method: "POST",
		path: "/api/arch/monte-carlo/run",
		description: "Run V2 Monte Carlo simulation with risk management profile.",
		required: ["SimulationParamsV2 body"],
		notes: "Returns MonteCarloResultV2 with equity paths, statistics, and confidence intervals.",
	},
	// ── Reports ───────────────────────────────────────────────
	{
		method: "GET",
		path: "/api/arch/reports/weekly",
		description: "Weekly trading report with daily breakdown and top wins/losses.",
		optional: ["weekStart", "weekOffset"],
		notes: "weekStart: ISO date. weekOffset: 0=current, 1=previous, etc. Defaults to current week.",
	},
	{
		method: "GET",
		path: "/api/arch/reports/monthly",
		description: "Monthly trading report with weekly and asset breakdowns.",
		optional: ["year", "month", "monthOffset"],
		notes: "year+month (1-indexed) or monthOffset (0=current). Includes best/worst day.",
	},
	{
		method: "GET",
		path: "/api/arch/reports/monthly-results",
		description: "Monthly results with prop firm profit calculations.",
		optional: ["year", "month", "monthOffset"],
		notes: "Includes prop firm share split, estimated tax, and trader net profit.",
	},
]

const apiDocs: ApiDocsResponse = {
	auth: {
		type: "bearer",
		header: "Authorization: Bearer $TOKEN",
		envVar: "ARCH_API_KEY",
		userSelection: "X-Arch-User header (email) — optional, defaults to first in ARCH_USER_EMAILS",
		envVarEmails: "ARCH_USER_EMAILS (comma-separated allowlist)",
		requirements: "User must exist in allowlist AND have isAdmin = true in the database",
	},
	fuzzyNaming: {
		description:
			"3-tier resolution: exact match → emoji-stripped match → contains match. Applies when referencing by name instead of ID.",
		appliesTo: ["strategy", "timeframe", "tags"],
	},
	responseFormat: {
		success: {
			status: "success",
			message: "Human-readable description",
			data: "Response payload (object or array)",
		},
		error: {
			status: "error",
			message: "Human-readable error description",
			errors: "[{ code: string, detail: string }]",
		},
	},
	endpoints,
}

const GET = async (): Promise<NextResponse> => NextResponse.json(apiDocs)

export { GET }
