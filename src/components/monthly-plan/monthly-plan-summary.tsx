"use client"

import {
	DollarSign,
	TrendingDown,
	TrendingUp,
	BarChart3,
	Target,
	CalendarDays,
	ShieldCheck,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormatting } from "@/hooks/use-formatting"
import { fromCents } from "@/lib/money"
import type { MonthlyPlan } from "@/db/schema"

interface SummaryCardProps {
	icon: React.ElementType
	label: string
	value: string
	subValue?: string
	iconClass?: string
}

const SummaryCard = ({
	icon: Icon,
	label,
	value,
	subValue,
	iconClass = "text-acc-100",
}: SummaryCardProps) => (
	<div className="rounded-lg border border-bg-300 bg-bg-100 p-m-400">
		<div className="mb-s-200 flex items-center gap-s-200">
			<Icon className={`h-4 w-4 ${iconClass}`} />
			<span className="text-tiny text-txt-300">{label}</span>
		</div>
		<p className="text-body font-semibold text-txt-100">{value}</p>
		{subValue && (
			<p className="mt-s-100 text-tiny text-txt-300">{subValue}</p>
		)}
	</div>
)

interface MonthlyPlanSummaryProps {
	plan: MonthlyPlan
	profileName?: string | null
}

export const MonthlyPlanSummary = ({ plan, profileName }: MonthlyPlanSummaryProps) => {
	const t = useTranslations("commandCenter.plan.summary")
	const { formatCurrency } = useFormatting()

	const riskPerTrade = fromCents(plan.riskPerTradeCents)
	const dailyLoss = fromCents(plan.dailyLossCents)
	const monthlyLoss = fromCents(plan.monthlyLossCents)
	const profitTarget = plan.dailyProfitTargetCents
		? fromCents(plan.dailyProfitTargetCents)
		: null
	const balance = fromCents(plan.accountBalance)

	const maxTrades = plan.maxDailyTrades ?? plan.derivedMaxDailyTrades
	const maxLosingDays = Number(plan.riskPerTradeCents) > 0 && Number(plan.dailyLossCents) > 0
		? Math.floor(Number(plan.monthlyLossCents) / Number(plan.dailyLossCents))
		: null

	return (
		<div className="space-y-m-400">
			{profileName && (
				<div className="gap-s-200 border-acc-100/20 bg-acc-100/5 px-s-300 py-s-300 flex items-center rounded-lg border">
					<ShieldCheck className="text-acc-100 h-4 w-4" />
					<span className="text-small text-txt-100 font-medium">
						{t("usingProfile", { name: profileName })}
					</span>
				</div>
			)}
			<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
				<SummaryCard
					icon={DollarSign}
					label={t("accountBalance")}
					value={formatCurrency(balance)}
				/>
				<SummaryCard
					icon={Target}
					label={t("riskPerTrade")}
					value={formatCurrency(riskPerTrade)}
					subValue={`${plan.riskPerTradePercent}%`}
				/>
				<SummaryCard
					icon={TrendingDown}
					label={t("dailyLossLimit")}
					value={formatCurrency(dailyLoss)}
					subValue={`${plan.dailyLossPercent}%`}
					iconClass="text-trade-sell"
				/>
				<SummaryCard
					icon={TrendingDown}
					label={t("monthlyLossLimit")}
					value={formatCurrency(monthlyLoss)}
					subValue={`${plan.monthlyLossPercent}%`}
					iconClass="text-trade-sell"
				/>
				{profitTarget !== null && (
					<SummaryCard
						icon={TrendingUp}
						label={t("dailyProfitTarget")}
						value={formatCurrency(profitTarget)}
						subValue={`${plan.dailyProfitTargetPercent}%`}
						iconClass="text-trade-buy"
					/>
				)}
				{maxTrades !== null && (
					<SummaryCard
						icon={BarChart3}
						label={t("maxTradesPerDay")}
						value={String(maxTrades)}
						subValue={plan.maxDailyTrades ? undefined : `(${t("derived")})`}
					/>
				)}
				{maxLosingDays !== null && (
					<SummaryCard
						icon={CalendarDays}
						label={t("maxLosingDays")}
						value={String(maxLosingDays)}
					/>
				)}
			</div>
		</div>
	)
}
