import { pgTable, index, foreignKey, unique, uuid, varchar, numeric, integer, boolean, timestamp, uniqueIndex, text, bigint, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const accountType = pgEnum("account_type", ['personal', 'prop', 'replay'])
export const conditionCategory = pgEnum("condition_category", ['indicator', 'price_action', 'market_context', 'custom'])
export const conditionTier = pgEnum("condition_tier", ['mandatory', 'tier_2', 'tier_3'])
export const executionMode = pgEnum("execution_mode", ['simple', 'scaled'])
export const executionType = pgEnum("execution_type", ['entry', 'exit'])
export const orderType = pgEnum("order_type", ['market', 'limit', 'stop', 'stop_limit'])
export const setupRank = pgEnum("setup_rank", ['A', 'AA', 'AAA'])
export const tagType = pgEnum("tag_type", ['setup', 'mistake', 'general'])
export const timeframeType = pgEnum("timeframe_type", ['time_based', 'renko'])
export const timeframeUnit = pgEnum("timeframe_unit", ['minutes', 'hours', 'days', 'weeks', 'ticks', 'points'])
export const tradeDirection = pgEnum("trade_direction", ['long', 'short'])
export const tradeOutcome = pgEnum("trade_outcome", ['win', 'loss', 'breakeven'])
export const userRole = pgEnum("user_role", ['admin', 'trader', 'viewer'])


export const assets = pgTable("assets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	symbol: varchar({ length: 20 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	assetTypeId: uuid("asset_type_id").notNull(),
	tickSize: numeric("tick_size", { precision: 18, scale:  8 }).notNull(),
	tickValue: integer("tick_value").notNull(),
	currency: varchar({ length: 10 }).default('BRL').notNull(),
	multiplier: numeric({ precision: 18, scale:  4 }).default('1'),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("assets_asset_type_idx").using("btree", table.assetTypeId.asc().nullsLast().op("uuid_ops")),
	index("assets_symbol_idx").using("btree", table.symbol.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.assetTypeId],
			foreignColumns: [assetTypes.id],
			name: "assets_asset_type_id_asset_types_id_fk"
		}).onDelete("restrict"),
	unique("assets_symbol_unique").on(table.symbol),
]);

export const accountTimeframes = pgTable("account_timeframes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	timeframeId: uuid("timeframe_id").notNull(),
	isEnabled: boolean("is_enabled").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("account_timeframes_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("account_timeframes_unique_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.timeframeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "account_timeframes_account_id_trading_accounts_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.timeframeId],
			foreignColumns: [timeframes.id],
			name: "account_timeframes_timeframe_id_timeframes_id_fk"
		}).onDelete("cascade"),
]);

export const dailyChecklists = pgTable("daily_checklists", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	accountId: uuid("account_id"),
	name: varchar({ length: 100 }).notNull(),
	items: text().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("daily_checklists_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("daily_checklists_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "daily_checklists_account_id_trading_accounts_id_fk"
		}).onDelete("cascade"),
]);

export const dailyAccountNotes = pgTable("daily_account_notes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	accountId: uuid("account_id"),
	date: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	preMarketNotes: text("pre_market_notes"),
	postMarketNotes: text("post_market_notes"),
	mood: varchar({ length: 20 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("daily_account_notes_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("daily_account_notes_date_idx").using("btree", table.date.asc().nullsLast().op("timestamptz_ops")),
	uniqueIndex("daily_account_notes_unique_idx").using("btree", table.accountId.asc().nullsLast().op("timestamptz_ops"), table.date.asc().nullsLast().op("uuid_ops")),
	index("daily_account_notes_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "daily_account_notes_account_id_trading_accounts_id_fk"
		}).onDelete("cascade"),
]);

export const dailyAssetSettings = pgTable("daily_asset_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	accountId: uuid("account_id").notNull(),
	assetId: uuid("asset_id").notNull(),
	date: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	bias: varchar({ length: 10 }),
	maxDailyTrades: integer("max_daily_trades"),
	maxPositionSize: integer("max_position_size"),
	notes: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("daily_asset_settings_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("daily_asset_settings_asset_idx").using("btree", table.assetId.asc().nullsLast().op("uuid_ops")),
	index("daily_asset_settings_date_idx").using("btree", table.date.asc().nullsLast().op("timestamptz_ops")),
	uniqueIndex("daily_asset_settings_unique_idx").using("btree", table.accountId.asc().nullsLast().op("timestamptz_ops"), table.assetId.asc().nullsLast().op("timestamptz_ops"), table.date.asc().nullsLast().op("uuid_ops")),
	index("daily_asset_settings_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "daily_asset_settings_account_id_trading_accounts_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.assetId],
			foreignColumns: [assets.id],
			name: "daily_asset_settings_asset_id_assets_id_fk"
		}).onDelete("cascade"),
]);

