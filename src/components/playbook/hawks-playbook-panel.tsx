import { useTranslations } from "next-intl"
import { ShieldCheck, Compass, Layers, Gauge } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StrategyHawksRollup } from "@/app/actions/strategy-conditions.types"

interface HawksPlaybookPanelProps {
	rollup: StrategyHawksRollup
}

const getRateTone = (rate: number, hasData: boolean): string => {
	if (!hasData) {
		return "text-txt-300"
	}
	if (rate >= 0.75) {
		return "text-trade-buy"
	}
	if (rate >= 0.4) {
		return "text-warning"
	}
	return "text-trade-sell"
}

const getBarTone = (rate: number, hasData: boolean): string => {
	if (!hasData) {
		return "bg-bg-300"
	}
	if (rate >= 0.75) {
		return "bg-trade-buy"
	}
	if (rate >= 0.4) {
		return "bg-warning"
	}
	return "bg-trade-sell"
}

interface KpiCardProps {
	label: string
	met: number
	total: number
	Icon: typeof ShieldCheck
	hintWhenEmpty?: string
}

const KpiCard = ({ label, met, total, Icon, hintWhenEmpty }: KpiCardProps) => {
	const hasData = total > 0
	const rate = hasData ? met / total : 0
	const pct = Math.round(rate * 100)

	return (
		<div className="border-bg-300 bg-bg-100 p-s-300 gap-s-200 flex flex-col rounded-lg border">
			<div className="gap-s-200 flex items-center justify-between">
				<div className="gap-s-200 flex min-w-0 items-center">
					<Icon className="text-txt-200 h-4 w-4 shrink-0" aria-hidden="true" />
					<span className="text-small text-txt-100 truncate font-medium">
						{label}
					</span>
				</div>
				<span
					className={cn(
						"text-small font-semibold tabular-nums",
						getRateTone(rate, hasData)
					)}
				>
					{hasData ? `${pct}%` : "—"}
				</span>
			</div>
			<div
				className="bg-bg-300 h-1 w-full overflow-hidden rounded-full"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={hasData ? pct : 0}
			>
				<div
					className={cn("h-full transition-all", getBarTone(rate, hasData))}
					style={{ width: hasData ? `${pct}%` : "0%" }}
				/>
			</div>
			<p className="text-tiny text-txt-300 tabular-nums">
				{hasData ? `${met} / ${total}` : (hintWhenEmpty ?? "—")}
			</p>
		</div>
	)
}

export const HawksPlaybookPanel = ({ rollup }: HawksPlaybookPanelProps) => {
	const t = useTranslations("playbook.hawksPanel")

	if (rollup.totalHawksTrades === 0) {
		return (
			<div className="border-bg-300 bg-bg-100 p-m-400 rounded-lg border text-center">
				<p className="text-small text-txt-200">{t("emptyState")}</p>
				<p className="text-tiny text-txt-300 mt-s-100">{t("emptyStateHint")}</p>
			</div>
		)
	}

	const capTotal = rollup.withinDailyCapCount + rollup.overDailyCapCount
	const overCapRate = capTotal > 0 ? rollup.overDailyCapCount / capTotal : 0
	const capHasOverages = rollup.overDailyCapCount > 0

	return (
		<div className="space-y-m-400">
			<p className="text-tiny text-txt-300">
				{t("basedOnTrades", { count: rollup.totalHawksTrades })}
			</p>

			<div className="gap-s-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard
					label={t("kpi.vwap")}
					met={rollup.vwapRespectedCount}
					total={rollup.totalHawksTrades}
					Icon={Compass}
				/>
				<KpiCard
					label={t("kpi.ajuste")}
					met={rollup.ajusteRespectedCount}
					total={rollup.totalHawksTrades}
					Icon={Gauge}
				/>
				<KpiCard
					label={t("kpi.tripleScreen")}
					met={rollup.tripleScreenConfirmedCount}
					total={rollup.totalHawksTrades}
					Icon={Layers}
				/>
				<KpiCard
					label={t("kpi.biasRespected")}
					met={rollup.biasRespectedCount}
					total={rollup.biasRespectedDenom}
					Icon={ShieldCheck}
					hintWhenEmpty={t("biasNoData")}
				/>
			</div>

			<div className="border-bg-300 bg-bg-100 p-s-300 gap-s-200 flex flex-col rounded-lg border">
				<div className="gap-s-200 flex items-center justify-between">
					<span className="text-small text-txt-100 font-medium">
						{t("dailyCap.title")}
					</span>
					<span
						className={cn(
							"text-tiny tabular-nums",
							capHasOverages ? "text-trade-sell" : "text-trade-buy"
						)}
					>
						{capHasOverages
							? t("dailyCap.overShare", {
									pct: Math.round(overCapRate * 100),
								})
							: t("dailyCap.allWithin")}
					</span>
				</div>
				<div className="gap-s-300 text-tiny text-txt-300 flex flex-wrap items-center">
					<span className="tabular-nums">
						{t("dailyCap.within", { count: rollup.withinDailyCapCount })}
					</span>
					<span aria-hidden="true">·</span>
					<span className="tabular-nums">
						{t("dailyCap.over", { count: rollup.overDailyCapCount })}
					</span>
				</div>
			</div>

			{rollup.scenarioDistribution.length > 0 && (
				<div className="border-bg-300 bg-bg-100 p-s-300 gap-s-200 flex flex-col rounded-lg border">
					<span className="text-small text-txt-100 font-medium">
						{t("scenarios.title")}
					</span>
					<div className="gap-s-200 flex flex-wrap">
						{rollup.scenarioDistribution.map((bucket) => {
							const isUntagged = bucket.scenarioId === null
							const label = isUntagged
								? t("scenarios.untagged")
								: (bucket.name ?? bucket.code ?? t("scenarios.untagged"))
							return (
								<span
									key={bucket.scenarioId ?? "untagged"}
									className={cn(
										"text-tiny px-s-200 py-s-100 gap-s-100 inline-flex items-center rounded-full border",
										isUntagged
											? "text-txt-300 border-bg-300 bg-bg-200"
											: "text-acc-100 border-acc-100/40 bg-acc-100/10"
									)}
								>
									<span className="truncate">{label}</span>
									<span className="tabular-nums opacity-70">
										{bucket.count}
									</span>
								</span>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}
