// pt-BR month labels indexed by 1–12 (index 0 reserved as empty sentinel
// so callers can use `MONTH_LABEL_PT[month]` without subtracting 1).

const MONTH_LABEL_PT: readonly string[] = [
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

const MONTH_ABBR_PT: readonly string[] = [
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

// Working-days approximation when no live projection is available. B3
// publishes ~252 trading days/year; rounded per-month default = 22.
const DEFAULT_TRADING_DAYS_PER_MONTH = 22

export { MONTH_LABEL_PT, MONTH_ABBR_PT, DEFAULT_TRADING_DAYS_PER_MONTH }
