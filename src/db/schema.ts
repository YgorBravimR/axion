import {
	pgTable,
	uuid,
	varchar,
	text,
	decimal,
	integer,
	bigint,
	smallint,
	numeric,
	timestamp,
	boolean,
	jsonb,
	pgEnum,
	index,
	uniqueIndex,
	primaryKey,
	date,
	foreignKey,
	check,
} from "drizzle-orm/pg-core"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { relations, sql } from "drizzle-orm"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

// Enums
export const tradeDirectionEnum = pgEnum("trade_direction", ["long", "short"])
export const tradeOutcomeEnum = pgEnum("trade_outcome", [
	"win",
	"loss",
	"breakeven",
])
export const tagTypeEnum = pgEnum("tag_type", ["setup", "mistake", "general"])
export const timeframeTypeEnum = pgEnum("timeframe_type", [
	"time_based",
	"renko",
])
export const timeframeUnitEnum = pgEnum("timeframe_unit", [
	"minutes",
	"hours",
	"days",
	"weeks",
	"months",
	"ticks",
	"points",
])

// Execution Mode Enum (simple = legacy single entry/exit, scaled = multiple executions)
export const executionModeEnum = pgEnum("execution_mode", ["simple", "scaled"])

// Execution Type Enum (entry or exit)
export const executionTypeEnum = pgEnum("execution_type", ["entry", "exit"])

// Order Type Enum
export const orderTypeEnum = pgEnum("order_type", [
	"market",
	"limit",
	"stop",
	"stop_limit",
])

// Account Type Enum
export const accountTypeEnum = pgEnum("account_type", ["personal", "prop"])

// User Role Enum
export const userRoleEnum = pgEnum("user_role", [
	"admin",
	"premium",
	"trader",
	"viewer",
])

// Condition Category Enum
export const conditionCategoryEnum = pgEnum("condition_category", [
	"indicator",
	"price_action",
	"market_context",
	"custom",
])

// Condition Tier Enum (cumulative ranking: mandatory → tier_2 → tier_3)
export const conditionTierEnum = pgEnum("condition_tier", [
	"mandatory",
	"tier_2",
	"tier_3",
])

// Setup Rank Enum (A = mandatory only, AA = + tier_2, AAA = all tiers met)
export const setupRankEnum = pgEnum("setup_rank", ["A", "AA", "AAA"])

// Trade Execution Rating Enum (A-F, measures execution quality)
export const tradeRatingEnum = pgEnum("trade_rating", ["A", "B", "C", "D", "F"])

// Two-phase journaling — trade enrichment status enums (see
// docs/plans/two-phase-journaling-with-enrichment.md Appendix A).
// `enrichment_status` is the rollup across the 4 enrichment passes
// (ops / candle-math / indicator-readout / SL+target).
export const enrichmentStatusEnum = pgEnum("enrichment_status", [
	"pending",
	"partial",
	"enriched",
])

// Per-pass status. `skipped` = prerequisite missing, `succeeded` = reviewer
// accepted output, `failed` = pass threw, `rejected` = reviewer rejected.
export const enrichmentPassStatusEnum = pgEnum("enrichment_pass_status", [
	"skipped",
	"succeeded",
	"failed",
	"rejected",
])

// Snapshot status — controls draft persistence across page refreshes and
// retention of committed audit records.
export const snapshotStatusEnum = pgEnum("snapshot_status", [
	"draft",
	"committed",
	"abandoned",
])

// Bug Report Status Enum
export const bugReportStatusEnum = pgEnum("bug_report_status", [
	"open",
	"accepted",
	"rejected",
	"closed",
])

// Capital Event Type Enum (Annual Reporting Phase 1)
export const capitalEventTypeEnum = pgEnum("capital_event_type", [
	"deposit",
	"withdrawal",
])

// DARF Payment Status Enum (BR Tax Engine Phase 1)
export const darfStatusEnum = pgEnum("darf_status", [
	"pending",
	"paid",
	"exempt",
	"overdue",
])

// Fractal Planning Cascade — Phase 1 enums
export const snapshotReasonEnum = pgEnum("snapshot_reason", [
	"month_start",
	"drawdown_trigger",
	"manual",
])

export const planMoodEnum = pgEnum("plan_mood", [
	"focused",
	"neutral",
	"distracted",
	"risk_off",
])

export const tierChangeReasonEnum = pgEnum("tier_change_reason", [
	"month_start",
	"drawdown_trigger",
	"manual",
])

// Strategy methodology (intrinsic to the strategy, not the account running it).
// Distinct from `accountModeEnum`: a Hawks-methodology strategy is *always* a
// Hawks strategy, regardless of which account/mode it's currently traded by.
// NULL methodology means "unstructured / free-form strategy" (the legacy default).
export const strategyMethodologyEnum = pgEnum("strategy_methodology", [
	"hawks",
	"orb",
	"dezk",
])

// Hawks Mode enums (mode-scoped sidecar; lib at src/lib/hawks/).
export const accountModeEnum = pgEnum("account_mode", ["default", "hawks"])
export const hawksScenarioDirectionEnum = pgEnum("hawks_scenario_direction", [
	"long",
	"short",
	"either",
])
export const hawksScenarioTypeEnum = pgEnum("hawks_scenario_type", [
	"setup",
	"mistake",
])
export const hawksBiasEnum = pgEnum("hawks_bias", ["long", "short", "neutral"])
export const hawksStopDirectionEnum = pgEnum("hawks_stop_direction", [
	"with",
	"against",
	"same",
])

// Plan-immutability cadence on monthly_plan (windowed lock on writes).
export const planLockCadenceEnum = pgEnum("plan_lock_cadence", [
	"weekly",
	"biweekly",
	"monthly",
	"quarterly",
	"yearly",
])

// ==========================================
// AUTH TABLES (Phase 10)
// ==========================================

// Users Table
export const users = pgTable(
	"users",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		email: varchar("email", { length: 255 }).notNull().unique(),
		emailVerified: timestamp("email_verified", { withTimezone: true }),
		passwordHash: varchar("password_hash", { length: 255 }).notNull(),
		image: varchar("image", { length: 255 }),
		isAdmin: boolean("is_admin").default(false).notNull(),
		role: userRoleEnum("role").default("trader").notNull(),

		// General user settings (not account-specific)
		preferredLocale: varchar("preferred_locale", { length: 10 })
			.default("pt-BR")
			.notNull(),
		theme: varchar("theme", { length: 20 }).default("dark").notNull(),
		dateFormat: varchar("date_format", { length: 20 })
			.default("DD/MM/YYYY")
			.notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("users_email_idx").on(table.email)]
)

// Trading Accounts Table (each user can have multiple)
export const tradingAccounts = pgTable(
	"trading_accounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Account identification
		name: varchar("name", { length: 100 }).notNull(),
		description: text("description"),
		isDefault: boolean("is_default").default(false).notNull(),
		isActive: boolean("is_active").default(true).notNull(),

		// Trading account type
		accountType: accountTypeEnum("account_type").default("personal").notNull(),
		propFirmName: text("prop_firm_name"),
		profitSharePercentage: text("profit_share_percentage")
			.default("100.00")
			.notNull(),

		// Tax rates intentionally NOT stored — sourced from @/lib/tax/legal-rates by
		// year (Lei 11.033/2004). Single source of truth across cockpit, reports,
		// and recompute. Per-account override removed 2026-05-07.

		defaultCurrency: varchar("default_currency", { length: 3 })
			.default("BRL")
			.notNull(),

		// Breakeven classification: trades within ±N ticks of entry are classified as breakeven
		defaultBreakevenTicks: integer("default_breakeven_ticks")
			.default(2)
			.notNull(),

		// Default asset: pre-selects this asset in trade forms, calculators, etc.
		defaultAssetId: uuid("default_asset_id").references(() => assets.id, {
			onDelete: "set null",
		}),

		// Display preferences
		showTaxEstimates: boolean("show_tax_estimates").default(true).notNull(),
		showPropCalculations: boolean("show_prop_calculations")
			.default(true)
			.notNull(),
		brand: varchar("brand", { length: 20 }).default("bravo").notNull(),

		// Annual Reporting: account lifecycle anchor + withdrawal configuration
		/** First month the account was active (1–12). Used to hide pre-start months. */
		accountStartMonth: smallint("account_start_month"),

		/** First year the account was active (e.g. 2025). */
		accountStartYear: smallint("account_start_year"),

		/**
		 * Opening balance in cents at account start.
		 * Seeds the patrimônio chain for the first active month.
		 * Plain BIGINT — no encryption (consistent with aggregate tables).
		 */
		startingBalanceCents: bigint("starting_balance_cents", { mode: "number" }),

		/**
		 * Percentage of net profit to target for withdrawal each month.
		 * "30.00" = 30%. Null or "0" disables the withdrawal line entirely.
		 */
		withdrawalTargetPercent: numeric("withdrawal_target_percent", {
			precision: 5,
			scale: 2,
		}).default("30.00"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("trading_accounts_user_idx").on(table.userId),
		uniqueIndex("trading_accounts_user_name_idx").on(table.userId, table.name),
	]
)

// Sessions Table (for Auth.js)
export const sessions = pgTable(
	"sessions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		currentAccountId: uuid("current_account_id").references(
			() => tradingAccounts.id,
			{
				onDelete: "set null",
			}
		),
		expires: timestamp("expires", { withTimezone: true }).notNull(),
	},
	(table) => [
		index("sessions_token_idx").on(table.sessionToken),
		index("sessions_user_idx").on(table.userId),
	]
)

// OAuth Accounts Table (for future OAuth support)
export const oauthAccounts = pgTable(
	"oauth_accounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: varchar("type", { length: 255 }).notNull(),
		provider: varchar("provider", { length: 255 }).notNull(),
		providerAccountId: varchar("provider_account_id", {
			length: 255,
		}).notNull(),
		refreshToken: text("refresh_token"),
		accessToken: text("access_token"),
		expiresAt: integer("expires_at"),
		tokenType: varchar("token_type", { length: 255 }),
		scope: varchar("scope", { length: 255 }),
		idToken: text("id_token"),
		sessionState: varchar("session_state", { length: 255 }),
	},
	(table) => [
		index("oauth_accounts_user_idx").on(table.userId),
		uniqueIndex("oauth_accounts_provider_idx").on(
			table.provider,
			table.providerAccountId
		),
	]
)

// Verification Tokens (for email verification)
export const verificationTokens = pgTable(
	"verification_tokens",
	{
		identifier: varchar("identifier", { length: 255 }).notNull(),
		token: varchar("token", { length: 255 }).notNull().unique(),
		expires: timestamp("expires", { withTimezone: true }).notNull(),
	},
	(table) => [
		uniqueIndex("verification_tokens_idx").on(table.identifier, table.token),
	]
)

// Rate Limit Attempts (DB-backed, survives serverless cold starts)
export const rateLimitAttempts = pgTable(
	"rate_limit_attempts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		identifier: varchar("identifier", { length: 255 }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("rate_limit_attempts_identifier_created_idx").on(
			table.identifier,
			table.createdAt
		),
	]
)

// Account Assets Table (per-account asset configuration)
export const accountAssets = pgTable(
	"account_assets",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		assetId: uuid("asset_id")
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),

		isEnabled: boolean("is_enabled").default(true).notNull(),

		// Per-asset breakeven override (NULL = use account default). Fee overrides
		// migrated to accountFeeRates table (Phase 3 of fee-config unification).
		breakevenTicksOverride: integer("breakeven_ticks_override"), // NULL = use account default

		notes: text("notes"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("account_assets_account_idx").on(table.accountId),
		uniqueIndex("account_assets_unique_idx").on(table.accountId, table.assetId),
	]
)

// Account Timeframes Table (per-account timeframe configuration)
export const accountTimeframes = pgTable(
	"account_timeframes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		timeframeId: uuid("timeframe_id")
			.notNull()
			.references(() => timeframes.id, { onDelete: "cascade" }),

		isEnabled: boolean("is_enabled").default(true).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("account_timeframes_account_idx").on(table.accountId),
		uniqueIndex("account_timeframes_unique_idx").on(
			table.accountId,
			table.timeframeId
		),
	]
)

// Asset Types Table
export const assetTypes = pgTable("asset_types", {
	id: uuid("id").primaryKey().defaultRandom(),
	code: varchar("code", { length: 50 }).notNull().unique(),
	name: varchar("name", { length: 100 }).notNull(),
	description: text("description"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
})

// Assets Table (admin-managed, no commission/fees - those are per-account)
// Money field (tickValue) stored as integer in cents
export const assets = pgTable(
	"assets",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		symbol: varchar("symbol", { length: 20 }).notNull().unique(),
		name: varchar("name", { length: 100 }).notNull(),
		assetTypeId: uuid("asset_type_id")
			.notNull()
			.references(() => assetTypes.id, { onDelete: "restrict" }),
		tickSize: decimal("tick_size", { precision: 18, scale: 8 }).notNull(),
		tickValue: integer("tick_value").notNull(), // cents per tick
		currency: varchar("currency", { length: 10 }).notNull().default("BRL"),
		multiplier: decimal("multiplier", { precision: 18, scale: 4 }).default("1"),
		// Note: commission/fees removed - now managed per-account in account_assets table
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("assets_symbol_idx").on(table.symbol),
		index("assets_asset_type_idx").on(table.assetTypeId),
	]
)

// Timeframes Table
export const timeframes = pgTable("timeframes", {
	id: uuid("id").primaryKey().defaultRandom(),
	code: varchar("code", { length: 20 }).notNull().unique(),
	name: varchar("name", { length: 50 }).notNull(),
	type: timeframeTypeEnum("type").notNull(),
	value: integer("value").notNull(),
	unit: timeframeUnitEnum("unit").notNull(),
	sortOrder: integer("sort_order").notNull().default(0),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
})

