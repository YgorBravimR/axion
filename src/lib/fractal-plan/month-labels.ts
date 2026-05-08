// pt-BR month labels indexed by 1–12 (index 0 reserved as empty sentinel
// so callers can use `monthLabelPt(month)` without subtracting 1).

const MONTH_LABEL_PT = [
	"",
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
] as const

const MONTH_ABBR_PT = [
	"",
	"Jan",
	"Fev",
	"Mar",
	"Abr",
	"Mai",
	"Jun",
	"Jul",
	"Ago",
	"Set",
	"Out",
	"Nov",
	"Dez",
] as const

const monthLabelPt = (month: number): string => MONTH_LABEL_PT[month] ?? ""
const monthAbbrPt = (month: number): string => MONTH_ABBR_PT[month] ?? ""

// Working-days approximation when no live projection is available. B3
// publishes ~252 trading days/year; rounded per-month default = 22.
const DEFAULT_TRADING_DAYS_PER_MONTH = 22

export {
	MONTH_LABEL_PT,
	MONTH_ABBR_PT,
	monthLabelPt,
	monthAbbrPt,
	DEFAULT_TRADING_DAYS_PER_MONTH,
}
