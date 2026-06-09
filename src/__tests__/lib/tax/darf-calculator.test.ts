import { describe, it, expect } from "vitest"
import {
	computeDarf,
	DARF_MINIMUM_FILING_CENTS,
} from "@/lib/tax/darf-calculator"
import { asBasisPoints } from "@/lib/tax/rate-conversion"

// Hand-computed fixtures (planilha validation):
//
// CASE A — gain month, no carryover:
//   grossGain = R$8,000 (800000c), fees = R$200 (20000c), irrf = R$30 (3000c)
//   netGain = 800000 − 20000 = 780000
//   taxableGain = 780000 (no carryover)
//   irGross = round(780000 × 2000/10000) = round(156000) = 156000 (R$1,560)
//   darfDue = 156000 − 3000 = 153000 (R$1,530)
//
// CASE B — loss month:
//   grossGain = −R$5,000 (−500000c), fees = R$100 (10000c), irrf = 0
//   netGain = −500000 − 10000 = −510000
//   carryoverOut = 0 + 510000 = 510000, darfDue = 0
//
// CASE C — partial carryover (month1 carryoverOut flows in):
//   grossGain = R$8,000 (800000c), fees = R$200 (20000c), irrf = R$30 (3000c)
//   carryoverIn = 510000 (from CASE B)
//   netGain = 780000
//   carryoverConsumed = min(510000, 780000) = 510000
//   taxableGain = 780000 − 510000 = 270000
//   irGross = round(270000 × 2000/10000) = 54000 (R$540)
//   darfDue = 54000 − 3000 = 51000 (R$510)
//   carryoverOut = 510000 − 510000 = 0

const BASE_INPUT = {
	grossGainCents: 800000,
	totalFeesCents: 20000,
	irrfCents: 3000,
	carryoverInCents: 0,
	deferredIrInCents: 0,
	irRateBps: asBasisPoints(2000),
	subjectToPersonalIr: true,
}