export const accountAssets = pgTable("account_assets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	assetId: uuid("asset_id").notNull(),
	isEnabled: boolean("is_enabled").default(true).notNull(),
	commissionOverride: integer("commission_override"),
	feesOverride: integer("fees_override"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	breakevenTicksOverride: integer("breakeven_ticks_override"),
}, (table) => [
	index("account_assets_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("account_assets_unique_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.assetId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "account_assets_account_id_trading_accounts_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.assetId],
			foreignColumns: [assets.id],
			name: "account_assets_asset_id_assets_id_fk"
		}).onDelete("cascade"),
]);

export const accountAssetSettings = pgTable("account_asset_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	accountId: uuid("account_id").notNull(),
	assetId: uuid("asset_id").notNull(),
	bias: varchar({ length: 10 }),
	maxDailyTrades: integer("max_daily_trades"),
	maxPositionSize: integer("max_position_size"),
	notes: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("account_asset_settings_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("account_asset_settings_asset_idx").using("btree", table.assetId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("account_asset_settings_unique_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops"), table.assetId.asc().nullsLast().op("uuid_ops")),
	index("account_asset_settings_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "account_asset_settings_account_id_trading_accounts_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.assetId],
			foreignColumns: [assets.id],
			name: "account_asset_settings_asset_id_assets_id_fk"
		}).onDelete("cascade"),
]);

export const assetTypes = pgTable("asset_types", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("asset_types_code_unique").on(table.code),
]);

export const dailyJournals = pgTable("daily_journals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	date: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	marketOutlook: text("market_outlook"),
	focusGoals: text("focus_goals"),
	mentalState: integer("mental_state"),
	sessionReview: text("session_review"),
	emotionalState: integer("emotional_state"),
	keyTakeaways: text("key_takeaways"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalPnl: bigint("total_pnl", { mode: "number" }),
	tradeCount: integer("trade_count"),
	winCount: integer("win_count"),
	lossCount: integer("loss_count"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("daily_journals_date_idx").using("btree", table.date.asc().nullsLast().op("timestamptz_ops")),
	unique("daily_journals_date_unique").on(table.date),
]);

export const notaImports = pgTable("nota_imports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	fileHash: varchar("file_hash", { length: 64 }).notNull(),
	notaDate: timestamp("nota_date", { withTimezone: true, mode: 'string' }).notNull(),
	brokerName: varchar("broker_name", { length: 100 }),
	totalFills: integer("total_fills").default(0).notNull(),
	matchedFills: integer("matched_fills").default(0).notNull(),
	unmatchedFills: integer("unmatched_fills").default(0).notNull(),
	tradesEnriched: integer("trades_enriched").default(0).notNull(),
	status: varchar({ length: 20 }).default('completed').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("nota_imports_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("nota_imports_date_idx").using("btree", table.notaDate.asc().nullsLast().op("timestamptz_ops")),
	index("nota_imports_file_hash_idx").using("btree", table.fileHash.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "nota_imports_account_id_trading_accounts_id_fk"
		}).onDelete("cascade"),
]);

export const oauthAccounts = pgTable("oauth_accounts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	type: varchar({ length: 255 }).notNull(),
	provider: varchar({ length: 255 }).notNull(),
	providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
	refreshToken: text("refresh_token"),
	accessToken: text("access_token"),
	expiresAt: integer("expires_at"),
	tokenType: varchar("token_type", { length: 255 }),
	scope: varchar({ length: 255 }),
	idToken: text("id_token"),
	sessionState: varchar("session_state", { length: 255 }),
}, (table) => [
	uniqueIndex("oauth_accounts_provider_idx").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.providerAccountId.asc().nullsLast().op("text_ops")),
	index("oauth_accounts_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "oauth_accounts_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const sessions = pgTable("sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionToken: varchar("session_token", { length: 255 }).notNull(),
	userId: uuid("user_id").notNull(),
	currentAccountId: uuid("current_account_id"),
	expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("sessions_token_idx").using("btree", table.sessionToken.asc().nullsLast().op("text_ops")),
	index("sessions_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "sessions_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.currentAccountId],
			foreignColumns: [tradingAccounts.id],
			name: "sessions_current_account_id_trading_accounts_id_fk"
		}).onDelete("set null"),
	unique("sessions_session_token_unique").on(table.sessionToken),
]);

