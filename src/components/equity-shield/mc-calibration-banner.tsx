"use client"

import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Dices, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCompactCurrency } from "@/lib/formatting"
import {
	suggestSmaPeriod,
	suggestMddMultiplier,
	suggestDrawdownLimitCents,
} from "@/lib/mc-calibration"
import { fromCents } from "@/lib/money"
import type { MCCalibrationSnapshot } from "@/types/mc-calibration"
import type { EquityShieldParams } from "@/types/equity-shield"

// ==========================================
// TYPES
// ==========================================

interface MCCalibrationBannerProps {
	snapshot: MCCalibrationSnapshot
	params: EquityShieldParams
	onParamsChange: (_params: EquityShieldParams) => void
	onDismiss: () => void
}

interface SuggestionRow {
	key: string
	label: string
	hint: string
	suggestedValue: number
	displayValue: string
	paramField: keyof EquityShieldParams
}

// ==========================================
// HELPERS
// ==========================================

const getTimestampLabel = (
	timestamp: number,
	tAge: (_key: string, _values?: Record<string, string | number>) => string,
	tAgeNow: string
): string => {
	const minutes = Math.round((Date.now() - timestamp) / 60000)
	if (minutes < 1) {
		return tAgeNow
	}
	return tAge("age", { minutes })
}

type ConfidenceLevel = "robust" | "moderate" | "weak"

const getV1Confidence = (profitablePct: number): ConfidenceLevel => {
	if (profitablePct >= 70) {
		return "robust"
	}
	if (profitablePct >= 50) {
		return "moderate"
	}
	return "weak"
}

const getV2Confidence = (riskOfRuinPercent: number): ConfidenceLevel => {
	if (riskOfRuinPercent <= 5) {
		return "robust"
	}
	if (riskOfRuinPercent <= 20) {
		return "moderate"
	}
	return "weak"
}

const confidenceColor: Record<ConfidenceLevel, string> = {
	robust: "text-fb-success",
	moderate: "text-warning",
	weak: "text-fb-error",
}

// ==========================================
// COMPONENT
// ==========================================

