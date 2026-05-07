// Legal IR rates for Brazilian day-trade. Source of truth for both the
// projection layer (cockpit) and account fee defaults. When reform actually
// ships (PL 1.087/2025 broader renda-variável track is still pending), flip
// the year boundary here — every call site updates without further changes.

interface LegalRateEntry {
	readonly fromYear: number
	readonly irRate: number    // 0–1 fraction applied to taxable gain
	readonly irrfRate: number  // 0–1 fraction withheld at source per gain trade-day
	readonly source: string
}

// Ordered descending: lookup picks first entry whose fromYear ≤ year.
const DAY_TRADE_RATES: readonly LegalRateEntry[] = [
	{
		fromYear: 2005,
		irRate: 0.20,
		irrfRate: 0.01,
		source: "Lei 11.033/2004 art. 2° §1° I",
	},
]

const lookup = (year: number): LegalRateEntry => {
	for (const entry of DAY_TRADE_RATES) {
		if (year >= entry.fromYear) return entry
	}
	return DAY_TRADE_RATES[DAY_TRADE_RATES.length - 1]
}

const getDayTradeIrRate = (year: number): number => lookup(year).irRate

const getDayTradeIrrfRate = (year: number): number => lookup(year).irrfRate

const getDayTradeRateSource = (year: number): string => lookup(year).source

export type { LegalRateEntry }
export { getDayTradeIrRate, getDayTradeIrrfRate, getDayTradeRateSource }