export const settings = pgTable("settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	key: varchar({ length: 50 }).notNull(),
	value: text().notNull(),
	description: text(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("settings_key_unique").on(table.key),
]);

export const tradingAccounts = pgTable("trading_accounts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	isDefault: boolean("is_default").default(false).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	accountType: accountType("account_type").default('personal').notNull(),
	propFirmName: text("prop_firm_name"),
	profitSharePercentage: text("profit_share_percentage").default('100.00').notNull(),
	dayTradeTaxRate: text("day_trade_tax_rate").default('20.00').notNull(),
	swingTradeTaxRate: text("swing_trade_tax_rate").default('15.00').notNull(),
	defaultRiskPerTrade: numeric("default_risk_per_trade", { precision: 5, scale:  2 }),
	maxDailyLoss: text("max_daily_loss"),
	maxDailyTrades: integer("max_daily_trades"),
	maxMonthlyLoss: text("max_monthly_loss"),
	allowSecondOpAfterLoss: boolean("allow_second_op_after_loss").default(true),
	reduceRiskAfterLoss: boolean("reduce_risk_after_loss").default(false),
	riskReductionFactor: numeric("risk_reduction_factor", { precision: 5, scale:  2 }),
	defaultCurrency: varchar("default_currency", { length: 3 }).default('BRL').notNull(),
	defaultCommission: text("default_commission").default('0').notNull(),
	defaultFees: text("default_fees").default('0').notNull(),
	showTaxEstimates: boolean("show_tax_estimates").default(true).notNull(),
	showPropCalculations: boolean("show_prop_calculations").default(true).notNull(),
	brand: varchar({ length: 20 }).default('bravo').notNull(),
	replayCurrentDate: timestamp("replay_current_date", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	defaultBreakevenTicks: integer("default_breakeven_ticks").default(2).notNull(),
	defaultAsset: varchar("default_asset", { length: 20 }),
}, (table) => [
	index("trading_accounts_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("trading_accounts_user_name_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "trading_accounts_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const tradeTags = pgTable("trade_tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tradeId: uuid("trade_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("trade_tags_tag_idx").using("btree", table.tagId.asc().nullsLast().op("uuid_ops")),
	index("trade_tags_trade_idx").using("btree", table.tradeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.tradeId],
			foreignColumns: [trades.id],
			name: "trade_tags_trade_id_trades_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [tags.id],
			name: "trade_tags_tag_id_tags_id_fk"
		}).onDelete("cascade"),
]);

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	email: varchar({ length: 255 }).notNull(),
	emailVerified: timestamp("email_verified", { withTimezone: true, mode: 'string' }),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
	image: varchar({ length: 255 }),
	isAdmin: boolean("is_admin").default(false).notNull(),
	preferredLocale: varchar("preferred_locale", { length: 10 }).default('pt-BR').notNull(),
	theme: varchar({ length: 20 }).default('dark').notNull(),
	dateFormat: varchar("date_format", { length: 20 }).default('DD/MM/YYYY').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	encryptedDek: text("encrypted_dek"),
	role: userRole().default('trader').notNull(),
}, (table) => [
	index("users_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	unique("users_email_unique").on(table.email),
]);

