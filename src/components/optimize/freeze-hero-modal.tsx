"use client"

import { useState, useMemo, useCallback } from "react"
import { useTranslations } from "next-intl"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
	evaluateHeroGates,
	suggestPresetId,
	snapshotMetrics,
	HERO_WIN_RULES,
} from "@/lib/optimize/hero-win-rules"
import { addHeroPreset } from "@/lib/optimize/hero-presets-store"
import { formatCentsAsCurrency } from "@/lib/money"
import { getEngineVersionForRecipe } from "@/lib/backtest/engine"
import type { OptimizationRun, HeroWinPreset } from "@/types/backtest"

interface FreezeHeroModalProps {
	open: boolean
	onOpenChange: (_open: boolean) => void
	run: OptimizationRun | null
	sourcePresetId: string
	onFrozen?: (_preset: HeroWinPreset) => void
}

const FreezeHeroModal = ({
	open,
	onOpenChange,
	run,
	sourcePresetId,
	onFrozen,
}: FreezeHeroModalProps) => {
	const t = useTranslations("optimize.freezeHero")

	const [notes, setNotes] = useState("")
	const [presetIdOverride, setPresetIdOverride] = useState<string | null>(null)

	const gates = useMemo(
		() => (run ? evaluateHeroGates(run) : { passes: false, failures: [] }),
		[run]
	)

	const suggestedId = useMemo(
		() => suggestPresetId(sourcePresetId, new Date()),
		[sourcePresetId]
	)
	const presetId = presetIdOverride ?? suggestedId

	const handleConfirm = useCallback(() => {
		if (!run || !gates.passes) {
			return
		}
		const journeyId = run.provenance?.journeyId ?? "ad-hoc"
		const preset: HeroWinPreset = {
			presetId,
			sourcePresetId,
			recipe: run.recipe,
			frozenAt: new Date().toISOString(),
			journeyId,
			engineVersion:
				run.provenance?.engineVersion ??
				getEngineVersionForRecipe(run.recipe) ??
				"unknown",
			metrics: snapshotMetrics(run),
			notes: notes.trim() || undefined,
		}
		addHeroPreset(preset)
		onFrozen?.(preset)
		onOpenChange(false)
		setNotes("")
		setPresetIdOverride(null)
	}, [
		run,
		gates.passes,
		presetId,
		sourcePresetId,
		notes,
		onFrozen,
		onOpenChange,
	])

	if (!run) {
		return null
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent id="freeze-hero-modal" className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("title")}</DialogTitle>
					<DialogDescription>{t("subtitle")}</DialogDescription>
				</DialogHeader>

				<div className="space-y-s-300 py-s-200">
					<section>
						<h4 className="text-small text-txt-200 mb-s-100 font-medium">
							{t("gatesTitle")}
						</h4>
						<ul className="space-y-s-100">
							<li className="text-tiny gap-s-200 flex items-center">
								<Badge
									id="freeze-gate-pf"
									variant="outline"
									className={
										run.summary.profitFactor >= HERO_WIN_RULES.minProfitFactor
											? "border-trade-buy text-trade-buy"
											: "border-fb-error text-fb-error"
									}
								>
									{run.summary.profitFactor >= HERO_WIN_RULES.minProfitFactor
										? "✓"
										: "✗"}
								</Badge>
								<span className="text-txt-300">
									{t("ruleMinPF", {
										min: HERO_WIN_RULES.minProfitFactor,
										actual: run.summary.profitFactor.toFixed(2),
									})}
								</span>
							</li>
							<li className="text-tiny gap-s-200 flex items-center">
								<Badge
									id="freeze-gate-robust"
									variant="outline"
									className={
										run.oosRobust === true
											? "border-trade-buy text-trade-buy"
											: "border-fb-error text-fb-error"
									}
								>
									{run.oosRobust === true ? "✓" : "✗"}
								</Badge>
								<span className="text-txt-300">{t("ruleRobust")}</span>
							</li>
							<li className="text-tiny gap-s-200 flex items-center">
								<Badge
									id="freeze-gate-trades"
									variant="outline"
									className={
										run.summary.totalTrades >= HERO_WIN_RULES.minTrades
											? "border-trade-buy text-trade-buy"
											: "border-fb-error text-fb-error"
									}
								>
									{run.summary.totalTrades >= HERO_WIN_RULES.minTrades
										? "✓"
										: "✗"}
								</Badge>
								<span className="text-txt-300">
									{t("ruleMinTrades", {
										min: HERO_WIN_RULES.minTrades,
										actual: run.summary.totalTrades,
									})}
								</span>
							</li>
						</ul>
					</section>

					<section>
						<h4 className="text-small text-txt-200 mb-s-100 font-medium">
							{t("metricsTitle")}
						</h4>
						<dl className="text-tiny grid grid-cols-2 gap-x-3 gap-y-1">
							<dt className="text-txt-300">{t("metricPF")}</dt>
							<dd className="text-txt-100 font-mono">
								{run.summary.profitFactor.toFixed(2)}
								{run.summaryOOS
									? ` / ${run.summaryOOS.profitFactor.toFixed(2)} ${t("oosSuffix")}`
									: ""}
							</dd>
							<dt className="text-txt-300">{t("metricDD")}</dt>
							<dd className="text-trade-sell font-mono">
								{formatCentsAsCurrency(run.summary.maxDrawdownCents, "BRL")}
							</dd>
							<dt className="text-txt-300">{t("metricTrades")}</dt>
							<dd className="text-txt-100 font-mono">
								{run.summary.totalTrades}
							</dd>
							<dt className="text-txt-300">{t("metricWinRate")}</dt>
							<dd className="text-txt-100 font-mono">
								{run.summary.winRate.toFixed(1)}%
							</dd>
						</dl>
					</section>

					<section className="space-y-s-100">
						<label
							className="text-small text-txt-200 block font-medium"
							htmlFor="freeze-preset-id"
						>
							{t("presetIdLabel")}
						</label>
						<input
							id="freeze-preset-id"
							type="text"
							value={presetId}
							onChange={(e) => setPresetIdOverride(e.target.value)}
							className="border-bg-300 bg-bg-100 text-small text-txt-100 w-full rounded-sm border px-2 py-1"
						/>
					</section>

					<section className="space-y-s-100">
						<label
							className="text-small text-txt-200 block font-medium"
							htmlFor="freeze-notes"
						>
							{t("notesLabel")}
						</label>
						<textarea
							id="freeze-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={3}
							className="border-bg-300 bg-bg-100 text-small text-txt-100 w-full rounded-sm border px-2 py-1"
							placeholder={t("notesPlaceholder")}
						/>
					</section>
				</div>

				<DialogFooter>
					<Button
						id="freeze-cancel"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						{t("cancel")}
					</Button>
					<Button
						id="freeze-confirm"
						onClick={handleConfirm}
						disabled={!gates.passes || !presetId.trim()}
					>
						{t("confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export { FreezeHeroModal }
