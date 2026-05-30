"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Unlock } from "lucide-react"
import { cn } from "@/lib/utils"
import {
	diagnoseSweepAxes,
	countByStatus,
	groupLockedByOwner,
	type SweepAxisDiagnosis,
} from "@/lib/optimize/sweep-diagnosis"
import type { LeafSelection, SweepableLeaf } from "@/lib/optimize/sweep-leaf"

interface SweepAxisDiagnosticsProps {
	leaves: SweepableLeaf[]
	selections: Map<string, LeafSelection>
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
	onSelectionsChange,
}: SweepAxisDiagnosticsProps) => {
	const t = useTranslations("optimize.sweepDiagnosis")
	const tLeaf = useTranslations("optimize.sweepLeaf")

	const diagnoses = diagnoseSweepAxes(leaves, selections)
	if (diagnoses.length === 0) {
		return null
	}
	const counts = countByStatus(diagnoses)
	const leafByPath = new Map(leaves.map((l) => [l.path, l]))
	const lockedGroups = groupLockedByOwner(diagnoses)

	const handleUnlock = (ownerPath: string): void => {
		if (!onSelectionsChange) {
			return
		}
		const next = new Map(selections)
		next.set(ownerPath, { kind: "fixed", value: UNLOCK_OWNER_VALUE })
		onSelectionsChange(next)
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
					return (
						<li
							key={d.leafPath}
							className="gap-s-200 flex items-baseline justify-between"
						>
							<span className="text-txt-200 truncate">{label}</span>
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
