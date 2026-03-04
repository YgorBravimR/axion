import {
	pgTable,
	uuid,
	varchar,
	text,
	decimal,
	integer,
	bigint,
	timestamp,
	boolean,
	pgEnum,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

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
export const userRoleEnum = pgEnum("user_role", ["admin", "trader", "viewer"])

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

		// @deprecated Risk settings — replaced by monthlyPlans. Kept for migration compatibility.
		defaultRiskPerTrade: decimal("default_risk_per_trade", { precision: 5, scale: 2 }),
		/** @deprecated Use monthlyPlans.dailyLossCents instead */
		maxDailyLoss: text("max_daily_loss"), // cents (encrypted)
		/** @deprecated Use monthlyPlans.maxDailyTrades instead */
		maxDailyTrades: integer("max_daily_trades"),
		/** @deprecated Use monthlyPlans.monthlyLossCents instead */
		maxMonthlyLoss: text("max_monthly_loss"), // cents (encrypted)
		/** @deprecated Use monthlyPlans.allowSecondOpAfterLoss instead */
		allowSecondOpAfterLoss: boolean("allow_second_op_after_loss").default(true),
		/** @deprecated Use monthlyPlans.reduceRiskAfterLoss instead */
		reduceRiskAfterLoss: boolean("reduce_risk_after_loss").default(false),
		/** @deprecated Use monthlyPlans.riskReductionFactor instead */
		riskReductionFactor: decimal("risk_reduction_factor", { precision: 5, scale: 2 }),
		defaultCurrency: varchar("default_currency", { length: 3 }).default("BRL").notNull(),

		// Global default fees for this account (encrypted)
		defaultCommission: text("default_commission").default("0").notNull(), // cents per contract (encrypted)
		defaultFees: text("default_fees").default("0").notNull(), // cents per contract (encrypted)

		// Breakeven classification: trades within ±N ticks of entry are classified as breakeven
		defaultBreakevenTicks: integer("default_breakeven_ticks").default(2).notNull(),

		// Display preferences
		showTaxEstimates: boolean("show_tax_estimates").default(true).notNull(),
		showPropCalculations: boolean("show_prop_calculations").default(true).notNull(),
		brand: varchar("brand", { length: 20 }).default("bravo").notNull(),

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

		// Per-asset fee overrides (NULL = use account default)
		commissionOverride: integer("commission_override"), // cents, NULL = use account default
		feesOverride: integer("fees_override"), // cents, NULL = use account default
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
		targetRMultiple: decimal("target_r_multiple", { precision: 8, scale: 2 }),
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
		realizedRMultiple: decimal("realized_r_multiple", {
			precision: 8,
			scale: 2,
		}),
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
	},
	(table) => [
		index("trades_account_idx").on(table.accountId),
		index("trades_asset_idx").on(table.asset),
		index("trades_entry_date_idx").on(table.entryDate),
		index("trades_outcome_idx").on(table.outcome),
		index("trades_strategy_idx").on(table.strategyId),
		index("trades_timeframe_idx").on(table.timeframeId),
		index("trades_dedup_hash_idx").on(table.deduplicationHash),
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

/**
 * @deprecated Replaced by monthlyPlans. Kept for migration compatibility and historical data.
 */
export const dailyTargets = pgTable(
	"daily_targets",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").notNull(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => tradingAccounts.id, { onDelete: "cascade" }),
		profitTarget: integer("profit_target"), // cents
		lossLimit: integer("loss_limit"), // cents (stored as positive)
		maxTrades: integer("max_trades"),
		maxConsecutiveLosses: integer("max_consecutive_losses"),
		accountBalance: integer("account_balance"), // cents
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("daily_targets_user_idx").on(table.userId),
		index("daily_targets_account_idx").on(table.accountId),
		uniqueIndex("daily_targets_account_unique_idx").on(table.accountId),
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

// Monthly Plans Table (monthly risk configuration per account)
export const monthlyPlans = pgTable(
	"monthly_plans",
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
		riskProfileId: uuid("risk_profile_id").references(() => riskManagementProfiles.id, {
			onDelete: "set null",
		}),

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
		index("monthly_plans_account_idx").on(table.accountId),
		uniqueIndex("monthly_plans_account_year_month_idx").on(table.accountId, table.year, table.month),
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
	dailyTargets: many(dailyTargets),
	dailyAccountNotes: many(dailyAccountNotes),
	dailyAssetSettings: many(dailyAssetSettings),
	accountAssetSettings: many(accountAssetSettings),
	monthlyPlans: many(monthlyPlans),
	notaImports: many(notaImports),
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

export const dailyTargetsRelations = relations(dailyTargets, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [dailyTargets.accountId],
		references: [tradingAccounts.id],
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
	monthlyPlans: many(monthlyPlans),
}))

// Nota Imports Relations
export const notaImportsRelations = relations(notaImports, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [notaImports.accountId],
		references: [tradingAccounts.id],
	}),
}))

// Monthly Plans Relations
export const monthlyPlansRelations = relations(monthlyPlans, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [monthlyPlans.accountId],
		references: [tradingAccounts.id],
	}),
	riskProfile: one(riskManagementProfiles, {
		fields: [monthlyPlans.riskProfileId],
		references: [riskManagementProfiles.id],
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

/** @deprecated Use MonthlyPlan instead */
export type DailyTarget = typeof dailyTargets.$inferSelect
/** @deprecated Use NewMonthlyPlan instead */
export type NewDailyTarget = typeof dailyTargets.$inferInsert

export type DailyAccountNote = typeof dailyAccountNotes.$inferSelect
export type NewDailyAccountNote = typeof dailyAccountNotes.$inferInsert

export type DailyAssetSetting = typeof dailyAssetSettings.$inferSelect
export type NewDailyAssetSetting = typeof dailyAssetSettings.$inferInsert

export type AccountAssetSetting = typeof accountAssetSettings.$inferSelect
export type NewAccountAssetSetting = typeof accountAssetSettings.$inferInsert

export type MonthlyPlan = typeof monthlyPlans.$inferSelect
export type NewMonthlyPlan = typeof monthlyPlans.$inferInsert

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
