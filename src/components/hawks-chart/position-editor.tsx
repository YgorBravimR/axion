"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { computePositionStats, floorBrickIdx } from "./drawings"
import type { PositionDrawing } from "./drawings"

interface PositionEditorProps {
	readonly drawing: PositionDrawing
	// 5m pane's brick close-timestamps (ms). Used to translate the
	// drawing's wall-clock startTimeMs / endTimeMs into brick indices the
	// user can edit numerically, and back. We use the 5m pane because the
	// hawks-chart workspace anchors all drawings to 5m timestamps — the
	// 15m / 60m projections derive automatically.
	readonly paneTimes: ReadonlyArray<number>
	readonly onCommit: (_next: PositionDrawing) => void
	readonly onCancel: () => void
}

// Inline editor for a position drawing. Lets the user edit the stop and
// target prices (and qty). Anything else (entry price, direction) is
// locked — change those by removing the drawing and adding it again.
//
// Why no chart-level drag handles: lightweight-charts has no built-in
// "draggable LineSeries" primitive. The supported approach is a custom
// IPrimitive plug-in (~250 LOC). For v1 we ship an inline editor at
// the drawings list — same data, less surface area. The drag affordance
// is on the backlog.
const HawksChartPositionEditor = ({
	drawing,
	paneTimes,
	onCommit,
	onCancel,
}: PositionEditorProps) => {
	const [entryPrice, setEntryPrice] = useState(drawing.entryPrice)
	const [stopPrice, setStopPrice] = useState(drawing.stopPrice)
	const [targetPrice, setTargetPrice] = useState(drawing.targetPrice)
	const [qty, setQty] = useState(drawing.qty)

	// Convert the drawing's wall-clock window into brick indices the user
	// edits. Same projection the renderer does — so what the user sees in
	// the input matches what they see on the chart.
	const initialStartIdx = Math.max(
		0,
		floorBrickIdx(paneTimes, drawing.startTimeMs)
	)
	const initialEndIdx = (() => {
		const raw = floorBrickIdx(paneTimes, drawing.endTimeMs)
		const lastIdx = paneTimes.length - 1
		if (raw < 0 || raw > lastIdx) {
			return lastIdx
		}
		return Math.max(initialStartIdx + 1, raw)
	})()
	const [startBrickIdx, setStartBrickIdx] = useState(initialStartIdx)
	const [endBrickIdx, setEndBrickIdx] = useState(initialEndIdx)

	const lastIdx = paneTimes.length - 1
	const spanBricks = Math.max(1, endBrickIdx - startBrickIdx)

	// Bound + monotonicity helpers — both inputs are clamped to the pane's
	// brick range and we keep start < end so the box never collapses to a
	// vertical line (which would crash lightweight-charts' setData with the
	// strictly-ascending-time assertion).
	const clamp = (n: number, lo: number, hi: number): number =>
		Math.max(lo, Math.min(hi, n))
	const handleStartChange = (next: number) => {
		const clamped = clamp(next, 0, Math.max(0, endBrickIdx - 1))
		setStartBrickIdx(clamped)
	}
	const handleEndChange = (next: number) => {
		const clamped = clamp(next, startBrickIdx + 1, lastIdx)
		setEndBrickIdx(clamped)
	}
	const handleSpanChange = (nextSpan: number) => {
		// "Span" UX = extend the END to the right (or pull it in). Keeps
		// the left anchor fixed; that's the muscle memory from Profit ProRT
		// where the box's left edge is the entry-brick.
		const clean = Math.max(1, Math.floor(nextSpan))
		const next = clamp(startBrickIdx + clean, startBrickIdx + 1, lastIdx)
		setEndBrickIdx(next)
	}

	const previewStats = computePositionStats({
		direction: drawing.direction,
		entryPrice,
		stopPrice,
		targetPrice,
		qty,
		valuePerPoint: drawing.valuePerPoint,
	})

	const handleSave = () => {
		// Translate brick indices back to wall-clock timestamps. Drawings
		// are persisted in wall-clock so they project consistently across
		// the 5m / 15m / 60m panes — same convention as the original draw.
		const startTimeMs = paneTimes[startBrickIdx] ?? drawing.startTimeMs
		const endTimeMs = paneTimes[endBrickIdx] ?? drawing.endTimeMs
		onCommit({
			...drawing,
			entryPrice,
			stopPrice,
			targetPrice,
			qty,
			startTimeMs,
			endTimeMs,
		})
	}

	// "Shift box" mode — when ON, edits to entry also shift stop+target by
	// the same delta so the R-distances stay intact. When OFF (default),
	// the three prices are independent and editing entry alone just resizes
	// the R-distance. Two distinct mental models; the toggle picks one
	// explicitly rather than forcing the user to guess which the form is
	// in.
	const [shiftLockedToEntry, setShiftLockedToEntry] = useState(false)

	const handleEntryChange = (next: number) => {
		if (shiftLockedToEntry) {
			const dEntry = next - entryPrice
			setStopPrice((s) => s + dEntry)
			setTargetPrice((t) => t + dEntry)
		}
		setEntryPrice(next)
	}

	// Snap stop/target to the playbook-sane side. For LONG, stop must be
	// below entry and target above; for SHORT, mirror. If the user enters
	// the wrong side, the save still goes through — we display a warning
	// instead of silently flipping (their fingers know better than the form).
	const stopOnRightSide =
		drawing.direction === "long"
			? stopPrice < entryPrice
			: stopPrice > entryPrice
	const targetOnRightSide =
		drawing.direction === "long"
			? targetPrice > entryPrice
			: targetPrice < entryPrice

	return (
		<div className="bg-bg-100 border-bg-300 px-s-300 py-s-200 gap-s-200 flex flex-wrap items-end rounded-md border">
			<label className="text-tiny text-txt-300 flex flex-col gap-1">
				Entry
				<input
					type="number"
					inputMode="decimal"
					className="bg-bg-200 border-bg-300 text-txt-100 w-24 rounded-sm border px-1 py-0.5 font-mono"
					value={entryPrice}
					onChange={(e) => handleEntryChange(Number(e.target.value))}
					step={5}
				/>
				<label
					htmlFor={`hawks-chart-position-editor-${drawing.id}-shift`}
					className="text-tiny text-txt-300 flex items-center gap-1"
				>
					<Checkbox
						id={`hawks-chart-position-editor-${drawing.id}-shift`}
						checked={shiftLockedToEntry}
						onCheckedChange={(v) => setShiftLockedToEntry(v === true)}
					/>
					shift box
				</label>
			</label>
			<label className="text-tiny text-txt-300 flex flex-col gap-1">
				Stop (1R)
				<input
					type="number"
					inputMode="decimal"
					className="bg-bg-200 border-bg-300 text-txt-100 w-24 rounded-sm border px-1 py-0.5 font-mono"
					value={stopPrice}
					onChange={(e) => setStopPrice(Number(e.target.value))}
					step={5}
				/>
				{!stopOnRightSide && (
					<span className="text-destructive">Wrong side of entry</span>
				)}
			</label>
			<label className="text-tiny text-txt-300 flex flex-col gap-1">
				Target
				<input
					type="number"
					inputMode="decimal"
					className="bg-bg-200 border-bg-300 text-txt-100 w-24 rounded-sm border px-1 py-0.5 font-mono"
					value={targetPrice}
					onChange={(e) => setTargetPrice(Number(e.target.value))}
					step={5}
				/>
				{!targetOnRightSide && (
					<span className="text-destructive">Wrong side of entry</span>
				)}
			</label>
			<label className="text-tiny text-txt-300 flex flex-col gap-1">
				Qty
				<input
					type="number"
					inputMode="numeric"
					className="bg-bg-200 border-bg-300 text-txt-100 w-16 rounded-sm border px-1 py-0.5 font-mono"
					value={qty}
					onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
					step={1}
					min={1}
				/>
			</label>
			{/*
			 * Horizontal extent — measured in 5m-pane brick INDICES, not
			 * timestamps. Three controls for three different muscle memories:
			 *   - Start brick: anchor of the left edge (entry side).
			 *   - End brick:   right edge (target/expiry side).
			 *   - Span:        derived end - start; editing it extends/pulls
			 *                  the right edge while keeping the left pinned.
			 * Side-buttons give one-handed extend/shrink in 10-brick jumps —
			 * matches how fast the eye scans the chart at zoom level "1 week".
			 */}
			<label className="text-tiny text-txt-300 flex flex-col gap-1">
				Start brick
				<div className="flex items-center gap-1">
					<button
						type="button"
						className="bg-bg-200 border-bg-300 text-txt-200 rounded-sm border px-1 hover:underline"
						onClick={() => handleStartChange(startBrickIdx - 10)}
						title="Move start 10 bricks left"
					>
						«
					</button>
					<input
						type="number"
						inputMode="numeric"
						className="bg-bg-200 border-bg-300 text-txt-100 w-20 rounded-sm border px-1 py-0.5 font-mono"
						value={startBrickIdx}
						onChange={(e) => handleStartChange(Number(e.target.value))}
						step={1}
						min={0}
						max={Math.max(0, endBrickIdx - 1)}
					/>
					<button
						type="button"
						className="bg-bg-200 border-bg-300 text-txt-200 rounded-sm border px-1 hover:underline"
						onClick={() => handleStartChange(startBrickIdx + 10)}
						title="Move start 10 bricks right"
					>
						»
					</button>
				</div>
			</label>
			<label className="text-tiny text-txt-300 flex flex-col gap-1">
				End brick
				<div className="flex items-center gap-1">
					<button
						type="button"
						className="bg-bg-200 border-bg-300 text-txt-200 rounded-sm border px-1 hover:underline"
						onClick={() => handleEndChange(endBrickIdx - 10)}
						title="Pull end 10 bricks left (shrink)"
					>
						«
					</button>
					<input
						type="number"
						inputMode="numeric"
						className="bg-bg-200 border-bg-300 text-txt-100 w-20 rounded-sm border px-1 py-0.5 font-mono"
						value={endBrickIdx}
						onChange={(e) => handleEndChange(Number(e.target.value))}
						step={1}
						min={startBrickIdx + 1}
						max={lastIdx}
					/>
					<button
						type="button"
						className="bg-bg-200 border-bg-300 text-txt-200 rounded-sm border px-1 hover:underline"
						onClick={() => handleEndChange(endBrickIdx + 10)}
						title="Extend end 10 bricks right"
					>
						»
					</button>
				</div>
			</label>
			<label className="text-tiny text-txt-300 flex flex-col gap-1">
				Span (bricks)
				<input
					type="number"
					inputMode="numeric"
					className="bg-bg-200 border-bg-300 text-txt-100 w-20 rounded-sm border px-1 py-0.5 font-mono"
					value={spanBricks}
					onChange={(e) => handleSpanChange(Number(e.target.value))}
					step={1}
					min={1}
				/>
			</label>
			<div className="text-tiny text-txt-200 flex flex-col font-mono">
				<span>R:R {previewStats.riskRewardRatio.toFixed(2)}</span>
				<span>
					risk R${previewStats.stopValue.toFixed(0)} · reward R$
					{previewStats.targetValue.toFixed(0)}
				</span>
			</div>
			<div className="ml-auto flex gap-2">
				<Button
					id={`hawks-chart-position-editor-${drawing.id}-cancel`}
					type="button"
					variant="ghost"
					size="sm"
					onClick={onCancel}
				>
					Cancel
				</Button>
				<Button
					id={`hawks-chart-position-editor-${drawing.id}-save`}
					type="button"
					variant="default"
					size="sm"
					onClick={handleSave}
				>
					Save
				</Button>
			</div>
		</div>
	)
}

export { HawksChartPositionEditor }
export type { PositionEditorProps }
