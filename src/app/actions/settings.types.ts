export interface RiskSettings {
	accountBalance: number
}

export interface UserSettingsData {
	isPropAccount: boolean
	propFirmName: string | null
	profitSharePercentage: number
	taxExemptThreshold: number
	defaultCurrency: string
	showTaxEstimates: boolean
	showPropCalculations: boolean
	showAllAccounts: boolean
}
