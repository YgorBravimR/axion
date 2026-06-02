"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Sparkles, Unlock, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import {
	diagnoseSweepAxes,
	countByStatus,
	groupLockedByOwner,
	type SweepAxisDiagnosis,
} from "@/lib/optimize/sweep-diagnosis"
import {
	hasRemediation,
	remediateAll,
	remediateForReason,
} from "@/lib/optimize/validator-remediation"
import type {
	LeafGroupValidator,
	LeafSelection,
	SweepableLeaf,
} from "@/lib/optimize/sweep-leaf"
import { useFormatting } from "@/hooks/use-formatting"

interface ValidatorBreakdown {
	raw: number
	valid: number
	droppedByReason: Map<string, number>
}

interface SweepAxisDiagnosticsProps {
	leaves: SweepableLeaf[]
	selections: Map<string, LeafSelection>
	/**
	 * Cardinality breakdown from the grid generator. When present and
	 * `valid < raw`, the component surfaces per-validator drop counts so
	 * the user understands WHY combos vanished after the per-axis math.
	 */
	breakdown?: ValidatorBreakdown
	/**
	 * Validators carry `paths` — when a reason in `breakdown` has paths
	 * matching a swept axis, that axis gets a ⚠ flag so the user knows
	 * which axes are causing the drop. Pass the same list the grid
	 * generator uses; safe to omit if you don't want flagging.
	 */
	validators?: LeafGroupValidator[]
	/** Optional remediation hook — when provided, locked-owner CTAs render. */
	onSelectionsChange?: (_next: Map<string, LeafSelection>) => void
}

const statusClass: Record<SweepAxisDiagnosis["status"], string> = {
	active: "text-fb-success",
	locked: "text-warning",
	gated: "text-txt-300",
}

/**
 * The value we flip an owner to when remediating a locked group. The only
 * `managedBy` owner shipped today is the Hawks `qualityBundle` enum, whose
 * "custom" option is the documented escape hatch (see grid-conditional.ts).
 * If another owner type lands with a different unlock value, lift this to
 * leaf metadata.
 */
const UNLOCK_OWNER_VALUE = "custom"

