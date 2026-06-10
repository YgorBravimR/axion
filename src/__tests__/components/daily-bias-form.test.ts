import { describe, it, expect } from "vitest"
import { getScreenLabel } from "@/lib/hawks/get-screen-label"

describe("getScreenLabel", () => {
	const mockTranslate = (key: string): string => {
		const translations: Record<string, string> = {
			screenRenko60: "Renko close above 60min",
			screenRenko60Hint:
				"Last 60-minute Renko brick closed above the trend baseline.",
			screenRenko60Short: "Renko close below 60min",
			screenRenko60HintShort:
				"Last 60-minute Renko brick closed below the trend baseline.",
			screenMacd: "MACD slope up",
			screenMacdHint:
				"MACD 27/117/55 histogram slope is positive on the higher timeframe.",
			screenMacdShort: "MACD slope down",
			screenMacdHintShort:
				"MACD 27/117/55 histogram slope is negative on the higher timeframe.",
			screenEmaStack: "EMA stack bullish",
			screenEmaStackHint: "EMA 27 above EMA 55 with intact slope.",
			screenEmaStackShort: "EMA stack bearish",
			screenEmaStackHintShort: "EMA 27 below EMA 55 or slope broken.",
			screenVwap: "Price above VWAP",
			screenVwapHint: "Session VWAP respected — price is trading above it.",
			screenVwapShort: "Price below VWAP",
			screenVwapHintShort:
				"Session VWAP respected — price is trading below it.",
			screenAjuste: "Ajuste respected",
			screenAjusteHint:
				"Daily settlement price (ajuste) holds as support/resistance.",
			screenAjusteShort: "Ajuste broken",
			screenAjusteHintShort:
				"Daily settlement price (ajuste) breaks as resistance/support.",
		}
		return translations[key] ?? key
	}

	describe("when bias is long", () => {
		it("should return bullish label for renko60", () => {
			const result = getScreenLabel("renko60", "long", mockTranslate)
			expect(result.label).toBe("Renko close above 60min")
			expect(result.hint).toBe(
				"Last 60-minute Renko brick closed above the trend baseline."
			)
		})

		it("should return bullish label for macd", () => {
			const result = getScreenLabel("macd", "long", mockTranslate)
			expect(result.label).toBe("MACD slope up")
			expect(result.hint).toBe(
				"MACD 27/117/55 histogram slope is positive on the higher timeframe."
			)
		})

		it("should return bullish label for emaStack", () => {
			const result = getScreenLabel("emaStack", "long", mockTranslate)
			expect(result.label).toBe("EMA stack bullish")
			expect(result.hint).toBe("EMA 27 above EMA 55 with intact slope.")
		})

		it("should return bullish label for vwap", () => {
			const result = getScreenLabel("vwap", "long", mockTranslate)
			expect(result.label).toBe("Price above VWAP")
			expect(result.hint).toBe(
				"Session VWAP respected — price is trading above it."
			)
		})

		it("should return bullish label for ajuste", () => {
			const result = getScreenLabel("ajuste", "long", mockTranslate)
			expect(result.label).toBe("Ajuste respected")
			expect(result.hint).toBe(
				"Daily settlement price (ajuste) holds as support/resistance."
			)
		})
	})

	describe("when bias is short", () => {
		it("should return bearish label for renko60", () => {
			const result = getScreenLabel("renko60", "short", mockTranslate)
			expect(result.label).toBe("Renko close below 60min")
			expect(result.hint).toBe(
				"Last 60-minute Renko brick closed below the trend baseline."
			)
		})

		it("should return bearish label for macd", () => {
			const result = getScreenLabel("macd", "short", mockTranslate)
			expect(result.label).toBe("MACD slope down")
			expect(result.hint).toBe(
				"MACD 27/117/55 histogram slope is negative on the higher timeframe."
			)
		})

		it("should return bearish label for emaStack", () => {
			const result = getScreenLabel("emaStack", "short", mockTranslate)
			expect(result.label).toBe("EMA stack bearish")
			expect(result.hint).toBe("EMA 27 below EMA 55 or slope broken.")
		})

		it("should return bearish label for vwap", () => {
			const result = getScreenLabel("vwap", "short", mockTranslate)
			expect(result.label).toBe("Price below VWAP")
			expect(result.hint).toBe(
				"Session VWAP respected — price is trading below it."
			)
		})

		it("should return bearish label for ajuste", () => {
			const result = getScreenLabel("ajuste", "short", mockTranslate)
			expect(result.label).toBe("Ajuste broken")
			expect(result.hint).toBe(
				"Daily settlement price (ajuste) breaks as resistance/support."
			)
		})
	})

	describe("when bias is neutral", () => {
		it("should return bullish label (default) for renko60", () => {
			const result = getScreenLabel("renko60", "neutral", mockTranslate)
			expect(result.label).toBe("Renko close above 60min")
		})

		it("should return bullish label (default) for all screens", () => {
			const screens: Array<
				"renko60" | "macd" | "emaStack" | "vwap" | "ajuste"
			> = ["renko60", "macd", "emaStack", "vwap", "ajuste"]
			for (const key of screens) {
				const result = getScreenLabel(key, "neutral", mockTranslate)
				expect(result.key).toBe(key)
				expect(result.label).not.toMatch(/down|below|bearish|broken/)
			}
		})
	})

	it("should return correct key for each screen type", () => {
		const screens: Array<"renko60" | "macd" | "emaStack" | "vwap" | "ajuste"> =
			["renko60", "macd", "emaStack", "vwap", "ajuste"]
		for (const key of screens) {
			const result = getScreenLabel(key, "long", mockTranslate)
			expect(result.key).toBe(key)
		}
	})
})