// Strategies Table (user-level: shared across all accounts)
export const strategies = pgTable(
	"strategies",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id").references(() => users.id, {
			onDelete: "cascade",
		}),
		// @deprecated - kept for migration compatibility, use userId instead
		accountId: uuid("account_id").references(() => tradingAccounts.id, {
			onDelete: "set null",
		}),
		code: varchar("code").notNull(),
		name: varchar("name", { length: 100 }).notNull(),
		description: text("description"),
		// Intrinsic methodology axis (see `strategyMethodologyEnum`). NULL = unstructured.
		// Drives per-methodology UI dispatch (e.g. Hawks-specific panels on /playbook/[id]).
		// Orthogonal to `account_modes.mode` which is the per-account runtime mode.
		methodology: strategyMethodologyEnum("methodology"),
		entryCriteria: text("entry_criteria"),
		exitCriteria: text("exit_criteria"),
		riskRules: text("risk_rules"),
		// R-multiple template (Fractal Planning Cascade — Phase 1).
		// All nullable; populated via Phase 3 backfill (existing targetRMultiple → finalR).
		stopR: decimal("stop_r", { precision: 8, scale: 2 }),
		partialR: decimal("partial_r", { precision: 8, scale: 2 }),
		partialProportion: decimal("partial_proportion", {
			precision: 4,
			scale: 3,
		}),
		finalR: decimal("final_r", { precision: 8, scale: 2 }),
		protectionR: decimal("protection_r", { precision: 8, scale: 2 }),
		defaultInstrumentSymbol: varchar("default_instrument_symbol", {
			length: 20,
		}),
		maxRiskPercent: decimal("max_risk_percent", { precision: 5, scale: 2 }),
		screenshotUrl: varchar("screenshot_url", { length: 500 }),
		screenshotS3Key: varchar("screenshot_s3_key", { length: 500 }),
		notes: text("notes"),
		isActive: boolean("is_active").default(true),
		// Strategy versioning v1 (manifesto §5 Q1 follow-up).
		// `strategies` row always mirrors the latest published version's content;
		// `strategy_versions` stores the immutable history. A strategy becomes
		// edit-locked as soon as any trade references it — further changes must
		// go through createStrategyVersion to bump to the next version number.
		currentVersion: integer("current_version").default(1).notNull(),
		nextVersionNumber: integer("next_version_number").default(2).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("strategies_user_idx").on(table.userId),
		index("strategies_account_idx").on(table.accountId),
		uniqueIndex("strategies_user_code_idx").on(table.userId, table.code),
	]
)

// Strategy Versions Table — immutable snapshots of a strategy's content at
// publish time. Trades pin to a version via `trades.strategyVersionId`;
// the per-version condition list lives in `strategy_conditions` (filtered by
// `strategyVersionId`), and per-version scenarios live in `strategy_scenarios`.
export const strategyVersions = pgTable(
	"strategy_versions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		strategyId: uuid("strategy_id")
			.notNull()
			.references(() => strategies.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		// Snapshot of strategies fields at publish time
		name: varchar("name", { length: 100 }).notNull(),
		description: text("description"),
		entryCriteria: text("entry_criteria"),
		exitCriteria: text("exit_criteria"),
		riskRules: text("risk_rules"),
		stopR: decimal("stop_r", { precision: 8, scale: 2 }),
		partialR: decimal("partial_r", { precision: 8, scale: 2 }),
		partialProportion: decimal("partial_proportion", {
			precision: 4,
			scale: 3,
		}),
		finalR: decimal("final_r", { precision: 8, scale: 2 }),
		protectionR: decimal("protection_r", { precision: 8, scale: 2 }),
		defaultInstrumentSymbol: varchar("default_instrument_symbol", {
			length: 20,
		}),
		maxRiskPercent: decimal("max_risk_percent", { precision: 5, scale: 2 }),
		screenshotUrl: varchar("screenshot_url", { length: 500 }),
		screenshotS3Key: varchar("screenshot_s3_key", { length: 500 }),
		notes: text("notes"),
		label: varchar("label", { length: 100 }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("strategy_versions_strategy_idx").on(table.strategyId),
		uniqueIndex("strategy_versions_strategy_version_idx").on(
			table.strategyId,
			table.version
		),
	]
)

// Trades Table
// Money fields (pnl, plannedRiskAmount, commission, fees) stored as integers in cents
export const trades = pgTable(
	"trades",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id").references(() => tradingAccounts.id, {
			onDelete: "cascade",
		}),

		// Basic Info
		asset: varchar("asset", { length: 20 }).notNull(),
		direction: tradeDirectionEnum("direction").notNull(),
		timeframeId: uuid("timeframe_id").references(() => timeframes.id, {
			onDelete: "set null",
		}),

		// Timing
		entryDate: timestamp("entry_date", { withTimezone: true }).notNull(),
		exitDate: timestamp("exit_date", { withTimezone: true }),

		// Execution
		entryPrice: text("entry_price").notNull(),
		exitPrice: text("exit_price"),
		positionSize: text("position_size").notNull(),

		// Risk Management
		stopLoss: text("stop_loss"),
		takeProfit: text("take_profit"),
		plannedRiskAmount: text("planned_risk_amount"), // cents
		plannedRMultiple: text("planned_r_multiple"),

		// Results
		pnl: text("pnl"), // cents
		pnlPercent: decimal("pnl_percent", { precision: 8, scale: 4 }),
		// Points P&L — computed at trade-save time via point-values resolver.
		// NULL = not yet computed or asset has no known point-value mapping.
		pointsPnl: decimal("points_pnl", { precision: 10, scale: 2 }),
		realizedRMultiple: decimal("realized_r_multiple", {
			precision: 8,
			scale: 2,
		}),
		// Fractal Planning Cascade — Phase 1.
		// 1R captured at entry from resolveDay(today).oneRCents and frozen.
		// rOutcome = pnl / oneRSnapshotCents, populated on close.
		oneRSnapshotCents: bigint("one_r_snapshot_cents", { mode: "number" }),
		rOutcome: decimal("r_outcome", { precision: 8, scale: 2 }),
		outcome: tradeOutcomeEnum("outcome"),

		// MFE/MAE (prices, not money)
		mfe: decimal("mfe", { precision: 18, scale: 8 }),
		mae: decimal("mae", { precision: 18, scale: 8 }),
		mfeR: decimal("mfe_r", { precision: 8, scale: 2 }),
		maeR: decimal("mae_r", { precision: 8, scale: 2 }),

		// Fees
		commission: text("commission"), // cents per contract
		fees: text("fees"), // cents per contract
		// Total contracts executed (entry + exit + any intra-trade scaling)
		// Default is positionSize * 2 (1 entry + 1 exit per contract)
		contractsExecuted: decimal("contracts_executed", {
			precision: 18,
			scale: 8,
		}),

		// Narrative
		preTradeThoughts: text("pre_trade_thoughts"),
		postTradeReflection: text("post_trade_reflection"),
		lessonLearned: text("lesson_learned"),

		// Strategy Reference
		strategyId: uuid("strategy_id").references(() => strategies.id, {
			onDelete: "set null",
		}),
		// Strategy version pin — resolved at trade-write time to the strategy's
		// currentVersion. Lets historical scoring use the rules that were active
		// when this trade was logged, even after the strategy is forked to v2.
		strategyVersionId: uuid("strategy_version_id").references(
			() => strategyVersions.id,
			{ onDelete: "set null" }
		),

		// Setup Quality Ranking (A/AA/AAA based on conditions met)
		setupRank: setupRankEnum("setup_rank"),
		// Trade screenshot
		screenshotUrl: varchar("screenshot_url", { length: 500 }),
		screenshotS3Key: varchar("screenshot_s3_key", { length: 500 }),

		// Compliance
		followedPlan: boolean("followed_plan"),
		disciplineNotes: text("discipline_notes"),

		// Execution Quality Rating (A-F, distinct from setupRank which measures setup quality)
		rating: tradeRatingEnum("rating"),

		// Execution Mode (for position scaling support)
		executionMode: executionModeEnum("execution_mode")
			.default("simple")
			.notNull(),

		// Aggregated execution data (populated when executionMode = 'scaled')
		totalEntryQuantity: decimal("total_entry_quantity", {
			precision: 20,
			scale: 8,
		}),
		totalExitQuantity: decimal("total_exit_quantity", {
			precision: 20,
			scale: 8,
		}),
		avgEntryPrice: decimal("avg_entry_price", { precision: 20, scale: 8 }),
		avgExitPrice: decimal("avg_exit_price", { precision: 20, scale: 8 }),
		remainingQuantity: decimal("remaining_quantity", {
			precision: 20,
			scale: 8,
		}).default("0"),

		// Deduplication (SHA-256 hash of accountId|asset|direction|entryDate|entryPrice|exitPrice|positionSize)
		deduplicationHash: varchar("deduplication_hash", { length: 64 }),

		// Two-phase journaling — enrichment rollup state
		// (see docs/plans/two-phase-journaling-with-enrichment.md Appendix A).
		enrichmentStatus: enrichmentStatusEnum("enrichment_status")
			.default("pending")
			.notNull(),
		enrichmentVersion: integer("enrichment_version").default(0).notNull(),
		enrichedAt: timestamp("enriched_at", { withTimezone: true }),

		// Per-pass status (NULL = pass never ran for this trade).
		enrichmentOpsStatus: enrichmentPassStatusEnum("enrichment_ops_status"),
		enrichmentCandleStatus: enrichmentPassStatusEnum(
			"enrichment_candle_status"
		),
		enrichmentIndicatorStatus: enrichmentPassStatusEnum(
			"enrichment_indicator_status"
		),
		enrichmentSlTargetStatus: enrichmentPassStatusEnum(
			"enrichment_sl_target_status"
		),

		// Hawks indicator readout snapshot — open-shape JSON so new indicators
		// slot in without a migration. Schema documented in the plan doc.
		indicatorReadout: jsonb("indicator_readout"),

		// Profit Pro reconciliation — operationNumber is a real column because
		// it backs the idempotency index. Other Profit-side numbers
		// (drawdown / ganho-max / perda-max) live inside profitMetadata.
		profitOperationNumber: integer("profit_operation_number"),
		profitMetadata: jsonb("profit_metadata"),

		// Metadata
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		isArchived: boolean("is_archived").default(false),

		// Trade source (manual = web UI, arch = Arch API, csv = CSV imports)
		source: varchar("source", { length: 20 }).default("manual"),
	},
	(table) => [
		index("trades_account_idx").on(table.accountId),
		index("trades_asset_idx").on(table.asset),
		index("trades_entry_date_idx").on(table.entryDate),
		index("trades_outcome_idx").on(table.outcome),
		index("trades_strategy_idx").on(table.strategyId),
		index("trades_strategy_version_idx").on(table.strategyVersionId),
		index("trades_timeframe_idx").on(table.timeframeId),
		index("trades_dedup_hash_idx").on(table.deduplicationHash),

		// Composite indexes for analytics queries
		index("idx_trades_account_archived_date").on(
			table.accountId,
			table.isArchived,
			table.entryDate
		),
		index("idx_trades_account_archived_outcome").on(
			table.accountId,
			table.isArchived,
			table.outcome
		),
		// Partial index: smaller and faster for the common case (non-archived trades)
		index("idx_trades_active_date")
			.on(table.accountId, table.entryDate)
			.where(sql`is_archived = false`),

		// Enrichment dashboards filter on this rollup constantly.
		index("trades_enrichment_status_idx").on(table.enrichmentStatus),
		// Idempotency lookup for Profit Pro orders.csv ingestion:
		// "have we already enriched a trade matching (account, date, operation)?"
		index("trades_profit_operation_number_idx").on(
			table.accountId,
			table.entryDate,
			table.profitOperationNumber
		),
	]
)

// ═══════════════════════════════════════════════════════════════════
// Two-phase journaling — trade_enrichment_snapshots
// ═══════════════════════════════════════════════════════════════════

// One row per (trade, dry-run-version). `draft` rows survive page
// refreshes during a review session; `committed` rows are the audit
// record after the reviewer accepted/rejected per-field; `abandoned`
// rows had their payload nulled by the cleanup job after expiresAt.
// Keep forever (decision A.3) until total volume crosses 5GB.
export const tradeEnrichmentSnapshots = pgTable(
	"trade_enrichment_snapshots",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tradeId: uuid("trade_id")
			.notNull()
			.references(() => trades.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		dryRunOutput: jsonb("dry_run_output").notNull(),
		acceptedFields: text("accepted_fields").array(),
		rejectedFields: text("rejected_fields").array(),
		enrichedAt: timestamp("enriched_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		enrichmentEngineVersion: varchar("enrichment_engine_version", {
			length: 32,
		}).notNull(),
		candleDataLoadedAt: timestamp("candle_data_loaded_at", {
			withTimezone: true,
		}),
		status: snapshotStatusEnum("status").default("draft").notNull(),
		runId: uuid("run_id").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
	},
	(table) => [
		index("trade_enrichment_snapshots_trade_idx").on(table.tradeId),
		index("trade_enrichment_snapshots_trade_version_idx").on(
			table.tradeId,
			table.version
		),
		index("trade_enrichment_snapshots_run_idx").on(table.runId, table.status),
		index("trade_enrichment_snapshots_status_expiry_idx").on(
			table.status,
			table.expiresAt
		),
	]
)