export const trades = pgTable("trades", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id"),
	asset: varchar({ length: 20 }).notNull(),
	direction: tradeDirection().notNull(),
	timeframeId: uuid("timeframe_id"),
	entryDate: timestamp("entry_date", { withTimezone: true, mode: 'string' }).notNull(),
	exitDate: timestamp("exit_date", { withTimezone: true, mode: 'string' }),
	entryPrice: text("entry_price").notNull(),
	exitPrice: text("exit_price"),
	positionSize: text("position_size").notNull(),
	stopLoss: text("stop_loss"),
	takeProfit: text("take_profit"),
	plannedRiskAmount: text("planned_risk_amount"),
	plannedRMultiple: text("planned_r_multiple"),
	pnl: text(),
	pnlPercent: numeric("pnl_percent", { precision: 8, scale:  4 }),
	realizedRMultiple: numeric("realized_r_multiple", { precision: 8, scale:  2 }),
	outcome: tradeOutcome(),
	mfe: numeric({ precision: 18, scale:  8 }),
	mae: numeric({ precision: 18, scale:  8 }),
	mfeR: numeric("mfe_r", { precision: 8, scale:  2 }),
	maeR: numeric("mae_r", { precision: 8, scale:  2 }),
	commission: text(),
	fees: text(),
	contractsExecuted: numeric("contracts_executed", { precision: 18, scale:  8 }),
	preTradeThoughts: text("pre_trade_thoughts"),
	postTradeReflection: text("post_trade_reflection"),
	lessonLearned: text("lesson_learned"),
	strategyId: uuid("strategy_id"),
	followedPlan: boolean("followed_plan"),
	disciplineNotes: text("discipline_notes"),
	executionMode: executionMode("execution_mode").default('simple').notNull(),
	totalEntryQuantity: numeric("total_entry_quantity", { precision: 20, scale:  8 }),
	totalExitQuantity: numeric("total_exit_quantity", { precision: 20, scale:  8 }),
	avgEntryPrice: numeric("avg_entry_price", { precision: 20, scale:  8 }),
	avgExitPrice: numeric("avg_exit_price", { precision: 20, scale:  8 }),
	remainingQuantity: numeric("remaining_quantity", { precision: 20, scale:  8 }).default('0'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isArchived: boolean("is_archived").default(false),
	deduplicationHash: varchar("deduplication_hash", { length: 64 }),
	setupRank: setupRank("setup_rank"),
	screenshotUrl: varchar("screenshot_url", { length: 500 }),
	screenshotS3Key: varchar("screenshot_s3_key", { length: 500 }),
}, (table) => [
	index("trades_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("trades_asset_idx").using("btree", table.asset.asc().nullsLast().op("text_ops")),
	index("trades_dedup_hash_idx").using("btree", table.deduplicationHash.asc().nullsLast().op("text_ops")),
	index("trades_entry_date_idx").using("btree", table.entryDate.asc().nullsLast().op("timestamptz_ops")),
	index("trades_outcome_idx").using("btree", table.outcome.asc().nullsLast().op("enum_ops")),
	index("trades_strategy_idx").using("btree", table.strategyId.asc().nullsLast().op("uuid_ops")),
	index("trades_timeframe_idx").using("btree", table.timeframeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "trades_account_id_trading_accounts_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.timeframeId],
			foreignColumns: [timeframes.id],
			name: "trades_timeframe_id_timeframes_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.strategyId],
			foreignColumns: [strategies.id],
			name: "trades_strategy_id_strategies_id_fk"
		}).onDelete("set null"),
]);

export const timeframes = pgTable("timeframes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 20 }).notNull(),
	name: varchar({ length: 50 }).notNull(),
	type: timeframeType().notNull(),
	value: integer().notNull(),
	unit: timeframeUnit().notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("timeframes_code_unique").on(table.code),
]);

export const userSettings = pgTable("user_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id", { length: 50 }).default('default').notNull(),
	isPropAccount: boolean("is_prop_account").default(false).notNull(),
	propFirmName: varchar("prop_firm_name", { length: 100 }),
	profitSharePercentage: numeric("profit_share_percentage", { precision: 5, scale:  2 }).default('100.00').notNull(),
	dayTradeTaxRate: numeric("day_trade_tax_rate", { precision: 5, scale:  2 }).default('20.00').notNull(),
	swingTradeTaxRate: numeric("swing_trade_tax_rate", { precision: 5, scale:  2 }).default('15.00').notNull(),
	taxExemptThreshold: integer("tax_exempt_threshold").default(0).notNull(),
	defaultCurrency: varchar("default_currency", { length: 3 }).default('BRL').notNull(),
	showTaxEstimates: boolean("show_tax_estimates").default(true).notNull(),
	showPropCalculations: boolean("show_prop_calculations").default(true).notNull(),
	showAllAccounts: boolean("show_all_accounts").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("user_settings_user_id_unique").on(table.userId),
]);

