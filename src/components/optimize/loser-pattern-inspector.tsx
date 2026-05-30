"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { minePatterns, topDrivers } from "@/lib/optimize/loser-pattern"
import type { OptimizationRun } from "@/types/backtest"

interface LoserPatternInspectorProps {
	runs: OptimizationRun[]
	/** Optional override of the leaf paths to mine. Defaults to all string-valued
	 *  paths found across the runs (inferred from the first recipe). */
	leafPaths?: string[]
}

const DEFAULT_LIMIT = 10
const DEFAULT_MIN_DELTA = 0.2

/** Walk a recipe and emit every dot-path leading to a primitive value. */
const walkPaths = (obj: unknown, prefix = ""): string[] => {
	if (obj === null || typeof obj !== "object") {
		return []
	}
	const out: string[] = []
	for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
		const path = prefix ? `${prefix}.${k}` : k
		if (v === null || typeof v !== "object") {
			out.push(path)
		} else {
			out.push(...walkPaths(v, path))
		}
	}
	return out
}

const formatFreq = (f: number): string => `${(f * 100).toFixed(0)}%`

const LoserPatternInspector = ({
	runs,
	leafPaths,
}: LoserPatternInspectorProps) => {
	const t = useTranslations("optimize.loserPattern")

	const [winnerThresh, setWinnerThresh] = useState(1.5)
	const [loserThresh, setLoserThresh] = useState(1.0)
	const [minDelta, setMinDelta] = useState(DEFAULT_MIN_DELTA)

	const inferredPaths = useMemo<string[]>(() => {
		if (leafPaths && leafPaths.length > 0) {
			return leafPaths
		}
		const first = runs[0]?.recipe
		if (!first) {
			return []
		}
		return walkPaths(first)
	}, [runs, leafPaths])

	const mining = useMemo(
		() =>
			minePatterns({
				runs,
				leafPaths: inferredPaths,
				winnerPfMin: winnerThresh,
				loserPfMax: loserThresh,
			}),
		[runs, inferredPaths, winnerThresh, loserThresh]
	)

	const drivers = useMemo(
		() => topDrivers(mining, DEFAULT_LIMIT, minDelta),
		[mining, minDelta]
	)

	if (runs.length < 10) {
		return (
			<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
				<p className="text-small text-txt-300">{t("emptyState")}</p>
			</div>
		)
	}

	return (
		<div className="border-bg-300 bg-bg-200 space-y-s-300 p-m-400 rounded-lg border">
			<div>
				<h3 className="text-h3 text-txt-100 font-semibold">{t("title")}</h3>
				<p className="text-small text-txt-300 mt-s-100">{t("subtitle")}</p>
			</div>

			<div className="gap-s-300 flex flex-wrap items-end">
				<label className="space-y-s-100 flex flex-col">
					<span className="text-tiny text-txt-300">{t("winnerThresh")}</span>
					<input
						type="number"
						step="0.1"
						min="1"
						value={winnerThresh}
						onChange={(e) => setWinnerThresh(parseFloat(e.target.value) || 1.5)}
						className="border-bg-300 bg-bg-100 text-small text-txt-100 w-24 rounded-sm border px-2 py-1"
					/>
				</label>
				<label className="space-y-s-100 flex flex-col">
					<span className="text-tiny text-txt-300">{t("loserThresh")}</span>
					<input
						type="number"
						step="0.1"
						min="0"
						value={loserThresh}
						onChange={(e) => setLoserThresh(parseFloat(e.target.value) || 1.0)}
						className="border-bg-300 bg-bg-100 text-small text-txt-100 w-24 rounded-sm border px-2 py-1"
					/>
				</label>
				<label className="space-y-s-100 flex flex-col">
					<span className="text-tiny text-txt-300">{t("minDelta")}</span>
					<input
						type="number"
						step="0.05"
						min="0"
						max="1"
						value={minDelta}
						onChange={(e) => setMinDelta(parseFloat(e.target.value) || 0)}
						className="border-bg-300 bg-bg-100 text-small text-txt-100 w-24 rounded-sm border px-2 py-1"
					/>
				</label>
				<div className="text-tiny text-txt-300 ml-auto self-end">
					{t("poolStats", {
						winners: mining.winners,
						losers: mining.losers,
					})}
				</div>
			</div>

			{drivers.length === 0 ? (
				<div className="border-bg-300 p-s-300 text-small text-txt-300 rounded-md border border-dashed text-center">
					{t("noDrivers")}
				</div>
			) : (
				<ul className="space-y-s-200">
					{drivers.map((d) => {
						const winnerLean = d.delta < 0
						const colorClass = winnerLean
							? "border-trade-buy/40 bg-trade-buy/5"
							: "border-fb-error/40 bg-fb-error/5"
						const advice = winnerLean
							? t("recommendLock", {
									leaf: d.leafPath,
									value: String(d.value),
								})
							: t("recommendAvoid", {
									leaf: d.leafPath,
									value: String(d.value),
								})
						return (
							<li
								key={`${d.leafPath}-${String(d.value)}`}
								className={`px-s-300 py-s-200 rounded-md border ${colorClass}`}
							>
								<div className="gap-s-300 flex items-baseline justify-between">
									<div>
										<code className="text-small text-txt-100 font-mono">
											{d.leafPath}
										</code>
										<span className="text-tiny text-txt-300 ml-2">
											= <span className="font-mono">{String(d.value)}</span>
										</span>
									</div>
									<div className="text-tiny text-txt-300 font-mono">
										W:{formatFreq(d.winnerFreq)} L:{formatFreq(d.loserFreq)}{" "}
										<span
											className={
												winnerLean ? "text-trade-buy" : "text-fb-error"
											}
										>
											Δ {d.delta >= 0 ? "+" : ""}
											{formatFreq(d.delta)}
										</span>
									</div>
								</div>
								<p className="text-tiny text-txt-200 mt-s-100">{advice}</p>
							</li>
						)
					})}
				</ul>
			)}
		</div>
	)
}

export { LoserPatternInspector }
