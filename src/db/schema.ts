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
} from "drizzle-orm/pg-core"
import { relations, sql } from "drizzle-orm"

// Enums
export const tradeDirectionEnum = pgEnum("trade_direction", ["long", "short"])
export const tradeOutcomeEnum = pgEnum("trade_outcome", ["win", "loss", "breakeven"])
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
export const accountTypeEnum = pgEnum("account_type", ["personal", "prop", "replay"])

// User Role Enum
export const userRoleEnum = pgEnum("user_role", ["admin", "premium", "trader", "viewer"])

// Condition Category Enum
export const conditionCategoryEnum = pgEnum("condition_category", [
	"indicator",
	"price_action",
	"market_context",
	"custom",
])

// Condition Tier Enum (cumulative ranking: mandatory → tier_2 → tier_3)
export const conditionTierEnum = pgEnum("condition_tier", ["mandatory", "tier_2", "tier_3"])

// Setup Rank Enum (A = mandatory only, AA = + tier_2, AAA = all tiers met)
export const setupRankEnum = pgEnum("setup_rank", ["A", "AA", "AAA"])

// Trade Execution Rating Enum (A-F, measures execution quality)
export const tradeRatingEnum = pgEnum("trade_rating", ["A", "B", "C", "D", "F"])

// Bug Report Status Enum
export const bugReportStatusEnum = pgEnum("bug_report_status", [
	"open",
	"accepted",
	"rejected",
	"closed",
])

// Capital Event Type Enum (Annual Reporting Phase 1)
export const capitalEventTypeEnum = pgEnum("capital_event_type", ["deposit", "withdrawal"])

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

// ==========================================
// AUTH TABLES (Phase 10)
// ==========================================

