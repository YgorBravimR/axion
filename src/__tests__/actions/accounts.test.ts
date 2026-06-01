import { describe, it, expect, beforeEach, vi } from "vitest"

// Mock all external dependencies before importing actions
vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			tradingAccounts: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			assets: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			accountAssets: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			accountTimeframes: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			timeframes: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			trades: {
				findMany: vi.fn(),
			},
			dailyChecklists: {
				findMany: vi.fn(),
			},
			dailyAssetSettings: {
				findMany: vi.fn(),
			},
			notaImports: {
				findMany: vi.fn(),
			},
		},
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}))

vi.mock("@/auth", () => ({
	auth: vi.fn(),
}))

vi.mock("@/lib/cache/invalidate", () => ({
	invalidateAccountData: vi.fn(),
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn(),
}))

vi.mock("next-intl/server", () => ({
	getTranslations: vi.fn((namespace: string) => (key: string) => {
		const translations: Record<string, Record<string, string>> = {
			"auth": {
				"errors.notAuthenticated": "Not authenticated",
				"register.genericError": "Registration error",
			},
			"settings": {
				"errors.invalidInput": "Invalid input",
				"errors.accountNameExists": "Account name already exists",
				"errors.accountNotFound": "Account not found",
				"errors.noAccountSelected": "No account selected",
				"errors.cannotDeleteDefault": "Cannot delete default account",
				"deleteAllDataError": "Failed to delete trading data",
			},
			"settings.account": {
				deleteAllDataError: "Failed to delete trading data",
			},
		}
		return translations[namespace]?.[key] || key
	}),
}))

vi.mock("@/lib/tax/fee-resolver", () => ({
	resolveFeeSnapshot: vi.fn(async () => ({
		commissionCents: 50,
		feesCents: 30,
	})),
}))

// Import after mocks configured
const { db } = await import("@/db/drizzle")
const { auth } = await import("@/auth")
const { requireAuth } = await import("@/app/actions/auth")
const {
	createAccount,
	updateAccount,
	deleteAccount,
	deleteAllTradingData,
	setDefaultAccount,
	getAccountAssets,
	updateAccountAsset,
	getAccountTimeframes,
	updateAccountTimeframe,
	getBreakevenTicks,
	getAssetFees,
	setAccountStartingBalance,
} = await import("@/app/actions/accounts")

// ============================================
// MOCK DATA FACTORIES
// ============================================

interface MockTradingAccount {
	id: string
	userId: string
	name: string
	description?: string | null
	accountType: "personal" | "prop"
	propFirmName?: string | null
	profitSharePercentage: string
	defaultCurrency: string
	defaultBreakevenTicks: number
	showTaxEstimates: boolean
	showPropCalculations: boolean
	isDefault: boolean
	startingBalanceCents?: number | null
	accountStartYear?: number | null
	createdAt: Date
	updatedAt: Date
}

const createMockAccount = (
	overrides: Partial<MockTradingAccount> = {}
): MockTradingAccount => ({
	id: "11111111-1111-4111-8111-111111111111",
	userId: "22222222-2222-4222-8222-222222222222",
	name: "Primary Account",
	description: "My trading account",
	accountType: "personal",
	propFirmName: null,
	profitSharePercentage: "100.00",
	defaultCurrency: "BRL",
	defaultBreakevenTicks: 2,
	showTaxEstimates: true,
	showPropCalculations: true,
	isDefault: true,
	createdAt: new Date(),
	updatedAt: new Date(),
	...overrides,
})

const mockUserId = "22222222-2222-4222-8222-222222222222"
const mockAccountId = "11111111-1111-4111-8111-111111111111"

// ============================================
// TESTS
// ============================================