// Trade Executions Table (for scaled position management)
// Money fields (commission, fees, slippage, executionValue) stored as integers in cents
export const tradeExecutions = pgTable(
	"trade_executions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tradeId: uuid("trade_id")
			.notNull()
			.references(() => trades.id, { onDelete: "cascade" }),

		// Execution details
		executionType: executionTypeEnum("execution_type").notNull(),
		executionDate: timestamp("execution_date", {
			withTimezone: true,
		}).notNull(),
		price: text("price").notNull(),
		quantity: text("quantity").notNull(),

		orderType: orderTypeEnum("order_type"),
		notes: text("notes"),

		commission: text("commission"), // cents
		fees: text("fees"), // cents
		slippage: text("slippage"), // cents

		executionValue: text("execution_value").notNull(),

		// Timestamps
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("trade_executions_trade_idx").on(table.tradeId),
		index("trade_executions_type_idx").on(table.executionType),
		index("trade_executions_date_idx").on(table.executionDate),
	]
)

// Tags Table (user-level: shared across all accounts)
export const tags = pgTable(
	"tags",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id").references(() => users.id, {
			onDelete: "cascade",
		}),
		// @deprecated - kept for migration compatibility, use userId instead
		accountId: uuid("account_id").references(() => tradingAccounts.id, {
			onDelete: "set null",
		}),
		name: varchar("name", { length: 50 }).notNull(),
		type: tagTypeEnum("type").notNull(),
		color: varchar("color", { length: 7 }),
		description: text("description"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("tags_user_idx").on(table.userId),
		index("tags_account_idx").on(table.accountId),
		uniqueIndex("tags_user_name_idx").on(table.userId, table.name),
	]
)

// Trade Tags Junction Table
export const tradeTags = pgTable(
	"trade_tags",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tradeId: uuid("trade_id")
			.notNull()
			.references(() => trades.id, { onDelete: "cascade" }),
		tagId: uuid("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("trade_tags_trade_idx").on(table.tradeId),
		index("trade_tags_tag_idx").on(table.tagId),
	]
)

// Daily Journals Table
// Money fields (totalPnl) stored as integers in cents
export const dailyJournals = pgTable(
	"daily_journals",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		date: timestamp("date", { withTimezone: true }).notNull().unique(),

		// Pre-Session
		marketOutlook: text("market_outlook"),
		focusGoals: text("focus_goals"),
		mentalState: integer("mental_state"),

		// Post-Session
		sessionReview: text("session_review"),
		emotionalState: integer("emotional_state"),
		keyTakeaways: text("key_takeaways"),

		// Metrics (totalPnl in cents)
		totalPnl: bigint("total_pnl", { mode: "number" }), // cents
		tradeCount: integer("trade_count"),
		winCount: integer("win_count"),
		lossCount: integer("loss_count"),

		// Metadata
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("daily_journals_date_idx").on(table.date)]
)

// ==========================================
// COMMAND CENTER TABLES (Phase 12)
// ==========================================

// Daily Checklists Table (user-defined checklist templates)
export const dailyChecklists = pgTable(
	"daily_checklists",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").notNull(),
		accountId: uuid("account_id").references(() => tradingAccounts.id, {
			onDelete: "cascade",
		}),
		name: varchar("name", { length: 100 }).notNull(),
		items: text("items").notNull(), // JSON array of { id, label, order }
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("daily_checklists_user_idx").on(table.userId),
		index("daily_checklists_account_idx").on(table.accountId),
	]
)

// Checklist Completions Table (daily completion tracking)
export const checklistCompletions = pgTable(
	"checklist_completions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		checklistId: uuid("checklist_id")
			.notNull()
			.references(() => dailyChecklists.id, { onDelete: "cascade" }),
		userId: text("user_id").notNull(),
		date: timestamp("date", { withTimezone: true }).notNull(),
		completedItems: text("completed_items").notNull().default("[]"), // JSON array of item IDs
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("checklist_completions_checklist_idx").on(table.checklistId),
		index("checklist_completions_user_idx").on(table.userId),
		index("checklist_completions_date_idx").on(table.date),
		uniqueIndex("checklist_completions_unique_idx").on(
			table.checklistId,
			table.date
		),
	]
)

// Daily Asset Settings Table (per-asset trading rules, per-day)
export const dailyAssetSettings = pgTable(
	"daily_asset_settings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").notNull(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		assetId: uuid("asset_id")
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),
		date: timestamp("date", { withTimezone: true }).notNull(), // Per-day tracking
		bias: varchar("bias", { length: 10 }), // 'long' | 'short' | 'neutral' | null
		maxDailyTrades: integer("max_daily_trades"),
		maxPositionSize: integer("max_position_size"),
		notes: text("notes"),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("daily_asset_settings_user_idx").on(table.userId),
		index("daily_asset_settings_account_idx").on(table.accountId),
		index("daily_asset_settings_asset_idx").on(table.assetId),
		index("daily_asset_settings_date_idx").on(table.date),
		uniqueIndex("daily_asset_settings_unique_idx").on(
			table.accountId,
			table.assetId,
			table.date
		),
	]
)

// Account Asset Settings (permanent, account-level — replaces daily_asset_settings)
export const accountAssetSettings = pgTable(
	"account_asset_settings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").notNull(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		assetId: uuid("asset_id")
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),
		bias: varchar("bias", { length: 10 }), // 'long' | 'short' | 'neutral' | null
		maxDailyTrades: integer("max_daily_trades"),
		maxPositionSize: integer("max_position_size"),
		notes: text("notes"),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("account_asset_settings_user_idx").on(table.userId),
		index("account_asset_settings_account_idx").on(table.accountId),
		index("account_asset_settings_asset_idx").on(table.assetId),
		uniqueIndex("account_asset_settings_unique_idx").on(
			table.accountId,
			table.assetId
		),
	]
)

// Risk Management Profiles Table (admin-created decision tree configurations)
export const riskManagementProfiles = pgTable(
	"risk_management_profiles",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: varchar("name", { length: 100 }).notNull(),
		description: text("description"),
		createdByUserId: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		isActive: boolean("is_active").default(true).notNull(),

		// Phase 4b: top-level cents columns dropped — caps now live on the fractal cascade
		// (yearlyPlans.defaultDailyLossR / defaultMonthlyLossR / etc.). Decision tree is
		// rebased to R-multiples via scripts/migrate-decision-tree-cents-to-r.ts.

		// Decision tree config (JSON stored as text — matches dailyChecklists.items pattern)
		decisionTree: text("decision_tree").notNull(), // JSON: DecisionTreeConfig

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("risk_profiles_created_by_idx").on(table.createdByUserId),
		index("risk_profiles_active_idx").on(table.isActive),
	]
)

// ==========================================
// BR TAX ENGINE TABLES (Phase 1)
// ==========================================

// ─── Account Fee Rates ────────────────────────────────────────────────────────
// Per-account (optionally per-asset) brokerage and exchange fee configuration.
// Single source of truth for the BR tax engine — supersedes tradingAccounts.dayTradeTaxRate.
export const accountFeeRates = pgTable(
	"account_fee_rates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),

		// NULL = applies to all assets on this account
		assetSymbol: varchar("asset_symbol", { length: 20 }),

		// Per-contract rates in cents (BRL). e.g. 5 = R$0.05
		txCorretagemCents: integer("tx_corretagem_cents").default(5).notNull(),
		txRegistroCents: integer("tx_registro_cents").default(74).notNull(),
		emolumentosCents: integer("emolumentos_cents").default(40).notNull(),

		// ISS as a percentage of txCorretagem (municipal tax, NOT flat per contract).
		// São Paulo default = 5.00 → ISS = txCorretagem × 0.05
		issRatePercent: decimal("iss_rate_percent", { precision: 5, scale: 2 })
			.default("5.00")
			.notNull(),

		// IRRF withheld at source: basis points. 100 = 1.00%
		irrfRateBps: integer("irrf_rate_bps").default(100).notNull(),

		// Day-trade IR rate: basis points. 2000 = 20.00%
		irRateBps: integer("ir_rate_bps").default(2000).notNull(),

		// false for prop accounts — firm handles IR, personal DARF skipped
		subjectToPersonalIr: boolean("subject_to_personal_ir")
			.default(true)
			.notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("account_fee_rates_account_idx").on(table.accountId),
		uniqueIndex("account_fee_rates_account_asset_idx").on(
			table.accountId,
			table.assetSymbol
		),
		check(
			"irrf_rate_bps_range",
			sql`${table.irrfRateBps} >= 0 AND ${table.irrfRateBps} <= 10000`
		),
		check(
			"ir_rate_bps_range",
			sql`${table.irRateBps} >= 0 AND ${table.irRateBps} <= 10000`
		),
	]
)

// ─── Monthly Tax Ledger ───────────────────────────────────────────────────────
// Materialized per-account-month tax summary. Recomputed lazily on read when dirty.
export const monthlyTaxLedger = pgTable(
	"monthly_tax_ledger",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),

		// First day of the month, UTC midnight
		month: timestamp("month", { withTimezone: true }).notNull(),

		// ── Gross P&L ────────────────────────────────────────────────────────────
		// Sum of day-trade pnl for all closes in this month, before fees/taxes
		grossGainCents: bigint("gross_gain_cents", { mode: "number" })
			.default(0)
			.notNull(),

		// ── Fees ─────────────────────────────────────────────────────────────────
		totalTxCorretagemCents: bigint("total_tx_corretagem_cents", {
			mode: "number",
		})
			.default(0)
			.notNull(),
		totalTxRegistroCents: bigint("total_tx_registro_cents", { mode: "number" })
			.default(0)
			.notNull(),
		totalEmolumentosCents: bigint("total_emolumentos_cents", { mode: "number" })
			.default(0)
			.notNull(),
		// ISS = totalTxCorretagem × issRatePercent/100. Municipal tax, informational deduction.
		totalIssCents: bigint("total_iss_cents", { mode: "number" })
			.default(0)
			.notNull(),
		// Sum of all four fee columns above
		totalFeesCents: bigint("total_fees_cents", { mode: "number" })
			.default(0)
			.notNull(),

		totalContractsExecuted: decimal("total_contracts_executed", {
			precision: 20,
			scale: 4,
		})
			.default("0")
			.notNull(),

		// ── IRRF ─────────────────────────────────────────────────────────────────
		// Sum of 1% × max(0, dailyGrossPnl) for each trading day in month
		irrfCents: bigint("irrf_cents", { mode: "number" }).default(0).notNull(),

		// ── Net gain for IR base ──────────────────────────────────────────────────
		// grossGainCents − totalFeesCents
		netGainBeforeCarryoverCents: bigint("net_gain_before_carryover_cents", {
			mode: "number",
		})
			.default(0)
			.notNull(),

		// ── Carryover ────────────────────────────────────────────────────────────
		// Accumulated loss balance at START of this month (positive = loss owed)
		carryoverInCents: bigint("carryover_in_cents", { mode: "number" })
			.default(0)
			.notNull(),
		carryoverConsumedCents: bigint("carryover_consumed_cents", {
			mode: "number",
		})
			.default(0)
			.notNull(),
		// Remaining carryover passed to next month
		carryoverOutCents: bigint("carryover_out_cents", { mode: "number" })
			.default(0)
			.notNull(),

		// ── IR Calculation ────────────────────────────────────────────────────────
		// max(0, netGainBeforeCarryover − carryoverConsumed)
		taxableGainCents: bigint("taxable_gain_cents", { mode: "number" })
			.default(0)
			.notNull(),
		// taxableGain × irRateBps / 10000
		irGrossCents: bigint("ir_gross_cents", { mode: "number" })
			.default(0)
			.notNull(),
		// max(0, irGross − irrfCents)
		darfDueCents: bigint("darf_due_cents", { mode: "number" })
			.default(0)
			.notNull(),

		// ── IR Deferral (Lei 9.430/96 art. 68 §1°) ────────────────────────────────
		// Sub-threshold IR (0 < amount < R$10) carried to next month. Once cumulative
		// crosses R$10, the full deferred balance is owed in the next eligible month.
		deferredIrCents: bigint("deferred_ir_cents", { mode: "number" })
			.default(0)
			.notNull(),

		// ── DARF status ───────────────────────────────────────────────────────────
		darfStatus: darfStatusEnum("darf_status").default("pending").notNull(),
		darfDueDate: timestamp("darf_due_date", { withTimezone: true }),
		darfPaidAt: timestamp("darf_paid_at", { withTimezone: true }),
		// Actual amount paid (may differ from darfDueCents if trader paid early/late)
		darfPaidAmountCents: bigint("darf_paid_amount_cents", { mode: "number" }),

		// ── Informational fields ──────────────────────────────────────────────────
		// Previous month's unpaid DARF balance (display-only, not added to this DARF calc)
		previousBalanceCents: bigint("previous_balance_cents", { mode: "number" })
			.default(0)
			.notNull(),
		// Operational expenses (VPS, data feeds, etc.) — informational, not tax-deductible
		gastosGeraisCents: bigint("gastos_gerais_cents", { mode: "number" })
			.default(0)
			.notNull(),
		// grossGain − totalFees − darfDue − gastosGerais
		netLiquidCents: bigint("net_liquid_cents", { mode: "number" })
			.default(0)
			.notNull(),

		// ── Dirty flag ────────────────────────────────────────────────────────────
		// true = stale, needs recompute before next read
		isDirty: boolean("is_dirty").default(true).notNull(),

		// ── Audit ─────────────────────────────────────────────────────────────────
		computedAt: timestamp("computed_at", { withTimezone: true }),
		tradeCount: integer("trade_count").default(0).notNull(),

		// Fractal Planning Cascade — Phase 1.
		// Bidirectional link to monthly_plan (auto-set on plan creation when year+month+account match).
		monthlyPlanId: uuid("monthly_plan_id").references(
			(): AnyPgColumn => monthlyPlan.id,
			{
				onDelete: "set null",
			}
		),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("monthly_tax_ledger_account_idx").on(table.accountId),
		uniqueIndex("monthly_tax_ledger_account_month_idx").on(
			table.accountId,
			table.month
		),
		index("monthly_tax_ledger_darf_status_idx").on(table.darfStatus),
		index("monthly_tax_ledger_dirty_idx").on(table.isDirty),
	]
)