// Users Table
export const users = pgTable(
	"users",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(), // encrypted
		email: varchar("email", { length: 255 }).notNull().unique(),
		emailVerified: timestamp("email_verified", { withTimezone: true }),
		passwordHash: varchar("password_hash", { length: 255 }).notNull(),
		image: varchar("image", { length: 255 }),
		isAdmin: boolean("is_admin").default(false).notNull(),
		role: userRoleEnum("role").default("trader").notNull(),

		// Encrypted Data Encryption Key (envelope encryption)
		encryptedDek: text("encrypted_dek"),

		// General user settings (not account-specific)
		preferredLocale: varchar("preferred_locale", { length: 10 }).default("pt-BR").notNull(),
		theme: varchar("theme", { length: 20 }).default("dark").notNull(),
		dateFormat: varchar("date_format", { length: 20 }).default("DD/MM/YYYY").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
		propFirmName: text("prop_firm_name"), // encrypted
		profitSharePercentage: text("profit_share_percentage").default("100.00").notNull(), // encrypted

		// Tax settings (per account, encrypted)
		dayTradeTaxRate: text("day_trade_tax_rate").default("20.00").notNull(), // encrypted
		swingTradeTaxRate: text("swing_trade_tax_rate").default("15.00").notNull(), // encrypted

		// @deprecated Risk settings — replaced by monthlyRiskConfig. Kept for migration compatibility.
		defaultRiskPerTrade: decimal("default_risk_per_trade", { precision: 5, scale: 2 }),
		/** @deprecated Use monthlyRiskConfig.dailyLossCents instead */
		maxDailyLoss: text("max_daily_loss"), // cents (encrypted)
		/** @deprecated Use monthlyRiskConfig.maxDailyTrades instead */
		maxDailyTrades: integer("max_daily_trades"),
		/** @deprecated Use monthlyRiskConfig.monthlyLossCents instead */
		maxMonthlyLoss: text("max_monthly_loss"), // cents (encrypted)
		/** @deprecated Use monthlyRiskConfig.allowSecondOpAfterLoss instead */
		allowSecondOpAfterLoss: boolean("allow_second_op_after_loss").default(true),
		/** @deprecated Use monthlyRiskConfig.reduceRiskAfterLoss instead */
		reduceRiskAfterLoss: boolean("reduce_risk_after_loss").default(false),
		/** @deprecated Use monthlyRiskConfig.riskReductionFactor instead */
		riskReductionFactor: decimal("risk_reduction_factor", { precision: 5, scale: 2 }),
		defaultCurrency: varchar("default_currency", { length: 3 }).default("BRL").notNull(),

		// Breakeven classification: trades within ±N ticks of entry are classified as breakeven
		defaultBreakevenTicks: integer("default_breakeven_ticks").default(2).notNull(),

		// Default asset: pre-selects this asset in trade forms, calculators, etc.
		defaultAsset: varchar("default_asset", { length: 20 }),

		// Display preferences
		showTaxEstimates: boolean("show_tax_estimates").default(true).notNull(),
		showPropCalculations: boolean("show_prop_calculations").default(true).notNull(),
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
		withdrawalTargetPercent: numeric("withdrawal_target_percent", { precision: 5, scale: 2 }).default("30.00"),

		// Replay mode: the effective "today" for this account
		replayCurrentDate: timestamp("replay_current_date", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
		currentAccountId: uuid("current_account_id").references(() => tradingAccounts.id, {
			onDelete: "set null",
		}),
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
		providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
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
		uniqueIndex("oauth_accounts_provider_idx").on(table.provider, table.providerAccountId),
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
	(table) => [uniqueIndex("verification_tokens_idx").on(table.identifier, table.token)]
)

// Rate Limit Attempts (DB-backed, survives serverless cold starts)
export const rateLimitAttempts = pgTable(
	"rate_limit_attempts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		identifier: varchar("identifier", { length: 255 }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("rate_limit_attempts_identifier_created_idx").on(table.identifier, table.createdAt)]
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

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("account_timeframes_account_idx").on(table.accountId),
		uniqueIndex("account_timeframes_unique_idx").on(table.accountId, table.timeframeId),
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
		entryCriteria: text("entry_criteria"),
		exitCriteria: text("exit_criteria"),
		riskRules: text("risk_rules"),
		// R-multiple template (Fractal Planning Cascade — Phase 1).
		// All nullable; populated via Phase 3 backfill (existing targetRMultiple → finalR).
		stopR: decimal("stop_r", { precision: 8, scale: 2 }),
		partialR: decimal("partial_r", { precision: 8, scale: 2 }),
		partialProportion: decimal("partial_proportion", { precision: 4, scale: 3 }),
		finalR: decimal("final_r", { precision: 8, scale: 2 }),
		protectionR: decimal("protection_r", { precision: 8, scale: 2 }),
		defaultInstrumentSymbol: varchar("default_instrument_symbol", { length: 20 }),
		maxRiskPercent: decimal("max_risk_percent", { precision: 5, scale: 2 }),
		screenshotUrl: varchar("screenshot_url", { length: 500 }),
		screenshotS3Key: varchar("screenshot_s3_key", { length: 500 }),
		notes: text("notes"),
		isActive: boolean("is_active").default(true),
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

		// Execution (encrypted: stores ciphertext when encryption is enabled)
		entryPrice: text("entry_price").notNull(),
		exitPrice: text("exit_price"),
		positionSize: text("position_size").notNull(),

		// Risk Management (encrypted)
		stopLoss: text("stop_loss"),
		takeProfit: text("take_profit"),
		plannedRiskAmount: text("planned_risk_amount"), // cents (encrypted)
		plannedRMultiple: text("planned_r_multiple"),

		// Results (encrypted)
		pnl: text("pnl"), // cents (encrypted)
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

		// Fees (encrypted)
		commission: text("commission"), // cents per contract (encrypted)
		fees: text("fees"), // cents per contract (encrypted)
		// Total contracts executed (entry + exit + any intra-trade scaling)
		// Default is positionSize * 2 (1 entry + 1 exit per contract)
		contractsExecuted: decimal("contracts_executed", { precision: 18, scale: 8 }),

		// Narrative
		preTradeThoughts: text("pre_trade_thoughts"),
		postTradeReflection: text("post_trade_reflection"),
		lessonLearned: text("lesson_learned"),

		// Strategy Reference
		strategyId: uuid("strategy_id").references(() => strategies.id, {
			onDelete: "set null",
		}),

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
		executionMode: executionModeEnum("execution_mode").default("simple").notNull(),

		// Aggregated execution data (populated when executionMode = 'scaled')
		totalEntryQuantity: decimal("total_entry_quantity", { precision: 20, scale: 8 }),
		totalExitQuantity: decimal("total_exit_quantity", { precision: 20, scale: 8 }),
		avgEntryPrice: decimal("avg_entry_price", { precision: 20, scale: 8 }),
		avgExitPrice: decimal("avg_exit_price", { precision: 20, scale: 8 }),
		remainingQuantity: decimal("remaining_quantity", { precision: 20, scale: 8 }).default("0"),

		// Deduplication (SHA-256 hash of accountId|asset|direction|entryDate|entryPrice|exitPrice|positionSize)
		deduplicationHash: varchar("deduplication_hash", { length: 64 }),

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
		executionDate: timestamp("execution_date", { withTimezone: true }).notNull(),
		price: text("price").notNull(), // encrypted
		quantity: text("quantity").notNull(), // encrypted

		// Optional metadata
		orderType: orderTypeEnum("order_type"),
		notes: text("notes"),

		// Costs for this specific execution (encrypted)
		commission: text("commission"), // cents (encrypted)
		fees: text("fees"), // cents (encrypted)
		slippage: text("slippage"), // cents (encrypted)

		// Calculated field (encrypted) - quantity * price in cents
		executionValue: text("execution_value").notNull(), // encrypted

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
		uniqueIndex("checklist_completions_unique_idx").on(table.checklistId, table.date),
	]
)

