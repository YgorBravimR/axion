import type { ChartThemeColors } from "@/lib/chart/theme-colors"

/**
 * ProfitChart indicator colors — fixed across all themes (from the trading platform).
 * Positive offsets: warm tones (peach -> orange -> brown).
 * Negative offsets: cool tones (lilac -> purple -> indigo).
 * @see /Users/ygorbravim/personal/projects/nelogica/working/BRAVO_I_All_tat.pas
 */
const PROFITCHART_COLORS: Record<string, string> = {
	trava_1: "rgb(255, 218, 185)", trava_2: "rgb(255, 140, 0)", trava_3: "rgb(194, 117, 23)",
	trava_4: "rgb(139, 69, 19)", trava_5: "rgb(107, 52, 16)",
	trava_neg1: "rgb(170, 170, 230)", trava_neg2: "rgb(160, 32, 240)", trava_neg3: "rgb(120, 30, 176)",
	trava_neg4: "rgb(75, 0, 130)", trava_neg5: "rgb(53, 0, 96)",
	percent_1: "rgb(255, 218, 185)", percent_2: "rgb(255, 140, 0)", percent_3: "rgb(194, 117, 23)",
	percent_neg1: "rgb(170, 170, 230)", percent_neg2: "rgb(160, 32, 240)", percent_neg3: "rgb(120, 30, 176)",
	ajuste: "rgb(180, 255, 255)", prev_day_close: "rgb(120, 20, 60)",
	prev_day_high: "rgb(255, 20, 147)", prev_day_low: "rgb(255, 20, 147)",
	vwap_m: "rgb(13, 71, 161)",
}

/** Build the full indicator color map using live theme colors + fixed ProfitChart colors */
const buildIndicatorColorMap = (theme: ChartThemeColors): Record<string, string> => ({
	...PROFITCHART_COLORS,
	trava_0: theme.txt300,
	vwap_d: theme.actionBuy,
	vwap_s: theme.acc200,
	ema_200: theme.acc100,
	entrada: theme.actionBuy,
	stop: theme.actionSell,
	alvo_final: theme.acc100,
	breakeven_trailing: theme.txt300,
	breakeven_trigger: theme.txt200,
	trailing_trigger: theme.txtPlaceholder,
})

/** Reference groups — show horizontal dashed lines instead of moving curves */
const REFERENCE_GROUPS = new Set([
	"trava",
	"percent",
	"daily_reference",
	"strategy_level",
])

export { PROFITCHART_COLORS, buildIndicatorColorMap, REFERENCE_GROUPS }
