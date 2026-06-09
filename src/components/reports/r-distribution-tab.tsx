"use client"

import { useTranslations } from "next-intl"

type RBin = "lt_neg1" | "neg1_to_0" | "0_to_1" | "1_to_2" | "ge_2"

const BIN_COLORS: Record<RBin, string> = {
	lt_neg1: "bg-trade-sell",
	neg1_to_0: "bg-trade-sell/60",
	"0_to_1": "bg-txt-300",
	"1_to_2": "bg-trade-buy/60",
	ge_2: "bg-trade-buy",
}

interface Props {
	rows: { bucket: string; count: number }[]
}

const RDistributionTab = ({ rows }: Props) => {
	const t = useTranslations("reports.rDistributionBins")
	const max = Math.max(...rows.map((r) => r.count), 1)

	return (
		<div className="space-y-s-300">
			{rows.map((r) => {
				const bin = r.bucket as RBin
				const barColor = BIN_COLORS[bin] ?? "bg-acc-100"
				return (
					<div key={r.bucket} className="gap-s-300 flex items-center">
						<span className="text-txt-200 text-small w-24">{t(bin)}</span>
						<div className="bg-bg-300 h-3 flex-1 rounded-sm">
							<div
								className={`${barColor} h-full rounded-sm`}
								style={{ width: `${(r.count / max) * 100}%` }}
							/>
						</div>
						<span className="text-txt-100 text-small w-12 text-right font-mono">
							{r.count}
						</span>
					</div>
				)
			})}
		</div>
	)
}

export { RDistributionTab }
