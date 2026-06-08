interface WeeklyMetaRow {
	isoWeek: number
	weekStart: string
	weekEnd: string
	metaBruto: number | null
	metaLiquido: number | null
	resultado: number
	autoRetirada: number
	disabled: boolean
}

interface WeeklyMetaVsRealData {
	year: number
	hasPlan: boolean
	withdrawalTargetPercent: number | null
	weeks: WeeklyMetaRow[]
}

interface AnnualRollupRow {
	month: number
	monthName: string
	disabled: boolean
	resultadoBruto: number | null
	resultadoLiquido: number | null
	pontos: number | null
	taxas: number | null
	imposto: number | null
	impostoEstimated: boolean
	aporteInicial: number | null
	mesAnterior: number | null
	diasGain: number
	diasLoss: number
	mensalEsperado: number | null
	mensalMaximo: number | null
	novoAporte: number
	retirada: number
	capitalInvestido: number | null
	/** Balance at end of period (stock, not a flow — do not sum across periods) */
	patrimonioFinal: number | null
	hasTrades: boolean
}

interface AnnualRollupTotals {
	resultadoBruto: number
	resultadoLiquido: number
	pontos: number
	taxas: number
	imposto: number
	diasGain: number
	diasLoss: number
	mensalEsperado: number
	mensalMaximo: number
	novoAporte: number
	retirada: number
	capitalInvestido: number
	/** Balance at end of period (stock, not a flow — do not sum across periods) */
	patrimonioFinal: number | null
}

interface AnnualRollupData {
	year: number
	rows: AnnualRollupRow[]
	totals: AnnualRollupTotals
	taxEstimated: boolean
	withdrawalTargetPercent: number | null
}

export type {
	WeeklyMetaRow,
	WeeklyMetaVsRealData,
	AnnualRollupRow,
	AnnualRollupTotals,
	AnnualRollupData,
}