// Daily Account Notes Table (pre/post market notes)
export const dailyAccountNotes = pgTable(
	"daily_account_notes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").notNull(),
		accountId: uuid("account_id").references(() => tradingAccounts.id, {
			onDelete: "cascade",
		}),
		date: timestamp("date", { withTimezone: true }).notNull(),
		preMarketNotes: text("pre_market_notes"),
		postMarketNotes: text("post_market_notes"),
		mood: varchar("mood", { length: 20 }), // 'great' | 'good' | 'neutral' | 'bad' | 'terrible'
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("daily_account_notes_user_idx").on(table.userId),
		index("daily_account_notes_account_idx").on(table.accountId),
		index("daily_account_notes_date_idx").on(table.date),
		uniqueIndex("daily_account_notes_unique_idx").on(table.accountId, table.date),
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
		uniqueIndex("daily_asset_settings_unique_idx").on(table.accountId, table.assetId, table.date),
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
		uniqueIndex("account_asset_settings_unique_idx").on(table.accountId, table.assetId),
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

		// Top-level limits (relational for quick queries)
		baseRiskCents: integer("base_risk_cents").notNull(),
		dailyLossCents: integer("daily_loss_cents").notNull(),
		weeklyLossCents: integer("weekly_loss_cents"), // nullable
		monthlyLossCents: integer("monthly_loss_cents").notNull(),
		dailyProfitTargetCents: integer("daily_profit_target_cents"), // nullable

		// Decision tree config (JSON stored as text — matches dailyChecklists.items pattern)
		decisionTree: text("decision_tree").notNull(), // JSON: DecisionTreeConfig

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("risk_profiles_created_by_idx").on(table.createdByUserId),
		index("risk_profiles_active_idx").on(table.isActive),
	]
)

