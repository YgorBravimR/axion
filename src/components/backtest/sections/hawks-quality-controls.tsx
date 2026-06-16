"use client"

import { memo, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SegmentedToggle } from "@/components/ui/segmented-toggle"
import { Switch } from "@/components/ui/switch"
import {
	getQualityPresetBundle,
	matchQualityPreset,
	normalizeQualityGates,
	type QualityPresetLevel,
} from "@/lib/backtest/presets/hawks-quality-presets"
import {
	useIsSwept,
	useAllSwept,
} from "@/components/optimize/swept-paths-context"
import type { QualityGatesConfig } from "@/types/backtest"

const BUNDLE_PATH = "entry.config.qualityGates.__bundle__"
const SR_BLOCK_PATH = "entry.config.qualityGates.srLevelBlock"
const SR_FAVOR_PATH = "entry.config.qualityGates.srLevelFavor"
const SR_BLOCK_BUFFER_PATH = "entry.config.qualityGates.srBlockBufferBricks"
const SR_FAVOR_RANGE_PATH = "entry.config.qualityGates.srFavorRangeBricks"
const KELTNER_OUTER_BLOCK_PATH = "entry.config.qualityGates.keltnerOuterBlock"
const KELTNER_INNER_PENALTY_PATH =
	"entry.config.qualityGates.keltnerInnerPenalty"
const KELTNER_NEAR_PATH = "entry.config.qualityGates.keltnerNearBricks"
const VWAP_WICK_REJECT_BLOCK_PATH =
	"entry.config.qualityGates.vwapWickRejectBlock"
const MACD_ALIGNMENT_PATH = "entry.config.qualityGates.macdAlignmentScore"
const MACD_SLOPE_PATH = "entry.config.qualityGates.macdSlopeWindow"
const AGGRESSION_MODE_PATH = "entry.config.qualityGates.aggressionMode"
const AGGRESSION_THRESHOLD_PATH =
	"entry.config.qualityGates.aggressionThreshold"
const VOLUME_SCORE_PATH = "entry.config.qualityGates.volumeScore"
const VOLUME_EMA_PATH = "entry.config.qualityGates.volumeEmaPeriod"
// Note: htfMaBlock is sweepable via OPTIMIZE but has no surface in this
// recipe UI today, so no hide-logic is needed for it here.

interface HawksQualityControlsProps {
	qualityGates: QualityGatesConfig | undefined
	onChange: (_next: QualityGatesConfig) => void
}

// Single-row layout for a labeled boolean toggle. Reused for every gate /
// score flag so the eye picks up state at a glance.
const ToggleRow = ({
	id,
	label,
	hint,
	checked,
	onCheckedChange,
}: {
	id: string
	label: string
	hint?: string
	checked: boolean
	onCheckedChange: (_next: boolean) => void
}) => (
	<div className="gap-s-300 flex items-start justify-between">
		<div className="min-w-0">
			<Label id={`${id}-label`} htmlFor={id} className="cursor-pointer">
				{label}
			</Label>
			{hint && <p className="text-tiny text-txt-300 mt-s-100">{hint}</p>}
		</div>
		<Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
	</div>
)

// Tunable numeric input. `min`/`step`/`max` are guidance for the browser
// stepper; we coerce to number on commit and let the engine clamp.
const NumberRow = ({
	id,
	label,
	hint,
	value,
	min,
	max,
	step,
	onChange,
}: {
	id: string
	label: string
	hint?: string
	value: number
	min?: number
	max?: number
	step?: number
	onChange: (_next: number) => void
}) => (
	<div className="gap-s-300 grid grid-cols-[1fr_120px] items-start">
		<div className="min-w-0">
			<Label id={`${id}-label`} htmlFor={id}>
				{label}
			</Label>
			{hint && <p className="text-tiny text-txt-300 mt-s-100">{hint}</p>}
		</div>
		<Input
			id={id}
			type="number"
			value={value}
			min={min}
			max={max}
			step={step}
			onChange={(e) => {
				const parsed = Number(e.target.value)
				if (Number.isFinite(parsed)) {
					onChange(parsed)
				}
			}}
		/>
	</div>
)

