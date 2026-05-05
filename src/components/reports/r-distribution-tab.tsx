"use client"

import { useEffect, useState } from "react"
import { getRDistribution } from "@/app/actions/fractal-plan/reports"

const LABELS: Record<string, string> = {
	lt_neg1: "< -1R",
	neg1_to_0: "-1R to 0",
	"0_to_1": "0 to 1R",
	"1_to_2": "1R to 2R",
	ge_2: "≥ 2R",
}

interface Props {
	from: Date
	to: Date
}

const RDistributionTab = ({ from, to }: Props) => {
	const [rows, setRows] = useState<{ bucket: string; count: number }[] | null>(null)

	useEffect(() => {
		getRDistribution({ from, to }).then((res) => {
			if (res.status === "success" && res.data) setRows(res.data)
		})
	}, [from, to])

	if (rows === null) return <p className="text-txt-200">Loading…</p>
	const max = Math.max(...rows.map((r) => r.count), 1)

	return (
		<div className="space-y-s-300">
			{rows.map((r) => (
				<div key={r.bucket} className="flex items-center gap-s-300">
					<span className="w-24 text-sm text-txt-200">{LABELS[r.bucket]}</span>
					<div className="h-3 flex-1 rounded bg-bg-300">
						<div
							className="h-full rounded bg-acc-100"
							style={{ width: `${(r.count / max) * 100}%` }}
						/>
					</div>
					<span className="w-12 text-right font-mono text-sm text-txt-100">{r.count}</span>
				</div>
			))}
		</div>
	)
}

export { RDistributionTab }
