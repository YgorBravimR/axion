"use client"

import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertCircle } from "lucide-react"
import type { EnrichmentDelta } from "@/lib/enrichment/types"
import { EnrichFieldRow } from "./enrich-field-row"

interface EnrichPassCardProps {
	passName:
		| "operations"
		| "candleMath"
		| "indicatorReadout"
		| "deterministicSlTarget"
	delta: EnrichmentDelta
	baseline: Record<string, unknown>
	acceptedFields: Set<string>
	rejectedFields: Set<string>
	onToggleField: (
		_field: string,
		_state: "accepted" | "rejected" | "neither"
	) => void
}

const getConfidenceBadgeVariant = (
	confidence: string
): "default" | "secondary" | "destructive" | "outline" => {
	switch (confidence) {
		case "high":
			return "default"
		case "medium":
			return "secondary"
		case "low":
			return "destructive"
		default:
			return "outline"
	}
}

export const EnrichPassCard = ({
	passName,
	delta,
	baseline,
	acceptedFields,
	rejectedFields,
	onToggleField,
}: EnrichPassCardProps) => {
	const t = useTranslations()

	const passNameLabel = t(`journal.enrichment.passNames.${passName}`)

	// Determine highest confidence level across all fields
	const highestConfidence = Object.values(delta.fields).reduce(
		(max: "high" | "medium" | "low", field) => {
			const order = { high: 3, medium: 2, low: 1 }
			return order[field.confidence] >= order[max] ? field.confidence : max
		},
		"low" as const
	)

	const passIsSkipped = delta.passStatus === "skipped"
	const passIsFailed = delta.passStatus === "failed"
	const fieldCount = Object.keys(delta.fields).length
	// A pass can succeed with zero fields when every enrichment field already
	// matches the current trade (e.g. CSV pass finds no diffs because the user
	// entered the canonical numbers manually). Render a clear "no changes"
	// state instead of an empty card with accept/reject buttons.
	const passSucceededWithNoChanges =
		delta.passStatus === "succeeded" && fieldCount === 0

	const handleAcceptAll = () => {
		for (const [fieldName, field] of Object.entries(delta.fields)) {
			// Only auto-accept high-confidence, non-conflicting fields
			if (field.confidence === "high" && !field.conflictsWithCurrent) {
				onToggleField(fieldName, "accepted")
			}
		}
	}

	const handleRejectAll = () => {
		for (const fieldName of Object.keys(delta.fields)) {
			onToggleField(fieldName, "neither")
		}
	}

	return (
		<Card id={`pass-${passName}`}>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="gap-s-200 flex items-center">
						<CardTitle>{passNameLabel}</CardTitle>
						<Badge
							id={`confidence-${passName}`}
							variant={getConfidenceBadgeVariant(highestConfidence)}
						>
							{t(`journal.enrichment.confidence.${highestConfidence}`)}
						</Badge>
					</div>
				</div>

				{/* Pass status indicators */}
				{passIsSkipped && (
					<div className="mt-s-200 px-s-300 py-s-200 bg-bg-300 text-txt-200 text-small rounded-sm">
						{t(`journal.enrichment.passStatus.skipped`, {
							reason: delta.skipReason || "unknown",
						})}
					</div>
				)}

				{passIsFailed && (
					<div
						className="mt-s-200 px-s-300 py-s-200 text-small gap-s-200 flex items-start rounded-sm"
						style={{
							backgroundColor:
								"color-mix(in srgb, var(--color-fb-error) 15%, transparent)",
							borderWidth: "1px",
							borderColor: "var(--color-fb-error)",
							color: "var(--color-fb-error)",
						}}
					>
						<AlertCircle className="mt-[2px] size-4 shrink-0" />
						<span>
							{t(`journal.enrichment.passStatus.failed`, {
								error: delta.errorMessage || "unknown error",
							})}
						</span>
					</div>
				)}

				{passSucceededWithNoChanges && (
					<div className="mt-s-200 px-s-300 py-s-200 bg-acc-100/10 text-acc-100 text-small rounded-sm">
						{t("journal.enrichment.passStatus.noChanges")}
					</div>
				)}
			</CardHeader>

			{!passIsSkipped && !passIsFailed && !passSucceededWithNoChanges && (
				<>
					<CardContent className="space-y-s-200">
						{Object.entries(delta.fields).map(([fieldName, field]) => {
							const baselineValue = baseline[fieldName]
							const fieldState = acceptedFields.has(fieldName)
								? ("accepted" as const)
								: rejectedFields.has(fieldName)
									? ("rejected" as const)
									: ("neither" as const)

							return (
								<EnrichFieldRow
									key={fieldName}
									fieldName={fieldName}
									field={field}
									baselineValue={baselineValue}
									state={fieldState}
									onToggle={(newState) => onToggleField(fieldName, newState)}
								/>
							)
						})}
					</CardContent>

					<div className="px-m-400 py-m-400 sm:px-m-500 sm:py-m-500 lg:px-m-600 lg:py-m-600 border-bg-300 gap-s-200 flex border-t">
						<Button
							id={`accept-all-${passName}`}
							variant="outline"
							size="sm"
							onClick={handleAcceptAll}
						>
							{t("journal.enrichment.passActions.acceptAll")}
						</Button>
						<Button
							id={`reject-all-${passName}`}
							variant="outline"
							size="sm"
							onClick={handleRejectAll}
						>
							{t("journal.enrichment.passActions.rejectAll")}
						</Button>
					</div>
				</>
			)}
		</Card>
	)
}