// Monthly Risk Config Table (monthly risk configuration per account)
export const monthlyRiskConfig = pgTable(
	"monthly_risk_config",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		year: integer("year").notNull(),
		month: integer("month").notNull(), // 1-12

		// USER INPUTS (required)
		accountBalance: text("account_balance").notNull(), // cents (encrypted)
		riskPerTradePercent: decimal("risk_per_trade_percent", { precision: 5, scale: 2 }).notNull(), // e.g. "1.00" = 1%
		dailyLossPercent: decimal("daily_loss_percent", { precision: 5, scale: 2 }).notNull(), // e.g. "3.00" = 3%
		monthlyLossPercent: decimal("monthly_loss_percent", { precision: 5, scale: 2 }).notNull(), // e.g. "10.00" = 10%

		// USER INPUTS (optional)
		dailyProfitTargetPercent: decimal("daily_profit_target_percent", { precision: 5, scale: 2 }), // nullable
		maxDailyTrades: integer("max_daily_trades"), // overrides auto-derived
		maxConsecutiveLosses: integer("max_consecutive_losses"),
		allowSecondOpAfterLoss: boolean("allow_second_op_after_loss").default(true),
		reduceRiskAfterLoss: boolean("reduce_risk_after_loss").default(false),
		riskReductionFactor: decimal("risk_reduction_factor", { precision: 5, scale: 2 }), // multiplier per consecutive loss e.g. 0.50
		increaseRiskAfterWin: boolean("increase_risk_after_win").default(false),
		capRiskAfterWin: boolean("cap_risk_after_win").default(false),
		profitReinvestmentPercent: decimal("profit_reinvestment_percent", { precision: 5, scale: 2 }), // % of profit to add/cap next trade's risk
		notes: text("notes"),

		// Risk profile reference (nullable — when set, profile's decision tree governs behavior)
		// FK name shortened explicitly because the auto-generated identifier exceeds Postgres's
		// 63-char limit and would otherwise be truncated on rename.
		riskProfileId: uuid("risk_profile_id"),

		// Weekly loss limit (optional, independent of risk profile)
		weeklyLossPercent: decimal("weekly_loss_percent", { precision: 5, scale: 2 }), // nullable
		weeklyLossCents: text("weekly_loss_cents"), // nullable, auto-derived (encrypted)

		// AUTO-DERIVED (computed on save, encrypted)
		riskPerTradeCents: text("risk_per_trade_cents").notNull(), // round(balance * riskPercent / 100) (encrypted)
		dailyLossCents: text("daily_loss_cents").notNull(), // round(balance * dailyLossPercent / 100) (encrypted)
		monthlyLossCents: text("monthly_loss_cents").notNull(), // round(balance * monthlyLossPercent / 100) (encrypted)
		dailyProfitTargetCents: integer("daily_profit_target_cents"), // nullable
		derivedMaxDailyTrades: integer("derived_max_daily_trades"), // floor(dailyLossCents / riskPerTradeCents)

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("monthly_risk_config_account_idx").on(table.accountId),
		uniqueIndex("monthly_risk_config_account_year_month_idx").on(table.accountId, table.year, table.month),
		foreignKey({
			name: "monthly_risk_config_risk_profile_id_fk",
			columns: [table.riskProfileId],
			foreignColumns: [riskManagementProfiles.id],
		}).onDelete("set null"),
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
		subjectToPersonalIr: boolean("subject_to_personal_ir").default(true).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("account_fee_rates_account_idx").on(table.accountId),
		uniqueIndex("account_fee_rates_account_asset_idx").on(
			table.accountId,
			table.assetSymbol,
		),
	],
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
		grossGainCents: bigint("gross_gain_cents", { mode: "number" }).default(0).notNull(),

		// ── Fees ─────────────────────────────────────────────────────────────────
		totalTxCorretagemCents: bigint("total_tx_corretagem_cents", { mode: "number" }).default(0).notNull(),
		totalTxRegistroCents: bigint("total_tx_registro_cents", { mode: "number" }).default(0).notNull(),
		totalEmolumentosCents: bigint("total_emolumentos_cents", { mode: "number" }).default(0).notNull(),
		// ISS = totalTxCorretagem × issRatePercent/100. Municipal tax, informational deduction.
		totalIssCents: bigint("total_iss_cents", { mode: "number" }).default(0).notNull(),
		// Sum of all four fee columns above
		totalFeesCents: bigint("total_fees_cents", { mode: "number" }).default(0).notNull(),

		totalContractsExecuted: decimal("total_contracts_executed", { precision: 20, scale: 4 })
			.default("0")
			.notNull(),

		// ── IRRF ─────────────────────────────────────────────────────────────────
		// Sum of 1% × max(0, dailyGrossPnl) for each trading day in month
		irrfCents: bigint("irrf_cents", { mode: "number" }).default(0).notNull(),

		// ── Net gain for IR base ──────────────────────────────────────────────────
		// grossGainCents − totalFeesCents
		netGainBeforeCarryoverCents: bigint("net_gain_before_carryover_cents", { mode: "number" }).default(0).notNull(),

		// ── Carryover ────────────────────────────────────────────────────────────
		// Accumulated loss balance at START of this month (positive = loss owed)
		carryoverInCents: bigint("carryover_in_cents", { mode: "number" }).default(0).notNull(),
		carryoverConsumedCents: bigint("carryover_consumed_cents", { mode: "number" }).default(0).notNull(),
		// Remaining carryover passed to next month
		carryoverOutCents: bigint("carryover_out_cents", { mode: "number" }).default(0).notNull(),

		// ── IR Calculation ────────────────────────────────────────────────────────
		// max(0, netGainBeforeCarryover − carryoverConsumed)
		taxableGainCents: bigint("taxable_gain_cents", { mode: "number" }).default(0).notNull(),
		// taxableGain × irRateBps / 10000
		irGrossCents: bigint("ir_gross_cents", { mode: "number" }).default(0).notNull(),
		// max(0, irGross − irrfCents)
		darfDueCents: bigint("darf_due_cents", { mode: "number" }).default(0).notNull(),

		// ── DARF status ───────────────────────────────────────────────────────────
		darfStatus: darfStatusEnum("darf_status").default("pending").notNull(),
		darfDueDate: timestamp("darf_due_date", { withTimezone: true }),
		darfPaidAt: timestamp("darf_paid_at", { withTimezone: true }),
		// Actual amount paid (may differ from darfDueCents if trader paid early/late)
		darfPaidAmountCents: bigint("darf_paid_amount_cents", { mode: "number" }),

		// ── Informational fields ──────────────────────────────────────────────────
		// Previous month's unpaid DARF balance (display-only, not added to this DARF calc)
		previousBalanceCents: bigint("previous_balance_cents", { mode: "number" }).default(0).notNull(),
		// Operational expenses (VPS, data feeds, etc.) — informational, not tax-deductible
		gastosGeraisCents: bigint("gastos_gerais_cents", { mode: "number" }).default(0).notNull(),
		// grossGain − totalFees − darfDue − gastosGerais
		netLiquidCents: bigint("net_liquid_cents", { mode: "number" }).default(0).notNull(),

		// ── Dirty flag ────────────────────────────────────────────────────────────
		// true = stale, needs recompute before next read
		isDirty: boolean("is_dirty").default(true).notNull(),

		// ── Audit ─────────────────────────────────────────────────────────────────
		computedAt: timestamp("computed_at", { withTimezone: true }),
		tradeCount: integer("trade_count").default(0).notNull(),

		// Fractal Planning Cascade — Phase 1.
		// Bidirectional link to monthly_plan (auto-set on plan creation when year+month+account match).
		monthlyPlanId: uuid("monthly_plan_id").references(() => monthlyPlan.id, {
			onDelete: "set null",
		}),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("monthly_tax_ledger_account_idx").on(table.accountId),
		uniqueIndex("monthly_tax_ledger_account_month_idx").on(table.accountId, table.month),
		index("monthly_tax_ledger_darf_status_idx").on(table.darfStatus),
		index("monthly_tax_ledger_dirty_idx").on(table.isDirty),
	],
)

// ==========================================
// YEARLY PLAN TABLES
// ==========================================

