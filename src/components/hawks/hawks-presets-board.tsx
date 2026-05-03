import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
	hawksBacktestRecipe,
	hawksEquityShieldDefaults,
	hawksMonteCarloDefaults,
} from "@/lib/hawks/presets"

interface KeyValueRow {
	label: string
	value: string
}

interface PresetCardProps {
	id: string
	title: string
	description: string
	rows: KeyValueRow[]
	href?: string
	cta?: string
}

const PresetCard = ({ id, title, description, rows, href, cta }: PresetCardProps) => (
	<Card id={id}>
		<CardHeader>
			<CardTitle>{title}</CardTitle>
			<CardDescription>{description}</CardDescription>
		</CardHeader>
		<CardContent className="space-y-m-300">
			<dl className="grid gap-s-200 sm:grid-cols-2">
				{rows.map((row) => (
					<div
						key={row.label}
						className="flex items-baseline justify-between gap-s-200 rounded-md border border-bg-300 bg-bg-200/40 px-s-300 py-s-200"
					>
						<dt className="text-text-300 text-fs-100 uppercase tracking-wide">
							{row.label}
						</dt>
						<dd className="font-mono text-fs-200">{row.value}</dd>
					</div>
				))}
			</dl>
			{href && cta && (
				<div className="flex justify-end">
					<Button id={`${id}-cta`} variant="outline" asChild>
						<Link href={href}>{cta}</Link>
					</Button>
				</div>
			)}
		</CardContent>
	</Card>
)

const HawksPresetsBoard = () => {
	const t = useTranslations("hawksPresets")

	const backtestRows: KeyValueRow[] = [
		{ label: t("backtest.entry"), value: hawksBacktestRecipe.entry.type },
		{ label: t("backtest.macd"), value: "21/89/42" },
		{ label: t("backtest.emas"), value: "27 / 55" },
		{ label: t("backtest.targets"), value: "76 / 100 / 162 pts" },
		{ label: t("backtest.stop"), value: t("backtest.method3") },
		{ label: t("backtest.session"), value: "09:05 → 17:00" },
	]

	const mcRows: KeyValueRow[] = [
		{ label: t("mc.maxTrades"), value: String(hawksMonteCarloDefaults.maxTradesPerDay) },
		{ label: t("mc.dailyStop"), value: `${hawksMonteCarloDefaults.dailyLossLimitPct}%` },
		{ label: t("mc.weeklyStop"), value: `${hawksMonteCarloDefaults.weeklyLossLimitPct}%` },
		{ label: t("mc.monthlyStop"), value: `${hawksMonteCarloDefaults.monthlyLossLimitPct}%` },
		{ label: t("mc.stopOnLosses"), value: String(hawksMonteCarloDefaults.stopAfterConsecutiveLosses) },
		{ label: t("mc.pfTarget"), value: `${hawksMonteCarloDefaults.profitFactorTarget.toFixed(2)}×` },
		{ label: t("mc.wrTarget"), value: `${(hawksMonteCarloDefaults.winRateTarget * 100).toFixed(1)}%` },
		{ label: t("mc.expectancy"), value: `${hawksMonteCarloDefaults.expectancyR.toFixed(2)}R` },
	]

	const shieldRows: KeyValueRow[] = [
		{ label: t("shield.mddMultiplier"), value: hawksEquityShieldDefaults.mddMultiplier.toFixed(2) },
		{ label: t("shield.recoveryPct"), value: `${(hawksEquityShieldDefaults.recoveryPercent * 100).toFixed(0)}%` },
		{ label: t("shield.smaPeriod"), value: String(hawksEquityShieldDefaults.smaPeriod) },
		{
			label: t("shield.cascade5"),
			value: t("shield.cascade5Value", { stops: hawksEquityShieldDefaults.stopDayCascade.stop5 }),
		},
		{
			label: t("shield.cascade10"),
			value: t("shield.cascade10Value", { stops: hawksEquityShieldDefaults.stopDayCascade.stop10 }),
		},
	]

	return (
		<div className="space-y-m-500">
			<PresetCard
				id="hawks-backtest-preset"
				title={t("backtest.title")}
				description={t("backtest.description")}
				rows={backtestRows}
				href="/backtest"
				cta={t("backtest.cta")}
			/>
			<PresetCard
				id="hawks-mc-preset"
				title={t("mc.title")}
				description={t("mc.description")}
				rows={mcRows}
				href="/monte-carlo"
				cta={t("mc.cta")}
			/>
			<PresetCard
				id="hawks-shield-preset"
				title={t("shield.title")}
				description={t("shield.description") + " " + hawksEquityShieldDefaults.notes}
				rows={shieldRows}
				href="/equity-shield"
				cta={t("shield.cta")}
			/>
		</div>
	)
}

export { HawksPresetsBoard }
