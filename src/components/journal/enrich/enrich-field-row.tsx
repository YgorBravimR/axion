"use client"

import type { EnrichmentField } from "@/lib/enrichment/types"
import { useTranslations } from "next-intl"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { Check, X, Minus } from "lucide-react"

type IndicatorKey =
	| "gate15m"
	| "gate60m"
	| "macd"
	| "vwapD"
	| "vwapM"
	| "vwapW"
	| "ajuste"

const INDICATOR_KEYS: IndicatorKey[] = [
	"gate15m",
	"gate60m",
	"macd",
	"vwapD",
	"vwapM",
	"vwapW",
	"ajuste",
]

interface IndicatorSnapshotLike {
	direction?: "long" | "short"
	favorableCount?: number
	gate15m?: { favorable?: boolean; state?: string }
	gate60m?: { favorable?: boolean; state?: string }
	macd?: { favorable?: boolean; sign?: string; value?: number }
	vwapD?: { favorable?: boolean; side?: string; distance?: number }
	vwapM?: { favorable?: boolean; side?: string; distance?: number }
	vwapW?: { favorable?: boolean; side?: string; distance?: number }
	ajuste?: { favorable?: boolean; position?: string; distance?: number }
}

const isIndicatorSnapshot = (v: unknown): v is IndicatorSnapshotLike => {
	if (typeof v !== "object" || v === null) {
		return false
	}
	const obj = v as Record<string, unknown>
	return (
		typeof obj.favorableCount === "number" &&
		typeof obj.direction === "string" &&
		typeof obj.gate15m === "object"
	)
}

const formatIndicatorDetail = (
	key: IndicatorKey,
	snap: IndicatorSnapshotLike
): string | null => {
	const readout = snap[key]
	if (!readout || typeof readout !== "object") {
		return null
	}
	const r = readout as Record<string, unknown>
	if (key === "macd") {
		const sign = typeof r.sign === "string" ? r.sign : null
		const value = typeof r.value === "number" ? r.value.toFixed(2) : null
		return value ? `${sign ?? "?"} (${value})` : (sign ?? null)
	}
	if (key === "ajuste") {
		const pos = typeof r.position === "string" ? r.position : null
		const dist = typeof r.distance === "number" ? r.distance.toFixed(0) : null
		return dist ? `${pos ?? "?"} ${dist}pts` : (pos ?? null)
	}
	if (key === "gate15m" || key === "gate60m") {
		return typeof r.state === "string" ? r.state : null
	}
	// vwapD/M/W
	const side = typeof r.side === "string" ? r.side : null
	const dist = typeof r.distance === "number" ? r.distance.toFixed(0) : null
	return dist ? `${side ?? "?"} ${dist}pts` : (side ?? null)
}

interface EnrichFieldRowProps {
	fieldName: string
	field: EnrichmentField
	baselineValue: unknown
	state: "accepted" | "rejected" | "neither"
	onToggle: (_newState: "accepted" | "rejected" | "neither") => void
}

const formatDuration = (ms: number): string => {
	if (!Number.isFinite(ms) || ms < 0) {
		return "—"
	}
	const totalSeconds = Math.round(ms / 1000)
	const h = Math.floor(totalSeconds / 3600)
	const m = Math.floor((totalSeconds % 3600) / 60)
	const s = totalSeconds % 60
	if (h > 0) {
		return `${h}h ${m}min`
	}
	if (m > 0) {
		return `${m}min ${s}s`
	}
	return `${s}s`
}

// pnl + plannedRiskAmount are stored as integer CENTS — divide before format.
const CENTS_BRL_FIELDS = new Set(["pnl", "plannedRiskAmount"])
// mfe + mae are stored as BRL gross excursion (matches what csv-trade-card
// renders via formatCurrency). Render as currency without the /100 step.
const BRL_FIELDS = new Set(["mfe", "mae"])
// Raw asset prices — pt-BR thousand separator, no currency.
const PRICE_FIELDS = new Set([
	"entryPrice",
	"exitPrice",
	"stopLoss",
	"takeProfit",
])