describe("createAccount", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should create personal account successfully", async () => {
		const newAccount = createMockAccount({
			id: "33333333-3333-4333-8333-333333333333",
			name: "New Account",
			accountType: "personal",
		})

		const mockInsertChain = {
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([newAccount]),
			}),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValue(
			null as never
		)
		vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)

		const result = await createAccount({
			name: "New Account",
			accountType: "personal",
			description: "A new account",
		})

		expect(result.status).toBe("success")
		expect(result.data?.name).toBe("New Account")
		expect(result.data?.accountType).toBe("personal")
	})

	it("should create prop account with profit share percentage", async () => {
		const newAccount = createMockAccount({
			id: "44444444-4444-4444-8444-444444444444",
			name: "Prop Account",
			accountType: "prop",
			propFirmName: "Elite Traders",
			profitSharePercentage: "80.00",
		})

		const mockInsertChain = {
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([newAccount]),
			}),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValue(
			null as never
		)
		vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)

		const result = await createAccount({
			name: "Prop Account",
			accountType: "prop",
			propFirmName: "Elite Traders",
			profitSharePercentage: 80,
		})

		expect(result.status).toBe("success")
		expect(result.data?.accountType).toBe("prop")
		expect(result.data?.profitSharePercentage).toBe("80.00")
	})

	it("should return error when account name already exists", async () => {
		const existing = createMockAccount({ name: "Existing Account" })

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValue(
			existing as never
		)

		const result = await createAccount({
			name: "Existing Account",
			accountType: "personal",
		})

		expect(result.status).toBe("error")
		expect(result.error).toContain("already exists")
	})

	it("should return error when not authenticated", async () => {
		vi.mocked(auth).mockResolvedValue({
			user: null,
		} as never)

		const result = await createAccount({
			name: "New Account",
			accountType: "personal",
		})

		expect(result.status).toBe("error")
		expect(result.error).toContain("authenticated")
	})

	it("should validate account type enum", async () => {
		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		const result = await createAccount({
			name: "Invalid Account",
			accountType: "invalid" as never,
		})

		expect(result.status).toBe("error")
	})
})

describe("updateAccount", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should update account name", async () => {
		const existing = createMockAccount()
		const updated = createMockAccount({ name: "Updated Name" })

		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([updated]),
				}),
			}),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		// First call checks if account exists, second call checks name uniqueness, third call returns nothing for name check
		vi.mocked(db.query.tradingAccounts)
			.findFirst.mockResolvedValueOnce(existing as never) // Account existence check
			.mockResolvedValueOnce(null as never) // Name uniqueness check - name doesn't exist elsewhere

		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

		const result = await updateAccount(existing.id, {
			name: "Updated Name",
		})

		expect(result.status).toBe("success")
		expect(result.data?.name).toBe("Updated Name")
	})

	it("should update profit share percentage for prop accounts", async () => {
		const existing = createMockAccount({ accountType: "prop" })
		const updated = createMockAccount({
			accountType: "prop",
			profitSharePercentage: "75.00",
		})

		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([updated]),
				}),
			}),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValue(
			existing as never
		)
		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

		const result = await updateAccount(existing.id, {
			profitSharePercentage: 75,
		})

		expect(result.status).toBe("success")
		expect(result.data?.profitSharePercentage).toBe("75.00")
	})

	it("should prevent duplicate account names", async () => {
		const existing = createMockAccount({ id: mockAccountId, name: "Account 1" })
		const other = createMockAccount({
			id: "55555555-5555-4555-8555-555555555555",
			name: "Account 2",
		})

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		// First call returns the account being updated
		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			existing as never
		)
		// Second call looks for duplicate name — finds other account
		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			other as never
		)

		const result = await updateAccount(mockAccountId, {
			name: "Account 2",
		})

		expect(result.status).toBe("error")
		expect(result.error).toContain("already exists")
	})

	it("should return NOT_FOUND when account does not exist", async () => {
		const nonexistentId = "00000000-0000-4000-8000-000000000000"
		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValue(
			null as never
		)

		const result = await updateAccount(nonexistentId, {
			name: "Updated",
		})

		expect(result.status).toBe("error")
		expect(result.error).toContain("not found")
	})

	it("should allow same name on update (idempotent)", async () => {
		const existing = createMockAccount({ id: mockAccountId, name: "Same Name" })
		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([existing]),
				}),
			}),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		// First call checks account exists, second call checks name uniqueness - same name is allowed
		vi.mocked(db.query.tradingAccounts)
			.findFirst.mockResolvedValueOnce(existing as never) // Account existence check
			.mockResolvedValueOnce(null as never) // Name uniqueness check - no other accounts have same name

		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

		const result = await updateAccount(mockAccountId, {
			name: "Same Name",
		})

		expect(result.status).toBe("success")
	})
})