export interface LadderRule {
	minContracts: number
	maxContracts: number
	multiplier: number
}

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
		irTaxRate: decimal("ir_tax_rate", { precision: 5, scale: 2 }).notNull().default("30.00"),
		tradingDaysPerWeek: integer("trading_days_per_week").notNull().default(5),

		// Capital ladder rules (JSONB array of LadderRule)
		ladderRules: jsonb("ladder_rules").notNull().$type<LadderRule[]>(),

		startWeek: integer("start_week").notNull().default(1),

		// Fractal Planning Cascade — Phase 3 defaults.
		// Year-level R targets that the cascade falls back to when no quarterly /
		// monthly / weekly / daily override is set. Stored as decimal R-multiples.
		defaultDailyLossR: decimal("default_daily_loss_r", { precision: 5, scale: 2 }),
		defaultDailyWinR: decimal("default_daily_win_r", { precision: 5, scale: 2 }),
		defaultWeeklyLossR: decimal("default_weekly_loss_r", { precision: 5, scale: 2 }),
		defaultWeeklyWinR: decimal("default_weekly_win_r", { precision: 5, scale: 2 }),
		defaultMonthlyLossR: decimal("default_monthly_loss_r", { precision: 5, scale: 2 }),
		defaultMonthlyWinR: decimal("default_monthly_win_r", { precision: 5, scale: 2 }),

		// Aggregate count targets (cascade Σ-aware projections)
		targetMonthsToYearly: integer("target_months_to_yearly"),
		targetWeeksToYearly: integer("target_weeks_to_yearly"),

		notes: text("notes"),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("yearly_plans_account_idx").on(table.accountId),
		uniqueIndex("yearly_plans_account_year_idx").on(table.accountId, table.year),
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

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("quarterly_plan_year_idx").on(table.yearlyPlanId),
		uniqueIndex("quarterly_plan_year_quarter_idx").on(table.yearlyPlanId, table.quarter),
	],
)

// Monthly Plan — tier snapshot (1R + capital frozen at month start) + R-cap overrides.
// Fractal cascade table. Risk-config lives separately in `monthly_risk_config`.
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
		snapshotCapitalCents: bigint("snapshot_capital_cents", { mode: "number" }).notNull(),
		snapshotOneRCents: bigint("snapshot_one_r_cents", { mode: "number" }).notNull(),
		snapshotTierIndex: integer("snapshot_tier_index").notNull(),
		snapshotComputedAt: timestamp("snapshot_computed_at", { withTimezone: true }).notNull(),
		snapshotReason: snapshotReasonEnum("snapshot_reason").notNull(),

		// Override caps (null → fall back to year defaults via cascade resolver)
		overrideDailyLossR: decimal("override_daily_loss_r", { precision: 8, scale: 2 }),
		overrideWeeklyLossR: decimal("override_weekly_loss_r", { precision: 8, scale: 2 }),
		overrideMonthlyLossR: decimal("override_monthly_loss_r", { precision: 8, scale: 2 }),
		overrideDailyTargetR: decimal("override_daily_target_r", { precision: 8, scale: 2 }),

		overrideActivePlaybookIds: jsonb("override_active_playbook_ids").$type<string[]>(),

		// Set by auto-link rule when matching ledger row exists.
		monthlyTaxLedgerId: uuid("monthly_tax_ledger_id").references(() => monthlyTaxLedger.id, {
			onDelete: "set null",
		}),

		monthlyGoalCents: bigint("monthly_goal_cents", { mode: "number" }),
		intentNotes: text("intent_notes"),
		postMortemNotes: text("post_mortem_notes"),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("monthly_plan_quarter_idx").on(table.quarterlyPlanId),
		uniqueIndex("monthly_plan_quarter_month_idx").on(table.quarterlyPlanId, table.month),
		index("monthly_plan_year_month_idx").on(table.year, table.month),
	],
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

		overrideDailyLossR: decimal("override_daily_loss_r", { precision: 8, scale: 2 }),
		overrideWeeklyLossR: decimal("override_weekly_loss_r", { precision: 8, scale: 2 }),
		overrideDailyTargetR: decimal("override_daily_target_r", { precision: 8, scale: 2 }),

		overrideActivePlaybookIds: jsonb("override_active_playbook_ids").$type<string[]>(),

		intentNotes: text("intent_notes"),
		postMortemNotes: text("post_mortem_notes"),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("weekly_plan_month_idx").on(table.monthlyPlanId),
		uniqueIndex("weekly_plan_month_week_idx").on(table.monthlyPlanId, table.isoWeek, table.isoYear),
	],
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

		overrideDailyLossR: decimal("override_daily_loss_r", { precision: 8, scale: 2 }),
		overrideDailyTargetR: decimal("override_daily_target_r", { precision: 8, scale: 2 }),

		overrideActivePlaybookIds: jsonb("override_active_playbook_ids").$type<string[]>(),

		// Post-market actuals (synced from trades)
		actualR: decimal("actual_r", { precision: 8, scale: 2 }),
		tradesCount: integer("trades_count"),
		actualSyncedAt: timestamp("actual_synced_at", { withTimezone: true }),
		postMarketNotes: text("post_market_notes"),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("daily_plan_week_idx").on(table.weeklyPlanId),
		uniqueIndex("daily_plan_week_date_idx").on(table.weeklyPlanId, table.date),
	],
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
	],
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
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("trading_conditions_user_idx").on(table.userId),
		uniqueIndex("trading_conditions_user_name_idx").on(table.userId, table.name),
	]
)