// ==========================================
// YEARLY PLAN TABLES
// ==========================================

export type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

export const yearlyPlans = pgTable(
	"yearly_plans",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		year: integer("year").notNull(),

		// Capital settings
		initialCapitalCents: integer("initial_capital_cents").notNull(),
		irTaxRate: decimal("ir_tax_rate", { precision: 5, scale: 2 })
			.notNull()
			.default("30.00"),
		tradingDaysPerWeek: integer("trading_days_per_week").notNull().default(5),
		defaultAssertivityPercent: decimal("default_assertivity_percent", {
			precision: 5,
			scale: 2,
		}).default("50.00"),

		// Capital ladder rules (JSONB array of LadderRuleR — money-based tiers)
		ladderRules: jsonb("ladder_rules").notNull().$type<LadderRuleR[]>(),

		startWeek: integer("start_week").notNull().default(1),

		// Fractal Planning Cascade — Phase 3 defaults.
		// Year-level R targets that the cascade falls back to when no quarterly /
		// monthly / weekly / daily override is set. Stored as decimal R-multiples.
		defaultDailyLossR: decimal("default_daily_loss_r", {
			precision: 5,
			scale: 2,
		}),
		defaultDailyWinR: decimal("default_daily_win_r", {
			precision: 5,
			scale: 2,
		}),
		defaultWeeklyLossR: decimal("default_weekly_loss_r", {
			precision: 5,
			scale: 2,
		}),
		defaultWeeklyWinR: decimal("default_weekly_win_r", {
			precision: 5,
			scale: 2,
		}),
		defaultMonthlyLossR: decimal("default_monthly_loss_r", {
			precision: 5,
			scale: 2,
		}),
		defaultMonthlyWinR: decimal("default_monthly_win_r", {
			precision: 5,
			scale: 2,
		}),

		// Phase 4b — adaptive behavior defaults (cascade fallback for live circuit breaker)
		defaultRiskProfileId: uuid("default_risk_profile_id"),
		defaultMaxConsecutiveLosses: integer("default_max_consecutive_losses"),
		defaultAllowSecondOpAfterLoss: boolean(
			"default_allow_second_op_after_loss"
		).default(true),
		defaultReduceRiskAfterLoss: boolean(
			"default_reduce_risk_after_loss"
		).default(false),
		defaultRiskReductionFactor: decimal("default_risk_reduction_factor", {
			precision: 5,
			scale: 2,
		}),
		defaultIncreaseRiskAfterWin: boolean(
			"default_increase_risk_after_win"
		).default(false),
		defaultCapRiskAfterWin: boolean("default_cap_risk_after_win").default(
			false
		),
		defaultProfitReinvestmentPercent: decimal(
			"default_profit_reinvestment_percent",
			{ precision: 5, scale: 2 }
		),

		// Aggregate count targets (cascade Σ-aware projections)
		targetMonthsToYearly: integer("target_months_to_yearly"),
		targetWeeksToYearly: integer("target_weeks_to_yearly"),

		notes: text("notes"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("yearly_plans_account_idx").on(table.accountId),
		uniqueIndex("yearly_plans_account_year_idx").on(
			table.accountId,
			table.year
		),
		foreignKey({
			name: "yearly_plans_default_risk_profile_fk",
			columns: [table.defaultRiskProfileId],
			foreignColumns: [riskManagementProfiles.id],
		}).onDelete("set null"),
	]
)

// ==========================================
// FRACTAL PLANNING CASCADE — Phase 1
// ==========================================

// Quarterly Plan — soft strategic layer (goals, reflection, playbook rotation).
// No tier math, no caps; pure intent + post-mortem container.
export const quarterlyPlan = pgTable(
	"quarterly_plan",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		yearlyPlanId: uuid("yearly_plan_id")
			.notNull()
			.references(() => yearlyPlans.id, { onDelete: "cascade" }),
		quarter: integer("quarter").notNull(),

		goalCents: bigint("goal_cents", { mode: "number" }),
		reflectionNotes: text("reflection_notes"),
		postMortemNotes: text("post_mortem_notes"),
		activePlaybookIds: jsonb("active_playbook_ids").$type<string[]>(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("quarterly_plan_year_idx").on(table.yearlyPlanId),
		uniqueIndex("quarterly_plan_year_quarter_idx").on(
			table.yearlyPlanId,
			table.quarter
		),
	]
)

// Monthly Plan — tier snapshot (1R + capital frozen at month start) + R-cap overrides.
// Fractal cascade table. All risk-config flows through resolver (yearly_plans → this table).
export const monthlyPlan = pgTable(
	"monthly_plan",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		quarterlyPlanId: uuid("quarterly_plan_id")
			.notNull()
			.references(() => quarterlyPlan.id, { onDelete: "cascade" }),
		year: integer("year").notNull(),
		month: integer("month").notNull(),

		// Tier snapshot (frozen at month start; refreshed only on drawdown_trigger or manual).
		snapshotCapitalCents: bigint("snapshot_capital_cents", {
			mode: "number",
		}).notNull(),
		snapshotOneRCents: bigint("snapshot_one_r_cents", {
			mode: "number",
		}).notNull(),
		snapshotTierIndex: integer("snapshot_tier_index").notNull(),
		snapshotComputedAt: timestamp("snapshot_computed_at", {
			withTimezone: true,
		}).notNull(),
		snapshotReason: snapshotReasonEnum("snapshot_reason").notNull(),

		// Override caps (null → fall back to year defaults via cascade resolver)
		overrideDailyLossR: decimal("override_daily_loss_r", {
			precision: 8,
			scale: 2,
		}),
		overrideWeeklyLossR: decimal("override_weekly_loss_r", {
			precision: 8,
			scale: 2,
		}),
		overrideMonthlyLossR: decimal("override_monthly_loss_r", {
			precision: 8,
			scale: 2,
		}),
		overrideDailyTargetR: decimal("override_daily_target_r", {
			precision: 8,
			scale: 2,
		}),

		overrideActivePlaybookIds: jsonb("override_active_playbook_ids").$type<
			string[]
		>(),

		// Phase 4b — adaptive behavior overrides (cascade winner over yearly defaults)
		overrideRiskProfileId: uuid("override_risk_profile_id"),
		overrideMaxConsecutiveLosses: integer("override_max_consecutive_losses"),
		overrideAllowSecondOpAfterLoss: boolean(
			"override_allow_second_op_after_loss"
		),
		overrideReduceRiskAfterLoss: boolean("override_reduce_risk_after_loss"),
		overrideRiskReductionFactor: decimal("override_risk_reduction_factor", {
			precision: 5,
			scale: 2,
		}),
		overrideIncreaseRiskAfterWin: boolean("override_increase_risk_after_win"),
		overrideCapRiskAfterWin: boolean("override_cap_risk_after_win"),
		overrideProfitReinvestmentPercent: decimal(
			"override_profit_reinvestment_percent",
			{ precision: 5, scale: 2 }
		),

		// Set by auto-link rule when matching ledger row exists.
		monthlyTaxLedgerId: uuid("monthly_tax_ledger_id").references(
			() => monthlyTaxLedger.id,
			{
				onDelete: "set null",
			}
		),

		monthlyGoalCents: bigint("monthly_goal_cents", { mode: "number" }),
		intentNotes: text("intent_notes"),
		postMortemNotes: text("post_mortem_notes"),

		// Plan-immutability (Hawks Mode design contribution): write-layer lock that
		// prevents the trader from editing their plan inside the cadence window once
		// committed. Break-glass requires recording a reason; default cadence is monthly.
		lockCadence: planLockCadenceEnum("lock_cadence")
			.default("monthly")
			.notNull(),
		lockedUntil: timestamp("locked_until", { withTimezone: true }),
		breakGlassReason: text("break_glass_reason"),
		breakGlassAt: timestamp("break_glass_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("monthly_plan_quarter_idx").on(table.quarterlyPlanId),
		uniqueIndex("monthly_plan_quarter_month_idx").on(
			table.quarterlyPlanId,
			table.month
		),
		index("monthly_plan_year_month_idx").on(table.year, table.month),
		foreignKey({
			name: "monthly_plan_override_risk_profile_fk",
			columns: [table.overrideRiskProfileId],
			foreignColumns: [riskManagementProfiles.id],
		}).onDelete("set null"),
	]
)

// Weekly Plan — R-based target/actual + override caps (subset of monthly's).
// Replaces legacy weekly_targets (points-based) which Phase 4 will drop.
export const weeklyPlan = pgTable(
	"weekly_plan",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		monthlyPlanId: uuid("monthly_plan_id")
			.notNull()
			.references(() => monthlyPlan.id, { onDelete: "cascade" }),
		isoWeek: integer("iso_week").notNull(),
		isoYear: integer("iso_year").notNull(),

		targetR: decimal("target_r", { precision: 8, scale: 2 }),
		actualR: decimal("actual_r", { precision: 8, scale: 2 }),
		actualSyncedAt: timestamp("actual_synced_at", { withTimezone: true }),

		overrideDailyLossR: decimal("override_daily_loss_r", {
			precision: 8,
			scale: 2,
		}),
		overrideWeeklyLossR: decimal("override_weekly_loss_r", {
			precision: 8,
			scale: 2,
		}),
		overrideDailyTargetR: decimal("override_daily_target_r", {
			precision: 8,
			scale: 2,
		}),

		overrideActivePlaybookIds: jsonb("override_active_playbook_ids").$type<
			string[]
		>(),

		// Phase 4b — within-session behavior overrides (subset of monthly)
		overrideMaxConsecutiveLosses: integer("override_max_consecutive_losses"),
		overrideAllowSecondOpAfterLoss: boolean(
			"override_allow_second_op_after_loss"
		),

		intentNotes: text("intent_notes"),
		postMortemNotes: text("post_mortem_notes"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("weekly_plan_month_idx").on(table.monthlyPlanId),
		uniqueIndex("weekly_plan_month_week_idx").on(
			table.monthlyPlanId,
			table.isoWeek,
			table.isoYear
		),
	]
)

// Daily Plan — pre-market intent + post-market reflection. Lazy-seeded.
export const dailyPlan = pgTable(
	"daily_plan",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		weeklyPlanId: uuid("weekly_plan_id")
			.notNull()
			.references(() => weeklyPlan.id, { onDelete: "cascade" }),
		date: date("date").notNull(),

		// Pre-market intent
		targetR: decimal("target_r", { precision: 8, scale: 2 }),
		maxTradesToday: integer("max_trades_today"),
		preMarketNotes: text("pre_market_notes"),
		mood: planMoodEnum("mood"),

		overrideDailyLossR: decimal("override_daily_loss_r", {
			precision: 8,
			scale: 2,
		}),
		overrideDailyTargetR: decimal("override_daily_target_r", {
			precision: 8,
			scale: 2,
		}),

		overrideActivePlaybookIds: jsonb("override_active_playbook_ids").$type<
			string[]
		>(),

		// Phase 4b — within-session behavior overrides
		overrideMaxConsecutiveLosses: integer("override_max_consecutive_losses"),
		overrideAllowSecondOpAfterLoss: boolean(
			"override_allow_second_op_after_loss"
		),

		// Post-market actuals (synced from trades)
		actualR: decimal("actual_r", { precision: 8, scale: 2 }),
		tradesCount: integer("trades_count"),
		actualSyncedAt: timestamp("actual_synced_at", { withTimezone: true }),
		postMarketNotes: text("post_market_notes"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("daily_plan_week_idx").on(table.weeklyPlanId),
		uniqueIndex("daily_plan_week_date_idx").on(table.weeklyPlanId, table.date),
	]
)

// Weekly Review — Friday/Saturday ritual artifact, scoped per account + ISO week.
// Stores the forward-looking output of the 6-phase review flow at
// /review/weekly/[year]/[week]. Decoupled from weekly_plan so the feature
// works even before a user has built the fractal plan tree.
export const weeklyReview = pgTable(
	"weekly_review",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		isoYear: integer("iso_year").notNull(),
		isoWeek: integer("iso_week").notNull(),

		lesson: text("lesson"),
		ruleChange: text("rule_change"),
		focusNextWeek: text("focus_next_week"),

		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("weekly_review_account_year_week_idx").on(
			table.accountId,
			table.isoYear,
			table.isoWeek
		),
	]
)

// Tier Change Log — audit trail of every 1R/tier transition.
export const tierChangeLog = pgTable(
	"tier_change_log",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		monthlyPlanId: uuid("monthly_plan_id")
			.notNull()
			.references(() => monthlyPlan.id, { onDelete: "cascade" }),

		fromTierIndex: integer("from_tier_index").notNull(),
		toTierIndex: integer("to_tier_index").notNull(),
		fromOneRCents: bigint("from_one_r_cents", { mode: "number" }).notNull(),
		toOneRCents: bigint("to_one_r_cents", { mode: "number" }).notNull(),
		triggerReason: tierChangeReasonEnum("trigger_reason").notNull(),
		triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		index("tier_change_log_account_idx").on(table.accountId),
		index("tier_change_log_month_idx").on(table.monthlyPlanId),
		index("tier_change_log_triggered_at_idx").on(table.triggeredAt),
	]
)

