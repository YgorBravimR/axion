import { relations } from "drizzle-orm/relations";
import { assetTypes, assets, tradingAccounts, accountTimeframes, timeframes, dailyChecklists, dailyAccountNotes, dailyAssetSettings, accountAssets, accountAssetSettings, notaImports, users, oauthAccounts, sessions, trades, tradeTags, tags, strategies, checklistCompletions, dailyTargets, strategyConditions, tradingConditions, strategyScenarios, riskManagementProfiles, tradeExecutions, monthlyPlans, scenarioImages } from "./schema";

export const assetsRelations = relations(assets, ({one, many}) => ({
	assetType: one(assetTypes, {
		fields: [assets.assetTypeId],
		references: [assetTypes.id]
	}),
	dailyAssetSettings: many(dailyAssetSettings),
	accountAssets: many(accountAssets),
	accountAssetSettings: many(accountAssetSettings),
}));

export const assetTypesRelations = relations(assetTypes, ({many}) => ({
	assets: many(assets),
}));

export const accountTimeframesRelations = relations(accountTimeframes, ({one}) => ({
	tradingAccount: one(tradingAccounts, {
		fields: [accountTimeframes.accountId],
		references: [tradingAccounts.id]
	}),
	timeframe: one(timeframes, {
		fields: [accountTimeframes.timeframeId],
		references: [timeframes.id]
	}),
}));

export const tradingAccountsRelations = relations(tradingAccounts, ({one, many}) => ({
	accountTimeframes: many(accountTimeframes),
	dailyChecklists: many(dailyChecklists),
	dailyAccountNotes: many(dailyAccountNotes),
	dailyAssetSettings: many(dailyAssetSettings),
	accountAssets: many(accountAssets),
	accountAssetSettings: many(accountAssetSettings),
	notaImports: many(notaImports),
	sessions: many(sessions),
	user: one(users, {
		fields: [tradingAccounts.userId],
		references: [users.id]
	}),
	trades: many(trades),
	tags: many(tags),
	dailyTargets: many(dailyTargets),
	monthlyPlans: many(monthlyPlans),
	strategies: many(strategies),
}));

export const timeframesRelations = relations(timeframes, ({many}) => ({
	accountTimeframes: many(accountTimeframes),
	trades: many(trades),
}));

export const dailyChecklistsRelations = relations(dailyChecklists, ({one, many}) => ({
	tradingAccount: one(tradingAccounts, {
		fields: [dailyChecklists.accountId],
		references: [tradingAccounts.id]
	}),
	checklistCompletions: many(checklistCompletions),
}));

export const dailyAccountNotesRelations = relations(dailyAccountNotes, ({one}) => ({
	tradingAccount: one(tradingAccounts, {
		fields: [dailyAccountNotes.accountId],
		references: [tradingAccounts.id]
	}),
}));

export const dailyAssetSettingsRelations = relations(dailyAssetSettings, ({one}) => ({
	tradingAccount: one(tradingAccounts, {
		fields: [dailyAssetSettings.accountId],
		references: [tradingAccounts.id]
	}),
	asset: one(assets, {
		fields: [dailyAssetSettings.assetId],
		references: [assets.id]
	}),
}));

export const accountAssetsRelations = relations(accountAssets, ({one}) => ({
	tradingAccount: one(tradingAccounts, {
		fields: [accountAssets.accountId],
		references: [tradingAccounts.id]
	}),
	asset: one(assets, {
		fields: [accountAssets.assetId],
		references: [assets.id]
	}),
}));

export const accountAssetSettingsRelations = relations(accountAssetSettings, ({one}) => ({
	tradingAccount: one(tradingAccounts, {
		fields: [accountAssetSettings.accountId],
		references: [tradingAccounts.id]
	}),
	asset: one(assets, {
		fields: [accountAssetSettings.assetId],
		references: [assets.id]
	}),
}));

