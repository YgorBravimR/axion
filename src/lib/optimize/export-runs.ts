/**
 * Browser-side export helpers for the optimize runs list. Two formats:
 *
 *   - JSON  → full lossless dump (recipe + summary + provenance + walk-forward
 *             splits). Use this when sharing a sweep for validation / reproduction.
 *   - CSV   → one row per run, summary metrics only. Use this for Excel /
 *             quick human review. The same columns the runs-comparison-table
 *             surfaces, in the same order.
 *
 * Both helpers trigger a real browser download via an in-memory Blob; they
 * intentionally avoid any server roundtrip so the user can export at any
 * time, including after the dev server is gone. Trades are excluded from
 * both formats because they're already empty in persisted runs (see
 * `sweep-runner.ts` — `trades: []` is the production shape).
 */
import type { OptimizationRun } from "@/types/backtest"

const downloadBlob = (
	blob: Blob,
	filenameStem: string,
	extension: string
): void => {
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
	a.href = url
	a.download = `${filenameStem}-${ts}.${extension}`
	document.body.appendChild(a)
	a.click()
	a.remove()
	// Defer revocation slightly so Firefox actually starts the download.
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Trim heavyweight per-run fields that aren't useful when sharing for
 * validation. `dayBreakdown` and `trades` are already empty in persisted
 * runs but we omit them explicitly so the export is identical regardless
 * of whether the run came from localStorage or from a fresh sweep.
 */
const toJsonShape = (run: OptimizationRun) => ({
	id: run.id,
	label: run.label,
	createdAt: run.createdAt,
	pinned: run.pinned,
	recipe: run.recipe,
	summary: run.summary,
	summaryIS: run.summaryIS,
	summaryOOS: run.summaryOOS,
	oosRobust: run.oosRobust,
	matchRate: run.matchRate,
	matchRateIS: run.matchRateIS,
	matchRateOOS: run.matchRateOOS,
	provenance: run.provenance,
	equityCurvePointCount: run.equityCurve.length,
})

const exportRunsAsJson = (runs: OptimizationRun[]): void => {
	const payload = {
		exportedAt: new Date().toISOString(),
		runCount: runs.length,
		runs: runs.map(toJsonShape),
	}
	const blob = new Blob([JSON.stringify(payload, null, 2)], {
		type: "application/json",
	})
	downloadBlob(blob, "axion-optimize-runs", "json")
}

// ── CSV ─────────────────────────────────────────────────────────────

const CSV_HEADERS = [
	"label",
	"stage",
	"journeyId",
	"parentRunIds",
	"trades",
	"winRate",
	"profitFactor",
	"profitFactorIS",
	"profitFactorOOS",
	"matchRate",
	"oosRobust",
	"totalPnlCents",
	"maxDrawdownCents",
	"sharpeRatio",
	"avgRMultiple",
	"createdAt",
	"strategy",
	"id",
] as const

/**
 * Quote a CSV field per RFC4180. Wraps with double-quotes when the value
 * contains a comma, quote, or newline; doubles any embedded quote.
 */
const csvField = (
	value: string | number | boolean | null | undefined
): string => {
	if (value === undefined || value === null) {
		return ""
	}
	const s = String(value)
	if (/[",\n\r]/.test(s)) {
		return `"${s.replace(/"/g, '""')}"`
	}
	return s
}

const toCsvRow = (run: OptimizationRun): string => {
	const cells: Array<string | number | boolean | undefined> = [
		run.label,
		run.provenance?.stage,
		run.provenance?.journeyId,
		run.provenance?.parentRunIds?.join("|"),
		run.summary.totalTrades,
		run.summary.winRate,
		run.summary.profitFactor,
		run.summaryIS?.profitFactor,
		run.summaryOOS?.profitFactor,
		run.matchRate,
		run.oosRobust,
		run.summary.totalPnlCents,
		run.summary.maxDrawdownCents,
		run.summary.sharpeRatio,
		run.summary.avgRMultiple,
		run.createdAt,
		run.recipe.entry.type,
		run.id,
	]
	return cells.map(csvField).join(",")
}

const exportRunsAsCsv = (runs: OptimizationRun[]): void => {
	const lines = [CSV_HEADERS.join(","), ...runs.map(toCsvRow)]
	// Prepend BOM so Excel correctly detects UTF-8 (label may contain accents).
	const blob = new Blob(["﻿" + lines.join("\n")], {
		type: "text/csv;charset=utf-8",
	})
	downloadBlob(blob, "axion-optimize-runs", "csv")
}

export { exportRunsAsJson, exportRunsAsCsv }