const formatBRL = (brl: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(brl)

const formatPrice = (n: number): string =>
	new Intl.NumberFormat("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(n)

const formatValue = (fieldName: string, value: unknown): string => {
	if (value === null || value === undefined || value === "") {
		return "—"
	}

	const numeric =
		typeof value === "number"
			? value
			: typeof value === "string" &&
				  value.trim() !== "" &&
				  !isNaN(Number(value))
				? Number(value)
				: null

	if (numeric !== null) {
		if (fieldName === "holdingMs") {
			return formatDuration(numeric)
		}
		if (CENTS_BRL_FIELDS.has(fieldName)) {
			return formatBRL(numeric / 100)
		}
		if (BRL_FIELDS.has(fieldName)) {
			return formatBRL(numeric)
		}
		if (PRICE_FIELDS.has(fieldName)) {
			return formatPrice(numeric)
		}
		return formatPrice(numeric)
	}

	if (typeof value === "object" && value !== null) {
		const obj = value as Record<string, unknown>
		if (
			typeof obj.favorableCount === "number" &&
			typeof obj.direction === "string"
		) {
			return `${obj.favorableCount}/7 ${obj.direction}`
		}
		return JSON.stringify(value)
	}

	return typeof value === "string" ? value : JSON.stringify(value)
}

const getStateIcon = (state: "accepted" | "rejected" | "neither") => {
	if (state === "accepted") {
		return (
			<Check className="size-4" style={{ color: "var(--color-trade-buy)" }} />
		)
	}
	if (state === "rejected") {
		return <X className="size-4" style={{ color: "var(--color-fb-error)" }} />
	}
	return <span className="text-txt-300 text-small">⊘</span>
}

const getConfidenceBadgeStyle = (
	confidence: string
): { backgroundColor: string; color: string } => {
	switch (confidence) {
		case "high":
			return {
				backgroundColor: "var(--color-trade-buy)",
				color: "var(--color-bg-100)",
			}
		case "medium":
			return {
				backgroundColor: "var(--color-rule-paused)",
				color: "var(--color-bg-100)",
			}
		case "low":
			return {
				backgroundColor: "var(--color-fb-error)",
				color: "var(--color-bg-100)",
			}
		default:
			return {
				backgroundColor: "var(--color-bg-300)",
				color: "var(--color-txt-100)",
			}
	}
}

export const EnrichFieldRow = ({
	fieldName,
	field,
	baselineValue,
	state,
	onToggle,
}: EnrichFieldRowProps) => {
	const t = useTranslations()

	const cycleState = () => {
		const nextState =
			state === "neither"
				? "accepted"
				: state === "accepted"
					? "rejected"
					: "neither"
		onToggle(nextState)
	}

	const fieldLabel = t(`journal.enrichment.fieldNames.${fieldName}`)
	const currentValue = formatValue(fieldName, baselineValue)
	const proposedValue = formatValue(fieldName, field.value)

	const hasConflict = field.conflictsWithCurrent && baselineValue !== null

	const indicatorSnapshot =
		fieldName === "indicatorReadout" && isIndicatorSnapshot(field.value)
			? field.value
			: null

	const borderColor =
		state === "accepted"
			? "var(--color-trade-buy)"
			: state === "rejected"
				? "var(--color-fb-error)"
				: "var(--color-bg-300)"

	const backgroundColor =
		state === "accepted"
			? "color-mix(in srgb, var(--color-trade-buy) 10%, transparent)"
			: state === "rejected"
				? "color-mix(in srgb, var(--color-fb-error) 10%, transparent)"
				: "transparent"

	const conflictBackgroundColor =
		"color-mix(in srgb, var(--color-rule-paused) 15%, transparent)"

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					onClick={cycleState}
					style={{
						borderLeftColor: borderColor,
						backgroundColor,
					}}
					className="px-m-400 py-s-300 w-full border-l-4 text-left transition-colors hover:opacity-80"
				>
					<div className="gap-m-400 flex items-center justify-between">
						<div className="gap-s-100 flex flex-1 flex-col">
							<div className="gap-s-200 flex items-center">
								<span className="text-txt-100 font-medium">{fieldLabel}</span>
								<span
									className="text-micro px-s-200 rounded-full py-[2px] font-medium"
									style={getConfidenceBadgeStyle(field.confidence)}
								>
									{t(`journal.enrichment.confidence.${field.confidence}`)}
								</span>
							</div>
							{indicatorSnapshot ? (
								<div className="mt-s-200 gap-s-100 flex flex-col">
									<div className="text-tiny text-txt-300">
										{t("journal.enrichment.indicatorSummary", {
											count: indicatorSnapshot.favorableCount ?? 0,
										})}{" "}
										· {indicatorSnapshot.direction?.toUpperCase()}
									</div>
									<div className="gap-s-100 mt-s-100 flex flex-col">
										{INDICATOR_KEYS.map((key) => {
											const readout = indicatorSnapshot[key]
											const favorable =
												typeof readout === "object" &&
												readout !== null &&
												(readout as { favorable?: boolean }).favorable === true
											const detail = formatIndicatorDetail(
												key,
												indicatorSnapshot
											)
											return (
												<div
													key={key}
													className="gap-s-300 text-tiny flex items-center"
												>
													{favorable ? (
														<Check
															className="size-3 shrink-0"
															style={{ color: "var(--color-trade-buy)" }}
															aria-label={t(
																"journal.enrichment.indicatorFavorable"
															)}
														/>
													) : (
														<Minus
															className="text-txt-300 size-3 shrink-0"
															aria-label={t(
																"journal.enrichment.indicatorUnfavorable"
															)}
														/>
													)}
													<span
														className={
															favorable ? "text-txt-100" : "text-txt-300"
														}
													>
														{t(`journal.enrichment.indicatorLabels.${key}`)}
													</span>
													{detail && (
														<span className="text-txt-300 tabular-nums">
															{detail}
														</span>
													)}
												</div>
											)
										})}
									</div>
								</div>
							) : (
								<div className="text-small text-txt-200">
									{currentValue} →{" "}
									<span className="font-medium">{proposedValue}</span>
								</div>
							)}
							{hasConflict && (
								<div
									className="mt-s-100 px-s-200 text-tiny gap-s-100 flex items-center rounded-sm py-[2px]"
									style={{
										backgroundColor: conflictBackgroundColor,
										color: "var(--color-bg-100)",
									}}
								>
									⚠️ {t("journal.enrichment.fieldStates.conflict")}
								</div>
							)}
						</div>
						<div className="gap-s-200 flex items-center">
							{getStateIcon(state)}
						</div>
					</div>
				</button>
			</TooltipTrigger>
			{field.derivation && (
				<TooltipContent id={`tooltip-${fieldName}`}>
					<p className="text-tiny">{field.derivation}</p>
				</TooltipContent>
			)}
		</Tooltip>
	)
}