// ==========================================
// PLAYBOOK ENHANCEMENT TABLES (Phase 13)
// ==========================================

// Trading Conditions Table (reusable conditions, user-level — like tags)
export const tradingConditions = pgTable(
	"trading_conditions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 100 }).notNull(),
		description: text("description"),
		category: conditionCategoryEnum("category").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("trading_conditions_user_idx").on(table.userId),
		uniqueIndex("trading_conditions_user_name_idx").on(
			table.userId,
			table.name
		),
	]
)

// Strategy Conditions Junction Table (links conditions to playbooks with tier).
// Each row belongs to a specific strategy version (strategyVersionId);
// strategyId is kept denormalized for "all conditions across all versions of
// this strategy" lookups without joining strategy_versions.
export const strategyConditions = pgTable(
	"strategy_conditions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		strategyId: uuid("strategy_id")
			.notNull()
			.references(() => strategies.id, { onDelete: "cascade" }),
		strategyVersionId: uuid("strategy_version_id")
			.notNull()
			.references(() => strategyVersions.id, { onDelete: "cascade" }),
		conditionId: uuid("condition_id")
			.notNull()
			.references(() => tradingConditions.id, { onDelete: "cascade" }),
		tier: conditionTierEnum("tier").notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("strategy_conditions_strategy_idx").on(table.strategyId),
		index("strategy_conditions_version_idx").on(table.strategyVersionId),
		index("strategy_conditions_condition_idx").on(table.conditionId),
		uniqueIndex("strategy_conditions_unique_idx").on(
			table.strategyVersionId,
			table.conditionId
		),
	]
)

// Trade Conditions Junction Table (per-trade record of which conditions were
// evaluated at execution time, with met=true/false snapshot). Frozen at
// trade-write time — never recomputed. Enables setupRank rationale decomposition
// for Hawks analytics and methodology-aware playbook scorecards.
export const tradeConditions = pgTable(
	"trade_conditions",
	{
		tradeId: uuid("trade_id")
			.notNull()
			.references(() => trades.id, { onDelete: "cascade" }),
		conditionId: uuid("condition_id")
			.notNull()
			.references(() => tradingConditions.id, { onDelete: "restrict" }),
		met: boolean("met").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.tradeId, table.conditionId] }),
		index("trade_conditions_condition_idx").on(table.conditionId),
	]
)

// Strategy Scenarios Table (visual examples for a playbook).
// Each row belongs to a specific strategy version (strategyVersionId);
// strategyId is kept denormalized for "all scenarios across all versions".
export const strategyScenarios = pgTable(
	"strategy_scenarios",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		strategyId: uuid("strategy_id")
			.notNull()
			.references(() => strategies.id, { onDelete: "cascade" }),
		strategyVersionId: uuid("strategy_version_id")
			.notNull()
			.references(() => strategyVersions.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 200 }).notNull(),
		description: text("description"),
		sortOrder: integer("sort_order").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("strategy_scenarios_strategy_idx").on(table.strategyId),
		index("strategy_scenarios_version_idx").on(table.strategyVersionId),
	]
)

// Scenario Images Table (up to 3 images per scenario)
export const scenarioImages = pgTable(
	"scenario_images",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		scenarioId: uuid("scenario_id")
			.notNull()
			.references(() => strategyScenarios.id, { onDelete: "cascade" }),
		url: varchar("url", { length: 500 }).notNull(),
		s3Key: varchar("s3_key", { length: 500 }).notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("scenario_images_scenario_idx").on(table.scenarioId)]
)

// Settings Table (key-value store for misc settings)
export const settings = pgTable("settings", {
	id: uuid("id").primaryKey().defaultRandom(),
	key: varchar("key", { length: 50 }).notNull().unique(),
	value: text("value").notNull(),
	description: text("description"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
})

// Nota de Corretagem Import Audit Table
export const notaImports = pgTable(
	"nota_imports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		fileName: varchar("file_name", { length: 255 }).notNull(),
		fileHash: varchar("file_hash", { length: 64 }).notNull(),
		notaDate: timestamp("nota_date", { withTimezone: true }).notNull(),
		brokerName: varchar("broker_name", { length: 100 }),
		totalFills: integer("total_fills").notNull().default(0),
		matchedFills: integer("matched_fills").notNull().default(0),
		unmatchedFills: integer("unmatched_fills").notNull().default(0),
		tradesEnriched: integer("trades_enriched").notNull().default(0),
		status: varchar("status", { length: 20 }).notNull().default("completed"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("nota_imports_account_idx").on(table.accountId),
		index("nota_imports_file_hash_idx").on(table.fileHash),
		index("nota_imports_date_idx").on(table.notaDate),
	]
)

// User Settings Table (structured settings for trading account)
export const userSettings = pgTable("user_settings", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: varchar("user_id", { length: 50 })
		.notNull()
		.unique()
		.default("default"),

	// Prop Trading Settings
	isPropAccount: boolean("is_prop_account").default(false).notNull(),
	propFirmName: varchar("prop_firm_name", { length: 100 }),
	profitSharePercentage: decimal("profit_share_percentage", {
		precision: 5,
		scale: 2,
	})
		.default("100.00")
		.notNull(),

	// Tax rates removed — sourced from @/lib/tax/legal-rates by year.
	taxExemptThreshold: integer("tax_exempt_threshold").default(0).notNull(), // cents

	// Display Preferences
	defaultCurrency: varchar("default_currency", { length: 3 })
		.default("BRL")
		.notNull(),
	showTaxEstimates: boolean("show_tax_estimates").default(true).notNull(),
	showPropCalculations: boolean("show_prop_calculations")
		.default(true)
		.notNull(),

	// Multi-Account Preferences
	showAllAccounts: boolean("show_all_accounts").default(false).notNull(),

	// Timestamps
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
})

// ==========================================
// BUG REPORTS
// ==========================================

export const bugReports = pgTable(
	"bug_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// Reporter
		reportedBy: uuid("reported_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Content
		subject: varchar("subject", { length: 200 }).notNull(),
		description: text("description").notNull(),

		// Auto-captured context
		currentUrl: varchar("current_url", { length: 500 }),
		userAgent: varchar("user_agent", { length: 500 }),
		consoleLogs: text("console_logs"),
		networkErrors: text("network_errors"),

		// Status & lifecycle
		status: bugReportStatusEnum("status").default("open").notNull(),

		// Lifecycle timestamps
		reportedAt: timestamp("reported_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		rejectedAt: timestamp("rejected_at", { withTimezone: true }),
		closedAt: timestamp("closed_at", { withTimezone: true }),

		// Admin handling
		handledBy: uuid("handled_by").references(() => users.id, {
			onDelete: "set null",
		}),
		rejectReason: text("reject_reason"),
		adminNotes: text("admin_notes"),
	},
	(table) => [
		index("bug_reports_reported_by_idx").on(table.reportedBy),
		index("bug_reports_status_idx").on(table.status),
	]
)

export const bugReportImages = pgTable("bug_report_images", {
	id: uuid("id").primaryKey().defaultRandom(),
	bugReportId: uuid("bug_report_id")
		.notNull()
		.references(() => bugReports.id, { onDelete: "cascade" }),
	imageUrl: varchar("image_url", { length: 500 }).notNull(),
	s3Key: varchar("s3_key", { length: 500 }).notNull(),
	isScreenshot: boolean("is_screenshot").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
})

// ==========================================
// ANALYTICS FILTER PRESETS (Phase 19)
// ==========================================

export const filterPresets = pgTable(
	"filter_presets",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accountId: uuid("account_id").references(() => tradingAccounts.id, {
			onDelete: "cascade",
		}),
		name: varchar("name", { length: 100 }).notNull(),
		filters: text("filters").notNull(), // JSON: serialized filter state
		isDefault: boolean("is_default").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("filter_presets_user_idx").on(table.userId),
		index("filter_presets_account_idx").on(table.accountId),
	]
)

// ==========================================
// HISTORICAL PRICE DATA
// ==========================================

// price_candles moved to R2 Parquet — see docs/backlog.md 2026-06-08 entry
// and src/lib/candle-store/. The on-Postgres registry (priceDataVersions)
// remains as the dataset directory for the UI.

export const indicatorGroups = pgTable("indicator_groups", {
	id: uuid("id").primaryKey().defaultRandom(),

	// Unique group key (e.g., "trava", "vwap", "percent")
	key: varchar("key", { length: 50 }).notNull().unique(),

	// Human-readable name (e.g., "Travas", "VWAPs")
	displayName: varchar("display_name", { length: 100 }).notNull(),

	// Optional description of the indicator group
	description: text("description"),

	sortOrder: integer("sort_order").notNull().default(0),
	isActive: boolean("is_active").default(true).notNull(),

	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
})

export const indicatorDefinitions = pgTable(
	"indicator_definitions",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// The key used inside the JSONB column (e.g., "vwap_d", "trava_0", "ema_200")
		key: varchar("key", { length: 50 }).notNull().unique(),

		// Parent group (e.g., trava_0..trava_5 all belong to "trava" group)
		groupId: uuid("group_id")
			.notNull()
			.references(() => indicatorGroups.id, {
				onDelete: "cascade",
			}),

		// Human-readable display name (e.g., "VWAP Diario", "EMA 200")
		displayName: varchar("display_name", { length: 100 }).notNull(),

		// Original CSV header this maps from (e.g., "VWAP D", "Média Móvel E [200]")
		csvHeader: varchar("csv_header", { length: 100 }),

		// Display order within group
		sortOrder: integer("sort_order").notNull().default(0),

		isActive: boolean("is_active").default(true).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("indicator_definitions_group_idx").on(table.groupId)]
)

export const priceDataVersions = pgTable(
	"price_data_versions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		assetId: uuid("asset_id")
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),
		timeframeId: uuid("timeframe_id")
			.notNull()
			.references(() => timeframes.id, { onDelete: "cascade" }),

		// Incremented on every import — used as cache key
		version: integer("version").notNull().default(1),

		lastImportedAt: timestamp("last_imported_at", { withTimezone: true }),
		rowCount: integer("row_count"),

		// Min/max candle timestamp captured at ingest. Powers the date-range
		// chips on the backtest dropdown without a R2 round-trip per render.
		// Nullable while pre-2026-06-08 rows are backfilled.
		firstCandleAt: timestamp("first_candle_at", { withTimezone: true }),
		lastCandleAt: timestamp("last_candle_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("price_data_versions_unique_idx").on(
			table.assetId,
			table.timeframeId
		),
	]
)

// ==========================================
// MATERIALIZED AGGREGATE TABLES (Annual Reporting Phase 0)
// ==========================================

export const accountMonthlyAggregate = pgTable(
	"account_monthly_aggregate",
	{
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		year: smallint("year").notNull(),
		month: smallint("month").notNull(),
		grossCents: bigint("gross_cents", { mode: "number" }).notNull().default(0),
		netCents: bigint("net_cents", { mode: "number" }).notNull().default(0),
		points: numeric("points", { precision: 12, scale: 2 })
			.notNull()
			.default("0"),
		tradingDays: smallint("trading_days").notNull().default(0),
		gainDays: smallint("gain_days").notNull().default(0),
		lossDays: smallint("loss_days").notNull().default(0),
		isDirty: boolean("is_dirty").notNull().default(true),
		computedAt: timestamp("computed_at", { withTimezone: true }),
	},
	(table) => [
		primaryKey({ columns: [table.accountId, table.year, table.month] }),
	]
)

export const accountWeeklyAggregate = pgTable(
	"account_weekly_aggregate",
	{
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		isoYear: smallint("iso_year").notNull(),
		isoWeek: smallint("iso_week").notNull(),
		grossCents: bigint("gross_cents", { mode: "number" }).notNull().default(0),
		netCents: bigint("net_cents", { mode: "number" }).notNull().default(0),
		points: numeric("points", { precision: 12, scale: 2 })
			.notNull()
			.default("0"),
		tradingDays: smallint("trading_days").notNull().default(0),
		gainDays: smallint("gain_days").notNull().default(0),
		lossDays: smallint("loss_days").notNull().default(0),
		isDirty: boolean("is_dirty").notNull().default(true),
		computedAt: timestamp("computed_at", { withTimezone: true }),
	},
	(table) => [
		primaryKey({ columns: [table.accountId, table.isoYear, table.isoWeek] }),
	]
)

// ==========================================
// CAPITAL EVENTS TABLE (Annual Reporting Phase 1)
// ==========================================

export const accountCapitalEvents = pgTable(
	"account_capital_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		eventType: capitalEventTypeEnum("event_type").notNull(),
		// Always positive; direction implied by eventType.
		// Plain BIGINT (no encryption) — consistent with aggregate tables.
		amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
		eventDate: date("event_date").notNull(), // actual transfer date, not log date
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("ace_account_date_idx").on(table.accountId, table.eventDate),
	]
)

// ==========================================
// HAWKS MODE (mode-scoped sidecar tables)
// ==========================================

// One row per (activate / deactivate) cycle per account. Partial unique index
// enforces "at most one active mode per account" at the DB layer — the server
// action catches unique_violation on double-activate races and returns idempotent
// success.
export const accountModes = pgTable(
	"account_modes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		mode: accountModeEnum("mode").notNull(),
		activatedAt: timestamp("activated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("account_modes_account_idx").on(table.accountId),
		index("account_modes_user_idx").on(table.userId),
		uniqueIndex("account_modes_active_per_account_idx")
			.on(table.accountId)
			.where(sql`deactivated_at IS NULL`),
	]
)