const SweepAxisDiagnostics = ({
	leaves,
	selections,
	breakdown,
	validators,
	onSelectionsChange,
}: SweepAxisDiagnosticsProps) => {
	const t = useTranslations("optimize.sweepDiagnosis")
	const tLeaf = useTranslations("optimize.sweepLeaf")
	const tInvariant = useTranslations("optimize.invariants")
	const { formatNumber } = useFormatting()

	const diagnoses = diagnoseSweepAxes(leaves, selections)
	const counts = countByStatus(diagnoses)
	const leafByPath = useMemo(
		() => new Map(leaves.map((l) => [l.path, l])),
		[leaves]
	)
	const lockedGroups = groupLockedByOwner(diagnoses)

	// Map each leaf path → array of reasonKeys whose validator references it
	// AND is currently dropping combos. Used to mark axis rows with ⚠.
	const flaggedReasonsByPath = useMemo<Map<string, string[]>>(() => {
		const map = new Map<string, string[]>()
		if (!validators || !breakdown) {
			return map
		}
		for (const v of validators) {
			const droppedCount = breakdown.droppedByReason.get(v.reasonKey) ?? 0
			if (droppedCount === 0) {
				continue
			}
			for (const p of v.paths) {
				const list = map.get(p) ?? []
				list.push(v.reasonKey)
				map.set(p, list)
			}
		}
		return map
	}, [validators, breakdown])

	const droppingReasons = useMemo<string[]>(() => {
		if (!breakdown) {
			return []
		}
		return Array.from(breakdown.droppedByReason.keys())
	}, [breakdown])

	const fixableReasons = droppingReasons.filter(hasRemediation)

	if (diagnoses.length === 0) {
		return null
	}

	const handleUnlock = (ownerPath: string): void => {
		if (!onSelectionsChange) {
			return
		}
		const next = new Map(selections)
		next.set(ownerPath, { kind: "fixed", value: UNLOCK_OWNER_VALUE })
		onSelectionsChange(next)
	}

	const handleFix = (reasonKey: string): void => {
		if (!onSelectionsChange) {
			return
		}
		const next = remediateForReason(reasonKey, selections)
		if (next) {
			onSelectionsChange(next)
		}
	}

	const handleFixAll = (): void => {
		if (!onSelectionsChange || fixableReasons.length === 0) {
			return
		}
		onSelectionsChange(remediateAll(fixableReasons, selections))
	}

	return (
		<div className="border-bg-300 space-y-s-200 mt-s-200 pt-s-200 border-t">
			<div className="text-tiny text-txt-300 font-medium">
				{t("title", {
					active: counts.active,
					total: diagnoses.length,
				})}
			</div>
			<ul className="space-y-s-100 text-tiny">
				{diagnoses.map((d) => {
					const label = tLeaf(d.labelKey)
					const parentLeaf =
						d.status === "gated" && d.conditionParentPath
							? leafByPath.get(d.conditionParentPath)
							: undefined
					const detail =
						d.status === "active"
							? t("active", { count: d.valueCount ?? 0 })
							: d.status === "locked"
								? t("locked", { ownerValue: String(d.ownerValue ?? "") })
								: t("gated", {
										parent: parentLeaf
											? tLeaf(parentLeaf.labelKey)
											: (d.conditionParentPath ?? ""),
									})
					const flags = flaggedReasonsByPath.get(d.leafPath) ?? []
					const flagTitle =
						flags.length > 0
							? t("flagTooltip", {
									reasons: flags.map((r) => tInvariant(r)).join(", "),
								})
							: undefined
					return (
						<li
							key={d.leafPath}
							className="gap-s-200 flex items-baseline justify-between"
						>
							<span
								className="gap-s-100 text-txt-200 flex min-w-0 items-baseline"
								title={flagTitle}
							>
								{flags.length > 0 && (
									<AlertTriangle
										className="text-warning h-3 w-3 shrink-0 self-center"
										aria-hidden="true"
									/>
								)}
								<span className="truncate">{label}</span>
							</span>
							<span
								className={cn(
									"shrink-0 font-medium tabular-nums",
									statusClass[d.status]
								)}
							>
								{detail}
							</span>
						</li>
					)
				})}
			</ul>
			{breakdown && breakdown.raw > 0 && breakdown.valid < breakdown.raw && (
				<div className="border-warning/40 bg-warning/5 space-y-s-200 mt-s-200 p-s-200 rounded-md border">
					<div className="text-tiny text-warning font-medium">
						{t("dropsHeader", {
							dropped: breakdown.raw - breakdown.valid,
							raw: formatNumber(breakdown.raw),
						})}
					</div>
					<ul className="space-y-s-200 text-tiny">
						{Array.from(breakdown.droppedByReason.entries()).map(
							([reason, count]) => {
								const fixable = hasRemediation(reason)
								return (
									<li key={reason} className="space-y-s-100">
										<div className="gap-s-200 flex items-baseline justify-between">
											<span className="text-txt-200 truncate">
												{tInvariant(reason)}
											</span>
											<span className="text-warning shrink-0 font-medium tabular-nums">
												−{formatNumber(count)}
											</span>
										</div>
										{fixable && onSelectionsChange && (
											<Button
												id={`fix-${reason}`}
												type="button"
												size="sm"
												variant="outline"
												onClick={() => handleFix(reason)}
												className="gap-s-100 w-full"
											>
												<Wrench className="h-3 w-3" aria-hidden="true" />
												{t("fixReasonCta", {
													reason: tInvariant(reason),
												})}
											</Button>
										)}
									</li>
								)
							}
						)}
					</ul>
					{onSelectionsChange && fixableReasons.length >= 2 && (
						<Button
							id="fix-all-validators"
							type="button"
							size="sm"
							variant="default"
							onClick={handleFixAll}
							className="gap-s-100 mt-s-100 w-full"
						>
							<Sparkles className="h-3 w-3" aria-hidden="true" />
							{t("fixAllCta", { count: fixableReasons.length })}
						</Button>
					)}
				</div>
			)}
			{onSelectionsChange &&
				lockedGroups.map((group) => {
					const ownerLeaf = leafByPath.get(group.ownerPath)
					const ownerLabel = ownerLeaf
						? tLeaf(ownerLeaf.labelKey)
						: group.ownerPath
					return (
						<Button
							key={group.ownerPath}
							id={`unlock-${group.ownerPath}`}
							type="button"
							size="sm"
							variant="outline"
							onClick={() => handleUnlock(group.ownerPath)}
							className="gap-s-200 mt-s-200 w-full"
						>
							<Unlock className="h-3 w-3" aria-hidden="true" />
							{t("unlockCta", {
								count: group.leafPaths.length,
								owner: ownerLabel,
							})}
						</Button>
					)
				})}
		</div>
	)
}

export { SweepAxisDiagnostics }
