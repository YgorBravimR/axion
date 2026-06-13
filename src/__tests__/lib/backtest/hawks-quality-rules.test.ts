/**
 * hawks-quality-rules.test.ts — Export verification for dual-mode quality gates.
 *
 * Verifies that the dual-mode rule implementations export correctly with the
 * required interface signatures:
 *   - keltnerInnerDualRule, macdDualRule, volumeDualRule (DualModeRule)
 *   - aggressionSplitRule (AggressionDualModeRule with split score/block methods)
 *
 * These smoke tests ensure the refactoring has exported the right structures.
 * Integration testing is performed by the engine at runtime via backtests.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from "vitest"
import {
	keltnerInnerDualRule,
	macdDualRule,
	volumeDualRule,
	aggressionSplitRule,
	createQualityContext,
	updateQualityContext,
	evaluateQuality,
} from "@/lib/backtest/modules/entry/hawks-quality-rules"
import type { HawksTripleScreenConfig } from "@/types/backtest"
import { makeHawksConfig } from "@/__tests__/helpers/hawks-config"
import type { CandleRow } from "@/types/candle"

describe("Dual-mode rules exports and interface compliance", () => {
	describe("keltnerInnerDualRule", () => {
		it("should export a valid DualModeRule", () => {
			expect(keltnerInnerDualRule).toBeDefined()
			expect(keltnerInnerDualRule.key).toBe("keltner_inner")
			expect(typeof keltnerInnerDualRule.weight).toBe("number")
			expect(typeof keltnerInnerDualRule.resolveMode).toBe("function")
			expect(typeof keltnerInnerDualRule.evaluateSignal).toBe("function")
		})

		it("resolveMode should return a valid mode", () => {
			const config = {
				qualityGates: {
					keltnerInner: { mode: "score" },
				},
			} as any
			const mode = keltnerInnerDualRule.resolveMode(config)
			expect(["off", "score", "block", "both"]).toContain(mode)
		})
	})

	describe("macdDualRule", () => {
		it("should export a valid DualModeRule", () => {
			expect(macdDualRule).toBeDefined()
			expect(macdDualRule.key).toBe("macd")
			expect(typeof macdDualRule.weight).toBe("number")
			expect(typeof macdDualRule.resolveMode).toBe("function")
			expect(typeof macdDualRule.evaluateSignal).toBe("function")
		})

		it("resolveMode should return a valid mode", () => {
			const config = {
				qualityGates: {
					macd: { mode: "block" },
				},
			} as any
			const mode = macdDualRule.resolveMode(config)
			expect(["off", "score", "block", "both"]).toContain(mode)
		})
	})

	describe("volumeDualRule", () => {
		it("should export a valid DualModeRule", () => {
			expect(volumeDualRule).toBeDefined()
			expect(volumeDualRule.key).toBe("volume")
			expect(typeof volumeDualRule.weight).toBe("number")
			expect(typeof volumeDualRule.resolveMode).toBe("function")
			expect(typeof volumeDualRule.evaluateSignal).toBe("function")
		})

		it("resolveMode should return a valid mode", () => {
			const config = {
				qualityGates: {
					volume: { mode: "both" },
				},
			} as any
			const mode = volumeDualRule.resolveMode(config)
			expect(["off", "score", "block", "both"]).toContain(mode)
		})
	})

	describe("aggressionSplitRule", () => {
		it("should export a valid AggressionDualModeRule with score methods", () => {
			expect(aggressionSplitRule).toBeDefined()
			expect(aggressionSplitRule.key).toBe("aggression")
			expect(typeof aggressionSplitRule.weight).toBe("number")
			expect(typeof aggressionSplitRule.resolveScoreMode).toBe("function")
			expect(typeof aggressionSplitRule.evaluateScoreSignal).toBe("function")
		})

		it("should export AggressionDualModeRule with block methods", () => {
			expect(typeof aggressionSplitRule.resolveBlockMode).toBe("function")
			expect(typeof aggressionSplitRule.evaluateBlockSignal).toBe("function")
		})

		it("resolveScoreMode should return off/original/reversed", () => {
			const config = {
				qualityGates: {
					aggression: { scoreMode: "original" },
				},
			} as any
			const mode = aggressionSplitRule.resolveScoreMode(config)
			expect(["off", "original", "reversed"]).toContain(mode)
		})

		it("resolveBlockMode should return off/blockOnAligned/blockOnAnti", () => {
			const config = {
				qualityGates: {
					aggression: { blockMode: "blockOnAligned" },
				},
			} as any
			const mode = aggressionSplitRule.resolveBlockMode(config)
			expect(["off", "blockOnAligned", "blockOnAnti"]).toContain(mode)
		})
	})

	describe("Mode resolution fallback behavior", () => {
		it("keltnerInner should fall back to legacy flag when nested is undefined", () => {
			const config = {
				qualityGates: {
					keltnerInner: undefined,
					keltnerInnerPenalty: true,
				},
			} as any
			const mode = keltnerInnerDualRule.resolveMode(config)
			expect(mode).toBe("score")
		})

		it("macd should fall back to legacy flag when nested is undefined", () => {
			const config = {
				qualityGates: {
					macd: undefined,
					macdAlignmentScore: true,
				},
			} as any
			const mode = macdDualRule.resolveMode(config)
			expect(mode).toBe("score")
		})

		it("volume should fall back to legacy flag when nested is undefined", () => {
			const config = {
				qualityGates: {
					volume: undefined,
					volumeScore: true,
				},
			} as any
			const mode = volumeDualRule.resolveMode(config)
			expect(mode).toBe("score")
		})

		it("aggression scoreMode should fall back to legacy aggressionMode when nested is undefined", () => {
			const config = {
				qualityGates: {
					aggression: undefined,
					aggressionMode: "original",
				},
			} as any
			const mode = aggressionSplitRule.resolveScoreMode(config)
			expect(mode).toBe("original")
		})
	})

	describe("Mode resolution priority (nested over legacy)", () => {
		it("keltnerInner.mode should take priority over legacy flag", () => {
			const config = {
				qualityGates: {
					keltnerInner: { mode: "block" },
					keltnerInnerPenalty: true,
				},
			} as any
			const mode = keltnerInnerDualRule.resolveMode(config)
			expect(mode).toBe("block")
		})

		it("macd.mode should take priority over legacy flag", () => {
			const config = {
				qualityGates: {
					macd: { mode: "score" },
					macdAlignmentScore: false,
				},
			} as any
			const mode = macdDualRule.resolveMode(config)
			expect(mode).toBe("score")
		})

		it("volume.mode should take priority over legacy flag", () => {
			const config = {
				qualityGates: {
					volume: { mode: "both" },
					volumeScore: false,
				},
			} as any
			const mode = volumeDualRule.resolveMode(config)
			expect(mode).toBe("both")
		})

		it("aggression.scoreMode should return the exact mode value (reversed)", () => {
			const config = {
				qualityGates: {
					aggression: { scoreMode: "reversed" },
					aggressionMode: "off",
				},
			} as any
			const mode = aggressionSplitRule.resolveScoreMode(config)
			expect(mode).toBe("reversed")
		})
	})

	// ────────────────────────────────────────────────────────────────────────────
	// Dual-mode behavior tests with crafted candle fixtures
	// ────────────────────────────────────────────────────────────────────────────

	describe("Dual-mode behavior", () => {
		// Helper to build minimal candles with required indicators
		const makeCandle = (
			opts: Partial<CandleRow> & {
				indicators?: Record<string, number | null>
			}
		): CandleRow => ({
			timestamp: "2026-05-30T10:00:00Z",
			open: 100000,
			high: 100100,
			low: 99900,
			close: 100050,
			candleIndex: 1,
			indicators: {
				macd: 0,
				volume_fin: 1000,
				agr_saldo: 0,
				kc1_sup: 100100,
				kc1_inf: 99900,
				kc2_sup: 100200,
				kc2_inf: 99800,
				...opts.indicators,
			},
			...opts,
		})

		// Tests use bare "macd" key (not parquet's "macd1_histo") since fixture
		// objects emit `macd: 0`. The override keeps the snapshot reader pointed
		// at that literal so fixtures stay self-consistent.
		const baseConfig: HawksTripleScreenConfig = makeHawksConfig({
			startTime: 930,
			macd_key: "macd",
		})

		// Keltner inner: 4 modes × 2 trigger states = 8 cases
		describe("keltnerInner dual-mode", () => {
			const modes = ["off", "score", "block", "both"] as const

			for (const mode of modes) {
				it(`mode="${mode}" with trigger FIRED (price within 125 band)`, () => {
					const candle = makeCandle({
						indicators: {
							kc1_sup: 100100, // d = 100100 - 100050 = 50, fires
							kc1_inf: 99950,
						},
					})
					const config = {
						...baseConfig,
						qualityGates: { keltnerInner: { mode } },
					}

					const ctx = updateQualityContext(
						candle,
						createQualityContext(),
						config
					)
					const result = evaluateQuality(candle, "long", 100, config, ctx)

					if (mode === "off") {
						expect(result.blocked).toBe(false)
						expect(result.quality.contributions).toHaveLength(0)
					} else if (mode === "score") {
						expect(result.blocked).toBe(false)
						const contrib = result.quality.contributions.find(
							(c) => c.key === "keltner_inner"
						)
						expect(contrib).toBeDefined()
						expect(contrib?.signal).toBe("penalty")
						expect(contrib?.contribution).toBe(-1.0)
					} else if (mode === "block") {
						expect(result.blocked).toBe(true)
					} else if (mode === "both") {
						expect(result.blocked).toBe(true)
					}
				})

				it(`mode="${mode}" with trigger MISSED (price outside 125 band)`, () => {
					const candle = makeCandle({
						indicators: {
							kc1_sup: 99900, // d = 99900 - 100050 = -150 (negative, no trigger)
							kc1_inf: 99700,
						},
					})
					const config = {
						...baseConfig,
						qualityGates: { keltnerInner: { mode } },
					}

					const ctx = updateQualityContext(
						candle,
						createQualityContext(),
						config
					)
					const result = evaluateQuality(candle, "long", 100, config, ctx)

					expect(result.blocked).toBe(false)

					const contrib = result.quality.contributions.find(
						(c) => c.key === "keltner_inner"
					)

					if (mode === "off") {
						expect(contrib).toBeUndefined()
					} else if (mode === "score" || mode === "both") {
						expect(contrib).toBeDefined()
						expect(contrib?.signal).toBe("neutral")
						expect(contrib?.contribution).toBe(0)
					}
				})
			}
		})

		// MACD: 4 modes × 4 trigger states = 16 cases
		describe("macd dual-mode", () => {
			const modes = ["off", "score", "block", "both"] as const

			const macdCases = [
				{
					name: "sign opposed",
					macdValue: -100,
					recentHistory: [-100, -80],
					expectedScore: "penalty",
					shouldBlockOnBlock: true,
				},
				{
					name: "sign aligned + slope mixed",
					macdValue: 100,
					recentHistory: [100, 50],
					expectedScore: "penalty",
					shouldBlockOnBlock: true,
				},
				{
					name: "sign aligned + slope aligned (pure favor)",
					macdValue: 100,
					recentHistory: [50, 100],
					expectedScore: "favor",
					shouldBlockOnBlock: false,
				},
				{
					name: "no MACD data",
					macdValue: null,
					recentHistory: null,
					expectedScore: "neutral",
					shouldBlockOnBlock: false,
				},
			]

			for (const mode of modes) {
				for (const testCase of macdCases) {
					it(`mode="${mode}" with state="${testCase.name}"`, () => {
						const indicators: Record<string, number> = {}
						if (testCase.macdValue !== null) {
							indicators.macd = testCase.macdValue
						}

						const candle = makeCandle({ indicators })
						const config = {
							...baseConfig,
							qualityGates: { macd: { mode } },
						}

						let ctx = createQualityContext()

						if (testCase.recentHistory) {
							ctx.recentMacd = testCase.recentHistory
						}
						ctx = updateQualityContext(candle, ctx, config)

						const result = evaluateQuality(candle, "long", 100, config, ctx)

						if (mode === "off") {
							expect(result.blocked).toBe(false)
							const contrib = result.quality.contributions.find(
								(c) => c.key === "macd"
							)
							expect(contrib).toBeUndefined()
						} else if (mode === "score") {
							expect(result.blocked).toBe(false)
							const contrib = result.quality.contributions.find(
								(c) => c.key === "macd"
							)
							if (testCase.expectedScore === "neutral") {
								expect(contrib?.signal).toBe("neutral")
								expect(contrib?.contribution).toBe(0)
							} else {
								expect(contrib?.signal).toBe(testCase.expectedScore)
								expect(Math.abs(contrib?.contribution || 0)).toBe(1.0)
							}
						} else if (mode === "block") {
							if (testCase.shouldBlockOnBlock) {
								expect(result.blocked).toBe(true)
							} else {
								expect(result.blocked).toBe(false)
							}
						} else if (mode === "both") {
							if (testCase.shouldBlockOnBlock) {
								expect(result.blocked).toBe(true)
							} else {
								expect(result.blocked).toBe(false)
								const contrib = result.quality.contributions.find(
									(c) => c.key === "macd"
								)
								if (testCase.expectedScore === "neutral") {
									expect(contrib?.contribution).toBe(0)
								} else if (testCase.expectedScore === "favor") {
									expect(contrib?.contribution).toBe(1.0)
								}
							}
						}
					})
				}
			}
		})

		// Volume: 4 modes × 3 trigger states = 12 cases
		describe("volume dual-mode", () => {
			const modes = ["off", "score", "block", "both"] as const

			const volumeCases = [
				{
					name: "volume > ema",
					volumeValue: 2000,
					emaValue: 1000,
					expectedScore: "favor",
					shouldBlockOnBlock: false,
				},
				{
					name: "volume < ema",
					volumeValue: 500,
					emaValue: 1000,
					expectedScore: "penalty",
					shouldBlockOnBlock: true,
				},
				{
					name: "no ema yet (null)",
					volumeValue: 2000,
					emaValue: null,
					expectedScore: "neutral",
					shouldBlockOnBlock: false,
				},
			]

			for (const mode of modes) {
				for (const testCase of volumeCases) {
					it(`mode="${mode}" with state="${testCase.name}"`, () => {
						const candle = makeCandle({
							indicators: { volume_fin: testCase.volumeValue },
						})
						const config = {
							...baseConfig,
							qualityGates: { volume: { mode } },
						}

						let ctx = createQualityContext()
						if (testCase.emaValue !== null) {
							ctx.volumeEma = testCase.emaValue
							ctx = updateQualityContext(candle, ctx, config)
						}

						const result = evaluateQuality(candle, "long", 100, config, ctx)

						if (mode === "off") {
							expect(result.blocked).toBe(false)
							const contrib = result.quality.contributions.find(
								(c) => c.key === "volume"
							)
							expect(contrib).toBeUndefined()
						} else if (mode === "score") {
							expect(result.blocked).toBe(false)
							const contrib = result.quality.contributions.find(
								(c) => c.key === "volume"
							)
							if (testCase.expectedScore === "neutral") {
								expect(contrib?.contribution).toBe(0)
							} else if (testCase.expectedScore === "favor") {
								expect(contrib?.contribution).toBe(1.0)
							} else if (testCase.expectedScore === "penalty") {
								expect(contrib?.contribution).toBe(-1.0)
							}
						} else if (mode === "block") {
							expect(result.blocked).toBe(testCase.shouldBlockOnBlock)
						} else if (mode === "both") {
							expect(result.blocked).toBe(testCase.shouldBlockOnBlock)
							if (!testCase.shouldBlockOnBlock) {
								const contrib = result.quality.contributions.find(
									(c) => c.key === "volume"
								)
								if (testCase.expectedScore === "favor") {
									expect(contrib?.contribution).toBe(1.0)
								} else if (testCase.expectedScore === "penalty") {
									expect(contrib?.contribution).toBe(-1.0)
								} else {
									expect(contrib?.contribution).toBe(0)
								}
							}
						}
					})
				}
			}
		})

		// Aggression: 3 scoreModes × 3 blockModes × 3 trigger states = 27 cases
		describe("aggression split-mode", () => {
			const scoreModes = ["off", "original", "reversed"] as const
			const blockModes = ["off", "blockOnAligned", "blockOnAnti"] as const

			const aggressionCases = [
				{
					name: "aligned past threshold",
					aggressionValue: 20000,
					direction: "long" as const,
					expectedScoreSignal: (scoreMode: string) => {
						if (scoreMode === "off") {
							return "neutral"
						}
						if (scoreMode === "original") {
							return "favor"
						}
						if (scoreMode === "reversed") {
							return "penalty"
						}
						return "neutral"
					},
					shouldBlockOn: (blockMode: string) => blockMode === "blockOnAligned",
				},
				{
					name: "anti-aligned past threshold",
					aggressionValue: -20000,
					direction: "long" as const,
					expectedScoreSignal: (scoreMode: string) => {
						if (scoreMode === "off") {
							return "neutral"
						}
						if (scoreMode === "original") {
							return "penalty"
						}
						if (scoreMode === "reversed") {
							return "favor"
						}
						return "neutral"
					},
					shouldBlockOn: (blockMode: string) => blockMode === "blockOnAnti",
				},
				{
					name: "within threshold",
					aggressionValue: 5000,
					direction: "long" as const,
					expectedScoreSignal: () => "neutral",
					shouldBlockOn: () => false,
				},
			]

			const testMatrix = scoreModes.flatMap((scoreMode) =>
				blockModes.flatMap((blockMode) =>
					aggressionCases.map((testCase) => ({
						scoreMode,
						blockMode,
						...testCase,
					}))
				)
			)

			for (const {
				scoreMode,
				blockMode,
				name,
				aggressionValue,
				direction,
				expectedScoreSignal,
				shouldBlockOn,
			} of testMatrix) {
				it(`scoreMode="${scoreMode}" blockMode="${blockMode}" state="${name}"`, () => {
					const candle = makeCandle({
						indicators: { agr_saldo: aggressionValue },
					})
					const config = {
						...baseConfig,
						qualityGates: {
							aggression: { scoreMode, blockMode, threshold: 15000 },
						},
					}

					const ctx = updateQualityContext(
						candle,
						createQualityContext(),
						config
					)

					const result = evaluateQuality(candle, direction, 100, config, ctx)

					const expectedBlocked = shouldBlockOn(blockMode)
					expect(result.blocked).toBe(expectedBlocked)

					if (!expectedBlocked && scoreMode !== "off") {
						const contrib = result.quality.contributions.find(
							(c) => c.key === "aggression"
						)
						const expectedSignal = expectedScoreSignal(scoreMode)
						expect(contrib?.signal).toBe(expectedSignal)
						if (expectedSignal === "favor") {
							expect(contrib?.contribution).toBe(1.0)
						} else if (expectedSignal === "penalty") {
							expect(contrib?.contribution).toBe(-1.0)
						} else {
							expect(contrib?.contribution).toBe(0)
						}
					}
				})
			}
		})
	})
})
