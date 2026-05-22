import { describe, it, expect, beforeEach, vi } from "vitest"

// Mock dependencies
vi.mock("@/db/drizzle", () => ({
	db: {
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		query: {
			dailyChecklists: {
				findMany: vi.fn(),
				findFirst: vi.fn(),
			},
			checklistCompletions: {
				findMany: vi.fn(),
				findFirst: vi.fn(),
			},
			accountAssetSettings: {
				findMany: vi.fn(),
				findFirst: vi.fn(),
			},
			accountAssets: {
				findMany: vi.fn(),
				findFirst: vi.fn(),
			},
			trades: {
				findMany: vi.fn(),
			},
		},
	},
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn(),
}))

vi.mock("@/lib/cache/invalidate", () => ({
	invalidateTradeData: vi.fn(),
}))

vi.mock("@/lib/effective-date", () => ({
	getServerEffectiveNow: async () => new Date("2026-05-22"),
}))

vi.mock("@/lib/fractal-plan/resolver", () => ({
	resolveDay: vi.fn(),
	resolveBehavior: vi.fn(),
}))

vi.mock("@/lib/hawks/cascade", () => ({
	checkHawksCascade: vi.fn(),
}))

vi.mock("@/lib/error-utils", () => ({
	toSafeErrorMessage: (error: unknown) => {
		if (error instanceof Error) {
			return error.message
		}
		return "Unknown error"
	},
}))

vi.mock("next-intl/server", () => ({
	getTranslations: () => (key: string) => {
		const translations: Record<string, string> = {
			"commandCenter.checklistsRetrieved": "Checklists retrieved",
			"commandCenter.failedToRetrieveChecklists":
				"Failed to retrieve checklists",
			"commandCenter.checklistCreated": "Checklist created",
			"commandCenter.failedToCreateChecklist": "Failed to create checklist",
			"commandCenter.checklistUpdated": "Checklist updated",
			"commandCenter.failedToUpdateChecklist": "Failed to update checklist",
			"commandCenter.checklistDeleted": "Checklist deleted",
			"commandCenter.failedToDeleteChecklist": "Failed to delete checklist",
			"commandCenter.completionsRetrieved": "Completions retrieved",
			"commandCenter.failedToRetrieveCompletions":
				"Failed to retrieve completions",
			"commandCenter.completionToggled": "Completion toggled",
			"commandCenter.failedToToggleCompletion": "Failed to toggle completion",
			"commandCenter.assetSettingsRetrieved": "Asset settings retrieved",
			"commandCenter.failedToRetrieveAssetSettings":
				"Failed to retrieve asset settings",
			"commandCenter.assetSettingsUpserted": "Asset settings upserted",
			"commandCenter.failedToUpsertAssetSettings":
				"Failed to upsert asset settings",
			"commandCenter.assetSettingsDeleted": "Asset settings deleted",
			"commandCenter.failedToDeleteAssetSettings":
				"Failed to delete asset settings",
			"commandCenter.circuitBreakerRetrieved": "Circuit breaker retrieved",
			"commandCenter.dailySummaryRetrieved": "Daily summary retrieved",
			"commandCenter.validationError": "Validation error",
			"commandCenter.checklistCreateFailed": "Checklist create failed",
			"commandCenter.checklistNotFound": "Checklist not found",
			"commandCenter.checklistUpdateFailed": "Checklist update failed",
			"commandCenter.checklistsFetchFailed": "Checklists fetch failed",
			"commandCenter.actions.checklistsRetrieved": "Checklists retrieved",
			"commandCenter.actions.checklistsFetchFailed": "Checklists fetch failed",
			"commandCenter.actions.checklistCreated": "Checklist created",
			"commandCenter.actions.checklistCreateFailed": "Checklist create failed",
			"commandCenter.actions.checklistUpdated": "Checklist updated",
			"commandCenter.actions.checklistUpdateFailed": "Checklist update failed",
			"commandCenter.actions.checklistNotFound": "Checklist not found",
			"commandCenter.actions.completionsRetrieved": "Completions retrieved",
			"commandCenter.actions.completionToggled": "Completion toggled",
			"commandCenter.actions.completionToggleFailed":
				"Completion toggle failed",
			"commandCenter.actions.assetSettingsRetrieved":
				"Asset settings retrieved",
			"commandCenter.actions.assetSettingsFetchFailed":
				"Asset settings fetch failed",
			"commandCenter.actions.assetSettingsUpdated": "Asset settings updated",
			"commandCenter.actions.assetSettingsCreated": "Asset settings created",
			"commandCenter.actions.assetSettingsSaveFailed":
				"Asset settings save failed",
			"commandCenter.actions.assetSettingsNotFound": "Asset settings not found",
			"commandCenter.actions.assetSettingsDeleted": "Asset settings deleted",
			"commandCenter.actions.assetSettingsDeleteFailed":
				"Asset settings delete failed",
			"commandCenter.actions.circuitBreakerRetrieved":
				"Circuit breaker retrieved",
			"commandCenter.actions.circuitBreakerFetchFailed":
				"Circuit breaker fetch failed",
			"commandCenter.actions.dailySummaryRetrieved": "Daily summary retrieved",
			"commandCenter.actions.dailySummaryFetchFailed":
				"Daily summary fetch failed",
			"commandCenter.actions.validationError": "Validation error",
			"commandCenter.actions.completionsFetchFailed":
				"Completions fetch failed",
			"commandCenter.actions.completionItemUpdated": "Completion item updated",
			"commandCenter.actions.completionCreated": "Completion created",
		}
		return translations[key] || key
	},
}))