// 24 seeded rows (HWK_S01..HWK_S24). screen_confirmation JSONB records which of
// Renko-60 / MACD / EMA stack / VWAP / ajuste D-1 are required for the scenario
// to "fire". scenarioType separates setup-named scenarios from mistake-named ones.
export const hawksScenarios = pgTable(
	"hawks_scenarios",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		code: varchar("code", { length: 16 }).notNull().unique(),
		nameEn: text("name_en").notNull(),
		namePt: text("name_pt").notNull(),
		descriptionPt: text("description_pt").notNull(),
		direction: hawksScenarioDirectionEnum("direction").notNull(),
		screenConfirmation: jsonb("screen_confirmation")
			.$type<{
				renko60: boolean
				macd: boolean
				emaStack: boolean
				vwap: boolean
				ajuste: boolean
			}>()
			.notNull(),
		scenarioType: hawksScenarioTypeEnum("scenario_type").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("hawks_scenarios_type_idx").on(table.scenarioType)]
)

// Sidecar on trades. tradeId PK enforces 1:1 with parent. scenarioId nullable
// because v0 ships single-scenario tagging (Open Question 2 deferred).
// accountId + tradingDay are denormalized here to enforce uniqueness on ordinal
// and prevent race-condition duplicates when two trades are created concurrently.
export const tradeHawksMetadata = pgTable(
	"trade_hawks_metadata",
	{
		tradeId: uuid("trade_id")
			.primaryKey()
			.references(() => trades.id, { onDelete: "cascade" }),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		tradingDay: date("trading_day").notNull(),
		scenarioId: uuid("scenario_id").references(() => hawksScenarios.id, {
			onDelete: "set null",
		}),
		biasAtEntry: hawksBiasEnum("bias_at_entry").notNull(),
		vwapRespected: boolean("vwap_respected").notNull(),
		ajusteRespected: boolean("ajuste_respected").notNull(),
		tripleScreenConfirmed: boolean("triple_screen_confirmed").notNull(),
		dailyTradeOrdinal: smallint("daily_trade_ordinal").notNull(),
		enteredAt: timestamp("entered_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("thm_account_day_ordinal_idx").on(
			table.accountId,
			table.tradingDay,
			table.dailyTradeOrdinal
		),
		index("thm_scenario_idx").on(table.scenarioId),
		index("thm_entered_at_idx").on(table.enteredAt),
	]
)

// One row per (accountId, tradingDay). expiresAt is set by activation logic to
// BRT 17:30 of the same trading day; coaching reads use
// `expiresAt IS NULL OR expiresAt > now()` to detect staleness without query-time
// string math.
export const dailyHawksBias = pgTable(
	"daily_hawks_bias",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		tradingDay: date("trading_day").notNull(),
		bias: hawksBiasEnum("bias").notNull(),
		renkoCloseAbove60min: boolean("renko_close_above_60min").notNull(),
		macdSlopeUp: boolean("macd_slope_up").notNull(),
		emaStackBullish: boolean("ema_stack_bullish").notNull(),
		vwapAbove: boolean("vwap_above").notNull(),
		ajusteRespected: boolean("ajuste_respected").notNull(),
		confirmedAt: timestamp("confirmed_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		notesPt: text("notes_pt"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("dhb_account_day_idx").on(table.accountId, table.tradingDay),
		index("dhb_expires_at_idx").on(table.expiresAt),
	]
)

// Append-only. Every stop edit on a Hawks-mode trade writes one row. Method-3
// violation flag = true when newStopR moves against position vs the previous
// row for the same trade.
export const tradeStopAuditEvents = pgTable(
	"trade_stop_audit_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tradeId: uuid("trade_id")
			.notNull()
			.references(() => trades.id, { onDelete: "cascade" }),
		stopPriceR: numeric("stop_price_r", { precision: 8, scale: 2 }).notNull(),
		directionVsPosition: hawksStopDirectionEnum(
			"direction_vs_position"
		).notNull(),
		methodViolation: boolean("method_violation").default(false).notNull(),
		recordedAt: timestamp("recorded_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("tsae_trade_recorded_at_idx").on(table.tradeId, table.recordedAt),
	]
)

// ═══════════════════════════════════════════════════════════════════
// Hawks Backtesting — Renko weekly brick sizes
// ═══════════════════════════════════════════════════════════════════

// One row per (asset, ISO week). effectiveDate = Monday of that week
// (ISO-safe anchor; avoids the ISO week-year edge case where week 1 can
// start in December). The asset_id column lets WIN and WDO coexist
// cleanly — every read MUST filter on assetId (today most callers
// hard-code WIN; the materializer + importer accept an asset arg).
// Upserted from the master CSV (`data/hawks/renko-sizes.csv`) via
// importHawksRenkoSizes — the CSV is WIN-only today; if/when WDO triples
// land the importer accepts an `assetSymbol` arg.
export const hawksRenkoSizes = pgTable(
	"hawks_renko_sizes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		assetId: uuid("asset_id")
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),
		effectiveDate: date("effective_date").notNull(),
		weekNumber: smallint("week_number").notNull(),
		size5m: smallint("size_5m").notNull(),
		size15m: smallint("size_15m").notNull(),
		size60m: smallint("size_60m").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("hawks_renko_sizes_asset_date_idx").on(
			table.assetId,
			table.effectiveDate
		),
	]
)

// ═══════════════════════════════════════════════════════════════════
// Asset Session Anchors — per-(asset, BRT-day) daily-constant indicators
// ═══════════════════════════════════════════════════════════════════
//
// One row per (asset, BRT date) holding values that are FIXED for the
// trading day (D-1 settlement, prior-day O/H/L/C, pivot levels, opening
// range, etc.). Decoupled from price_candles to avoid duplicating the
// same value across N candles × M timeframes, and to let new daily
// indicators land without backfilling every candle row.
//
// Payload is JSONB so new keys can be added without a migration.
// Readers wrap with a Zod schema at the application boundary
// (`src/lib/indicators/daily-anchors.ts`).
export const assetSessionAnchors = pgTable(
	"asset_session_anchors",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		assetId: uuid("asset_id")
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),
		date: date("date").notNull(),
		payload: jsonb("payload").notNull(),
		source: varchar("source", { length: 20 }).default("imported").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("asset_session_anchors_asset_date_idx").on(
			table.assetId,
			table.date
		),
		index("asset_session_anchors_date_idx").on(table.date),
	]
)

// ═══════════════════════════════════════════════════════════════════
// Asset Pivots — precomputed structural pivots per (asset, timeframe, N)
// ═══════════════════════════════════════════════════════════════════
//
// Persisted swing-sequence for every Renko candle source. Indexed by
// (asset_id, timeframe_id, confirmation_n, brick_index). Both the engine
// (entry filters, Fib gates) and the chart (overlays, Fib boxes) read
// from this table — single canonical answer per (asset, tf, N).
//
// Detection lives in `src/lib/pivots/detect-renko.ts` (single source of
// truth, "pivots-v1"). Backfill via `scripts/backfill-pivots.ts`;
// per-ingest writer triggers after `price_candles` reload.
//
// Pivot price always equals `candles[brick_index].high` (TOPO) or `.low`
// (FUNDO) — asserted at write time. Subset invariant doesn't hold (see
// detect-renko header); count-monotonicity does:
// `|pivots(N=k+1)| ≤ |pivots(N=k)|`.
export const pivotTypeEnum = pgEnum("pivot_type", ["topo", "fundo"])

export const assetPivots = pgTable(
	"asset_pivots",
	{
		assetId: uuid("asset_id")
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),
		timeframeId: uuid("timeframe_id")
			.notNull()
			.references(() => timeframes.id, { onDelete: "cascade" }),
		confirmationN: smallint("confirmation_n").notNull(),
		brickIndex: integer("brick_index").notNull(),
		pivotType: pivotTypeEnum("pivot_type").notNull(),
		pivotPrice: numeric("pivot_price", { precision: 20, scale: 8 }).notNull(),
		pivotTimestamp: timestamp("pivot_timestamp", {
			withTimezone: true,
		}).notNull(),
		algorithmVersion: varchar("algorithm_version", { length: 32 }).notNull(),
		computedAt: timestamp("computed_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			columns: [
				table.assetId,
				table.timeframeId,
				table.confirmationN,
				table.brickIndex,
			],
		}),
		check(
			"asset_pivots_confirmation_n_range",
			sql`${table.confirmationN} between 1 and 6`
		),
		index("asset_pivots_seq_idx").on(
			table.assetId,
			table.timeframeId,
			table.confirmationN,
			table.brickIndex
		),
	]
)

// ═══════════════════════════════════════════════════════════════════
// Hawks Weekly OCO — One-Cancels-Other order config per (account, week, asset)
// ═══════════════════════════════════════════════════════════════════

// One row per (account, ISO week, asset). Derived from hawksRenkoSizes +
// per-account R/R preferences. effectiveDate = Monday of the ISO week (same
// anchor as hawksRenkoSizes, so the two tables join cleanly).
// The trader sets stop_ticks / target_ticks / breakeven_trigger_ticks at the
// start of each week; trail_config captures box-trail rules (Pedro pattern:
// trail 2 boxes behind after +3R).
export const hawksWeeklyOco = pgTable(
	"hawks_weekly_oco",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		effectiveDate: date("effective_date").notNull(),
		weekNumber: smallint("week_number").notNull(),
		asset: varchar("asset", { length: 8 }).notNull(),
		stopTicks: smallint("stop_ticks").notNull(),
		targetTicks: smallint("target_ticks").notNull(),
		breakevenTriggerTicks: smallint("breakeven_trigger_ticks").notNull(),
		trailConfig: jsonb("trail_config").$type<{
			mode: "fixed" | "box_trail" | "none"
			boxesBehind?: number
			triggerAtR?: number
		} | null>(),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("hawks_weekly_oco_account_week_asset_idx").on(
			table.accountId,
			table.effectiveDate,
			table.asset
		),
		index("hawks_weekly_oco_effective_date_idx").on(table.effectiveDate),
	]
)

// ==========================================
// AI ASSISTANT — admin-managed runtime config
// ==========================================
//
// Singleton row (id = 1) the admin updates from /settings/admin to control
// rollout of the AI Assistant feature WITHOUT a redeploy. Independent of the
// build-time `AI_ASSISTANT_ENABLED` env flag; the assistant is visible only
// when BOTH switches are on. See `src/lib/ai-assistant/access.ts` for the
// runtime resolver and `docs/plans/ai-assistant-phase-1.md` §"Visibility
// gating model" for the rationale.
//
// If the row doesn't exist OR `enabled = false`, the assistant is fully
// invisible (UI returns null, API returns 404, no DB writes, no LLM calls).
export const aiAssistantConfig = pgTable("ai_assistant_config", {
	// Singleton: always id = 1. CHECK enforced via column constraint.
	id: integer("id").primaryKey().default(1),
	// Master kill-switch. Default false — admin must explicitly turn on.
	enabled: boolean("enabled").notNull().default(false),
	// Which roles see the assistant when enabled. JSON array of UserRole
	// strings ("admin" | "premium" | "trader" | "viewer"). Default ["admin"]
	// so initial rollout is admin-only even if `enabled = true`.
	allowedRoles: jsonb("allowed_roles").notNull().default(["admin"]),
	// Optional per-user allowlist (overrides allowedRoles when non-empty).
	// Array of user_id strings. Empty array = no override; use allowedRoles.
	// Useful for "dogfood on Ygor's account only" before broader rollout.
	allowedUserIds: jsonb("allowed_user_ids").notNull().default([]),
	// Surfaces enabled for this rollout. Array of surface keys
	// ("trade_detail" | "day_detail" | "analytics" | ...). Empty = none.
	// Lets admin enable the trade-detail narrator while keeping the
	// dashboard Coach off, even if both are built.
	allowedSurfaces: jsonb("allowed_surfaces").notNull().default([]),
	// Monthly per-user cost ceiling in cents. Defaults to 500 (= $5/user/mo)
	// per the Phase-1 spec. Admin can lower without a deploy if costs spike.
	monthlyCostCapCents: integer("monthly_cost_cap_cents").notNull().default(500),
	// Free-text reason for the last change (audit trail).
	lastChangeReason: text("last_change_reason"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedBy: varchar("updated_by", { length: 50 }),
})

// AI Assistant — per-user conversation thread. One row per "Ask about this
// trade" panel open; subsequent user messages on the same context reuse the
// open conversation until closedAt is set.
export const aiAssistantConversations = pgTable(
	"ai_assistant_conversations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		// Which surface opened this conversation. Matches allowedSurfaces
		// entries in ai_assistant_config. "trade_detail" for Phase 1.
		surface: text("surface").notNull(),
		// Opaque ID of the thing being narrated (e.g. tradeId as string,
		// dayKey, backtestRunId). Lets us look up all conversations about a
		// single trade across multiple sessions.
		contextRefId: text("context_ref_id").notNull(),
		// Stamps which system prompt version drove this conversation, so we
		// can correlate post-hoc when a prompt change regresses behavior.
		promptVersion: text("prompt_version").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		closedAt: timestamp("closed_at", { withTimezone: true }),
	},
	(table) => [
		index("ai_assistant_conversations_user_created_idx").on(
			table.userId,
			table.createdAt
		),
		index("ai_assistant_conversations_context_idx").on(
			table.surface,
			table.contextRefId
		),
	]
)

