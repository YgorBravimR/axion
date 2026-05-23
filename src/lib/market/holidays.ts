/**
 * B3 and NYSE Holiday Data
 *
 * B3 publishes its annual trading calendar every December/January via a numbered
 * "OC" circular (e.g. OC 054-2025 covers 2026). Since 2022 B3 trades NORMALLY on
 * São Paulo state/municipal holidays (Revolução Constitucionalista 09/07,
 * Aniversário de São Paulo 25/01) — do not add them.
 *
 * NYSE holidays follow a fixed federal schedule. 2025-01-09 (National Day of
 * Mourning for President Carter) is a legitimate one-off closure — keep it.
 *
 * Data covers 2025–2026. Update annually when B3 publishes its new OC.
 * Half-day sessions (Ash Wednesday for B3, day-before-Independence-Day for NYSE)
 * are intentionally excluded — this module tracks full closures only.
 * @see https://www.b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/calendario-de-negociacao/
 * @see https://www.nyse.com/markets/hours-calendars
 */

interface Holiday {
	date: string // YYYY-MM-DD
	name: string
	nameEn: string
}

// B3 holidays — only weekday closings (weekends already excluded)
const B3_HOLIDAYS: Holiday[] = [
	// ── 2025 ──────────────────────────────────────────────────────────────────
	{
		date: "2025-01-01",
		name: "Confraternização Universal",
		nameEn: "New Year's Day",
	},
	{ date: "2025-03-03", name: "Carnaval", nameEn: "Carnival" },
	{ date: "2025-03-04", name: "Carnaval", nameEn: "Carnival" },
	{ date: "2025-04-18", name: "Paixão de Cristo", nameEn: "Good Friday" },
	{ date: "2025-04-21", name: "Tiradentes", nameEn: "Tiradentes Day" },
	{ date: "2025-05-01", name: "Dia do Trabalho", nameEn: "Labour Day" },
	{ date: "2025-06-19", name: "Corpus Christi", nameEn: "Corpus Christi" },
	{
		date: "2025-11-20",
		name: "Dia Nacional de Zumbi e Consciência Negra",
		nameEn: "Black Awareness Day",
	},
	{ date: "2025-12-24", name: "Véspera de Natal", nameEn: "Christmas Eve" },
	{ date: "2025-12-25", name: "Natal", nameEn: "Christmas Day" },
	{ date: "2025-12-31", name: "Véspera de Ano Novo", nameEn: "New Year's Eve" },
	// ── 2026 ──────────────────────────────────────────────────────────────────
	{
		date: "2026-01-01",
		name: "Confraternização Universal",
		nameEn: "New Year's Day",
	},
	{ date: "2026-02-16", name: "Carnaval", nameEn: "Carnival" },
	{ date: "2026-02-17", name: "Carnaval", nameEn: "Carnival" },
	{ date: "2026-04-03", name: "Paixão de Cristo", nameEn: "Good Friday" },
	{ date: "2026-04-21", name: "Tiradentes", nameEn: "Tiradentes Day" },
	{ date: "2026-05-01", name: "Dia do Trabalho", nameEn: "Labour Day" },
	{ date: "2026-06-04", name: "Corpus Christi", nameEn: "Corpus Christi" },
	{
		date: "2026-09-07",
		name: "Independência do Brasil",
		nameEn: "Independence Day",
	},
	{
		date: "2026-10-12",
		name: "Nossa Senhora Aparecida",
		nameEn: "Our Lady of Aparecida",
	},
	{ date: "2026-11-02", name: "Finados", nameEn: "All Souls' Day" },
	{
		date: "2026-11-20",
		name: "Dia Nacional de Zumbi e Consciência Negra",
		nameEn: "Black Awareness Day",
	},
	{ date: "2026-12-24", name: "Véspera de Natal", nameEn: "Christmas Eve" },
	{ date: "2026-12-25", name: "Natal", nameEn: "Christmas Day" },
	{ date: "2026-12-31", name: "Véspera de Ano Novo", nameEn: "New Year's Eve" },
]

// NYSE holidays — only weekday closings
const NYSE_HOLIDAYS: Holiday[] = [
	// ── 2025 ──────────────────────────────────────────────────────────────────
	{ date: "2025-01-01", name: "Ano Novo", nameEn: "New Year's Day" },
	{
		date: "2025-01-09",
		name: "Luto Nacional (Pres. Carter)",
		nameEn: "National Day of Mourning",
	},
	{
		date: "2025-01-20",
		name: "Martin Luther King Jr.",
		nameEn: "Martin Luther King Jr. Day",
	},
	{
		date: "2025-02-17",
		name: "Dia dos Presidentes",
		nameEn: "Presidents' Day",
	},
	{ date: "2025-04-18", name: "Sexta-feira Santa", nameEn: "Good Friday" },
	{ date: "2025-05-26", name: "Memorial Day", nameEn: "Memorial Day" },
	{ date: "2025-06-19", name: "Juneteenth", nameEn: "Juneteenth" },
	{ date: "2025-07-04", name: "Independência EUA", nameEn: "Independence Day" },
	{ date: "2025-09-01", name: "Dia do Trabalho EUA", nameEn: "Labor Day" },
	{ date: "2025-11-27", name: "Ação de Graças", nameEn: "Thanksgiving" },
	{ date: "2025-12-25", name: "Natal", nameEn: "Christmas Day" },
	// ── 2026 ──────────────────────────────────────────────────────────────────
	{ date: "2026-01-01", name: "Ano Novo", nameEn: "New Year's Day" },
	{
		date: "2026-01-19",
		name: "Martin Luther King Jr.",
		nameEn: "Martin Luther King Jr. Day",
	},
	{
		date: "2026-02-16",
		name: "Dia dos Presidentes",
		nameEn: "Presidents' Day",
	},
	{ date: "2026-04-03", name: "Sexta-feira Santa", nameEn: "Good Friday" },
	{ date: "2026-05-25", name: "Memorial Day", nameEn: "Memorial Day" },
	{ date: "2026-06-19", name: "Juneteenth", nameEn: "Juneteenth" },
	{
		date: "2026-07-03",
		name: "Independência EUA (obs.)",
		nameEn: "Independence Day (observed)",
	},
	{ date: "2026-09-07", name: "Dia do Trabalho EUA", nameEn: "Labor Day" },
	{ date: "2026-11-26", name: "Ação de Graças", nameEn: "Thanksgiving" },
	{ date: "2026-12-25", name: "Natal", nameEn: "Christmas Day" },
]

// Index by date for O(1) lookup
const b3HolidayMap = new Map(B3_HOLIDAYS.map((h) => [h.date, h]))
const nyseHolidayMap = new Map(NYSE_HOLIDAYS.map((h) => [h.date, h]))

export const isB3Holiday = (dateStr: string): boolean =>
	b3HolidayMap.has(dateStr)

export const isNyseHoliday = (dateStr: string): boolean =>
	nyseHolidayMap.has(dateStr)

export const getB3HolidayName = (
	dateStr: string,
	locale: string
): string | null => {
	const holiday = b3HolidayMap.get(dateStr)
	if (!holiday) {
		return null
	}
	return locale === "pt-BR" ? holiday.name : holiday.nameEn
}

export const getNyseHolidayName = (
	dateStr: string,
	locale: string
): string | null => {
	const holiday = nyseHolidayMap.get(dateStr)
	if (!holiday) {
		return null
	}
	return locale === "pt-BR" ? holiday.name : holiday.nameEn
}
