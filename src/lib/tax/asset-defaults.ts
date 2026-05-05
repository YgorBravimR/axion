// B3 day-trade per-contract fee defaults (R$, expressed in cents-of-real).
// Sourced from public B3 tariff tables and broker breakdowns. Mini contracts
// (WDO/WIN) cost ~1/5 of full contracts (DOL/IND) because notional is 1/5x.
// Users can override per-asset via the fee-rate form once their broker's
// effective rates (post-ADV reduction, brokerage cashback, etc.) are known.
import type { FeeRatesEntry } from "./types"

const SHARED_RATES = {
	issRatePercent: "5.00",
	irrfRateBps: 100,
	irRateBps: 2000,
	subjectToPersonalIr: true,
} as const

const ASSET_FEE_DEFAULTS: Record<string, FeeRatesEntry> = {
	WDO: {
		assetSymbol: "WDO",
		txCorretagemCents: 5,
		txRegistroCents: 74,
		emolumentosCents: 40,
		...SHARED_RATES,
	},
	DOL: {
		assetSymbol: "DOL",
		txCorretagemCents: 5,
		txRegistroCents: 370,
		emolumentosCents: 200,
		...SHARED_RATES,
	},
	WIN: {
		assetSymbol: "WIN",
		txCorretagemCents: 5,
		txRegistroCents: 16,
		emolumentosCents: 9,
		...SHARED_RATES,
	},
	IND: {
		assetSymbol: "IND",
		txCorretagemCents: 5,
		txRegistroCents: 80,
		emolumentosCents: 45,
		...SHARED_RATES,
	},
}

export { ASSET_FEE_DEFAULTS }