// AI Assistant — every message (user prompt + assistant response) in a
// conversation. Assistant rows carry the full tool-call trace + token/cost
// accounting + validator verdicts. Source of truth for the audit log (spec
// §2 hard rule 7).
export const aiAssistantMessages = pgTable(
	"ai_assistant_messages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		conversationId: uuid("conversation_id")
			.notNull()
			.references(() => aiAssistantConversations.id, {
				onDelete: "cascade",
			}),
		role: text("role").notNull(), // "user" | "assistant"
		content: text("content").notNull(),
		// Array of { name, args, result, latencyMs } objects. Null for user
		// messages and assistant turns that didn't call any tool.
		toolCalls: jsonb("tool_calls"),
		// Anthropic model id used for this turn (e.g. "claude-sonnet-4-6").
		// Null on user messages.
		model: text("model"),
		tokensIn: integer("tokens_in"),
		tokensOut: integer("tokens_out"),
		// Cost of this assistant turn in cents (fractional cents rounded up
		// at write time). Null on user messages.
		costCents: integer("cost_cents"),
		latencyMs: integer("latency_ms"),
		// Validator output: { unsourcedNumbers: [], recommendationsCaught:
		// [], offTopicFlag: bool, ... }. Null on user messages.
		validatorVerdicts: jsonb("validator_verdicts"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("ai_assistant_messages_conversation_created_idx").on(
			table.conversationId,
			table.createdAt
		),
	]
)

// AI Assistant — per-user monthly usage rollup. Hard ceiling enforced
// server-side BEFORE any LLM call (cheap PK lookup). Composite PK is
// (userId, yearMonth) so each month is its own row; rollover is implicit.
export const aiAssistantUsage = pgTable(
	"ai_assistant_usage",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// "YYYY-MM" format. Lexicographic comparison = chronological.
		yearMonth: text("year_month").notNull(),
		costCents: integer("cost_cents").notNull().default(0),
		// bigint because token counts can exceed int4 over a busy month.
		tokensIn: bigint("tokens_in", { mode: "number" }).notNull().default(0),
		tokensOut: bigint("tokens_out", { mode: "number" }).notNull().default(0),
		messageCount: integer("message_count").notNull().default(0),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.yearMonth] })]
)

// AI Assistant — validator catches. Every message whose response failed a
// validator (unsourced number, recommendation phrasing, off-topic, prompt-
// injection sink) creates one row per violation. Drives the eval-suite
// promotion ritual (learning-loop spec §A.5).
export const aiAssistantViolations = pgTable(
	"ai_assistant_violations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		messageId: uuid("message_id")
			.notNull()
			.references(() => aiAssistantMessages.id, { onDelete: "cascade" }),
		// Validator name. Matches the validator catalog in
		// src/lib/ai-assistant/validators.ts (ships PR 3).
		kind: text("kind").notNull(),
		// The substring (or full message) the validator caught. Bounded to
		// 500 chars to avoid blowing row size on hostile inputs.
		snippet: text("snippet").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("ai_assistant_violations_kind_created_idx").on(
			table.kind,
			table.createdAt
		),
	]
)

// AI Assistant — per-message user feedback (👍/👎 + category + free text).
// Drives the failure-to-eval pipeline (learning-loop spec §A.2/A.5). Feedback
// is private to the user; cascade-deletes with the message it's about.
export const aiAssistantFeedback = pgTable(
	"ai_assistant_feedback",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		messageId: uuid("message_id")
			.notNull()
			.references(() => aiAssistantMessages.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// -1 (👎), 0 (neutral / no opinion), +1 (👍).
		rating: integer("rating").notNull(),
		// Optional category set by the 👎 form: "hallucinated_number" |
		// "wrong_pattern" | "off_topic" | "useless" |
		// "recommendation_phrasing" | "great" | "other". Stored free-form
		// (text) so the eval-suite categories can evolve without a
		// migration.
		category: text("category"),
		freeText: text("free_text"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("ai_assistant_feedback_message_idx").on(table.messageId)]
)

// AI Assistant — daily telemetry rollup. One row per UTC date, written by a
// cron at 02:00 UTC. Powers /dev/ai-assistant-health admin dashboard
// (learning-loop spec §A.4) without scanning the messages table at read
// time. Aggregates are non-PII (counts + rates only) so the admin page can
// show org-wide trends without exposing any single user's content.
export const aiAssistantDailyRollup = pgTable("ai_assistant_daily_rollup", {
	// "YYYY-MM-DD". Lexicographic = chronological.
	date: text("date").primaryKey(),
	messagesTotal: integer("messages_total").notNull().default(0),
	// { trade_detail: 23, day_detail: 5, ... } — surface name → count.
	messagesBySurface: jsonb("messages_by_surface").notNull().default({}),
	// { unsourced_number: 2, recommendation_phrase: 0, ... } — violation
	// kind → count. Matches validator names.
	violations: jsonb("violations").notNull().default({}),
	// { up: 12, down: 3, byCategory: { hallucinated_number: 1, ... } }.
	feedback: jsonb("feedback").notNull().default({}),
	costCents: integer("cost_cents").notNull().default(0),
	p50LatencyMs: integer("p50_latency_ms"),
	p95LatencyMs: integer("p95_latency_ms"),
	// Distinct user_id count for the day. Helps spot a spike of new users
	// hitting the assistant after a rollout.
	activeUsers: integer("active_users").notNull().default(0),
	computedAt: timestamp("computed_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
})

// ==========================================
// RELATIONS
// ==========================================

// User Relations
export const usersRelations = relations(users, ({ many }) => ({
	tradingAccounts: many(tradingAccounts),
	sessions: many(sessions),
	oauthAccounts: many(oauthAccounts),
	strategies: many(strategies),
	tags: many(tags),
	riskManagementProfiles: many(riskManagementProfiles),
	tradingConditions: many(tradingConditions),
	filterPresets: many(filterPresets),
	bugReports: many(bugReports),
}))

// Trading Account Relations
export const tradingAccountsRelations = relations(
	tradingAccounts,
	({ one, many }) => ({
		user: one(users, {
			fields: [tradingAccounts.userId],
			references: [users.id],
		}),
		trades: many(trades),
		strategies: many(strategies),
		tags: many(tags),
		accountAssets: many(accountAssets),
		accountTimeframes: many(accountTimeframes),
		dailyChecklists: many(dailyChecklists),
		dailyAssetSettings: many(dailyAssetSettings),
		accountAssetSettings: many(accountAssetSettings),
		notaImports: many(notaImports),
		accountFeeRates: many(accountFeeRates),
		monthlyTaxLedger: many(monthlyTaxLedger),
	})
)

// Session Relations
export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
	currentAccount: one(tradingAccounts, {
		fields: [sessions.currentAccountId],
		references: [tradingAccounts.id],
	}),
}))

// OAuth Account Relations
export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
	user: one(users, {
		fields: [oauthAccounts.userId],
		references: [users.id],
	}),
}))

// Account Assets Relations
export const accountAssetsRelations = relations(accountAssets, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [accountAssets.accountId],
		references: [tradingAccounts.id],
	}),
	asset: one(assets, {
		fields: [accountAssets.assetId],
		references: [assets.id],
	}),
}))

// Account Timeframes Relations
export const accountTimeframesRelations = relations(
	accountTimeframes,
	({ one }) => ({
		account: one(tradingAccounts, {
			fields: [accountTimeframes.accountId],
			references: [tradingAccounts.id],
		}),
		timeframe: one(timeframes, {
			fields: [accountTimeframes.timeframeId],
			references: [timeframes.id],
		}),
	})
)

// Trade Relations
export const tradesRelations = relations(trades, ({ one, many }) => ({
	account: one(tradingAccounts, {
		fields: [trades.accountId],
		references: [tradingAccounts.id],
	}),
	strategy: one(strategies, {
		fields: [trades.strategyId],
		references: [strategies.id],
	}),
	strategyVersion: one(strategyVersions, {
		fields: [trades.strategyVersionId],
		references: [strategyVersions.id],
	}),
	timeframe: one(timeframes, {
		fields: [trades.timeframeId],
		references: [timeframes.id],
	}),
	tradeTags: many(tradeTags),
	executions: many(tradeExecutions),
	hawksMetadata: one(tradeHawksMetadata, {
		fields: [trades.id],
		references: [tradeHawksMetadata.tradeId],
	}),
	stopAuditEvents: many(tradeStopAuditEvents),
	conditions: many(tradeConditions),
}))

export const tradeHawksMetadataRelations = relations(
	tradeHawksMetadata,
	({ one }) => ({
		trade: one(trades, {
			fields: [tradeHawksMetadata.tradeId],
			references: [trades.id],
		}),
		scenario: one(hawksScenarios, {
			fields: [tradeHawksMetadata.scenarioId],
			references: [hawksScenarios.id],
		}),
	})
)

export const tradeStopAuditEventsRelations = relations(
	tradeStopAuditEvents,
	({ one }) => ({
		trade: one(trades, {
			fields: [tradeStopAuditEvents.tradeId],
			references: [trades.id],
		}),
	})
)

export const tradeExecutionsRelations = relations(
	tradeExecutions,
	({ one }) => ({
		trade: one(trades, {
			fields: [tradeExecutions.tradeId],
			references: [trades.id],
		}),
	})
)

export const timeframesRelations = relations(timeframes, ({ many }) => ({
	trades: many(trades),
	accountTimeframes: many(accountTimeframes),
	priceDataVersions: many(priceDataVersions),
}))

export const strategiesRelations = relations(strategies, ({ one, many }) => ({
	user: one(users, {
		fields: [strategies.userId],
		references: [users.id],
	}),
	account: one(tradingAccounts, {
		fields: [strategies.accountId],
		references: [tradingAccounts.id],
	}),
	trades: many(trades),
	versions: many(strategyVersions),
	strategyConditions: many(strategyConditions),
	scenarios: many(strategyScenarios),
}))

export const strategyVersionsRelations = relations(
	strategyVersions,
	({ one, many }) => ({
		strategy: one(strategies, {
			fields: [strategyVersions.strategyId],
			references: [strategies.id],
		}),
		trades: many(trades),
		conditions: many(strategyConditions),
		scenarios: many(strategyScenarios),
	})
)

export const tagsRelations = relations(tags, ({ one, many }) => ({
	user: one(users, {
		fields: [tags.userId],
		references: [users.id],
	}),
	account: one(tradingAccounts, {
		fields: [tags.accountId],
		references: [tradingAccounts.id],
	}),
	tradeTags: many(tradeTags),
}))

export const tradeTagsRelations = relations(tradeTags, ({ one }) => ({
	trade: one(trades, {
		fields: [tradeTags.tradeId],
		references: [trades.id],
	}),
	tag: one(tags, {
		fields: [tradeTags.tagId],
		references: [tags.id],
	}),
}))

export const assetTypesRelations = relations(assetTypes, ({ many }) => ({
	assets: many(assets),
}))

export const assetsRelations = relations(assets, ({ one, many }) => ({
	assetType: one(assetTypes, {
		fields: [assets.assetTypeId],
		references: [assetTypes.id],
	}),
	accountAssets: many(accountAssets),
	dailyAssetSettings: many(dailyAssetSettings),
	accountAssetSettings: many(accountAssetSettings),
	priceDataVersions: many(priceDataVersions),
}))

// Command Center Relations
export const dailyChecklistsRelations = relations(
	dailyChecklists,
	({ one, many }) => ({
		account: one(tradingAccounts, {
			fields: [dailyChecklists.accountId],
			references: [tradingAccounts.id],
		}),
		completions: many(checklistCompletions),
	})
)

export const checklistCompletionsRelations = relations(
	checklistCompletions,
	({ one }) => ({
		checklist: one(dailyChecklists, {
			fields: [checklistCompletions.checklistId],
			references: [dailyChecklists.id],
		}),
	})
)

export const accountAssetSettingsRelations = relations(
	accountAssetSettings,
	({ one }) => ({
		account: one(tradingAccounts, {
			fields: [accountAssetSettings.accountId],
			references: [tradingAccounts.id],
		}),
		asset: one(assets, {
			fields: [accountAssetSettings.assetId],
			references: [assets.id],
		}),
	})
)

export const dailyAssetSettingsRelations = relations(
	dailyAssetSettings,
	({ one }) => ({
		account: one(tradingAccounts, {
			fields: [dailyAssetSettings.accountId],
			references: [tradingAccounts.id],
		}),
		asset: one(assets, {
			fields: [dailyAssetSettings.assetId],
			references: [assets.id],
		}),
	})
)

// Risk Management Profiles Relations
export const riskManagementProfilesRelations = relations(
	riskManagementProfiles,
	({ one }) => ({
		createdBy: one(users, {
			fields: [riskManagementProfiles.createdByUserId],
			references: [users.id],
		}),
	})
)

// Nota Imports Relations
export const notaImportsRelations = relations(notaImports, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [notaImports.accountId],
		references: [tradingAccounts.id],
	}),
}))

// Account Fee Rates Relations
export const accountFeeRatesRelations = relations(
	accountFeeRates,
	({ one }) => ({
		account: one(tradingAccounts, {
			fields: [accountFeeRates.accountId],
			references: [tradingAccounts.id],
		}),
	})
)

// Monthly Tax Ledger Relations
export const monthlyTaxLedgerRelations = relations(
	monthlyTaxLedger,
	({ one }) => ({
		account: one(tradingAccounts, {
			fields: [monthlyTaxLedger.accountId],
			references: [tradingAccounts.id],
		}),
	})
)

// Yearly Plan Relations
export const yearlyPlansRelations = relations(yearlyPlans, ({ one, many }) => ({
	account: one(tradingAccounts, {
		fields: [yearlyPlans.accountId],
		references: [tradingAccounts.id],
	}),
	quarterlyPlans: many(quarterlyPlan),
}))

