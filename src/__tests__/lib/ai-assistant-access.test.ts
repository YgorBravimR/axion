/**
 * Tests for `canUseAiAssistant()` — the single source of truth for AI
 * Assistant visibility. Covers every row of the 7-row truth table in
 * docs/plans/ai-assistant-phase-1.md §2a.
 *
 * Strategy: mock @/auth (session) + @/db/drizzle (config row) + the build
 * flag module. Each test exercises one gate state and asserts the
 * canUse/reason pair. No real DB; no real session.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const { authMock, dbConfigMock, buildEnabledMock } = vi.hoisted(() => ({
	authMock: vi.fn(),
	dbConfigMock: vi.fn(),
	buildEnabledMock: vi.fn(),
}))

vi.mock("@/auth", () => ({
	auth: authMock,
}))

vi.mock("@/lib/flags/ai-assistant", () => ({
	isAiAssistantBuildEnabled: buildEnabledMock,
}))

// Mock the db so the config read returns whatever dbConfigMock yields.
// Drizzle query-builder shape: db.select().from().where().limit() resolves
// to an array of rows. We collapse all of that into the terminal limit()
// that returns the mocked value.
vi.mock("@/db/drizzle", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: dbConfigMock,
				}),
			}),
		}),
	},
}))

// Schema imports are evaluated at import time but the table objects don't
// need to be real for our mocked-db tests. Stub them as opaque objects.
vi.mock("@/db/schema", () => ({
	aiAssistantConfig: { id: "id-col" },
}))

import { canUseAiAssistant } from "@/lib/ai-assistant/access"

const ENABLED_DEFAULTS = {
	id: 1,
	enabled: true,
	allowedRoles: ["admin"],
	allowedUserIds: [],
	allowedSurfaces: ["trade_detail"],
	monthlyCostCapCents: 500,
	lastChangeReason: null,
	updatedAt: new Date(),
	updatedBy: null,
}

describe("canUseAiAssistant — 7-row gate truth table", () => {
	beforeEach(() => {
		authMock.mockReset()
		dbConfigMock.mockReset()
		buildEnabledMock.mockReset()
		// Default to build enabled for all tests except ROW 1
		buildEnabledMock.mockReturnValue(true)
	})

	it("ROW 1 — build flag off → denies regardless of session/config", async () => {
		buildEnabledMock.mockReturnValue(false)
		const result = await canUseAiAssistant()
		expect(result.canUse).toBe(false)
		if (!result.canUse) {
			expect(result.reason).toBe("build_disabled")
		}
		// Should short-circuit before any session or DB hit.
		expect(authMock).not.toHaveBeenCalled()
		expect(dbConfigMock).not.toHaveBeenCalled()
	})

	it("ROW 2 — build on, no session → denies", async () => {
		authMock.mockResolvedValueOnce(null)
		const result = await canUseAiAssistant()
		expect(result.canUse).toBe(false)
		if (!result.canUse) {
			expect(result.reason).toBe("no_session")
		}
	})

	it("ROW 3 — build on, session present, config row missing → denies", async () => {
		authMock.mockResolvedValueOnce({
			user: { id: "u-1", role: "admin" },
		})
		dbConfigMock.mockResolvedValueOnce([])
		const result = await canUseAiAssistant()
		expect(result.canUse).toBe(false)
		if (!result.canUse) {
			expect(result.reason).toBe("config_missing")
		}
	})

	it("ROW 4 — build on, session, config exists, enabled=false → denies", async () => {
		authMock.mockResolvedValueOnce({
			user: { id: "u-1", role: "admin" },
		})
		dbConfigMock.mockResolvedValueOnce([
			{ ...ENABLED_DEFAULTS, enabled: false },
		])
		const result = await canUseAiAssistant()
		expect(result.canUse).toBe(false)
		if (!result.canUse) {
			expect(result.reason).toBe("globally_disabled")
		}
	})

	it("ROW 5 — build on, session, enabled, role NOT in allowedRoles → denies", async () => {
		authMock.mockResolvedValueOnce({
			user: { id: "u-1", role: "viewer" },
		})
		dbConfigMock.mockResolvedValueOnce([
			{ ...ENABLED_DEFAULTS, allowedRoles: ["admin", "premium"] },
		])
		const result = await canUseAiAssistant()
		expect(result.canUse).toBe(false)
		if (!result.canUse) {
			expect(result.reason).toBe("role_not_allowed")
		}
	})

	it("ROW 6 — build on, session, enabled, role allowed, no surface filter → allows", async () => {
		authMock.mockResolvedValueOnce({
			user: { id: "u-1", role: "admin" },
		})
		dbConfigMock.mockResolvedValueOnce([
			{ ...ENABLED_DEFAULTS, allowedSurfaces: [] },
		])
		// Caller omits surface → surface gate skipped.
		const result = await canUseAiAssistant()
		expect(result.canUse).toBe(true)
		if (result.canUse) {
			expect(result.userId).toBe("u-1")
			expect(result.role).toBe("admin")
		}
	})

	it("ROW 7 — build on, session, enabled, role allowed, surface NOT allowed → denies", async () => {
		authMock.mockResolvedValueOnce({
			user: { id: "u-1", role: "admin" },
		})
		dbConfigMock.mockResolvedValueOnce([
			{ ...ENABLED_DEFAULTS, allowedSurfaces: ["trade_detail"] },
		])
		const result = await canUseAiAssistant("dashboard")
		expect(result.canUse).toBe(false)
		if (!result.canUse) {
			expect(result.reason).toBe("surface_not_allowed")
		}
	})
})

describe("canUseAiAssistant — allowedUserIds override", () => {
	beforeEach(() => {
		authMock.mockReset()
		dbConfigMock.mockReset()
		buildEnabledMock.mockReset()
	})

	it("allowlist contains user → allows even if role would be denied", async () => {
		buildEnabledMock.mockReturnValue(true)
		authMock.mockResolvedValueOnce({
			user: { id: "u-ygor", role: "trader" },
		})
		dbConfigMock.mockResolvedValueOnce([
			{
				...ENABLED_DEFAULTS,
				allowedRoles: ["admin"],
				allowedUserIds: ["u-ygor"],
			},
		])
		const result = await canUseAiAssistant("trade_detail")
		expect(result.canUse).toBe(true)
	})

	it("allowlist non-empty + user not in it → denies, role check skipped", async () => {
		buildEnabledMock.mockReturnValue(true)
		authMock.mockResolvedValueOnce({
			user: { id: "u-other", role: "admin" },
		})
		dbConfigMock.mockResolvedValueOnce([
			{
				...ENABLED_DEFAULTS,
				allowedRoles: ["admin"], // role would allow
				allowedUserIds: ["u-ygor"], // but allowlist overrides
			},
		])
		const result = await canUseAiAssistant("trade_detail")
		expect(result.canUse).toBe(false)
		if (!result.canUse) {
			expect(result.reason).toBe("user_not_allowlisted")
		}
	})

	it("empty allowlist + role allowed → falls through to role check (allows)", async () => {
		buildEnabledMock.mockReturnValue(true)
		authMock.mockResolvedValueOnce({
			user: { id: "u-1", role: "premium" },
		})
		dbConfigMock.mockResolvedValueOnce([
			{
				...ENABLED_DEFAULTS,
				allowedRoles: ["admin", "premium"],
				allowedUserIds: [],
			},
		])
		const result = await canUseAiAssistant("trade_detail")
		expect(result.canUse).toBe(true)
	})
})

describe("canUseAiAssistant — role fallback for null role", () => {
	beforeEach(() => {
		authMock.mockReset()
		dbConfigMock.mockReset()
		buildEnabledMock.mockReset()
	})

	it("session.user.role null → fallback to 'trader'; denied when allowedRoles excludes trader", async () => {
		buildEnabledMock.mockReturnValue(true)
		authMock.mockResolvedValueOnce({
			user: { id: "u-1", role: null },
		})
		dbConfigMock.mockResolvedValueOnce([
			{ ...ENABLED_DEFAULTS, allowedRoles: ["admin"] },
		])
		const result = await canUseAiAssistant("trade_detail")
		expect(result.canUse).toBe(false)
		if (!result.canUse) {
			expect(result.reason).toBe("role_not_allowed")
		}
	})

	it("session.user.role null → fallback to 'trader'; allowed when allowedRoles includes trader", async () => {
		buildEnabledMock.mockReturnValue(true)
		authMock.mockResolvedValueOnce({
			user: { id: "u-1", role: null },
		})
		dbConfigMock.mockResolvedValueOnce([
			{ ...ENABLED_DEFAULTS, allowedRoles: ["trader"] },
		])
		const result = await canUseAiAssistant("trade_detail")
		expect(result.canUse).toBe(true)
		if (result.canUse) {
			expect(result.role).toBe("trader")
		}
	})
})