export const tags = pgTable("tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	accountId: uuid("account_id"),
	name: varchar({ length: 50 }).notNull(),
	type: tagType().notNull(),
	color: varchar({ length: 7 }),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("tags_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("tags_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("tags_user_name_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "tags_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "tags_account_id_trading_accounts_id_fk"
		}).onDelete("set null"),
]);

export const verificationTokens = pgTable("verification_tokens", {
	identifier: varchar({ length: 255 }).notNull(),
	token: varchar({ length: 255 }).notNull(),
	expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	uniqueIndex("verification_tokens_idx").using("btree", table.identifier.asc().nullsLast().op("text_ops"), table.token.asc().nullsLast().op("text_ops")),
	unique("verification_tokens_token_unique").on(table.token),
]);

export const checklistCompletions = pgTable("checklist_completions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	checklistId: uuid("checklist_id").notNull(),
	userId: text("user_id").notNull(),
	date: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	completedItems: text("completed_items").default('[]').notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("checklist_completions_checklist_idx").using("btree", table.checklistId.asc().nullsLast().op("uuid_ops")),
	index("checklist_completions_date_idx").using("btree", table.date.asc().nullsLast().op("timestamptz_ops")),
	uniqueIndex("checklist_completions_unique_idx").using("btree", table.checklistId.asc().nullsLast().op("timestamptz_ops"), table.date.asc().nullsLast().op("uuid_ops")),
	index("checklist_completions_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.checklistId],
			foreignColumns: [dailyChecklists.id],
			name: "checklist_completions_checklist_id_daily_checklists_id_fk"
		}).onDelete("cascade"),
]);

export const dailyTargets = pgTable("daily_targets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	accountId: uuid("account_id").notNull(),
	profitTarget: integer("profit_target"),
	lossLimit: integer("loss_limit"),
	maxTrades: integer("max_trades"),
	maxConsecutiveLosses: integer("max_consecutive_losses"),
	accountBalance: integer("account_balance"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("daily_targets_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("daily_targets_account_unique_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	index("daily_targets_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "daily_targets_account_id_trading_accounts_id_fk"
		}).onDelete("cascade"),
]);

export const strategyConditions = pgTable("strategy_conditions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	strategyId: uuid("strategy_id").notNull(),
	conditionId: uuid("condition_id").notNull(),
	tier: conditionTier().notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("strategy_conditions_condition_idx").using("btree", table.conditionId.asc().nullsLast().op("uuid_ops")),
	index("strategy_conditions_strategy_idx").using("btree", table.strategyId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("strategy_conditions_unique_idx").using("btree", table.strategyId.asc().nullsLast().op("uuid_ops"), table.conditionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.strategyId],
			foreignColumns: [strategies.id],
			name: "strategy_conditions_strategy_id_strategies_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.conditionId],
			foreignColumns: [tradingConditions.id],
			name: "strategy_conditions_condition_id_trading_conditions_id_fk"
		}).onDelete("cascade"),
]);

export const strategyScenarios = pgTable("strategy_scenarios", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	strategyId: uuid("strategy_id").notNull(),
	name: varchar({ length: 200 }).notNull(),
	description: text(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("strategy_scenarios_strategy_idx").using("btree", table.strategyId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.strategyId],
			foreignColumns: [strategies.id],
			name: "strategy_scenarios_strategy_id_strategies_id_fk"
		}).onDelete("cascade"),
]);

export const tradingConditions = pgTable("trading_conditions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	category: conditionCategory().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("trading_conditions_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("trading_conditions_user_name_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "trading_conditions_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const riskManagementProfiles = pgTable("risk_management_profiles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	createdByUserId: uuid("created_by_user_id").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	baseRiskCents: integer("base_risk_cents").notNull(),
	dailyLossCents: integer("daily_loss_cents").notNull(),
	weeklyLossCents: integer("weekly_loss_cents"),
	monthlyLossCents: integer("monthly_loss_cents").notNull(),
	dailyProfitTargetCents: integer("daily_profit_target_cents"),
	decisionTree: text("decision_tree").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("risk_profiles_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("risk_profiles_created_by_idx").using("btree", table.createdByUserId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [users.id],
			name: "risk_management_profiles_created_by_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const tradeExecutions = pgTable("trade_executions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tradeId: uuid("trade_id").notNull(),
	executionType: executionType("execution_type").notNull(),
	executionDate: timestamp("execution_date", { withTimezone: true, mode: 'string' }).notNull(),
	price: text().notNull(),
	quantity: text().notNull(),
	orderType: orderType("order_type"),
	notes: text(),
	commission: text(),
	fees: text(),
	slippage: text(),
	executionValue: text("execution_value").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("trade_executions_date_idx").using("btree", table.executionDate.asc().nullsLast().op("timestamptz_ops")),
	index("trade_executions_trade_idx").using("btree", table.tradeId.asc().nullsLast().op("uuid_ops")),
	index("trade_executions_type_idx").using("btree", table.executionType.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.tradeId],
			foreignColumns: [trades.id],
			name: "trade_executions_trade_id_trades_id_fk"
		}).onDelete("cascade"),
]);