// Strategy Conditions Junction Table (links conditions to playbooks with tier)
export const strategyConditions = pgTable(
	"strategy_conditions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		strategyId: uuid("strategy_id")
			.notNull()
			.references(() => strategies.id, { onDelete: "cascade" }),
		conditionId: uuid("condition_id")
			.notNull()
			.references(() => tradingConditions.id, { onDelete: "cascade" }),
		tier: conditionTierEnum("tier").notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("strategy_conditions_strategy_idx").on(table.strategyId),
		index("strategy_conditions_condition_idx").on(table.conditionId),
		uniqueIndex("strategy_conditions_unique_idx").on(table.strategyId, table.conditionId),
	]
)

// Strategy Scenarios Table (visual examples for a playbook)
export const strategyScenarios = pgTable(
	"strategy_scenarios",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		strategyId: uuid("strategy_id")
			.notNull()
			.references(() => strategies.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 200 }).notNull(),
		description: text("description"),
		sortOrder: integer("sort_order").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("strategy_scenarios_strategy_idx").on(table.strategyId)]
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
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
	userId: varchar("user_id", { length: 50 }).notNull().unique().default("default"),

	// Prop Trading Settings
	isPropAccount: boolean("is_prop_account").default(false).notNull(),
	propFirmName: varchar("prop_firm_name", { length: 100 }),
	profitSharePercentage: decimal("profit_share_percentage", {
		precision: 5,
		scale: 2,
	})
		.default("100.00")
		.notNull(),

	// Tax Settings
	dayTradeTaxRate: decimal("day_trade_tax_rate", { precision: 5, scale: 2 })
		.default("20.00")
		.notNull(),
	swingTradeTaxRate: decimal("swing_trade_tax_rate", { precision: 5, scale: 2 })
		.default("15.00")
		.notNull(),
	taxExemptThreshold: integer("tax_exempt_threshold").default(0).notNull(), // cents

	// Display Preferences
	defaultCurrency: varchar("default_currency", { length: 3 })
		.default("BRL")
		.notNull(),
	showTaxEstimates: boolean("show_tax_estimates").default(true).notNull(),
	showPropCalculations: boolean("show_prop_calculations").default(true).notNull(),

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
		reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		rejectedAt: timestamp("rejected_at", { withTimezone: true }),
		closedAt: timestamp("closed_at", { withTimezone: true }),

		// Admin handling
		handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
		rejectReason: text("reject_reason"),
		adminNotes: text("admin_notes"),
	},
	(table) => [
		index("bug_reports_reported_by_idx").on(table.reportedBy),
		index("bug_reports_status_idx").on(table.status),
	]
)

export const bugReportImages = pgTable(
	"bug_report_images",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		bugReportId: uuid("bug_report_id")
			.notNull()
			.references(() => bugReports.id, { onDelete: "cascade" }),
		imageUrl: varchar("image_url", { length: 500 }).notNull(),
		s3Key: varchar("s3_key", { length: 500 }).notNull(),
		isScreenshot: boolean("is_screenshot").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	}
)

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

export const priceCandles = pgTable(
	"price_candles",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		assetId: uuid("asset_id")
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),
		timeframeId: uuid("timeframe_id")
			.notNull()
			.references(() => timeframes.id, { onDelete: "cascade" }),

		// OHLC core data
		timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
		open: decimal("open", { precision: 18, scale: 8 }).notNull(),
		high: decimal("high", { precision: 18, scale: 8 }).notNull(),
		low: decimal("low", { precision: 18, scale: 8 }).notNull(),
		close: decimal("close", { precision: 18, scale: 8 }).notNull(),

		// Candle metadata ("Contador de Candles" from ProfitChart CSV)
		candleIndex: integer("candle_index"),

		// Flexible indicator storage — keys are normalized slugs (e.g., "vwap_d", "trava_0")
		// Missing/null indicators are simply absent from the object
		indicators: jsonb("indicators").$type<Record<string, number>>().default({}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// Renko candles: candleIndex resets daily, so we need both timestamp + index.
		// Multiple boxes can share the same millisecond, but (timestamp + candleIndex) is unique.
		uniqueIndex("price_candles_unique_idx").on(
			table.assetId,
			table.timeframeId,
			table.timestamp,
			table.candleIndex
		),
		// Note: GIN index on indicators added manually in migration SQL:
		// CREATE INDEX price_candles_indicators_gin_idx ON price_candles USING gin (indicators);
	]
)