const MCCalibrationBanner = ({
	snapshot,
	params,
	onParamsChange,
	onDismiss,
}: MCCalibrationBannerProps) => {
	const t = useTranslations("equityShield.calibration")
	const [appliedFields, setAppliedFields] = useState<Set<string>>(new Set())

	// Build suggestion rows based on snapshot version
	const suggestions = useMemo<SuggestionRow[]>(() => {
		const rows: SuggestionRow[] = []

		if (snapshot.version === "v1") {
			if (snapshot.expectedMaxLossStreak !== undefined) {
				const suggested = suggestSmaPeriod(snapshot.expectedMaxLossStreak)
				rows.push({
					key: "smaPeriod",
					label: t("smaPeriod"),
					hint: t("smaPeriodHint", {
						streak: snapshot.expectedMaxLossStreak.toFixed(1),
					}),
					suggestedValue: suggested,
					displayValue: String(suggested),
					paramField: "smaPeriod",
				})
			}

			if (
				snapshot.worstMaxRDrawdown !== undefined &&
				snapshot.medianMaxRDrawdown !== undefined
			) {
				const suggested = suggestMddMultiplier(
					snapshot.worstMaxRDrawdown,
					snapshot.medianMaxRDrawdown
				)
				rows.push({
					key: "mddMultiplier",
					label: t("mddMultiplier"),
					hint: t("mddMultiplierHint"),
					suggestedValue: suggested,
					displayValue: `${suggested}x`,
					paramField: "mddMultiplier",
				})
			}
		}

		if (snapshot.version === "v2") {
			if (
				snapshot.worstMaxDrawdownPercent !== undefined &&
				snapshot.initialBalanceCents !== undefined
			) {
				const suggested = suggestDrawdownLimitCents(
					snapshot.worstMaxDrawdownPercent,
					params.initialBalanceCents
				)
				rows.push({
					key: "drawdownLimitCents",
					label: t("drawdownLimit"),
					hint: t("drawdownLimitHint", {
						pct: snapshot.worstMaxDrawdownPercent.toFixed(1),
					}),
					suggestedValue: suggested,
					displayValue: formatCompactCurrency(fromCents(suggested), "R$"),
					paramField: "drawdownLimitCents",
				})
			}
		}

		return rows
	}, [snapshot, params.initialBalanceCents, t])

	const handleApply = (row: SuggestionRow) => {
		onParamsChange({ ...params, [row.paramField]: row.suggestedValue })
		setAppliedFields((prev) => new Set(prev).add(row.key))
		setTimeout(() => {
			setAppliedFields((prev) => {
				const next = new Set(prev)
				next.delete(row.key)
				return next
			})
		}, 1500)
	}

	const handleApplyAll = () => {
		const updates = suggestions.reduce<Partial<EquityShieldParams>>(
			(acc, row) => ({ ...acc, [row.paramField]: row.suggestedValue }),
			{}
		)
		onParamsChange({ ...params, ...updates })
		const allKeys = new Set(suggestions.map((r) => r.key))
		setAppliedFields(allKeys)
		setTimeout(() => setAppliedFields(new Set()), 1500)
	}

	// Confidence indicator
	const confidenceLevel =
		snapshot.version === "v1" && snapshot.profitablePct !== undefined
			? getV1Confidence(snapshot.profitablePct)
			: snapshot.version === "v2" && snapshot.riskOfRuinPercent !== undefined
				? getV2Confidence(snapshot.riskOfRuinPercent)
				: null

	const confidenceText =
		snapshot.version === "v1" && snapshot.profitablePct !== undefined
			? t("profitablePct", { value: snapshot.profitablePct.toFixed(1) })
			: snapshot.version === "v2" && snapshot.riskOfRuinPercent !== undefined
				? t("riskOfRuin", { value: snapshot.riskOfRuinPercent.toFixed(1) })
				: null

	const versionLabel = snapshot.version === "v1" ? t("titleV1") : t("titleV2")

	const timestampLabel = getTimestampLabel(snapshot.timestamp, t, t("ageNow"))

	if (suggestions.length === 0) {
		return null
	}

	return (
		<div className="border-acc-100/30 bg-acc-100/5 space-y-s-300 p-s-300 sm:p-m-400 rounded-lg border">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="gap-s-200 flex items-center">
					<Dices className="text-acc-100 h-5 w-5" aria-hidden="true" />
					<h3 className="text-small text-txt-100 font-semibold">
						{t("title")}
					</h3>
					<Badge
						id="mc-version-badge"
						variant="outline"
						className="text-acc-100 border-acc-100/30 text-tiny"
					>
						{versionLabel}
					</Badge>
					<span className="text-tiny text-txt-300">{timestampLabel}</span>
				</div>
				<button
					type="button"
					onClick={onDismiss}
					className="text-txt-300 hover:text-txt-100 p-s-100 transition-colors"
					aria-label={t("clear")}
					tabIndex={0}
				>
					<X className="h-4 w-4" aria-hidden="true" />
				</button>
			</div>

			<p className="text-tiny text-txt-300">{t("subtitle")}</p>

			{/* Confidence indicator */}
			{confidenceLevel && confidenceText && (
				<div className="gap-s-200 flex items-center">
					<span className="text-tiny text-txt-300">{t("confidence")}:</span>
					<span
						className={`text-tiny font-medium ${confidenceColor[confidenceLevel]}`}
					>
						{confidenceText}
					</span>
				</div>
			)}

			{/* Suggestion rows */}
			<div className="space-y-s-200">
				{suggestions.map((row) => {
					const isApplied = appliedFields.has(row.key)
					return (
						<div
							key={row.key}
							className="bg-bg-100/50 p-s-200 sm:p-s-300 flex items-center justify-between rounded-md"
						>
							<div className="space-y-0.5">
								<div className="gap-s-200 flex items-center">
									<span className="text-small text-txt-100 font-medium">
										{row.label}
									</span>
									<span className="text-small text-acc-100 font-semibold">
										{row.displayValue}
									</span>
								</div>
								<p className="text-tiny text-txt-300">{row.hint}</p>
							</div>
							<Button
								id={`apply-${row.key}`}
								variant="outline"
								size="sm"
								onClick={() => handleApply(row)}
								disabled={isApplied}
								className="gap-s-100 shrink-0"
								aria-label={`${t("apply")} ${row.label}`}
							>
								{isApplied ? (
									<>
										<Check className="h-3 w-3" aria-hidden="true" />
									</>
								) : (
									t("apply")
								)}
							</Button>
						</div>
					)
				})}
			</div>

			{/* Apply All */}
			{suggestions.length > 1 && (
				<div className="flex justify-end">
					<Button
						id="apply-all-mc-suggestions"
						variant="default"
						size="sm"
						onClick={handleApplyAll}
						className="gap-s-200"
						aria-label={t("applyAll")}
					>
						{t("applyAll")}
					</Button>
				</div>
			)}
		</div>
	)
}

export { MCCalibrationBanner }
