import type { AccountAsset, AccountTimeframe } from "@/db/schema"

interface AccountInput {
	name: string
	description?: string
	accountType: "personal" | "prop"
	propFirmName?: string
	profitSharePercentage?: number
	defaultCurrency?: string
	defaultBreakevenTicks?: number
	showTaxEstimates?: boolean
	showPropCalculations?: boolean
	defaultAssetId?: string | null
}

interface AccountAssetInput {
	assetId: string
	isEnabled: boolean
	breakevenTicksOverride?: number | null
	notes?: string
}

interface AccountAssetWithDetails extends AccountAsset {
	asset: {
		id: string
		symbol: string
		name: string
		tickSize: string
		tickValue: number
		currency: string
	}
}

interface AccountTimeframeWithDetails extends AccountTimeframe {
	timeframe: {
		id: string
		code: string
		name: string
		type: string
		value: number
		unit: string
	}
}

export type {
	AccountInput,
	AccountAssetInput,
	AccountAssetWithDetails,
	AccountTimeframeWithDetails,
}
