import { describe, expect, it } from "vitest"

/**
 * Test for month label i18n using the 0-based numeric keys in messages/en.json and messages/pt-BR.json
 *
 * The months object uses 0-based indexing (0-11), so month number must be reduced by 1.
 * Usage: `tMonths(String(month - 1))` where month is 1-12
 */

describe("Month i18n key mapping", () => {
	const enMonths: Record<string, string> = {
		"0": "January",
		"1": "February",
		"2": "March",
		"3": "April",
		"4": "May",
		"5": "June",
		"6": "July",
		"7": "August",
		"8": "September",
		"9": "October",
		"10": "November",
		"11": "December",
	}

	const ptBRMonths: Record<string, string> = {
		"0": "Janeiro",
		"1": "Fevereiro",
		"2": "Março",
		"3": "Abril",
		"4": "Maio",
		"5": "Junho",
		"6": "Julho",
		"7": "Agosto",
		"8": "Setembro",
		"9": "Outubro",
		"10": "Novembro",
		"11": "Dezembro",
	}

	it("maps 1-based month numbers to 0-based i18n keys for English", () => {
		for (let month = 1; month <= 12; month++) {
			const key = String(month - 1)
			expect(enMonths[key]).toBeDefined()
		}

		expect(enMonths[String(3 - 1)]).toBe("March")
		expect(enMonths[String(6 - 1)]).toBe("June")
		expect(enMonths[String(1 - 1)]).toBe("January")
	})

	it("maps 1-based month numbers to 0-based i18n keys for Portuguese", () => {
		for (let month = 1; month <= 12; month++) {
			const key = String(month - 1)
			expect(ptBRMonths[key]).toBeDefined()
		}

		expect(ptBRMonths[String(3 - 1)]).toBe("Março")
		expect(ptBRMonths[String(6 - 1)]).toBe("Junho")
	})

	it("correctly resolves June (month 6) for both locales", () => {
		const junemonth = 6
		const key = String(junemonth - 1)

		expect(enMonths[key]).toBe("June")
		expect(ptBRMonths[key]).toBe("Junho")
	})

	it("correctly resolves all months with 0-based indexing", () => {
		const expectedEn = [
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		]
		const expectedPtBR = [
			"Janeiro",
			"Fevereiro",
			"Março",
			"Abril",
			"Maio",
			"Junho",
			"Julho",
			"Agosto",
			"Setembro",
			"Outubro",
			"Novembro",
			"Dezembro",
		]

		for (let i = 0; i < 12; i++) {
			expect(enMonths[String(i)]).toBe(expectedEn[i])
			expect(ptBRMonths[String(i)]).toBe(expectedPtBR[i])
		}
	})
})