export const monthlyPlans = pgTable("monthly_plans", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	year: integer().notNull(),
	month: integer().notNull(),
	accountBalance: text("account_balance").notNull(),
	riskPerTradePercent: numeric("risk_per_trade_percent", { precision: 5, scale:  2 }).notNull(),
	dailyLossPercent: numeric("daily_loss_percent", { precision: 5, scale:  2 }).notNull(),
	monthlyLossPercent: numeric("monthly_loss_percent", { precision: 5, scale:  2 }).notNull(),
	dailyProfitTargetPercent: numeric("daily_profit_target_percent", { precision: 5, scale:  2 }),
	maxDailyTrades: integer("max_daily_trades"),
	maxConsecutiveLosses: integer("max_consecutive_losses"),
	allowSecondOpAfterLoss: boolean("allow_second_op_after_loss").default(true),
	reduceRiskAfterLoss: boolean("reduce_risk_after_loss").default(false),
	riskReductionFactor: numeric("risk_reduction_factor", { precision: 5, scale:  2 }),
	increaseRiskAfterWin: boolean("increase_risk_after_win").default(false),
	profitReinvestmentPercent: numeric("profit_reinvestment_percent", { precision: 5, scale:  2 }),
	notes: text(),
	riskPerTradeCents: text("risk_per_trade_cents").notNull(),
	dailyLossCents: text("daily_loss_cents").notNull(),
	monthlyLossCents: text("monthly_loss_cents").notNull(),
	dailyProfitTargetCents: integer("daily_profit_target_cents"),
	derivedMaxDailyTrades: integer("derived_max_daily_trades"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	capRiskAfterWin: boolean("cap_risk_after_win").default(false),
	riskProfileId: uuid("risk_profile_id"),
	weeklyLossPercent: numeric("weekly_loss_percent", { precision: 5, scale:  2 }),
	weeklyLossCents: text("weekly_loss_cents"),
}, (table) => [
	index("monthly_plans_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("monthly_plans_account_year_month_idx").using("btree", table.accountId.asc().nullsLast().op("int4_ops"), table.year.asc().nullsLast().op("uuid_ops"), table.month.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "monthly_plans_account_id_trading_accounts_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.riskProfileId],
			foreignColumns: [riskManagementProfiles.id],
			name: "monthly_plans_risk_profile_id_risk_management_profiles_id_fk"
		}).onDelete("set null"),
]);

export const strategies = pgTable("strategies", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	accountId: uuid("account_id"),
	code: varchar().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	entryCriteria: text("entry_criteria"),
	exitCriteria: text("exit_criteria"),
	riskRules: text("risk_rules"),
	targetRMultiple: numeric("target_r_multiple", { precision: 8, scale:  2 }),
	maxRiskPercent: numeric("max_risk_percent", { precision: 5, scale:  2 }),
	screenshotUrl: varchar("screenshot_url", { length: 500 }),
	notes: text(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	screenshotS3Key: varchar("screenshot_s3_key", { length: 500 }),
}, (table) => [
	index("strategies_account_idx").using("btree", table.accountId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("strategies_user_code_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.code.asc().nullsLast().op("uuid_ops")),
	index("strategies_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "strategies_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [tradingAccounts.id],
			name: "strategies_account_id_trading_accounts_id_fk"
		}).onDelete("set null"),
]);

export const scenarioImages = pgTable("scenario_images", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scenarioId: uuid("scenario_id").notNull(),
	url: varchar({ length: 500 }).notNull(),
	s3Key: varchar("s3_key", { length: 500 }).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("scenario_images_scenario_idx").using("btree", table.scenarioId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [strategyScenarios.id],
			name: "scenario_images_scenario_id_strategy_scenarios_id_fk"
		}).onDelete("cascade"),
]);