// Playbook Enhancement Relations
export const tradingConditionsRelations = relations(
	tradingConditions,
	({ one, many }) => ({
		user: one(users, {
			fields: [tradingConditions.userId],
			references: [users.id],
		}),
		strategyConditions: many(strategyConditions),
		tradeConditions: many(tradeConditions),
	})
)

export const strategyConditionsRelations = relations(
	strategyConditions,
	({ one }) => ({
		strategy: one(strategies, {
			fields: [strategyConditions.strategyId],
			references: [strategies.id],
		}),
		strategyVersion: one(strategyVersions, {
			fields: [strategyConditions.strategyVersionId],
			references: [strategyVersions.id],
		}),
		condition: one(tradingConditions, {
			fields: [strategyConditions.conditionId],
			references: [tradingConditions.id],
		}),
	})
)

export const tradeConditionsRelations = relations(
	tradeConditions,
	({ one }) => ({
		trade: one(trades, {
			fields: [tradeConditions.tradeId],
			references: [trades.id],
		}),
		condition: one(tradingConditions, {
			fields: [tradeConditions.conditionId],
			references: [tradingConditions.id],
		}),
	})
)

export const strategyScenariosRelations = relations(
	strategyScenarios,
	({ one, many }) => ({
		strategy: one(strategies, {
			fields: [strategyScenarios.strategyId],
			references: [strategies.id],
		}),
		strategyVersion: one(strategyVersions, {
			fields: [strategyScenarios.strategyVersionId],
			references: [strategyVersions.id],
		}),
		images: many(scenarioImages),
	})
)

export const scenarioImagesRelations = relations(scenarioImages, ({ one }) => ({
	scenario: one(strategyScenarios, {
		fields: [scenarioImages.scenarioId],
		references: [strategyScenarios.id],
	}),
}))

// Bug Report Relations
export const bugReportsRelations = relations(bugReports, ({ one, many }) => ({
	reporter: one(users, {
		fields: [bugReports.reportedBy],
		references: [users.id],
	}),
	handler: one(users, {
		fields: [bugReports.handledBy],
		references: [users.id],
	}),
	images: many(bugReportImages),
}))

export const bugReportImagesRelations = relations(
	bugReportImages,
	({ one }) => ({
		bugReport: one(bugReports, {
			fields: [bugReportImages.bugReportId],
			references: [bugReports.id],
		}),
	})
)

// Filter Preset Relations
export const filterPresetsRelations = relations(filterPresets, ({ one }) => ({
	user: one(users, {
		fields: [filterPresets.userId],
		references: [users.id],
	}),
	account: one(tradingAccounts, {
		fields: [filterPresets.accountId],
		references: [tradingAccounts.id],
	}),
}))

export const priceDataVersionsRelations = relations(
	priceDataVersions,
	({ one }) => ({
		asset: one(assets, {
			fields: [priceDataVersions.assetId],
			references: [assets.id],
		}),
		timeframe: one(timeframes, {
			fields: [priceDataVersions.timeframeId],
			references: [timeframes.id],
		}),
	})
)

// Indicator Group Relations
export const indicatorGroupsRelations = relations(
	indicatorGroups,
	({ many }) => ({
		indicators: many(indicatorDefinitions),
	})
)

export const indicatorDefinitionsRelations = relations(
	indicatorDefinitions,
	({ one }) => ({
		group: one(indicatorGroups, {
			fields: [indicatorDefinitions.groupId],
			references: [indicatorGroups.id],
		}),
	})
)

// ==========================================
// FRACTAL PLANNING CASCADE — Phase 1 relations
// ==========================================

export const quarterlyPlanRelations = relations(
	quarterlyPlan,
	({ one, many }) => ({
		yearlyPlan: one(yearlyPlans, {
			fields: [quarterlyPlan.yearlyPlanId],
			references: [yearlyPlans.id],
		}),
		months: many(monthlyPlan),
	})
)

export const monthlyPlanRelations = relations(monthlyPlan, ({ one, many }) => ({
	quarterlyPlan: one(quarterlyPlan, {
		fields: [monthlyPlan.quarterlyPlanId],
		references: [quarterlyPlan.id],
	}),
	taxLedger: one(monthlyTaxLedger, {
		fields: [monthlyPlan.monthlyTaxLedgerId],
		references: [monthlyTaxLedger.id],
	}),
	weeklyPlans: many(weeklyPlan),
	tierChanges: many(tierChangeLog),
}))

export const weeklyPlanRelations = relations(weeklyPlan, ({ one, many }) => ({
	monthlyPlan: one(monthlyPlan, {
		fields: [weeklyPlan.monthlyPlanId],
		references: [monthlyPlan.id],
	}),
	dailyPlans: many(dailyPlan),
}))

export const dailyPlanRelations = relations(dailyPlan, ({ one }) => ({
	weeklyPlan: one(weeklyPlan, {
		fields: [dailyPlan.weeklyPlanId],
		references: [weeklyPlan.id],
	}),
}))

export const tierChangeLogRelations = relations(tierChangeLog, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [tierChangeLog.accountId],
		references: [tradingAccounts.id],
	}),
	monthlyPlan: one(monthlyPlan, {
		fields: [tierChangeLog.monthlyPlanId],
		references: [monthlyPlan.id],
	}),
}))

// ==========================================
// TYPE EXPORTS
// ==========================================

// Auth Types
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type TradingAccount = typeof tradingAccounts.$inferSelect
export type NewTradingAccount = typeof tradingAccounts.$inferInsert

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

export type OAuthAccount = typeof oauthAccounts.$inferSelect
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert

export type VerificationToken = typeof verificationTokens.$inferSelect
export type NewVerificationToken = typeof verificationTokens.$inferInsert

export type AccountAsset = typeof accountAssets.$inferSelect
export type NewAccountAsset = typeof accountAssets.$inferInsert

export type AccountTimeframe = typeof accountTimeframes.$inferSelect
export type NewAccountTimeframe = typeof accountTimeframes.$inferInsert

// Trading Types
export type Trade = typeof trades.$inferSelect
export type NewTrade = typeof trades.$inferInsert

export type Strategy = typeof strategies.$inferSelect
export type NewStrategy = typeof strategies.$inferInsert
export type StrategyMethodology =
	(typeof strategyMethodologyEnum.enumValues)[number]

export type StrategyVersion = typeof strategyVersions.$inferSelect
export type NewStrategyVersion = typeof strategyVersions.$inferInsert

export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert

export type TradeTag = typeof tradeTags.$inferSelect
export type NewTradeTag = typeof tradeTags.$inferInsert

export type DailyJournal = typeof dailyJournals.$inferSelect
export type NewDailyJournal = typeof dailyJournals.$inferInsert

export type Setting = typeof settings.$inferSelect
export type NewSetting = typeof settings.$inferInsert

export type AssetType = typeof assetTypes.$inferSelect
export type NewAssetType = typeof assetTypes.$inferInsert

export type Asset = typeof assets.$inferSelect
export type NewAsset = typeof assets.$inferInsert

export type Timeframe = typeof timeframes.$inferSelect
export type NewTimeframe = typeof timeframes.$inferInsert

export type UserSettings = typeof userSettings.$inferSelect
export type NewUserSettings = typeof userSettings.$inferInsert

export type TradeExecution = typeof tradeExecutions.$inferSelect
export type NewTradeExecution = typeof tradeExecutions.$inferInsert

// Command Center Types
export type DailyChecklist = typeof dailyChecklists.$inferSelect
export type NewDailyChecklist = typeof dailyChecklists.$inferInsert

export type ChecklistCompletion = typeof checklistCompletions.$inferSelect
export type NewChecklistCompletion = typeof checklistCompletions.$inferInsert

export type DailyAssetSetting = typeof dailyAssetSettings.$inferSelect
export type NewDailyAssetSetting = typeof dailyAssetSettings.$inferInsert

export type AccountAssetSetting = typeof accountAssetSettings.$inferSelect
export type NewAccountAssetSetting = typeof accountAssetSettings.$inferInsert

export type YearlyPlan = typeof yearlyPlans.$inferSelect
export type NewYearlyPlan = typeof yearlyPlans.$inferInsert

export type RiskManagementProfileRow =
	typeof riskManagementProfiles.$inferSelect
export type NewRiskManagementProfileRow =
	typeof riskManagementProfiles.$inferInsert

export type NotaImport = typeof notaImports.$inferSelect
export type NewNotaImport = typeof notaImports.$inferInsert

// Playbook Enhancement Types
export type TradingCondition = typeof tradingConditions.$inferSelect
export type NewTradingCondition = typeof tradingConditions.$inferInsert

export type StrategyCondition = typeof strategyConditions.$inferSelect
export type NewStrategyCondition = typeof strategyConditions.$inferInsert

export type TradeCondition = typeof tradeConditions.$inferSelect
export type NewTradeCondition = typeof tradeConditions.$inferInsert

export type StrategyScenario = typeof strategyScenarios.$inferSelect
export type NewStrategyScenario = typeof strategyScenarios.$inferInsert

export type ScenarioImage = typeof scenarioImages.$inferSelect
export type NewScenarioImage = typeof scenarioImages.$inferInsert

export type WeeklyReview = typeof weeklyReview.$inferSelect
export type NewWeeklyReview = typeof weeklyReview.$inferInsert

// Bug Report Types
export type BugReport = typeof bugReports.$inferSelect
export type NewBugReport = typeof bugReports.$inferInsert

export type BugReportImage = typeof bugReportImages.$inferSelect
export type NewBugReportImage = typeof bugReportImages.$inferInsert

// Filter Preset Types
export type FilterPreset = typeof filterPresets.$inferSelect
export type NewFilterPreset = typeof filterPresets.$inferInsert

// Historical Price Data Types
// (PriceCandle types removed — candle data moved to R2 Parquet)

export type IndicatorGroup = typeof indicatorGroups.$inferSelect
export type NewIndicatorGroup = typeof indicatorGroups.$inferInsert

export type IndicatorDefinition = typeof indicatorDefinitions.$inferSelect
export type NewIndicatorDefinition = typeof indicatorDefinitions.$inferInsert

export type PriceDataVersion = typeof priceDataVersions.$inferSelect
export type NewPriceDataVersion = typeof priceDataVersions.$inferInsert

// ==========================================
// FRACTAL PLANNING CASCADE — Phase 1 inferred types
// ==========================================

export type QuarterlyPlan = typeof quarterlyPlan.$inferSelect
export type NewQuarterlyPlan = typeof quarterlyPlan.$inferInsert

// Fractal monthly_plan keeps FractalMonthlyPlan naming for clarity vs legacy
// `monthly_plans` table that was dropped in Phase 4b.
export type FractalMonthlyPlan = typeof monthlyPlan.$inferSelect
export type NewFractalMonthlyPlan = typeof monthlyPlan.$inferInsert

export type WeeklyPlan = typeof weeklyPlan.$inferSelect
export type NewWeeklyPlan = typeof weeklyPlan.$inferInsert

export type DailyPlan = typeof dailyPlan.$inferSelect
export type NewDailyPlan = typeof dailyPlan.$inferInsert

export type TierChangeLog = typeof tierChangeLog.$inferSelect
export type NewTierChangeLog = typeof tierChangeLog.$inferInsert

// ==========================================
// HAWKS MODE — inferred types
// ==========================================

export type AccountMode = typeof accountModes.$inferSelect
export type NewAccountMode = typeof accountModes.$inferInsert

export type HawksScenario = typeof hawksScenarios.$inferSelect
export type NewHawksScenario = typeof hawksScenarios.$inferInsert

export type TradeHawksMetadata = typeof tradeHawksMetadata.$inferSelect
export type NewTradeHawksMetadata = typeof tradeHawksMetadata.$inferInsert

export type DailyHawksBias = typeof dailyHawksBias.$inferSelect
export type NewDailyHawksBias = typeof dailyHawksBias.$inferInsert

export type TradeStopAuditEvent = typeof tradeStopAuditEvents.$inferSelect
export type NewTradeStopAuditEvent = typeof tradeStopAuditEvents.$inferInsert

export type HawksRenkoSize = typeof hawksRenkoSizes.$inferSelect
export type NewHawksRenkoSize = typeof hawksRenkoSizes.$inferInsert

export type HawksWeeklyOco = typeof hawksWeeklyOco.$inferSelect
export type NewHawksWeeklyOco = typeof hawksWeeklyOco.$inferInsert

// ==========================================
// AI ASSISTANT — inferred types
// ==========================================

export type AiAssistantConfig = typeof aiAssistantConfig.$inferSelect
export type NewAiAssistantConfig = typeof aiAssistantConfig.$inferInsert

export type AiAssistantConversation =
	typeof aiAssistantConversations.$inferSelect
export type NewAiAssistantConversation =
	typeof aiAssistantConversations.$inferInsert

export type AiAssistantMessage = typeof aiAssistantMessages.$inferSelect
export type NewAiAssistantMessage = typeof aiAssistantMessages.$inferInsert

export type AiAssistantUsage = typeof aiAssistantUsage.$inferSelect
export type NewAiAssistantUsage = typeof aiAssistantUsage.$inferInsert

export type AiAssistantViolation = typeof aiAssistantViolations.$inferSelect
export type NewAiAssistantViolation = typeof aiAssistantViolations.$inferInsert

export type AiAssistantFeedback = typeof aiAssistantFeedback.$inferSelect
export type NewAiAssistantFeedback = typeof aiAssistantFeedback.$inferInsert

export type AiAssistantDailyRollup = typeof aiAssistantDailyRollup.$inferSelect
export type NewAiAssistantDailyRollup =
	typeof aiAssistantDailyRollup.$inferInsert
