import { useTranslations } from "next-intl"

interface TargetActualGaugeProps {
	targetR: string | null
	actualR: string | null
}

const num = (v: string | null): number | null => {
	if (v === null) {
		return null
	}
	const n = Number(v)
	return Number.isFinite(n) ? n : null
}

const formatR = (v: number | null): string =>
	v === null ? "—" : `${v.toFixed(2)}R`

const TargetActualGauge = ({ targetR, actualR }: TargetActualGaugeProps) => {
	const t = useTranslations("plan")
	const target = num(targetR)
	const actual = num(actualR)
	const pct =
		target !== null && actual !== null && target !== 0
			? Math.max(0, Math.min(150, (actual / target) * 100))
			: 0
	const onTrack = target !== null && actual !== null && actual >= target * 0.5
	const ahead = target !== null && actual !== null && actual >= target

	return (
		<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
			<div className="gap-m-400 grid grid-cols-2">
				<div>
					<dt className="text-tiny text-txt-300">{t("common.target")}</dt>
					<dd className="text-txt-100 mt-1 font-mono text-2xl">
						{formatR(target)}
					</dd>
				</div>
				<div>
					<dt className="text-tiny text-txt-300">{t("common.actual")}</dt>
					<dd
						className={`mt-1 font-mono text-2xl ${
							ahead
								? "text-fb-success"
								: onTrack
									? "text-warning"
									: actual !== null && actual < 0
										? "text-fb-error"
										: "text-txt-100"
						}`}
					>
						{formatR(actual)}
					</dd>
				</div>
			</div>
			<div className="mt-s-300 bg-bg-300 h-2 overflow-hidden rounded-full">
				<div
					className={`h-full ${ahead ? "bg-fb-success" : onTrack ? "bg-warning" : "bg-bg-300"}`}
					style={{ width: `${pct}%` }}
					aria-hidden="true"
				/>
			</div>
			<p className="mt-s-200 text-tiny text-txt-300">
				{target === null || actual === null
					? t("gauge.noData")
					: t("gauge.pctOfTarget", { pct: pct.toFixed(0) })}
			</p>
		</div>
	)
}

export type { TargetActualGaugeProps }
export { TargetActualGauge }