export const indicatorGroups = pgTable(
	"indicator_groups",
	{
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
	}
)

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
	(table) => [
		index("indicator_definitions_group_idx").on(table.groupId),
	]
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
		points: numeric("points", { precision: 12, scale: 2 }).notNull().default("0"),
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
		points: numeric("points", { precision: 12, scale: 2 }).notNull().default("0"),
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
		eventDate: date("event_date").notNull(),  // actual transfer date, not log date
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("ace_account_date_idx").on(table.accountId, table.eventDate),
	]
)

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
export const tradingAccountsRelations = relations(tradingAccounts, ({ one, many }) => ({
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
	dailyAccountNotes: many(dailyAccountNotes),
	dailyAssetSettings: many(dailyAssetSettings),
	accountAssetSettings: many(accountAssetSettings),
	monthlyRiskConfig: many(monthlyRiskConfig),
	notaImports: many(notaImports),
	accountFeeRates: many(accountFeeRates),
	monthlyTaxLedger: many(monthlyTaxLedger),
}))

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
export const accountTimeframesRelations = relations(accountTimeframes, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [accountTimeframes.accountId],
		references: [tradingAccounts.id],
	}),
	timeframe: one(timeframes, {
		fields: [accountTimeframes.timeframeId],
		references: [timeframes.id],
	}),
}))

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
	timeframe: one(timeframes, {
		fields: [trades.timeframeId],
		references: [timeframes.id],
	}),
	tradeTags: many(tradeTags),
	executions: many(tradeExecutions),
}))

export const tradeExecutionsRelations = relations(tradeExecutions, ({ one }) => ({
	trade: one(trades, {
		fields: [tradeExecutions.tradeId],
		references: [trades.id],
	}),
}))

export const timeframesRelations = relations(timeframes, ({ many }) => ({
	trades: many(trades),
	accountTimeframes: many(accountTimeframes),
	priceCandles: many(priceCandles),
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
	strategyConditions: many(strategyConditions),
	scenarios: many(strategyScenarios),
}))

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
	priceCandles: many(priceCandles),
	priceDataVersions: many(priceDataVersions),
}))

// Command Center Relations
export const dailyChecklistsRelations = relations(dailyChecklists, ({ one, many }) => ({
	account: one(tradingAccounts, {
		fields: [dailyChecklists.accountId],
		references: [tradingAccounts.id],
	}),
	completions: many(checklistCompletions),
}))

export const checklistCompletionsRelations = relations(checklistCompletions, ({ one }) => ({
	checklist: one(dailyChecklists, {
		fields: [checklistCompletions.checklistId],
		references: [dailyChecklists.id],
	}),
}))

export const dailyAccountNotesRelations = relations(dailyAccountNotes, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [dailyAccountNotes.accountId],
		references: [tradingAccounts.id],
	}),
}))

export const accountAssetSettingsRelations = relations(accountAssetSettings, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [accountAssetSettings.accountId],
		references: [tradingAccounts.id],
	}),
	asset: one(assets, {
		fields: [accountAssetSettings.assetId],
		references: [assets.id],
	}),
}))

export const dailyAssetSettingsRelations = relations(dailyAssetSettings, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [dailyAssetSettings.accountId],
		references: [tradingAccounts.id],
	}),
	asset: one(assets, {
		fields: [dailyAssetSettings.assetId],
		references: [assets.id],
	}),
}))

// Risk Management Profiles Relations
export const riskManagementProfilesRelations = relations(riskManagementProfiles, ({ one, many }) => ({
	createdBy: one(users, {
		fields: [riskManagementProfiles.createdByUserId],
		references: [users.id],
	}),
	monthlyRiskConfig: many(monthlyRiskConfig),
}))

// Nota Imports Relations
export const notaImportsRelations = relations(notaImports, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [notaImports.accountId],
		references: [tradingAccounts.id],
	}),
}))

// Account Fee Rates Relations
export const accountFeeRatesRelations = relations(accountFeeRates, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [accountFeeRates.accountId],
		references: [tradingAccounts.id],
	}),
}))

// Monthly Tax Ledger Relations
export const monthlyTaxLedgerRelations = relations(monthlyTaxLedger, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [monthlyTaxLedger.accountId],
		references: [tradingAccounts.id],
	}),
}))

// Monthly Risk Config Relations
export const monthlyRiskConfigRelations = relations(monthlyRiskConfig, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [monthlyRiskConfig.accountId],
		references: [tradingAccounts.id],
	}),
	riskProfile: one(riskManagementProfiles, {
		fields: [monthlyRiskConfig.riskProfileId],
		references: [riskManagementProfiles.id],
	}),
}))

// Yearly Plan Relations
export const yearlyPlansRelations = relations(yearlyPlans, ({ one, many }) => ({
	account: one(tradingAccounts, {
		fields: [yearlyPlans.accountId],
		references: [tradingAccounts.id],
	}),
}))

// Playbook Enhancement Relations
export const tradingConditionsRelations = relations(tradingConditions, ({ one, many }) => ({
	user: one(users, {
		fields: [tradingConditions.userId],
		references: [users.id],
	}),
	strategyConditions: many(strategyConditions),
}))

export const strategyConditionsRelations = relations(strategyConditions, ({ one }) => ({
	strategy: one(strategies, {
		fields: [strategyConditions.strategyId],
		references: [strategies.id],
	}),
	condition: one(tradingConditions, {
		fields: [strategyConditions.conditionId],
		references: [tradingConditions.id],
	}),
}))

