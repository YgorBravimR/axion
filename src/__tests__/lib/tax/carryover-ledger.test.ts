import { describe, it, expect } from "vitest"
import { buildCarryoverChain } from "@/lib/tax/carryover-ledger"

// Hand-computed 3-month chain (planilha validation):
// Month 1: loss −R$5,000 (−500000c net) → balance 500000
// Month 2: loss −R$2,000 (−200000c net) → balance 700000
// Month 3: gain +R$8,000 (+780000c net after fees) → consumes 700000, taxable 80000, balance 0
describe("buildCarryoverChain", () => {
	it("3-month chain: loss/loss/gain — carryover offsets gain correctly", () => {
		const months = [
			{ month: new Date("2026-01-01"), netGainCents: -500000 },
			{ month: new Date("2026-02-01"), netGainCents: -200000 },
			{ month: new Date("2026-03-01"), netGainCents: 780000 },
		]
		const chain = buildCarryoverChain(months)

		// Month 1: loss, balance grows
		expect(chain[0].balanceCents).toBe(500000)
		expect(chain[0].exhaustedAt).toBeNull()

		// Month 2: loss, balance grows
		expect(chain[1].balanceCents).toBe(700000)
		expect(chain[1].exhaustedAt).toBeNull()

		// Month 3: gain partially consumed by carryover
		expect(chain[2].balanceCents).toBe(0)
		expect(chain[2].exhaustedAt).toEqual(new Date("2026-03-01"))
	})

	it("single loss month → balance = absolute loss", () => {
		const months = [{ month: new Date("2026-01-01"), netGainCents: -300000 }]
		const chain = buildCarryoverChain(months)
		expect(chain[0].balanceCents).toBe(300000)
		expect(chain[0].monthsInDeficit).toBe(1)
	})

	it("gain month with no prior carryover → balance stays 0", () => {
		const months = [{ month: new Date("2026-01-01"), netGainCents: 500000 }]
		const chain = buildCarryoverChain(months)
		expect(chain[0].balanceCents).toBe(0)
		expect(chain[0].exhaustedAt).toBeNull()
	})

	it("gain only partially covers carryover → remaining balance carried", () => {
		const months = [
			{ month: new Date("2026-01-01"), netGainCents: -1000000 },
			{ month: new Date("2026-02-01"), netGainCents: 300000 },
		]
		const chain = buildCarryoverChain(months)
		expect(chain[0].balanceCents).toBe(1000000)
		expect(chain[1].balanceCents).toBe(700000)
		expect(chain[1].exhaustedAt).toBeNull()
	})

	it("multi-year chain — no annual reset", () => {
		const months = [
			{ month: new Date("2025-12-01"), netGainCents: -500000 },
			{ month: new Date("2026-01-01"), netGainCents: 200000 },
			{ month: new Date("2026-02-01"), netGainCents: 400000 },
		]
		const chain = buildCarryoverChain(months)
		// Dec: −500k → balance 500k
		expect(chain[0].balanceCents).toBe(500000)
		// Jan: +200k, consume 200k → balance 300k
		expect(chain[1].balanceCents).toBe(300000)
		// Feb: +400k, consume 300k → balance 0, exhausted
		expect(chain[2].balanceCents).toBe(0)
		expect(chain[2].exhaustedAt).toEqual(new Date("2026-02-01"))
	})

	it("empty array → empty chain", () => {
		expect(buildCarryoverChain([])).toHaveLength(0)
	})
})