export const notaImportsRelations = relations(notaImports, ({one}) => ({
	tradingAccount: one(tradingAccounts, {
		fields: [notaImports.accountId],
		references: [tradingAccounts.id]
	}),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({one}) => ({
	user: one(users, {
		fields: [oauthAccounts.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	oauthAccounts: many(oauthAccounts),
	sessions: many(sessions),
	tradingAccounts: many(tradingAccounts),
	tags: many(tags),
	tradingConditions: many(tradingConditions),
	riskManagementProfiles: many(riskManagementProfiles),
	strategies: many(strategies),
}));

export const sessionsRelations = relations(sessions, ({one}) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	}),
	tradingAccount: one(tradingAccounts, {
		fields: [sessions.currentAccountId],
		references: [tradingAccounts.id]
	}),
}));

export const tradeTagsRelations = relations(tradeTags, ({one}) => ({
	trade: one(trades, {
		fields: [tradeTags.tradeId],
		references: [trades.id]
	}),
	tag: one(tags, {
		fields: [tradeTags.tagId],
		references: [tags.id]
	}),
}));

export const tradesRelations = relations(trades, ({one, many}) => ({
	tradeTags: many(tradeTags),
	tradingAccount: one(tradingAccounts, {
		fields: [trades.accountId],
		references: [tradingAccounts.id]
	}),
	timeframe: one(timeframes, {
		fields: [trades.timeframeId],
		references: [timeframes.id]
	}),
	strategy: one(strategies, {
		fields: [trades.strategyId],
		references: [strategies.id]
	}),
	tradeExecutions: many(tradeExecutions),
}));

export const tagsRelations = relations(tags, ({one, many}) => ({
	tradeTags: many(tradeTags),
	user: one(users, {
		fields: [tags.userId],
		references: [users.id]
	}),
	tradingAccount: one(tradingAccounts, {
		fields: [tags.accountId],
		references: [tradingAccounts.id]
	}),
}));

export const strategiesRelations = relations(strategies, ({one, many}) => ({
	trades: many(trades),
	strategyConditions: many(strategyConditions),
	strategyScenarios: many(strategyScenarios),
	user: one(users, {
		fields: [strategies.userId],
		references: [users.id]
	}),
	tradingAccount: one(tradingAccounts, {
		fields: [strategies.accountId],
		references: [tradingAccounts.id]
	}),
}));

export const checklistCompletionsRelations = relations(checklistCompletions, ({one}) => ({
	dailyChecklist: one(dailyChecklists, {
		fields: [checklistCompletions.checklistId],
		references: [dailyChecklists.id]
	}),
}));

export const dailyTargetsRelations = relations(dailyTargets, ({one}) => ({
	tradingAccount: one(tradingAccounts, {
		fields: [dailyTargets.accountId],
		references: [tradingAccounts.id]
	}),
}));

export const strategyConditionsRelations = relations(strategyConditions, ({one}) => ({
	strategy: one(strategies, {
		fields: [strategyConditions.strategyId],
		references: [strategies.id]
	}),
	tradingCondition: one(tradingConditions, {
		fields: [strategyConditions.conditionId],
		references: [tradingConditions.id]
	}),
}));

export const tradingConditionsRelations = relations(tradingConditions, ({one, many}) => ({
	strategyConditions: many(strategyConditions),
	user: one(users, {
		fields: [tradingConditions.userId],
		references: [users.id]
	}),
}));

export const strategyScenariosRelations = relations(strategyScenarios, ({one, many}) => ({
	strategy: one(strategies, {
		fields: [strategyScenarios.strategyId],
		references: [strategies.id]
	}),
	scenarioImages: many(scenarioImages),
}));

export const riskManagementProfilesRelations = relations(riskManagementProfiles, ({one, many}) => ({
	user: one(users, {
		fields: [riskManagementProfiles.createdByUserId],
		references: [users.id]
	}),
	monthlyPlans: many(monthlyPlans),
}));

export const tradeExecutionsRelations = relations(tradeExecutions, ({one}) => ({
	trade: one(trades, {
		fields: [tradeExecutions.tradeId],
		references: [trades.id]
	}),
}));

export const monthlyPlansRelations = relations(monthlyPlans, ({one}) => ({
	tradingAccount: one(tradingAccounts, {
		fields: [monthlyPlans.accountId],
		references: [tradingAccounts.id]
	}),
	riskManagementProfile: one(riskManagementProfiles, {
		fields: [monthlyPlans.riskProfileId],
		references: [riskManagementProfiles.id]
	}),
}));

export const scenarioImagesRelations = relations(scenarioImages, ({one}) => ({
	strategyScenario: one(strategyScenarios, {
		fields: [scenarioImages.scenarioId],
		references: [strategyScenarios.id]
	}),
}));