export const strategyScenariosRelations = relations(strategyScenarios, ({ one, many }) => ({
	strategy: one(strategies, {
		fields: [strategyScenarios.strategyId],
		references: [strategies.id],
	}),
	images: many(scenarioImages),
}))

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

export const bugReportImagesRelations = relations(bugReportImages, ({ one }) => ({
	bugReport: one(bugReports, {
		fields: [bugReportImages.bugReportId],
		references: [bugReports.id],
	}),
}))

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

// Price Candle Relations
export const priceCandlesRelations = relations(priceCandles, ({ one }) => ({
	asset: one(assets, {
		fields: [priceCandles.assetId],
		references: [assets.id],
	}),
	timeframe: one(timeframes, {
		fields: [priceCandles.timeframeId],
		references: [timeframes.id],
	}),
}))

export const priceDataVersionsRelations = relations(priceDataVersions, ({ one }) => ({
	asset: one(assets, {
		fields: [priceDataVersions.assetId],
		references: [assets.id],
	}),
	timeframe: one(timeframes, {
		fields: [priceDataVersions.timeframeId],
		references: [timeframes.id],
	}),
}))

// Indicator Group Relations
export const indicatorGroupsRelations = relations(indicatorGroups, ({ many }) => ({
	indicators: many(indicatorDefinitions),
}))

export const indicatorDefinitionsRelations = relations(indicatorDefinitions, ({ one }) => ({
	group: one(indicatorGroups, {
		fields: [indicatorDefinitions.groupId],
		references: [indicatorGroups.id],
	}),
}))

// ==========================================
// FRACTAL PLANNING CASCADE — Phase 1 relations
// ==========================================

export const quarterlyPlanRelations = relations(quarterlyPlan, ({ one, many }) => ({
	yearlyPlan: one(yearlyPlans, {
		fields: [quarterlyPlan.yearlyPlanId],
		references: [yearlyPlans.id],
	}),
	months: many(monthlyPlan),
}))

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

export type DailyAccountNote = typeof dailyAccountNotes.$inferSelect
export type NewDailyAccountNote = typeof dailyAccountNotes.$inferInsert

export type DailyAssetSetting = typeof dailyAssetSettings.$inferSelect
export type NewDailyAssetSetting = typeof dailyAssetSettings.$inferInsert

export type AccountAssetSetting = typeof accountAssetSettings.$inferSelect
export type NewAccountAssetSetting = typeof accountAssetSettings.$inferInsert

export type MonthlyRiskConfig = typeof monthlyRiskConfig.$inferSelect
export type NewMonthlyRiskConfig = typeof monthlyRiskConfig.$inferInsert

export type YearlyPlan = typeof yearlyPlans.$inferSelect
export type NewYearlyPlan = typeof yearlyPlans.$inferInsert

export type RiskManagementProfileRow = typeof riskManagementProfiles.$inferSelect
export type NewRiskManagementProfileRow = typeof riskManagementProfiles.$inferInsert

export type NotaImport = typeof notaImports.$inferSelect
export type NewNotaImport = typeof notaImports.$inferInsert

// Playbook Enhancement Types
export type TradingCondition = typeof tradingConditions.$inferSelect
export type NewTradingCondition = typeof tradingConditions.$inferInsert

export type StrategyCondition = typeof strategyConditions.$inferSelect
export type NewStrategyCondition = typeof strategyConditions.$inferInsert

export type StrategyScenario = typeof strategyScenarios.$inferSelect
export type NewStrategyScenario = typeof strategyScenarios.$inferInsert

export type ScenarioImage = typeof scenarioImages.$inferSelect
export type NewScenarioImage = typeof scenarioImages.$inferInsert

// Bug Report Types
export type BugReport = typeof bugReports.$inferSelect
export type NewBugReport = typeof bugReports.$inferInsert

export type BugReportImage = typeof bugReportImages.$inferSelect
export type NewBugReportImage = typeof bugReportImages.$inferInsert

// Filter Preset Types
export type FilterPreset = typeof filterPresets.$inferSelect
export type NewFilterPreset = typeof filterPresets.$inferInsert

// Historical Price Data Types
export type PriceCandle = typeof priceCandles.$inferSelect
export type NewPriceCandle = typeof priceCandles.$inferInsert

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

// Fractal monthly_plan keeps FractalMonthlyPlan naming established before the
// legacy `monthly_plans` table was renamed to `monthly_risk_config` (Phase 4b).
export type FractalMonthlyPlan = typeof monthlyPlan.$inferSelect
export type NewFractalMonthlyPlan = typeof monthlyPlan.$inferInsert

export type WeeklyPlan = typeof weeklyPlan.$inferSelect
export type NewWeeklyPlan = typeof weeklyPlan.$inferInsert

export type DailyPlan = typeof dailyPlan.$inferSelect
export type NewDailyPlan = typeof dailyPlan.$inferInsert

export type TierChangeLog = typeof tierChangeLog.$inferSelect
export type NewTierChangeLog = typeof tierChangeLog.$inferInsert
