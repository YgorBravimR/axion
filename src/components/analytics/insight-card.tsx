import { TrendingUp, TrendingDown } from "lucide-react"

type InsightType = "best" | "worst"

interface InsightCardProps {
	type: InsightType
	label: string
	title: string
	detail: string
	action: string
}

interface InsightCardPlaceholderProps {
	type: InsightType
	label: string
	placeholderText: string
}

const STYLES: Record<InsightType, { border: string; bg: string; iconBg: string; text: string; detailText: string }> = {
	best: {
		border: "border-trade-buy/20",
		bg: "bg-trade-buy/5",
		iconBg: "bg-trade-buy/15",
		text: "text-trade-buy",
		detailText: "text-trade-buy/80",
	},
	worst: {
		border: "border-trade-sell/20",
		bg: "bg-trade-sell/5",
		iconBg: "bg-trade-sell/15",
		text: "text-trade-sell",
		detailText: "text-trade-sell/80",
	},
}

const ICONS: Record<InsightType, typeof TrendingUp> = {
	best: TrendingUp,
	worst: TrendingDown,
}

export const InsightCard = ({ type, label, title, detail, action }: InsightCardProps) => {
	const styles = STYLES[type]
	const Icon = ICONS[type]

	return (
		<div className={`flex items-start gap-s-300 rounded-lg border ${styles.border} ${styles.bg} p-s-300 sm:p-m-400`}>
			<div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${styles.iconBg}`}>
				<Icon className={`h-4 w-4 ${styles.text}`} />
			</div>
			<div className="min-w-0">
				<p className="text-caption text-txt-300">{label}</p>
				<p className={`text-small font-semibold ${styles.text}`}>{title}</p>
				<p className={`text-caption ${styles.detailText}`}>{detail}</p>
				<p className="text-caption text-txt-300 mt-s-100">{action}</p>
			</div>
		</div>
	)
}

export const InsightCardPlaceholder = ({ type, label, placeholderText }: InsightCardPlaceholderProps) => {
	const Icon = ICONS[type]

	return (
		<div className="flex items-start gap-s-300 rounded-lg border border-dashed border-bg-300 bg-bg-300/10 p-s-300 sm:p-m-400">
			<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-300/20">
				<Icon className="h-4 w-4 text-txt-300" />
			</div>
			<div className="min-w-0">
				<p className="text-caption text-txt-300">{label}</p>
				<p className="text-small text-txt-300 font-medium">—</p>
				<p className="text-caption text-txt-300 mt-s-100">{placeholderText}</p>
			</div>
		</div>
	)
}
