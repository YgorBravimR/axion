"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import {
	diagnoseSweepAxes,
	countByStatus,
	type SweepAxisDiagnosis,
} from "@/lib/optimize/sweep-diagnosis"
import type { LeafSelection, SweepableLeaf } from "@/lib/optimize/sweep-leaf"

interface SweepAxisDiagnosticsProps {
	leaves: SweepableLeaf[]
	selections: Map<string, LeafSelection>
}

const statusClass: Record<SweepAxisDiagnosis["status"], string> = {
	active: "text-fb-success",
	locked: "text-warning",
	gated: "text-txt-300",
}

const SweepAxisDiagnostics = ({
	leaves,
	selections,
}: SweepAxisDiagnosticsProps) => {
	const t = useTranslations("optimize.sweepDiagnosis")
	const tLeaf = useTranslations("optimize.sweepLeaf")

	const diagnoses = diagnoseSweepAxes(leaves, selections)
	if (diagnoses.length === 0) {
		return null
	}
	const counts = countByStatus(diagnoses)
	const leafByPath = new Map(leaves.map((l) => [l.path, l]))

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
		</div>
	)
}

export { SweepAxisDiagnostics }
