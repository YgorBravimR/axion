import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the DB + resolveDay so we can exercise the mode gate + null paths
// without a live database. The pure state machine is covered exhaustively in
// daily-governor.test.ts; here we verify the DRY seam (gate + compose).
vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			accountModes: { findFirst: vi.fn() },
		},
		select: vi.fn(),
	},
}))
vi.mock("@/lib/fractal-plan/resolver", () => ({
	resolveDay: vi.fn(),
}))

const { db } = await import("@/db/drizzle")
const { resolveDay } = await import("@/lib/fractal-plan/resolver")
const { getHawksDailyGovernorStatus, applyGovernorToStatus } =
	await import("@/lib/hawks/daily-governor-status")
import type { LiveTradingStatus } from "@/types/live-trading-status"
import type { GovernorResult } from "@/lib/hawks/daily-governor"

const findFirst = vi.mocked(db.query.accountModes.findFirst)
const resolveDayMock = vi.mocked(resolveDay)

describe("getHawksDailyGovernorStatus — mode gate", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns null for a non-Hawks account (never touches trades)", async () => {
		findFirst.mockResolvedValue({ mode: "standard" } as never)
		const result = await getHawksDailyGovernorStatus("acct-1", new Date())
		expect(result).toBeNull()
		expect(resolveDayMock).not.toHaveBeenCalled()
	})

	it("returns null when no active mode row exists", async () => {
		findFirst.mockResolvedValue(undefined as never)
		const result = await getHawksDailyGovernorStatus("acct-1", new Date())
		expect(result).toBeNull()
	})

	it("fails open (null) on a DB error rather than forcing a wrong stop", async () => {
		findFirst.mockRejectedValue(new Error("db down"))
		const result = await getHawksDailyGovernorStatus("acct-1", new Date())
		expect(result).toBeNull()
	})

	it("returns null when the day has no positive target", async () => {
		findFirst.mockResolvedValue({ mode: "hawks" } as never)
		resolveDayMock.mockResolvedValue({
			oneRCents: 10000,
			dailyTargetR: { value: "0" },
		} as never)
		const result = await getHawksDailyGovernorStatus("acct-1", new Date())
		expect(result).toBeNull()
	})
})

describe("applyGovernorToStatus — D3 merge (the integration seam)", () => {
	const baseStatus = (
		overrides: Partial<LiveTradingStatus>
	): LiveTradingStatus =>
		({
			shouldStopTrading: false,
			stopReason: null,
			hawksGovernor: null,
			...overrides,
		}) as LiveTradingStatus

	const gov = (overrides: Partial<GovernorResult>): GovernorResult => ({
		phase: "phaseA",
		totalR: 2,
		cushion: 2,
		armed: true,
		shouldStop: false,
		stopReason: null,
		...overrides,
	})

	it("no-op when governor is null (non-Hawks account untouched)", () => {
		const status = baseStatus({
			shouldStopTrading: true,
			stopReason: "dailyTargetReached",
		})
		applyGovernorToStatus(status, null)
		expect(status.shouldStopTrading).toBe(true)
		expect(status.stopReason).toBe("dailyTargetReached")
		expect(status.hawksGovernor).toBeNull()
	})

	it("D3: clears the cents target-stop for Hawks (target is a milestone, not exit)", () => {
		const status = baseStatus({
			shouldStopTrading: true,
			stopReason: "dailyTargetReached",
		})
		applyGovernorToStatus(status, gov({ phase: "phaseB", shouldStop: false }))
		expect(status.shouldStopTrading).toBe(false)
		expect(status.stopReason).toBeNull()
		expect(status.hawksGovernor?.phase).toBe("phaseB")
	})

	it("governor stop wins: postTargetStop overrides", () => {
		const status = baseStatus({})
		applyGovernorToStatus(
			status,
			gov({ phase: "phaseB", shouldStop: true, stopReason: "postTargetStop" })
		)
		expect(status.shouldStopTrading).toBe(true)
		expect(status.stopReason).toBe("postTargetStop")
	})

	it("governor stop wins: neverRedFloor overrides", () => {
		const status = baseStatus({})
		applyGovernorToStatus(
			status,
			gov({
				phase: "phaseA",
				cushion: 0,
				shouldStop: true,
				stopReason: "neverRedFloor",
			})
		)
		expect(status.shouldStopTrading).toBe(true)
		expect(status.stopReason).toBe("neverRedFloor")
	})

	it("does not clobber a non-target existing stop (e.g. dailyLossLimit in phase0)", () => {
		const status = baseStatus({
			shouldStopTrading: true,
			stopReason: "dailyLossLimit",
		})
		applyGovernorToStatus(status, gov({ phase: "phase0", shouldStop: false }))
		expect(status.shouldStopTrading).toBe(true)
		expect(status.stopReason).toBe("dailyLossLimit")
	})

	it("always attaches the governor snapshot for the panels", () => {
		const status = baseStatus({})
		applyGovernorToStatus(status, gov({ totalR: 3, cushion: 3 }))
		expect(status.hawksGovernor).toEqual({
			phase: "phaseA",
			totalR: 3,
			cushion: 3,
			armed: true,
		})
	})
})