const HawksQualityControls = memo(
	({ qualityGates, onChange }: HawksQualityControlsProps) => {
		const t = useTranslations("backtest.hawks.quality")

		// Hide each control independently when its sweep axis is active.
		// The bundle preset hides too because picking a bundle in the sweep
		// drives every gate at once — the preset selector is meaningless
		// under that condition.
		const isBundleSwept = useIsSwept(BUNDLE_PATH)
		const isSrBlockSwept = useIsSwept(SR_BLOCK_PATH)
		const isSrFavorSwept = useIsSwept(SR_FAVOR_PATH)
		const isSrBlockBufferSwept = useIsSwept(SR_BLOCK_BUFFER_PATH)
		const isSrFavorRangeSwept = useIsSwept(SR_FAVOR_RANGE_PATH)
		const isKeltnerOuterBlockSwept = useIsSwept(KELTNER_OUTER_BLOCK_PATH)
		const isKeltnerInnerPenaltySwept = useIsSwept(KELTNER_INNER_PENALTY_PATH)
		const isKeltnerNearSwept = useIsSwept(KELTNER_NEAR_PATH)
		const isVwapWickRejectBlockSwept = useIsSwept(VWAP_WICK_REJECT_BLOCK_PATH)
		const isMacdAlignmentSwept = useIsSwept(MACD_ALIGNMENT_PATH)
		const isMacdSlopeSwept = useIsSwept(MACD_SLOPE_PATH)
		const isAggressionModeSwept = useIsSwept(AGGRESSION_MODE_PATH)
		const isAggressionThresholdSwept = useIsSwept(AGGRESSION_THRESHOLD_PATH)
		const isVolumeScoreSwept = useIsSwept(VOLUME_SCORE_PATH)
		const isVolumeEmaSwept = useIsSwept(VOLUME_EMA_PATH)

		const isSrGroupAllSwept = useAllSwept([
			SR_BLOCK_PATH,
			SR_FAVOR_PATH,
			SR_BLOCK_BUFFER_PATH,
			SR_FAVOR_RANGE_PATH,
		])
		const isKeltnerGroupAllSwept = useAllSwept([
			KELTNER_OUTER_BLOCK_PATH,
			KELTNER_INNER_PENALTY_PATH,
			KELTNER_NEAR_PATH,
		])
		const isMacdGroupAllSwept = useAllSwept([
			MACD_ALIGNMENT_PATH,
			MACD_SLOPE_PATH,
		])
		const isAggressionGroupAllSwept = useAllSwept([
			AGGRESSION_MODE_PATH,
			AGGRESSION_THRESHOLD_PATH,
		])
		const isVolumeGroupAllSwept = useAllSwept([
			VOLUME_SCORE_PATH,
			VOLUME_EMA_PATH,
		])

		// Normalized view: every field has a concrete value, so the UI never
		// renders an "undefined" toggle. Writes go through `patch` which
		// merges into the *current* (possibly partial) gates so we don't
		// accidentally clobber forward-compatible fields the UI doesn't know
		// about yet.
		const view = normalizeQualityGates(qualityGates)
		const currentLevel = matchQualityPreset(qualityGates)

		const patch = useCallback(
			(partial: Partial<QualityGatesConfig>) => {
				onChange({ ...qualityGates, ...partial })
			},
			[onChange, qualityGates]
		)

		const handlePresetChange = useCallback(
			(level: QualityPresetLevel) => {
				if (level === "custom") {
					// "Custom" is purely a marker — picking it should not rewrite
					// the user's current edits. The selector will auto-snap to
					// "custom" anyway whenever the gates don't match a bundle.
					return
				}
				onChange(getQualityPresetBundle(level))
			},
			[onChange]
		)

		const presetOptions: { value: QualityPresetLevel; label: string }[] = [
			{ value: "off", label: t("preset.off.label") },
			{ value: "lite", label: t("preset.lite.label") },
			{ value: "standard", label: t("preset.standard.label") },
			{ value: "strict", label: t("preset.strict.label") },
			{ value: "custom", label: t("preset.custom.label") },
		]

		return (
			<div className="space-y-s-300">
				{!isBundleSwept && (
					<div className="space-y-s-200">
						<Label id="hawks-quality-preset-label">{t("presetLabel")}</Label>
						<SegmentedToggle
							value={currentLevel}
							options={presetOptions}
							onChange={handlePresetChange}
							aria-labelledby="hawks-quality-preset-label"
						/>
						<p className="text-tiny text-txt-300">
							{t(`preset.${currentLevel}.description`)}
						</p>
					</div>
				)}

				<details className="group border-bg-300 bg-bg-100 rounded-sm border">
					<summary className="gap-s-300 px-s-300 py-s-300 text-small text-txt-200 hover:text-txt-100 flex cursor-pointer list-none items-center justify-between">
						<span className="text-txt-100 font-medium">
							{t("advanced.title")}
						</span>
						<span className="text-txt-300 text-tiny transition-transform group-open:rotate-180">
							▾
						</span>
					</summary>

					<div className="border-bg-300 space-y-m-400 p-s-300 border-t">
						{/* Group A — S/R levels */}
						{!isSrGroupAllSwept && (
							<fieldset className="space-y-s-300">
								<legend className="text-small text-txt-100 font-medium">
									{t("groups.sr")}
								</legend>
								{!isSrBlockSwept && (
									<ToggleRow
										id="quality-srLevelBlock"
										label={t("srLevelBlock.label")}
										hint={t("srLevelBlock.hint")}
										checked={view.srLevelBlock}
										onCheckedChange={(v) => patch({ srLevelBlock: v })}
									/>
								)}
								{!isSrFavorSwept && (
									<ToggleRow
										id="quality-srLevelFavor"
										label={t("srLevelFavor.label")}
										hint={t("srLevelFavor.hint")}
										checked={view.srLevelFavor}
										onCheckedChange={(v) => patch({ srLevelFavor: v })}
									/>
								)}
								{!isSrBlockBufferSwept && (
									<NumberRow
										id="quality-srBlockBufferBricks"
										label={t("srBlockBufferBricks.label")}
										hint={t("srBlockBufferBricks.hint")}
										value={view.srBlockBufferBricks}
										min={0}
										step={1}
										onChange={(v) => patch({ srBlockBufferBricks: v })}
									/>
								)}
								{!isSrFavorRangeSwept && (
									<NumberRow
										id="quality-srFavorRangeBricks"
										label={t("srFavorRangeBricks.label")}
										hint={t("srFavorRangeBricks.hint")}
										value={view.srFavorRangeBricks}
										min={0}
										step={1}
										onChange={(v) => patch({ srFavorRangeBricks: v })}
									/>
								)}
							</fieldset>
						)}

						{/* Group B — Keltner */}
						{!isKeltnerGroupAllSwept && (
							<fieldset className="space-y-s-300">
								<legend className="text-small text-txt-100 font-medium">
									{t("groups.keltner")}
								</legend>
								{!isKeltnerOuterBlockSwept && (
									<ToggleRow
										id="quality-keltnerOuterBlock"
										label={t("keltnerOuterBlock.label")}
										hint={t("keltnerOuterBlock.hint")}
										checked={view.keltnerOuterBlock}
										onCheckedChange={(v) => patch({ keltnerOuterBlock: v })}
									/>
								)}
								{!isKeltnerInnerPenaltySwept && (
									<ToggleRow
										id="quality-keltnerInnerPenalty"
										label={t("keltnerInnerPenalty.label")}
										hint={t("keltnerInnerPenalty.hint")}
										checked={view.keltnerInnerPenalty}
										onCheckedChange={(v) => patch({ keltnerInnerPenalty: v })}
									/>
								)}
								{!isKeltnerNearSwept && (
									<NumberRow
										id="quality-keltnerNearBricks"
										label={t("keltnerNearBricks.label")}
										hint={t("keltnerNearBricks.hint")}
										value={view.keltnerNearBricks}
										min={0}
										step={1}
										onChange={(v) => patch({ keltnerNearBricks: v })}
									/>
								)}
							</fieldset>
						)}

						{/* VWAP wick touch+reject veto (Group D — methodology-correct). */}
						{!isVwapWickRejectBlockSwept && (
							<fieldset className="space-y-s-300">
								<legend className="text-small text-txt-100 font-medium">
									{t("groups.vwapWick")}
								</legend>
								<ToggleRow
									id="quality-vwapWickRejectBlock"
									label={t("vwapWickRejectBlock.label")}
									hint={t("vwapWickRejectBlock.hint")}
									checked={view.vwapWickRejectBlock}
									onCheckedChange={(v) => patch({ vwapWickRejectBlock: v })}
								/>
							</fieldset>
						)}

						{/* Group C — MACD */}
						{!isMacdGroupAllSwept && (
							<fieldset className="space-y-s-300">
								<legend className="text-small text-txt-100 font-medium">
									{t("groups.macd")}
								</legend>
								{!isMacdAlignmentSwept && (
									<ToggleRow
										id="quality-macdAlignmentScore"
										label={t("macdAlignmentScore.label")}
										hint={t("macdAlignmentScore.hint")}
										checked={view.macdAlignmentScore}
										onCheckedChange={(v) => patch({ macdAlignmentScore: v })}
									/>
								)}
								{!isMacdSlopeSwept && (
									<NumberRow
										id="quality-macdSlopeWindow"
										label={t("macdSlopeWindow.label")}
										hint={t("macdSlopeWindow.hint")}
										value={view.macdSlopeWindow}
										min={1}
										step={1}
										onChange={(v) => patch({ macdSlopeWindow: v })}
									/>
								)}
							</fieldset>
						)}

						{/* Group D — aggression */}
						{!isAggressionGroupAllSwept && (
							<fieldset className="space-y-s-300">
								<legend className="text-small text-txt-100 font-medium">
									{t("groups.aggression")}
								</legend>
								{!isAggressionModeSwept && (
									<div className="space-y-s-200">
										<Label id="hawks-quality-aggression-label">
											{t("aggressionMode.label")}
										</Label>
										<SegmentedToggle
											value={view.aggressionMode}
											options={[
												{ value: "off", label: t("aggressionMode.off") },
												{
													value: "original",
													label: t("aggressionMode.original"),
												},
												// "reversed" pruned 2026-06-16; see Group F audit.
											]}
											onChange={(v) =>
												patch({
													aggressionMode: v as "off" | "original",
												})
											}
											aria-labelledby="hawks-quality-aggression-label"
										/>
										<p className="text-tiny text-txt-300">
											{t("aggressionMode.hint")}
										</p>
									</div>
								)}
								{!isAggressionThresholdSwept && (
									<NumberRow
										id="quality-aggressionThreshold"
										label={t("aggressionThreshold.label")}
										hint={t("aggressionThreshold.hint")}
										value={view.aggressionThreshold}
										min={0}
										step={1000}
										onChange={(v) => patch({ aggressionThreshold: v })}
									/>
								)}
							</fieldset>
						)}

						{/* Group E — volume */}
						{!isVolumeGroupAllSwept && (
							<fieldset className="space-y-s-300">
								<legend className="text-small text-txt-100 font-medium">
									{t("groups.volume")}
								</legend>
								{!isVolumeScoreSwept && (
									<ToggleRow
										id="quality-volumeScore"
										label={t("volumeScore.label")}
										hint={t("volumeScore.hint")}
										checked={view.volumeScore}
										onCheckedChange={(v) => patch({ volumeScore: v })}
									/>
								)}
								{!isVolumeEmaSwept && (
									<NumberRow
										id="quality-volumeEmaPeriod"
										label={t("volumeEmaPeriod.label")}
										hint={t("volumeEmaPeriod.hint")}
										value={view.volumeEmaPeriod}
										min={1}
										step={50}
										onChange={(v) => patch({ volumeEmaPeriod: v })}
									/>
								)}
							</fieldset>
						)}

						{/* Tier thresholds */}
						<fieldset className="space-y-s-300">
							<legend className="text-small text-txt-100 font-medium">
								{t("groups.tiers")}
							</legend>
							<p className="text-tiny text-txt-300">{t("tierHint")}</p>
							<div className="gap-s-300 grid grid-cols-3">
								<div className="space-y-s-100">
									<Label id="quality-tier-aaa-label" htmlFor="quality-tier-aaa">
										AAA ≥
									</Label>
									<Input
										id="quality-tier-aaa"
										type="number"
										value={view.tierThresholds.AAA}
										step={1}
										onChange={(e) => {
											const v = Number(e.target.value)
											if (Number.isFinite(v)) {
												patch({
													tierThresholds: { ...view.tierThresholds, AAA: v },
												})
											}
										}}
									/>
								</div>
								<div className="space-y-s-100">
									<Label id="quality-tier-aa-label" htmlFor="quality-tier-aa">
										AA ≥
									</Label>
									<Input
										id="quality-tier-aa"
										type="number"
										value={view.tierThresholds.AA}
										step={1}
										onChange={(e) => {
											const v = Number(e.target.value)
											if (Number.isFinite(v)) {
												patch({
													tierThresholds: { ...view.tierThresholds, AA: v },
												})
											}
										}}
									/>
								</div>
								<div className="space-y-s-100">
									<Label id="quality-tier-a-label" htmlFor="quality-tier-a">
										A ≥
									</Label>
									<Input
										id="quality-tier-a"
										type="number"
										value={view.tierThresholds.A}
										step={1}
										onChange={(e) => {
											const v = Number(e.target.value)
											if (Number.isFinite(v)) {
												patch({
													tierThresholds: { ...view.tierThresholds, A: v },
												})
											}
										}}
									/>
								</div>
							</div>
						</fieldset>
					</div>
				</details>
			</div>
		)
	}
)
HawksQualityControls.displayName = "HawksQualityControls"

export { HawksQualityControls }