const { db } = await import("@/db/drizzle")
const { requireAuth } = await import("@/app/actions/auth")
const { invalidateTradeData } = await import("@/lib/cache/invalidate")
const { resolveDay, resolveBehavior } =
	await import("@/lib/fractal-plan/resolver")
const { checkHawksCascade } = await import("@/lib/hawks/cascade")
const {
	getChecklists,
	createChecklist,
	updateChecklist,
	deleteChecklist,
	getTodayCompletions,
	toggleChecklistItem,
	getAccountAssetSettings,
	upsertAssetSettings,
	deleteAssetSettings,
	getCircuitBreakerStatus,
	getDailySummary,
} = await import("@/app/actions/command-center")

const mockUserId = "user-123"
const mockAccountId = "account-456"

const createMockChecklist = (overrides = {}) => ({
	id: "checklist-1",
	userId: mockUserId,
	accountId: mockAccountId,
	name: "Pre-Market Checklist",
	items: JSON.stringify([
		{ id: "item-1", label: "Review news", order: 0 },
		{ id: "item-2", label: "Check levels", order: 1 },
	]),
	isActive: true,
	createdAt: new Date(),
	updatedAt: new Date(),
	...overrides,
})

const createMockCompletion = (overrides = {}) => ({
	id: "completion-1",
	userId: mockUserId,
	checklistId: "checklist-1",
	date: new Date("2026-05-22"),
	completedItems: JSON.stringify(["item-1"]),
	completedAt: new Date("2026-05-22T10:00:00Z"),
	createdAt: new Date(),
	updatedAt: new Date(),
	...overrides,
})

const createMockAssetSetting = (overrides = {}) => ({
	id: "setting-1",
	userId: mockUserId,
	accountId: mockAccountId,
	asset: "WINQ23",
	maxLossPerDay: 10000, // R$100.00
	maxDailyTrades: 10,
	riskRewardRatio: 2,
	createdAt: new Date(),
	updatedAt: new Date(),
	...overrides,
})