describe("computeDarf", () => {
	it("CASE A: gain month, no carryover → correct DARF", () => {
		const result = computeDarf(BASE_INPUT)
		expect(result.netGainBeforeCarryover).toBe(780000)
		expect(result.carryoverConsumed).toBe(0)
		expect(result.carryoverOut).toBe(0)
		expect(result.taxableGain).toBe(780000)
		expect(result.irGross).toBe(156000)
		expect(result.darfDue).toBe(153000)
	})

	it("CASE B: loss month → darfDue=0, carryoverOut accumulates", () => {
		const result = computeDarf({
			...BASE_INPUT,
			grossGainCents: -500000,
			totalFeesCents: 10000,
			irrfCents: 0,
		})
		expect(result.netGainBeforeCarryover).toBe(-510000)
		expect(result.darfDue).toBe(0)
		expect(result.taxableGain).toBe(0)
		expect(result.carryoverOut).toBe(510000)
	})

	it("CASE C: partial carryover consumption → carryover offsets taxable gain", () => {
		const result = computeDarf({ ...BASE_INPUT, carryoverInCents: 510000 })
		expect(result.carryoverConsumed).toBe(510000)
		expect(result.carryoverOut).toBe(0)
		expect(result.taxableGain).toBe(270000)
		expect(result.irGross).toBe(54000)
		expect(result.darfDue).toBe(51000)
	})

	it("large carryover exceeds gain → taxableGain=0, partial carryover consumed, remainder carries", () => {
		// carryoverIn = R$10,000, netGain = R$3,000 → consume 3k, carry 7k
		const result = computeDarf({
			...BASE_INPUT,
			grossGainCents: 320000,
			carryoverInCents: 1000000,
		})
		// netGain = 320000 − 20000 = 300000
		expect(result.netGainBeforeCarryover).toBe(300000)
		expect(result.carryoverConsumed).toBe(300000)
		expect(result.carryoverOut).toBe(700000)
		expect(result.taxableGain).toBe(0)
		expect(result.darfDue).toBe(0)
	})

	it("IRRF exceeds IR gross → darfDue = 0, never negative", () => {
		// Small gain: netGain=500, irGross=100, irrf=50 → net 50 (R$0.50), now floored to 0 (< R$10)
		const result = computeDarf({
			...BASE_INPUT,
			grossGainCents: 600,
			totalFeesCents: 100,
			irrfCents: 50,
			irRateBps: asBasisPoints(2000),
		})
		expect(result.darfDue).toBe(0)
		expect(result.belowMinimumThreshold).toBe(true)
		// IRRF strictly exceeds irGross → net 0 → exempt (not "below threshold", just nothing owed)
		const edgeResult = computeDarf({
			...BASE_INPUT,
			grossGainCents: 600,
			totalFeesCents: 100,
			irrfCents: 200,
		})
		expect(edgeResult.darfDue).toBe(0)
		expect(edgeResult.belowMinimumThreshold).toBe(false)
	})

	it("prop account → all outputs 0, carryoverOut passthrough", () => {
		const result = computeDarf({
			...BASE_INPUT,
			subjectToPersonalIr: false,
			carryoverInCents: 50000,
		})
		expect(result.taxableGain).toBe(0)
		expect(result.irGross).toBe(0)
		expect(result.darfDue).toBe(0)
		// carryoverOut equals carryoverIn passthrough for prop accounts
		expect(result.carryoverOut).toBe(50000)
	})

	it("exactly-zero net gain → exempt, no carryover added", () => {
		const result = computeDarf({
			...BASE_INPUT,
			grossGainCents: 20000,
			totalFeesCents: 20000,
			irrfCents: 0,
		})
		expect(result.netGainBeforeCarryover).toBe(0)
		expect(result.darfDue).toBe(0)
		expect(result.carryoverOut).toBe(0)
		expect(result.belowMinimumThreshold).toBe(false)
	})

	describe("R$10 minimum filing threshold (Lei 9.430/96 art. 68)", () => {
		it("exposes DARF_MINIMUM_FILING_CENTS = 1000 (R$10.00)", () => {
			expect(DARF_MINIMUM_FILING_CENTS).toBe(1000)
		})

		it("just below R$10 floor (999 cents) → darfDue=0, belowMinimumThreshold=true", () => {
			// taxableGain that yields irGross=999, irrf=0 → irNetOfIrrf=999 → floored
			// 999 / 0.2 = 4995 cents taxable gain needed; netGain = 4995 + fees
			const result = computeDarf({
				...BASE_INPUT,
				grossGainCents: 4995 + 20000,
				totalFeesCents: 20000,
				irrfCents: 0,
			})
			expect(result.irGross).toBe(999)
			expect(result.darfDue).toBe(0)
			expect(result.belowMinimumThreshold).toBe(true)
		})

		it("exactly at R$10 (1000 cents) → darfDue=1000, belowMinimumThreshold=false", () => {
			const result = computeDarf({
				...BASE_INPUT,
				grossGainCents: 5000 + 20000,
				totalFeesCents: 20000,
				irrfCents: 0,
			})
			expect(result.irGross).toBe(1000)
			expect(result.darfDue).toBe(1000)
			expect(result.belowMinimumThreshold).toBe(false)
		})

		it("just above R$10 (1001 cents) → darfDue=1001, belowMinimumThreshold=false", () => {
			// 1001 / 0.2 = 5005 taxable
			const result = computeDarf({
				...BASE_INPUT,
				grossGainCents: 5005 + 20000,
				totalFeesCents: 20000,
				irrfCents: 0,
			})
			expect(result.irGross).toBe(1001)
			expect(result.darfDue).toBe(1001)
			expect(result.belowMinimumThreshold).toBe(false)
		})

		it("IRRF brings amount below threshold → darfDue=0, belowMinimumThreshold=true", () => {
			// irGross = 1500, irrf = 600 → net = 900 (below R$10) → floored
			const result = computeDarf({
				...BASE_INPUT,
				grossGainCents: 7500 + 20000,
				totalFeesCents: 20000,
				irrfCents: 600,
			})
			expect(result.irGross).toBe(1500)
			expect(result.darfDue).toBe(0)
			expect(result.belowMinimumThreshold).toBe(true)
		})

		it("IRRF brings amount exactly to threshold (1000) → darfDue=1000, not floored", () => {
			// irGross = 2000, irrf = 1000 → net = 1000 → at threshold (NOT below)
			const result = computeDarf({
				...BASE_INPUT,
				grossGainCents: 10000 + 20000,
				totalFeesCents: 20000,
				irrfCents: 1000,
			})
			expect(result.irGross).toBe(2000)
			expect(result.darfDue).toBe(1000)
			expect(result.belowMinimumThreshold).toBe(false)
		})

		it("prop account stays exempt regardless of threshold", () => {
			const result = computeDarf({ ...BASE_INPUT, subjectToPersonalIr: false })
			expect(result.belowMinimumThreshold).toBe(false)
		})

		it("loss month stays exempt regardless of threshold", () => {
			const result = computeDarf({ ...BASE_INPUT, grossGainCents: -500000 })
			expect(result.belowMinimumThreshold).toBe(false)
		})
	})

	describe("IR deferral (Lei 9.430/96 art. 68 §1°)", () => {
		it("single month with sub-R$10 IR → deferred forward", () => {
			// taxableGain that yields irGross=800, irrf=0 → net=800 (below R$10)
			// 800 / 0.2 = 4000 cents taxable gain needed
			const result = computeDarf({
				...BASE_INPUT,
				grossGainCents: 4000 + 20000,
				totalFeesCents: 20000,
				irrfCents: 0,
				deferredIrInCents: 0,
			})
			expect(result.irGross).toBe(800)
			expect(result.darfDue).toBe(0)
			expect(result.belowMinimumThreshold).toBe(true)
			expect(result.deferredIrOutCents).toBe(800)
		})

		it("two months chained: M1 defers 600, M2 has 800 → cumulative 1400 → DARF emitted", () => {
			// Month 1: yields irGross=600 (sub-R$10) → deferredOut=600
			// Month 2: yields irGross=800, deferredIn=600 → cumulative=1400 → crosses R$10 → emit DARF
			const m1 = computeDarf({
				...BASE_INPUT,
				grossGainCents: 3000 + 20000,
				totalFeesCents: 20000,
				irrfCents: 0,
				deferredIrInCents: 0,
			})
			expect(m1.irGross).toBe(600)
			expect(m1.darfDue).toBe(0)
			expect(m1.deferredIrOutCents).toBe(600)

			const m2 = computeDarf({
				...BASE_INPUT,
				grossGainCents: 4000 + 20000,
				totalFeesCents: 20000,
				irrfCents: 0,
				deferredIrInCents: m1.deferredIrOutCents,
			})
			expect(m2.irGross).toBe(800)
			expect(m2.darfDue).toBe(1400) // full cumulative (600+800)
			expect(m2.belowMinimumThreshold).toBe(false)
			expect(m2.deferredIrOutCents).toBe(0)
		})

		it("three months chained: M1=400, M2=300, M3=500 → M3 cumulative=1200 → DARF emitted", () => {
			// M1: 400 deferred
			const m1 = computeDarf({
				...BASE_INPUT,
				grossGainCents: 2000 + 20000,
				totalFeesCents: 20000,
				irrfCents: 0,
				deferredIrInCents: 0,
			})
			expect(m1.irGross).toBe(400)
			expect(m1.darfDue).toBe(0)
			expect(m1.deferredIrOutCents).toBe(400)

			// M2: 300 + prior 400 = 700, still sub-R$10, defer all
			const m2 = computeDarf({
				...BASE_INPUT,
				grossGainCents: 1500 + 20000,
				totalFeesCents: 20000,
				irrfCents: 0,
				deferredIrInCents: m1.deferredIrOutCents,
			})
			expect(m2.irGross).toBe(300)
			expect(m2.darfDue).toBe(0)
			expect(m2.belowMinimumThreshold).toBe(true)
			expect(m2.deferredIrOutCents).toBe(700)

			// M3: 500 + prior 700 = 1200, crosses R$10, emit DARF
			const m3 = computeDarf({
				...BASE_INPUT,
				grossGainCents: 2500 + 20000,
				totalFeesCents: 20000,
				irrfCents: 0,
				deferredIrInCents: m2.deferredIrOutCents,
			})
			expect(m3.irGross).toBe(500)
			expect(m3.darfDue).toBe(1200)
			expect(m3.belowMinimumThreshold).toBe(false)
			expect(m3.deferredIrOutCents).toBe(0)
		})

		it("loss month preserves deferred balance (pass-through)", () => {
			const result = computeDarf({
				...BASE_INPUT,
				grossGainCents: -500000,
				totalFeesCents: 10000,
				irrfCents: 0,
				deferredIrInCents: 600,
			})
			expect(result.darfDue).toBe(0)
			expect(result.deferredIrOutCents).toBe(600)
		})

		it("prop account preserves deferred balance (pass-through)", () => {
			const result = computeDarf({
				...BASE_INPUT,
				subjectToPersonalIr: false,
				deferredIrInCents: 600,
			})
			expect(result.darfDue).toBe(0)
			expect(result.deferredIrOutCents).toBe(600)
		})

		it("cumulative exactly at R$10 (1000 cents) → DARF emitted, not floored", () => {
			// deferredIn=500, current=500 → cumulative=1000 → at threshold
			const result = computeDarf({
				...BASE_INPUT,
				grossGainCents: 2500 + 20000,
				totalFeesCents: 20000,
				irrfCents: 0,
				deferredIrInCents: 500,
			})
			expect(result.irGross).toBe(500)
			expect(result.darfDue).toBe(1000)
			expect(result.belowMinimumThreshold).toBe(false)
			expect(result.deferredIrOutCents).toBe(0)
		})
	})
})