describe("deleteAccount", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should delete non-default account when user has multiple", async () => {
		const defaultAccount = createMockAccount({
			id: "default-id",
			isDefault: true,
		})
		const accountToDelete = createMockAccount({
			id: mockAccountId,
			isDefault: false,
		})

		const mockDeleteChain = {
			where: vi.fn().mockResolvedValue(undefined),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		// First call finds the account to delete
		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			accountToDelete as never
		)
		// Second call finds user's accounts
		vi.mocked(db.query.tradingAccounts).findMany.mockResolvedValueOnce([
			defaultAccount,
			accountToDelete,
		] as never)

		vi.mocked(db).delete.mockReturnValue(mockDeleteChain as never)

		const result = await deleteAccount(mockAccountId)

		expect(result.status).toBe("success")
		expect(result.shouldLogout).toBe(false)
	})

	it("should prevent deletion of default account when not the last one", async () => {
		const defaultAccount = createMockAccount({
			id: mockAccountId,
			isDefault: true,
		})
		const otherAccount = createMockAccount({
			id: "44444444-4444-4444-8444-444444444444",
			isDefault: false,
		})

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			defaultAccount as never
		)
		vi.mocked(db.query.tradingAccounts).findMany.mockResolvedValueOnce([
			defaultAccount,
			otherAccount,
		] as never)

		const result = await deleteAccount(mockAccountId)

		expect(result.status).toBe("error")
		expect(result.error?.toLowerCase()).toContain("cannot delete")
	})

	it("should allow deletion of default account when it is the last one", async () => {
		const defaultAccount = createMockAccount({
			id: mockAccountId,
			isDefault: true,
		})

		const mockDeleteChain = {
			where: vi.fn().mockResolvedValue(undefined),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			defaultAccount as never
		)
		vi.mocked(db.query.tradingAccounts).findMany.mockResolvedValueOnce([
			defaultAccount,
		] as never)

		vi.mocked(db).delete.mockReturnValue(mockDeleteChain as never)

		const result = await deleteAccount(mockAccountId)

		expect(result.status).toBe("success")
		expect(result.shouldLogout).toBe(true)
	})

	it("should return NOT_FOUND for nonexistent account", async () => {
		const nonexistentId = "00000000-0000-4000-8000-000000000000"
		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			null as never
		)

		const result = await deleteAccount(nonexistentId)

		expect(result.status).toBe("error")
		expect(result.error).toContain("not found")
	})
})

describe("deleteAllTradingData", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should delete all trading data while preserving account", async () => {
		const mockDeleteChain = {
			where: vi.fn().mockResolvedValue(undefined),
		}

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db).delete.mockReturnValue(mockDeleteChain as never)

		const result = await deleteAllTradingData()

		expect(result.status).toBe("success")
		// Should call delete 4 times (trades, dailyChecklists, dailyAssetSettings, notaImports)
		expect(vi.mocked(db).delete).toHaveBeenCalledTimes(4)
	})

	it("should return error if delete fails", async () => {
		vi.mocked(requireAuth).mockRejectedValue(new Error("Auth failed") as never)

		const result = await deleteAllTradingData()

		expect(result.status).toBe("error")
	})
})

describe("setDefaultAccount", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should set account as default and unset other defaults", async () => {
		const accountToSetDefault = createMockAccount({
			id: mockAccountId,
			isDefault: false,
		})
		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			accountToSetDefault as never
		)
		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

		const result = await setDefaultAccount(mockAccountId)

		expect(result.status).toBe("success")
		// Should call update twice (unset others, set this one)
		expect(vi.mocked(db).update).toHaveBeenCalledTimes(2)
	})

	it("should return NOT_FOUND for nonexistent account", async () => {
		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			null as never
		)

		const result = await setDefaultAccount("nonexistent")

		expect(result.status).toBe("error")
	})
})

