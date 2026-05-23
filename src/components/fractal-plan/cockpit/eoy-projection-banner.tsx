import { TrendingUp, Sparkles } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { cn } from "@/lib/utils"

interface EoyProjectionBannerProps {
	realEndBalanceCents: number
	projectedEoyBalanceCents: number
	initialCapitalCents: number
	totalRentPctEoy: number
	avgRPerDayYtd: number
	lastActualMonthIdx: number
}

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const MONTHS_PT = [
	"jan",
	"fev",
	"mar",
	"abr",
	"mai",
	"jun",
	"jul",
	"ago",
	"set",
	"out",
	"nov",
	"dez",
]

const EoyProjectionBanner = async ({
	realEndBalanceCents,
	projectedEoyBalanceCents,
	initialCapitalCents,
	totalRentPctEoy,
	avgRPerDayYtd,
	lastActualMonthIdx,
}: EoyProjectionBannerProps) => {
	const t = await getTranslations("plan.eoyProjection")
	const ytdRent =
		initialCapitalCents > 0
			? ((realEndBalanceCents - initialCapitalCents) / initialCapitalCents) *
				100
			: 0
	const totalRentFromCapital =
		initialCapitalCents > 0
			? ((projectedEoyBalanceCents - initialCapitalCents) /
					initialCapitalCents) *
				100
			: 0
	const lastMonthLabel =
		lastActualMonthIdx >= 0 ? (MONTHS_PT[lastActualMonthIdx] ?? "—") : "—"

	return (
		<section
			id="plan-year-eoy-banner"
			aria-label={t("ariaLabel")}
			className="mb-m-400 gap-m-400 border-bg-300 bg-bg-200 p-m-400 grid grid-cols-1 rounded-md border sm:grid-cols-4"
		>
			<div className="gap-s-300 flex items-start">
				<div className="bg-acc-100/15 p-s-200 rounded-md">
					<TrendingUp className="text-acc-100 h-4 w-4" aria-hidden="true" />
				</div>
				<div>
					<p className="text-tiny text-txt-300 tracking-wide uppercase">
						{t("ytdLabel", { month: lastMonthLabel })}
					</p>
					<p className="text-h3 text-txt-100 font-mono tabular-nums">
						{formatBRL(realEndBalanceCents)}
					</p>
					<p
						className={cn(
							"text-tiny font-mono tabular-nums",
							ytdRent > 0
								? "text-profit"
								: ytdRent < 0
									? "text-loss"
									: "text-txt-300"
						)}
					>
						{ytdRent >= 0 ? "+" : ""}
						{ytdRent.toFixed(1)}%
					</p>
				</div>
			</div>

			<div className="gap-s-300 flex items-start">
				<div className="bg-proj/15 p-s-200 rounded-md">
					<Sparkles className="text-proj h-4 w-4" aria-hidden="true" />
				</div>
				<div>
					<p className="text-tiny text-txt-300 tracking-wide uppercase">
						{t("eoyProjectionLabel")}
					</p>
					<p className="text-h3 text-proj font-mono italic tabular-nums">
						{formatBRL(projectedEoyBalanceCents)}
					</p>
					<p className="text-tiny text-proj/80 font-mono italic tabular-nums">
						{t("eoyRentNote", { pct: totalRentFromCapital.toFixed(1) })}
					</p>
				</div>
			</div>

			<div>
				<p className="text-tiny text-txt-300 tracking-wide uppercase">
					{t("remainingGain")}
				</p>
				<p className="text-h3 text-txt-200 font-mono tabular-nums">
					{formatBRL(projectedEoyBalanceCents - realEndBalanceCents)}
				</p>
				<p className="text-tiny text-txt-300 font-mono tabular-nums">
					{t("remainingRentNote", { pct: totalRentPctEoy.toFixed(1) })}
				</p>
			</div>

			<div>
				<p className="text-tiny text-txt-300 tracking-wide uppercase">
					{t("pace")}
				</p>
				<p className="text-h3 text-txt-200 font-mono tabular-nums">
					{avgRPerDayYtd.toFixed(2)}
				</p>
				<p className="text-tiny text-txt-300">{t("paceNote")}</p>
			</div>
		</section>
	)
}

export { EoyProjectionBanner }
export type { EoyProjectionBannerProps }
