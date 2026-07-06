import { describe, it, expect } from "vitest"
import {
	resolveHawksDailyGovernor,
	type GovernorTrade,
} from "@/lib/hawks/daily-governor"

// Helpers to build a day's closed trades tersely. rOutcome drives the machine;
// outcome is derived from sign unless overridden (for scratch/breakeven cases).
const win = (r: number): GovernorTrade => ({ rOutcome: r, outcome: "win" })
const loss = (r: number): GovernorTrade => ({ rOutcome: r, outcome: "loss" })
const be = (): GovernorTrade => ({ rOutcome: 0, outcome: "breakeven" })

const TARGET = 5

const run = (trades: GovernorTrade[], dailyTargetR = TARGET) =>
	resolveHawksDailyGovernor({ trades, dailyTargetR })

describe("resolveHawksDailyGovernor", () => {
	describe("Phase 0 — not armed", () => {
		it("S1: first trade is a stop — governor does not stop (loss cap governs)", () => {
			const r = run([loss(-1)])
			expect(r.phase).toBe("phase0")
			expect(r.armed).toBe(false)
			expect(r.shouldStop).toBe(false)
			expect(r.stopReason).toBeNull()
		})

		it("S13a: a sub-1R win does NOT arm the rule", () => {
			const r = run([win(0.7)])
			expect(r.phase).toBe("phase0")
			expect(r.armed).toBe(false)
			expect(r.shouldStop).toBe(false)
		})

		it("S13b: +0.7R then -1R lands at -0.3R, still phase0, no governor stop", () => {
			const r = run([win(0.7), loss(-1)])
			expect(r.totalR).toBeCloseTo(-0.3, 5)
			expect(r.phase).toBe("phase0")
			expect(r.shouldStop).toBe(false)
		})

		it("empty trades → no stop, phase0", () => {
			const r = run([])
			expect(r.phase).toBe("phase0")
			expect(r.shouldStop).toBe(false)
			expect(r.totalR).toBe(0)
		})
	})

	describe("Phase A — armed, never-red cushion", () => {
		it("S2: +1R then -1R → 0R floor, day ends", () => {
			const r = run([win(1), loss(-1)])
			expect(r.totalR).toBe(0)
			expect(r.armed).toBe(true)
			expect(r.phase).toBe("phaseA")
			expect(r.cushion).toBe(0)
			expect(r.shouldStop).toBe(true)
			expect(r.stopReason).toBe("neverRedFloor")
		})

		it("S3: +1,+1,+1 then -1,-1,-1 → rides to 0R, three stops absorbed", () => {
			// After 2 wins: cushion 2, still trading.
			expect(run([win(1), win(1)]).cushion).toBe(2)
			expect(run([win(1), win(1)]).shouldStop).toBe(false)
			// Full sequence lands at 0R and stops.
			const r = run([win(1), win(1), win(1), loss(-1), loss(-1), loss(-1)])
			expect(r.totalR).toBe(0)
			expect(r.cushion).toBe(0)
			expect(r.shouldStop).toBe(true)
			expect(r.stopReason).toBe("neverRedFloor")
		})

		it("S4: +1.5R then -1R → +0.5R remainder, day ends (fractional not risked)", () => {
			const r = run([win(1.5), loss(-1)])
			expect(r.totalR).toBeCloseTo(0.5, 5)
			expect(r.cushion).toBe(0)
			expect(r.shouldStop).toBe(true)
			expect(r.stopReason).toBe("neverRedFloor")
		})

		it("S5: +1.5R + +1.5R → floor(3.0) = 3 cushion (running-total combines .5s)", () => {
			const r = run([win(1.5), win(1.5)])
			expect(r.totalR).toBeCloseTo(3, 5)
			expect(r.cushion).toBe(3)
			expect(r.shouldStop).toBe(false)
		})

		it("cushion-exact-to-0 boundary: +2R then -1,-1 → 0R stop", () => {
			expect(run([win(2), loss(-1)]).cushion).toBe(1)
			expect(run([win(2), loss(-1)]).shouldStop).toBe(false)
			const r = run([win(2), loss(-1), loss(-1)])
			expect(r.totalR).toBe(0)
			expect(r.shouldStop).toBe(true)
		})

		it("S20: cushion grows cleanly on further wins (+2R then +1R → +3R cushion 3)", () => {
			const r = run([win(2), win(1)])
			expect(r.totalR).toBe(3)
			expect(r.cushion).toBe(3)
			expect(r.phase).toBe("phaseA")
			expect(r.shouldStop).toBe(false)
		})

		it("S18: five +0.99R wins arm via running total (4.95R → cushion 4)", () => {
			const r = run([win(0.99), win(0.99), win(0.99), win(0.99), win(0.99)])
			expect(r.totalR).toBeCloseTo(4.95, 5)
			expect(r.armed).toBe(true)
			expect(r.phase).toBe("phaseA")
			expect(r.cushion).toBe(4)
		})
	})

	describe("LATCH — armed stays armed on partial-loss excursions (P0)", () => {
		it("S16: +1.5R (arm) then -0.7R → +0.8R still armed, floor holds, no red", () => {
			const r = run([win(1.5), loss(-0.7)])
			expect(r.totalR).toBeCloseTo(0.8, 5)
			expect(r.armed).toBe(true) // latched — did NOT revert to phase0
			expect(r.phase).toBe("phaseA")
			expect(r.cushion).toBe(0) // floor(0.8) = 0 → day ends at >=0
			expect(r.shouldStop).toBe(true)
			expect(r.stopReason).toBe("neverRedFloor")
		})

		it("S17: armed day cannot re-expose the full loss cap below break-even", () => {
			// +1R arms; a subsequent partial loss keeps us armed so the floor is 0R,
			// never the -3R cap. The governor stops at cushion<1 rather than letting
			// the day bleed to a red loss-cap.
			const r = run([win(1), loss(-0.6)])
			expect(r.armed).toBe(true)
			expect(r.totalR).toBeCloseTo(0.4, 5)
			expect(r.phase).toBe("phaseA")
			expect(r.shouldStop).toBe(true)
			expect(r.stopReason).toBe("neverRedFloor")
		})
	})

	describe("Phase B — after target, one stop hard", () => {
		it("S6: +1R x5 hits target, then -1R → +4R, day ends", () => {
			// At exactly target: in Phase B but no post-target loss yet → keep going.
			const atTarget = run([win(1), win(1), win(1), win(1), win(1)])
			expect(atTarget.phase).toBe("phaseB")
			expect(atTarget.shouldStop).toBe(false)
			// One stop after target ends it.
			const r = run([win(1), win(1), win(1), win(1), win(1), loss(-1)])
			expect(r.totalR).toBe(4)
			expect(r.phase).toBe("phaseB")
			expect(r.shouldStop).toBe(true)
			expect(r.stopReason).toBe("postTargetStop")
		})

		it("S7: wins after target don't buy stops; first stop still ends it", () => {
			const stillGoing = run([win(5), win(1), win(1)])
			expect(stillGoing.phase).toBe("phaseB")
			expect(stillGoing.shouldStop).toBe(false)
			expect(stillGoing.totalR).toBe(7)
			const r = run([win(5), win(1), win(1), loss(-1)])
			expect(r.totalR).toBe(6)
			expect(r.shouldStop).toBe(true)
			expect(r.stopReason).toBe("postTargetStop")
		})

		it("S8: crossing target tightens — +4R,+1R(→5R),-1R → +4R ends", () => {
			// The win that crosses the target is NOT the stop (boundary guard).
			const crossing = run([win(4), win(1)])
			expect(crossing.phase).toBe("phaseB")
			expect(crossing.shouldStop).toBe(false)
			const r = run([win(4), win(1), loss(-1)])
			expect(r.totalR).toBe(4)
			expect(r.shouldStop).toBe(true)
			expect(r.stopReason).toBe("postTargetStop")
		})

		it("S9: a single +2R overshoot crosses the target into Phase B", () => {
			const r = run([win(4), win(2)])
			expect(r.totalR).toBe(6)
			expect(r.phase).toBe("phaseB")
			expect(r.shouldStop).toBe(false)
		})

		it("S19: ANY losing trade ends Phase B, even a -0.4R partial", () => {
			const r = run([win(5), loss(-0.4)])
			expect(r.phase).toBe("phaseB")
			expect(r.totalR).toBeCloseTo(4.6, 5)
			expect(r.shouldStop).toBe(true)
			expect(r.stopReason).toBe("postTargetStop")
		})
	})

	describe("Edge cases", () => {
		it("S12: breakeven trades don't consume cushion or count as the stop", () => {
			const r = run([win(1), be(), be()])
			expect(r.totalR).toBe(1)
			expect(r.cushion).toBe(1)
			expect(r.phase).toBe("phaseA")
			expect(r.shouldStop).toBe(false)
		})

		it("breakeven in Phase B does not end the day (not a loss)", () => {
			const r = run([win(5), be()])
			expect(r.phase).toBe("phaseB")
			expect(r.shouldStop).toBe(false)
		})

		it("target exactly at 1R still separates Phase A boundary from Phase B", () => {
			// If target were 1R, the first +1R win both arms and hits target → Phase B.
			const r = run([win(1)], 1)
			expect(r.phase).toBe("phaseB")
			expect(r.shouldStop).toBe(false)
		})
	})
})
