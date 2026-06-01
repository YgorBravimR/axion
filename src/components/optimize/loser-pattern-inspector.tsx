"use client"

import { useMemo, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { minePatterns, topDrivers } from "@/lib/optimize/loser-pattern"
import { getSweepableParams } from "@/lib/optimize/parameter-grid"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import {
	AlertDialog,
	AlertDialogTrigger,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogAction,
	AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import type { OptimizationRun } from "@/types/backtest"
import type { SweepableParam } from "@/lib/optimize/sweepable-params"

interface LoserPatternInspectorProps {
	runs: OptimizationRun[]
	/** Optional override of the leaf paths to mine. Defaults to the catalog's
	 *  sweepable paths for the first run's strategy. */
	leafPaths?: string[]
	/** Callback to apply a recommendation to the sweep builder state. */
	onApplyRecommendation?: (_leafPath: string, _value: unknown) => void
}

const DEFAULT_LIMIT = 10
const DEFAULT_MIN_DELTA = 0.2

const formatFreq = (f: number): string => `${(f * 100).toFixed(0)}%`

/**
 * Humanize a recipe dot-path when no catalog labelKey is available. Drops
 * leading namespace segments and capitalizes the leaf. This is the rare
 * fallback — most paths are catalog-known.
 */
const humanizePath = (path: string): string => {
	const parts = path.split(".")
	const leaf = parts[parts.length - 1] ?? path
	return leaf
		.replace(/([A-Z])/g, " $1")
		.replace(/^./, (c) => c.toUpperCase())
		.trim()
}

const LoserPatternInspector = ({
	runs,
	leafPaths,
	onApplyRecommendation,
}: LoserPatternInspectorProps) => {
	const t = useTranslations("optimize.loserPattern")
	const tLabel = useTranslations("optimize.sweepParam")
	const { showToast } = useToast()

	const [winnerThresh, setWinnerThresh] = useState(1.5)
	const [loserThresh, setLoserThresh] = useState(1.0)
	const [minDelta, setMinDelta] = useState(DEFAULT_MIN_DELTA)
	const [applyAllDialogOpen, setApplyAllDialogOpen] = useState(false)
	const [appliedRecommendations, setAppliedRecommendations] = useState<
		Set<string>
	>(new Set())

	/**
	 * Source the inspected paths from the sweepable-params catalog instead of
	 * walking every primitive on the recipe. Walking picked up noise paths like
	 * `displayName`, `id`, `slippageTicks`, etc., which produced confusing
	 * driver rows ("Avoid displayName = …"). The catalog already lists the
	 * paths the user can sweep — exactly the surface area drivers should mine.
	 */
	const catalogParams = useMemo<SweepableParam[]>(() => {
		const first = runs[0]?.recipe
		if (!first) {
			return []
		}
		return getSweepableParams(first)
	}, [runs])

	const inferredPaths = useMemo<string[]>(() => {
		if (leafPaths && leafPaths.length > 0) {
			return leafPaths
		}
		return catalogParams.map((p) => p.path)
	}, [catalogParams, leafPaths])

	/**
	 * Build the lookup maps once: path → human label (from catalog labelKey)
	 * and per-enum-path value → option label (e.g. boolean true → "On"). We
	 * use these to render rows in human language; mining still works on raw
	 * values so the math is unchanged.
	 */
	const labelByPath = useMemo(() => {
		const map = new Map<string, string>()
		for (const p of catalogParams) {
			map.set(p.path, tLabel(p.labelKey))
		}
		return map
	}, [catalogParams, tLabel])

	const optionLabelByPath = useMemo(() => {
		// Map<path, Map<canonicalValue, label>>. Canonical values come from
		// catalog `opt.value` ("on"/"off", "pct_range", etc.).
		const map = new Map<string, Map<string, string>>()
		for (const p of catalogParams) {
			if (p.kind === "enum") {
				const inner = new Map<string, string>()
				for (const opt of p.options) {
					inner.set(opt.value, tLabel(opt.labelKey))
				}
				map.set(p.path, inner)
			}
		}
		return map
	}, [catalogParams, tLabel])

	const enumReaderByPath = useMemo(() => {
		const map = new Map<string, SweepableParam>()
		for (const p of catalogParams) {
			if (p.kind === "enum") {
				map.set(p.path, p)
			}
		}
		return map
	}, [catalogParams])

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

	const handleApplySingle = useCallback(
		(leafPath: string, value: unknown) => {
			if (!onApplyRecommendation) {
				return
			}
			onApplyRecommendation(leafPath, value)
			const key = `${leafPath}:${String(value)}`
			setAppliedRecommendations((prev) => new Set(prev).add(key))
			showToast("success", t("applySuccess"))
		},
		[onApplyRecommendation, t, showToast]
	)

	const handleApplyAll = useCallback(() => {
		if (!onApplyRecommendation || drivers.length === 0) {
			return
		}
		let appliedCount = 0
		for (const driver of drivers) {
			onApplyRecommendation(driver.leafPath, driver.value)
			const key = `${driver.leafPath}:${String(driver.value)}`
			setAppliedRecommendations((prev) => new Set(prev).add(key))
			appliedCount++
		}
		setApplyAllDialogOpen(false)
		showToast("success", t("applyAllSuccess", { count: appliedCount }))
	}, [drivers, onApplyRecommendation, t, showToast])

	const isRecommendationApplied = useCallback(
		(leafPath: string, value: unknown): boolean => {
			const key = `${leafPath}:${String(value)}`
			return appliedRecommendations.has(key)
		},
		[appliedRecommendations]
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
				<div className="text-tiny text-txt-300 gap-s-200 ml-auto flex items-center self-end">
					<span>
						{t("poolStats", {
							winners: mining.winners,
							losers: mining.losers,
						})}
					</span>
					{drivers.length > 0 && onApplyRecommendation && (
						<AlertDialog
							open={applyAllDialogOpen}
							onOpenChange={setApplyAllDialogOpen}
						>
							<AlertDialogTrigger asChild>
								<Button
									id="apply-all-trigger"
									variant="outline"
									size="sm"
									onClick={() => setApplyAllDialogOpen(true)}
								>
									{t("applyAllButton")}
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent size="sm">
								<AlertDialogHeader>
									<AlertDialogTitle>{t("applyAllTitle")}</AlertDialogTitle>
									<AlertDialogDescription>
										{t("applyAllDescription", { count: drivers.length })}
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel id="cancel-apply-all">
										{t("applyAllCancel")}
									</AlertDialogCancel>
									<AlertDialogAction
										id="confirm-apply-all"
										onClick={handleApplyAll}
										variant="default"
									>
										{t("applyAllConfirm")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					)}
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
						// Resolve human label for the path (falls back to a
						// humanized leaf segment for paths not in the catalog).
						const leafLabel =
							labelByPath.get(d.leafPath) ?? humanizePath(d.leafPath)
						// Resolve value label for enum paths. The catalog stores
						// canonical "on"/"off" strings while the recipe stores the
						// raw boolean — translate through the param's projection.
						const enumParam = enumReaderByPath.get(d.leafPath)
						const valueLabel = (() => {
							if (!enumParam || enumParam.kind !== "enum") {
								return String(d.value)
							}
							const options = optionLabelByPath.get(d.leafPath)
							// The mining stores values via the raw recipe read, not
							// via getCurrentValue. We try both: direct (string match)
							// and the boolean→"on"/"off" projection. Falls back to
							// String(value) if neither matches.
							const direct = options?.get(String(d.value))
							if (direct) {
								return direct
							}
							if (typeof d.value === "boolean") {
								return options?.get(d.value ? "on" : "off") ?? String(d.value)
							}
							return String(d.value)
						})()
						const advice = winnerLean
							? t("recommendLock", { leaf: leafLabel, value: valueLabel })
							: t("recommendAvoid", { leaf: leafLabel, value: valueLabel })
						const isApplied = isRecommendationApplied(d.leafPath, d.value)
						return (
							<li
								key={`${d.leafPath}-${String(d.value)}`}
								className={`px-s-300 py-s-200 rounded-md border ${colorClass}`}
							>
								<div className="gap-s-300 flex flex-col sm:flex-row sm:items-baseline sm:justify-between">
									<div>
										<span className="text-small text-txt-100 font-medium">
											{leafLabel}
										</span>
										<span className="text-tiny text-txt-300 ml-2">
											= <span className="font-mono">{valueLabel}</span>
										</span>
									</div>
									<div className="gap-s-200 flex flex-wrap items-center justify-between sm:justify-end">
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
										{onApplyRecommendation && (
											<Button
												id={`apply-single-${d.leafPath}-${String(d.value)}`}
												size="sm"
												variant={isApplied ? "outline" : "default"}
												disabled={isApplied}
												onClick={() => handleApplySingle(d.leafPath, d.value)}
												className="whitespace-nowrap"
											>
												{isApplied ? t("applyApplied") : t("applyButton")}
											</Button>
										)}
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
