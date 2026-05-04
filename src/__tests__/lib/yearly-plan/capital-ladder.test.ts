import { describe, it, expect } from "vitest"
import { buildCapitalLadder, contractsForBalance } from "@/lib/yearly-plan/capital-ladder"
import type { LadderRule } from "@/db/schema"

const DEFAULT_RULES: LadderRule[] = [
	{ minContracts: 1,  maxContracts: 5,  multiplier: 1 },
	{ minContracts: 6,  maxContracts: 10, multiplier: 2 },
	{ minContracts: 11, maxContracts: 15, multiplier: 3 },
	{ minContracts: 16, maxContracts: 20, multiplier: 4 },
]
const VALOR_POR_CONTRATO = 300000

describe("buildCapitalLadder", () => {
	it("produces exactly 20 levels", () => {
		const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
		expect(ladder).toHaveLength(20)
	})
	it("level 1 (contracts=1, multiplier=1): valorOperacional = R$3k", () => {
		const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
		expect(ladder[0].contracts).toBe(1)
		expect(ladder[0].valorOperacionalCents).toBe(300000)
		expect(ladder[0].multiplier).toBe(1)
	})
	it("level 5 (contracts=5, multiplier=1): valorOperacional = R$15k", () => {
		const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
		expect(ladder[4].contracts).toBe(5)
		expect(ladder[4].valorOperacionalCents).toBe(1500000)
	})
	it("level 6 (contracts=6, multiplier=2)", () => {
		const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
		expect(ladder[5].contracts).toBe(6)
		expect(ladder[5].valorOperacionalCents).toBe(1800000)
		expect(ladder[5].multiplier).toBe(2)
	})
	it("level 20 (contracts=20, multiplier=4): valorOperacional = R$60k", () => {
		const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
		expect(ladder[19].contracts).toBe(20)
		expect(ladder[19].valorOperacionalCents).toBe(6000000)
		expect(ladder[19].multiplier).toBe(4)
	})
})

describe("contractsForBalance", () => {
	it("R$0 → floor at 1 contract", () => {
		const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
		expect(contractsForBalance(0, ladder)).toBe(1)
	})
	it("R$3k (300000 cents) → 1 contract", () => {
		const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
		expect(contractsForBalance(300000, ladder)).toBe(1)
	})
	it("R$9k (900000 cents) → 3 contracts", () => {
		const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
		expect(contractsForBalance(900000, ladder)).toBe(3)
	})
	it("R$18k (1800000 cents) → 6 contracts", () => {
		const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
		expect(contractsForBalance(1800000, ladder)).toBe(6)
	})
	it("above max ladder level → 20 contracts (capped)", () => {
		const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
		expect(contractsForBalance(999_000_000, ladder)).toBe(20)
	})
})
