import { describe, expect, it } from "vitest"
// Import from the pure source (r-number.ts), not the barrel — the barrel
// (brick-size-resolver.ts) also imports @/db/drizzle, which throws
// "DATABASE_URL missing" at module load on CI (no .env). This test only
// exercises pure R→points math, so it must not drag in the DB client.
import { rNumberToPoints } from "@/lib/enrichment/r-number"

describe("rNumberToPoints", () => {
	it("R20 = 95 points (per CLAUDE.md rule 0)", () => {
		expect(rNumberToPoints(20)).toBe(95)
	})

	it("R21 = 100 points", () => {
		expect(rNumberToPoints(21)).toBe(100)
	})

	it("R24 = 115 points", () => {
		expect(rNumberToPoints(24)).toBe(115)
	})

	it("R34 = 165 points", () => {
		expect(rNumberToPoints(34)).toBe(165)
	})

	it("R2 = 5 points (boundary)", () => {
		expect(rNumberToPoints(2)).toBe(5)
	})

	it("R1 = 0 points (degenerate)", () => {
		expect(rNumberToPoints(1)).toBe(0)
	})
})