describe("getAccountAssets", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should return all assets with account-specific configurations", async () => {
		const account = createMockAccount()
		const allAssets = [
			{
				id: "asset-1",
				symbol: "ES",
				name: "E-mini S&P 500",
				tickSize: "0.25",
				tickValue: "12.50",
				currency: "USD",
				isActive: true,
			},
			{
				id: "asset-2",
				symbol: "NQ",
				name: "E-mini Nasdaq",
				tickSize: "0.25",
				tickValue: "20",
				currency: "USD",
				isActive: true,
			},
		]

		const accountConfigs = [
			{
				id: "config-1",
				accountId: mockAccountId,
				assetId: "asset-1",
				isEnabled: true,
				breakevenTicksOverride: null,
				notes: null,
			},
		]

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId, accountId: mockAccountId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			account as never
		)
		vi.mocked(db.query.assets).findMany.mockResolvedValueOnce(
			allAssets as never
		)
		vi.mocked(db.query.accountAssets).findMany.mockResolvedValueOnce(
			accountConfigs as never
		)

		const result = await getAccountAssets(mockAccountId)

		expect(result.status).toBe("success")
		expect(result.data).toHaveLength(2)
		expect(result.data?.[0]?.isEnabled).toBe(true)
		expect(result.data?.[1]?.isEnabled).toBe(false) // Default for unconfigured assets
	})

	it("should return error when account not found", async () => {
		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			null as never
		)

		const result = await getAccountAssets(mockAccountId)

		expect(result.status).toBe("error")
	})
})

describe("updateAccountAsset", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should create new asset configuration if not exists", async () => {
		const account = createMockAccount()
		const mockInsertChain = {
			values: vi.fn().mockResolvedValue(undefined),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId, accountId: mockAccountId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			account as never
		)
		vi.mocked(db.query.accountAssets).findFirst.mockResolvedValueOnce(
			null as never
		)
		vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)

		const result = await updateAccountAsset({
			assetId: "asset-123",
			isEnabled: true,
			breakevenTicksOverride: null,
		})

		expect(result.status).toBe("success")
		expect(vi.mocked(db).insert).toHaveBeenCalled()
	})

	it("should update existing asset configuration", async () => {
		const account = createMockAccount()
		const existing = {
			id: "config-1",
			accountId: mockAccountId,
			assetId: "asset-123",
		}

		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId, accountId: mockAccountId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			account as never
		)
		vi.mocked(db.query.accountAssets).findFirst.mockResolvedValueOnce(
			existing as never
		)
		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

		const result = await updateAccountAsset({
			assetId: "asset-123",
			isEnabled: false,
			breakevenTicksOverride: 5,
			notes: "Updated config",
		})

		expect(result.status).toBe("success")
		expect(vi.mocked(db).update).toHaveBeenCalled()
	})
})

describe("getAccountTimeframes", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should return all timeframes with account-specific configurations", async () => {
		const account = createMockAccount()
		const allTimeframes = [
			{
				id: "tf-1",
				code: "1M",
				name: "1 Minute",
				type: "intraday",
				value: 1,
				unit: "minute",
				sortOrder: 1,
				isActive: true,
			},
			{
				id: "tf-2",
				code: "5M",
				name: "5 Minutes",
				type: "intraday",
				value: 5,
				unit: "minute",
				sortOrder: 2,
				isActive: true,
			},
			{
				id: "tf-3",
				code: "1H",
				name: "1 Hour",
				type: "intraday",
				value: 1,
				unit: "hour",
				sortOrder: 3,
				isActive: true,
			},
		]

		const accountConfigs = [
			{
				id: "tfc-1",
				accountId: mockAccountId,
				timeframeId: "tf-1",
				isEnabled: true,
			},
		]

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId, accountId: mockAccountId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			account as never
		)
		vi.mocked(db.query.timeframes).findMany.mockResolvedValueOnce(
			allTimeframes as never
		)
		vi.mocked(db.query.accountTimeframes).findMany.mockResolvedValueOnce(
			accountConfigs as never
		)

		const result = await getAccountTimeframes(mockAccountId)

		expect(result.status).toBe("success")
		expect(result.data).toHaveLength(3)
		expect(result.data?.[0]?.isEnabled).toBe(true)
		expect(result.data?.[1]?.isEnabled).toBe(false) // Default for unconfigured
	})
})

