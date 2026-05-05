interface TargetActualGaugeProps {
	targetR: string | null
	actualR: string | null
}

const num = (v: string | null): number | null => {
	if (v == null) return null
	const n = Number(v)
	return Number.isFinite(n) ? n : null
}

const formatR = (v: number | null): string => (v == null ? "—" : `${v.toFixed(2)}R`)

const TargetActualGauge = ({ targetR, actualR }: TargetActualGaugeProps) => {
	const target = num(targetR)
	const actual = num(actualR)
	const pct = target != null && actual != null && target !== 0 ? Math.max(0, Math.min(150, (actual / target) * 100)) : 0
	const onTrack = target != null && actual != null && actual >= target * 0.5
	const ahead = target != null && actual != null && actual >= target

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-m-400">
			<div className="grid grid-cols-2 gap-m-400">
				<div>
					<dt className="text-tiny text-txt-300">Target</dt>
					<dd className="mt-1 font-mono text-2xl text-txt-100">{formatR(target)}</dd>
				</div>
				<div>
					<dt className="text-tiny text-txt-300">Actual</dt>
					<dd
						className={`mt-1 font-mono text-2xl ${
							ahead ? "text-fb-success" : onTrack ? "text-acc-100" : actual != null && actual < 0 ? "text-fb-error" : "text-txt-100"
						}`}
					>
						{formatR(actual)}
					</dd>
				</div>
			</div>
			<div className="mt-s-300 h-2 overflow-hidden rounded-full bg-bg-300">
				<div
					className={`h-full ${ahead ? "bg-fb-success" : onTrack ? "bg-acc-100" : "bg-acc-200"}`}
					style={{ width: `${pct}%` }}
					aria-hidden="true"
				/>
			</div>
			<p className="mt-s-200 text-tiny text-txt-300">
				{target == null || actual == null ? "Set a target and run trades to see progress." : `${pct.toFixed(0)}% of target`}
			</p>
		</div>
	)
}

export type { TargetActualGaugeProps }
export { TargetActualGauge }