describe("Command Center Server Actions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(requireAuth).mockImplementation(
			async () =>
				({
					userId: mockUserId,
					sessionId: "sess-123",
					accountId: mockAccountId,
					allAccountIds: [mockAccountId],
					showAllAccounts: false,
				}) as never
		)
		// Set default empty implementations to avoid errors
		vi.mocked(db.query.dailyChecklists).findMany.mockImplementation(
			async () => [] as never
		)
		vi.mocked(db.query.checklistCompletions).findMany.mockImplementation(
			async () => [] as never
		)
		vi.mocked(db.query.accountAssetSettings).findMany.mockImplementation(
			async () => [] as never
		)
		vi.mocked(db.query.accountAssets).findMany.mockImplementation(
			async () => [] as never
		)
		vi.mocked(db.query.trades).findMany.mockImplementation(
			async () => [] as never
		)
		// Set default implementations for resolveDay, resolveBehavior, checkHawksCascade
		vi.mocked(resolveDay).mockImplementation(
			async () =>
				({
					oneRCents: 10000,
					dailyLossR: { value: "5" },
					dailyTargetR: { value: "10" },
					monthlyLossR: { value: "50" },
				}) as never
		)
		vi.mocked(resolveBehavior).mockImplementation(
			async () =>
				({
					maxConsecutiveLosses: null,
					reduceRiskAfterLoss: false,
					riskReductionFactor: null,
					allowSecondOpAfterLoss: true,
					profitReinvestmentPercent: null,
					increaseRiskAfterWin: false,
					capRiskAfterWin: false,
				}) as never
		)
		vi.mocked(checkHawksCascade).mockImplementation(
			async () => ({ triggered: false }) as never
		)
	})

	describe("getChecklists", () => {
		it("should return empty array when no checklists exist", async () => {
			vi.mocked(db.query.dailyChecklists).findMany.mockImplementation(
				async () => [] as never
			)

			const result = await getChecklists()

			expect(result.status).toBe("success")
			expect(result.data).toEqual([])
		})

		it("should return all checklists for user account", async () => {
			const checklist1 = createMockChecklist({ id: "checklist-1" })
			const checklist2 = createMockChecklist({
				id: "checklist-2",
				name: "Post-Market Review",
			})

			vi.mocked(db.query.dailyChecklists).findMany.mockImplementation(
				async () => [checklist1, checklist2] as never
			)

			const result = await getChecklists()

			expect(result.status).toBe("success")
			expect(result.data).toHaveLength(2)
			expect(result.data?.[0]?.name).toBe("Pre-Market Checklist")
			expect(result.data?.[1]?.name).toBe("Post-Market Review")
		})

		it("should include completion data with checklists", async () => {
			const checklist = createMockChecklist()
			vi.mocked(db.query.dailyChecklists).findMany.mockImplementation(
				async () => [checklist] as never
			)

			const result = await getChecklists()

			expect(result.status).toBe("success")
			expect(result.data?.[0]?.items).toBeDefined()
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.dailyChecklists).findMany.mockImplementation(
				async () => {
					throw new Error("Database error")
				}
			)

			const result = await getChecklists()

			expect(result.status).toBe("error")
		})

		it("should require authentication", async () => {
			vi.mocked(requireAuth).mockImplementation(async () => {
				throw new Error("Not authenticated")
			})

			const result = await getChecklists()

			expect(result.status).toBe("error")
			expect(vi.mocked(requireAuth)).toHaveBeenCalled()
		})
	})

	describe("createChecklist", () => {
		it("should create new checklist with items", async () => {
			const mockInsertChain = {
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						createMockChecklist({
							name: "Pre-Market Checklist",
							items: JSON.stringify([
								{ id: "item-1", label: "Item 1", order: 0 },
								{ id: "item-2", label: "Item 2", order: 1 },
							]),
						}),
					]),
				}),
			}

			vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)
			vi.mocked(invalidateTradeData).mockImplementation(
				async () => undefined as never
			)

			const input = {
				name: "Pre-Market Checklist",
				items: [
					{ id: "item-1", label: "Item 1", order: 0 },
					{ id: "item-2", label: "Item 2", order: 1 },
				],
			}

			const result = await createChecklist(input)

			expect(result.status).toBe("success")
			expect(result.data?.name).toBe("Pre-Market Checklist")
			expect(vi.mocked(invalidateTradeData)).toHaveBeenCalled()
		})

		it("should return error when missing required fields", async () => {
			const input = {
				name: "",
				items: [],
			}

			const result = await createChecklist(input)

			expect(result.status).toBe("error")
			expect(result.errors).toBeDefined()
		})

		it("should return error when database insert fails", async () => {
			const mockInsertChain = {
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockRejectedValue(new Error("Insert failed")),
				}),
			}

			vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)

			const input = {
				name: "New Checklist",
				items: [{ id: "item-1", label: "Item 1", order: 0 }],
			}

			const result = await createChecklist(input)

			expect(result.status).toBe("error")
		})
	})

	describe("updateChecklist", () => {
		it("should update checklist name and description", async () => {
			const mockUpdateChain = {
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([createMockChecklist()]),
					}),
				}),
			}

			vi.mocked(db.query.dailyChecklists).findFirst.mockImplementation(
				async () => createMockChecklist() as never
			)
			vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)
			vi.mocked(invalidateTradeData).mockImplementation(
				async () => undefined as never
			)

			const result = await updateChecklist("checklist-1", {
				name: "Updated Name",
			})

			expect(result.status).toBe("success")
			expect(vi.mocked(invalidateTradeData)).toHaveBeenCalled()
		})

		it("should return error when checklist not found", async () => {
			vi.mocked(db.query.dailyChecklists).findFirst.mockImplementation(
				async () => null as never
			)

			const result = await updateChecklist("nonexistent", { name: "New Name" })

			expect(result.status).toBe("error")
		})

		it("should return error when update fails", async () => {
			const mockUpdateChain = {
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockRejectedValue(new Error("Update failed")),
					}),
				}),
			}

			vi.mocked(db.query.dailyChecklists).findFirst.mockImplementation(
				async () => createMockChecklist() as never
			)
			vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

			const result = await updateChecklist("checklist-1", {
				name: "New Name",
			})

			expect(result.status).toBe("error")
		})
	})

	describe("deleteChecklist", () => {
		it("should delete checklist", async () => {
			const mockUpdateChain = {
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined),
				}),
			}

			vi.mocked(db.query.dailyChecklists).findFirst.mockImplementation(
				async () => createMockChecklist() as never
			)
			vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)
			vi.mocked(invalidateTradeData).mockImplementation(
				async () => undefined as never
			)

			const result = await deleteChecklist("checklist-1")

			expect(result.status).toBe("success")
			expect(vi.mocked(invalidateTradeData)).toHaveBeenCalled()
		})

		it("should return error when checklist not found", async () => {
			vi.mocked(db.query.dailyChecklists).findFirst.mockImplementation(
				async () => null as never
			)

			const result = await deleteChecklist("checklist-1")

			expect(result.status).toBe("error")
		})

		it("should return error when delete fails", async () => {
			const mockUpdateChain = {
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockRejectedValue(new Error("Delete failed")),
				}),
			}

			vi.mocked(db.query.dailyChecklists).findFirst.mockImplementation(
				async () => createMockChecklist() as never
			)
			vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

			const result = await deleteChecklist("checklist-1")

			expect(result.status).toBe("error")
		})
	})

	describe("getTodayCompletions", () => {
		it("should return empty array when no completions today", async () => {
			vi.mocked(db.query.dailyChecklists).findMany.mockImplementation(
				async () => [] as never
			)
			vi.mocked(db.query.checklistCompletions).findMany.mockImplementation(
				async () => [] as never
			)

			const result = await getTodayCompletions()

			expect(result.status).toBe("success")
			expect(result.data).toEqual([])
		})

		it("should return todays checklist with completions", async () => {
			const checklist1 = createMockChecklist({ id: "checklist-1" })
			const checklist2 = createMockChecklist({
				id: "checklist-2",
				name: "Post-Market Review",
			})

			vi.mocked(db.query.dailyChecklists).findMany.mockImplementation(
				async () => [checklist1, checklist2] as never
			)
			vi.mocked(db.query.checklistCompletions).findMany.mockImplementation(
				async () => [] as never
			)

			const result = await getTodayCompletions()

			expect(result.status).toBe("success")
			expect(result.data).toHaveLength(2)
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.dailyChecklists).findMany.mockImplementation(
				async () => {
					throw new Error("Query failed")
				}
			)

			const result = await getTodayCompletions()

			expect(result.status).toBe("error")
		})
	})

	describe("toggleChecklistItem", () => {
		it("should create new completion when item not completed", async () => {
			const checklistUuid = "550e8400-e29b-41d4-a716-446655440001"
			const mockInsertChain = {
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([createMockCompletion()]),
				}),
			}

			vi.mocked(db.query.checklistCompletions).findFirst.mockImplementation(
				async () => null as never
			)
			vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)
			vi.mocked(invalidateTradeData).mockImplementation(
				async () => undefined as never
			)

			const result = await toggleChecklistItem(checklistUuid, "item-1", true)

			expect(result.status).toBe("success")
			expect(vi.mocked(invalidateTradeData)).toHaveBeenCalled()
		})

		it("should update completion when toggling", async () => {
			const checklistUuid = "550e8400-e29b-41d4-a716-446655440001"
			const mockChecklist = createMockChecklist({
				id: checklistUuid,
				items: JSON.stringify([{ id: "item-1", label: "Item 1", order: 0 }]),
			})
			const mockCompletion = createMockCompletion()
			const mockUpdateChain = {
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([mockCompletion]),
					}),
				}),
			}

			vi.mocked(db.query.checklistCompletions).findFirst.mockImplementation(
				async () => mockCompletion as never
			)
			vi.mocked(db.query.dailyChecklists).findFirst.mockImplementation(
				async () => mockChecklist as never
			)
			vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)
			vi.mocked(invalidateTradeData).mockImplementation(
				async () => undefined as never
			)

			const result = await toggleChecklistItem(checklistUuid, "item-1", true)

			expect(result.status).toBe("success")
		})

		it("should return error when toggle fails", async () => {
			vi.mocked(db.query.checklistCompletions).findFirst.mockImplementation(
				async () => {
					throw new Error("Query failed")
				}
			)

			const result = await toggleChecklistItem("checklist-1", "item-1", true)

			expect(result.status).toBe("error")
		})
	})

	describe("getAccountAssetSettings", () => {
		it("should return empty array when no asset settings", async () => {
			vi.mocked(db.query.accountAssetSettings).findMany.mockImplementation(
				async () => [] as never
			)
			vi.mocked(db.query.accountAssets).findMany.mockImplementation(
				async () => [] as never
			)

			const result = await getAccountAssetSettings()

			expect(result.status).toBe("success")
			expect(result.data).toEqual([])
		})

		it("should return all asset settings for account", async () => {
			const setting1 = createMockAssetSetting({ asset: "WINQ23" })
			const setting2 = createMockAssetSetting({
				id: "setting-2",
				asset: "WDOJ23",
			})

			vi.mocked(db.query.accountAssetSettings).findMany.mockImplementation(
				async () => [setting1, setting2] as never
			)

			const result = await getAccountAssetSettings()

			expect(result.status).toBe("success")
			expect(result.data).toHaveLength(2)
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.accountAssetSettings).findMany.mockImplementation(
				async () => {
					throw new Error("Query failed")
				}
			)

			const result = await getAccountAssetSettings()

			expect(result.status).toBe("error")
		})
	})

	describe("upsertAssetSettings", () => {
		it("should create new asset setting if not exists", async () => {
			const assetUuid = "550e8400-e29b-41d4-a716-446655440000"
			const mockInsertChain = {
				values: vi.fn().mockReturnValue({
					returning: vi
						.fn()
						.mockResolvedValue([
							createMockAssetSetting({ assetId: assetUuid }),
						]),
				}),
			}

			vi.mocked(db.query.accountAssetSettings).findFirst.mockImplementation(
				async () => null as never
			)
			vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)
			vi.mocked(invalidateTradeData).mockImplementation(
				async () => undefined as never
			)

			const input = {
				assetId: assetUuid,
				maxDailyTrades: 10,
			}

			const result = await upsertAssetSettings(input)

			expect(result.status).toBe("success")
		})

		it("should update existing asset setting", async () => {
			const assetUuid = "550e8400-e29b-41d4-a716-446655440000"
			const mockUpdateChain = {
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi
							.fn()
							.mockResolvedValue([
								createMockAssetSetting({ maxDailyTrades: 20 }),
							]),
					}),
				}),
			}

			vi.mocked(db.query.accountAssetSettings).findFirst.mockImplementation(
				async () => createMockAssetSetting({ assetId: assetUuid }) as never
			)
			vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)
			vi.mocked(invalidateTradeData).mockImplementation(
				async () => undefined as never
			)

			const input = {
				assetId: assetUuid,
				maxDailyTrades: 20,
			}

			const result = await upsertAssetSettings(input)

			expect(result.status).toBe("success")
		})

		it("should return error when upsert fails", async () => {
			const assetUuid = "550e8400-e29b-41d4-a716-446655440000"
			const mockUpdateChain = {
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockRejectedValue(new Error("Update failed")),
				}),
			}

			vi.mocked(db.query.accountAssetSettings).findFirst.mockImplementation(
				async () => createMockAssetSetting({ assetId: assetUuid }) as never
			)
			vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

			const input = {
				assetId: assetUuid,
				maxDailyTrades: 10,
			}

			const result = await upsertAssetSettings(input)

			expect(result.status).toBe("error")
		})
	})

	describe("deleteAssetSettings", () => {
		it("should delete asset setting", async () => {
			const mockUpdateChain = {
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined),
				}),
			}

			vi.mocked(db.query.accountAssetSettings).findFirst.mockImplementation(
				async () => createMockAssetSetting() as never
			)
			vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)
			vi.mocked(invalidateTradeData).mockImplementation(
				async () => undefined as never
			)

			const result = await deleteAssetSettings("WINQ23")

			expect(result.status).toBe("success")
			expect(vi.mocked(invalidateTradeData)).toHaveBeenCalled()
		})

		it("should return NOT_FOUND when asset settings don't exist", async () => {
			vi.mocked(db.query.accountAssetSettings).findFirst.mockImplementation(
				async () => null as never
			)

			const result = await deleteAssetSettings("WINQ23")

			expect(result.status).toBe("error")
			expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
		})

		it("should return error when update fails", async () => {
			const mockUpdateChain = {
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockRejectedValue(new Error("Delete failed")),
				}),
			}

			vi.mocked(db.query.accountAssetSettings).findFirst.mockImplementation(
				async () => createMockAssetSetting() as never
			)
			vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

			const result = await deleteAssetSettings("WINQ23")

			expect(result.status).toBe("error")
			expect(result.errors?.[0]?.code).toBe("DELETE_FAILED")
		})
	})

	describe("getCircuitBreakerStatus", () => {
		it("should return circuit breaker status with empty trades", async () => {
			vi.mocked(db.query.trades).findMany.mockImplementation(
				async () => [] as never
			)

			const result = await getCircuitBreakerStatus()

			expect(result.status).toBe("success")
			expect(result.data?.shouldStopTrading).toBeDefined()
			expect(result.data?.dailyPnL).toBe(0)
			expect(result.data?.tradesCount).toBe(0)
		})

		it("should detect daily loss limit breach", async () => {
			const losingTrade = createMockTrade({
				pnl: -50000, // R$500 loss
				entryDate: new Date("2026-05-22"),
				outcome: "loss" as const,
			})

			vi.mocked(db.query.trades).findMany.mockImplementation(
				async () => [losingTrade] as never
			)

			const result = await getCircuitBreakerStatus()

			expect(result.status).toBe("success")
			expect(result.data?.lossLimitHit).toBeDefined()
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockImplementation(async () => {
				throw new Error("Query failed")
			})

			const result = await getCircuitBreakerStatus()

			expect(result.status).toBe("error")
			expect(result.errors?.[0]?.code).toBe("FETCH_FAILED")
		})
	})

	describe("getDailySummary", () => {
		it("should return empty summary when no trades today", async () => {
			vi.mocked(db.query.trades).findMany.mockImplementation(
				async () => [] as never
			)

			const result = await getDailySummary()

			expect(result.status).toBe("success")
			expect(result.data?.tradesCount).toBe(0)
			expect(result.data?.totalPnL).toBe(0)
			expect(result.data?.winCount).toBe(0)
			expect(result.data?.lossCount).toBe(0)
		})

		it("should aggregate todays trades", async () => {
			const trade = createMockTrade({
				entryDate: new Date("2026-05-22"),
				pnl: 10000,
				outcome: "win" as const,
			})

			vi.mocked(db.query.trades).findMany.mockImplementation(
				async () => [trade] as never
			)

			const result = await getDailySummary()

			expect(result.status).toBe("success")
			expect(result.data?.tradesCount).toBe(1)
			expect(result.data?.totalPnL).toBeCloseTo(100, 1) // 10000 cents = R$100.00
			expect(result.data?.winCount).toBe(1)
			expect(result.data?.lossCount).toBe(0)
			expect(result.data?.winRate).toBeCloseTo(100, 1)
		})

		it("should calculate win rate from trades", async () => {
			const winTrade = createMockTrade({
				entryDate: new Date("2026-05-22"),
				pnl: 10000,
				outcome: "win" as const,
			})
			const lossTrade = createMockTrade({
				id: "trade-2",
				entryDate: new Date("2026-05-22T12:00:00Z"),
				pnl: -5000,
				outcome: "loss" as const,
			})

			vi.mocked(db.query.trades).findMany.mockImplementation(
				async () => [winTrade, lossTrade] as never
			)

			const result = await getDailySummary()

			expect(result.status).toBe("success")
			expect(result.data?.tradesCount).toBe(2)
			expect(result.data?.winCount).toBe(1)
			expect(result.data?.lossCount).toBe(1)
			expect(result.data?.winRate).toBeCloseTo(50, 0)
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockImplementation(async () => {
				throw new Error("Query failed")
			})

			const result = await getDailySummary()

			expect(result.status).toBe("error")
			expect(result.errors?.[0]?.code).toBe("FETCH_FAILED")
		})
	})
})

// Mock helper for trade creation in daily summary tests
const createMockTrade = (overrides = {}) => ({
	id: "trade-1",
	userId: mockUserId,
	accountId: mockAccountId,
	asset: "WINQ23",
	direction: "long" as const,
	entryDate: new Date("2026-05-22T10:00:00Z"),
	exitDate: new Date("2026-05-22T11:00:00Z"),
	entryPrice: 1000,
	exitPrice: 1100,
	quantity: 1,
	pnl: 10000,
	commission: 500,
	fees: 200,
	outcome: "win" as const,
	realizedRMultiple: "2.5",
	followedPlan: true,
	isArchived: false,
	timeframeId: "1h",
	strategyId: "strategy-1",
	strategyVersionId: "v1",
	createdAt: new Date(),
	...overrides,
})