describe("updateAccountTimeframe", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should create timeframe config if not exists", async () => {
		const account = createMockAccount()
		const mockInsertChain = {
			values: vi.fn().mockResolvedValue(undefined),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId, accountId: mockAccountId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			account as never
		)
		vi.mocked(db.query.accountTimeframes).findFirst.mockResolvedValueOnce(
			null as never
		)
		vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)

		const result = await updateAccountTimeframe("tf-123", true)

		expect(result.status).toBe("success")
	})

	it("should update existing timeframe config", async () => {
		const account = createMockAccount()
		const existing = {
			id: "tfc-1",
			accountId: mockAccountId,
			timeframeId: "tf-123",
			isEnabled: true,
		}

		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId, accountId: mockAccountId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			account as never
		)
		vi.mocked(db.query.accountTimeframes).findFirst.mockResolvedValueOnce(
			existing as never
		)
		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

		const result = await updateAccountTimeframe("tf-123", false)

		expect(result.status).toBe("success")
	})
})

describe("getBreakevenTicks", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should return per-asset override if configured", async () => {
		const account = createMockAccount({ defaultBreakevenTicks: 2 })
		const asset = { id: "asset-1", symbol: "ES" }
		const config = { id: "config-1", breakevenTicksOverride: 5 }

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId, accountId: mockAccountId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValue(
			account as never
		)
		vi.mocked(db.query.assets).findFirst.mockResolvedValue(asset as never)
		vi.mocked(db.query.accountAssets).findFirst.mockResolvedValue(
			config as never
		)

		const result = await getBreakevenTicks("ES", mockAccountId)

		expect(result).toBe(5)
	})

	it("should return account default if no override", async () => {
		const account = createMockAccount({ defaultBreakevenTicks: 3 })
		const asset = { id: "asset-1", symbol: "ES" }

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId, accountId: mockAccountId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValue(
			account as never
		)
		vi.mocked(db.query.assets).findFirst.mockResolvedValue(asset as never)
		vi.mocked(db.query.accountAssets).findFirst.mockResolvedValue(null as never)

		const result = await getBreakevenTicks("ES", mockAccountId)

		expect(result).toBe(3)
	})

	it("should return default fallback 2 when account not found", async () => {
		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValue(
			null as never
		)
		// These won't be called since account not found, but reset them anyway to prevent test pollution
		vi.mocked(db.query.assets).findFirst.mockResolvedValue(null as never)
		vi.mocked(db.query.accountAssets).findFirst.mockResolvedValue(null as never)

		const result = await getBreakevenTicks("ES", mockAccountId)

		expect(result).toBe(2)
	})
})

describe("getAssetFees", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should return commission and fees from fee resolver", async () => {
		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId, accountId: mockAccountId },
		} as never)

		const result = await getAssetFees("ES", mockAccountId)

		expect(result.commission).toBe(50)
		expect(result.fees).toBe(30)
	})

	it("should return zero fees when account not selected", async () => {
		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		const result = await getAssetFees("ES")

		expect(result.commission).toBe(0)
		expect(result.fees).toBe(0)
	})
})

describe("setAccountStartingBalance", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("should set starting balance and account start year", async () => {
		const account = createMockAccount()
		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			account as never
		)
		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

		const result = await setAccountStartingBalance(
			mockAccountId,
			10000000,
			2025
		)

		expect(result.status).toBe("success")
		expect(vi.mocked(db).update).toHaveBeenCalled()
	})

	it("should return NOT_FOUND for nonexistent account", async () => {
		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValueOnce(
			null as never
		)

		const result = await setAccountStartingBalance(
			"99999999-9999-4999-8999-999999999999",
			10000000,
			2025
		)

		expect(result.status).toBe("error")
		expect(result.error).toContain("not found")
	})

	it("should set starting balance with year value", async () => {
		const account = createMockAccount()
		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([account]),
				}),
			}),
		}

		vi.mocked(auth).mockResolvedValue({
			user: { id: mockUserId },
		} as never)

		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValue(
			account as never
		)
		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

		// Action accepts any numeric year value
		const result = await setAccountStartingBalance(mockAccountId, 10000000, -1)

		expect(result.status).toBe("success")
	})
})
