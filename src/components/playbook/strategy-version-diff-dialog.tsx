"use client"

import { useState, useTransition, useMemo, useEffect } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Minus, Plus, RefreshCw } from "lucide-react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { getStrategyVersionDiff } from "@/app/actions/strategy-version-diff"
import type {
	DiffConditionEntry,
	StrategyVersionDiffData,
} from "@/app/actions/strategy-version-diff.types"
import type { StrategyVersionSummary } from "@/app/actions/strategies.types"

interface StrategyVersionDiffDialogProps {
	readonly strategyId: string
	readonly versions: readonly StrategyVersionSummary[]
	readonly open: boolean
	readonly onOpenChange: (_next: boolean) => void
}

type DiffStatus = "added" | "removed" | "tier-changed" | "unchanged"

function getDiffStatus(entry: DiffConditionEntry): DiffStatus {
	if (entry.tierA === null) {
		return "added"
	}
	if (entry.tierB === null) {
		return "removed"
	}
	if (entry.tierA !== entry.tierB) {
		return "tier-changed"
	}
	return "unchanged"
}

const STATUS_CONFIG = {
	"added": {
		rowClass: "bg-fb-success/5 border-fb-success/20",
		badgeClass: "text-fb-success bg-fb-success/10",
		Icon: Plus,
		labelKey: "diff.statusAdded" as const,
	},
	"removed": {
		rowClass: "bg-fb-error/5 border-fb-error/20",
		badgeClass: "text-fb-error bg-fb-error/10",
		Icon: Minus,
		labelKey: "diff.statusRemoved" as const,
	},
	"tier-changed": {
		rowClass: "bg-acc-100/5 border-acc-100/20",
		badgeClass: "text-acc-100 bg-acc-100/10",
		Icon: RefreshCw,
		labelKey: "diff.statusTierChanged" as const,
	},
	"unchanged": {
		rowClass: "border-transparent",
		badgeClass: "text-txt-300 bg-bg-300",
		Icon: Minus,
		labelKey: "diff.statusUnchanged" as const,
	},
}

function DiffRow({
	entry,
	t,
}: {
	entry: DiffConditionEntry
	t: ReturnType<typeof useTranslations<"playbook.versioning">>
}) {
	const status = getDiffStatus(entry)
	const config = STATUS_CONFIG[status]
	const Icon = config.Icon

	return (
		<div
			className={cn(
				"gap-s-300 grid grid-cols-[1fr_auto_auto_auto] items-center",
				"px-s-300 py-s-200 text-small rounded-md border",
				config.rowClass
			)}
		>
			<span className="text-txt-100 truncate">{entry.conditionName}</span>
			<span
				className={cn(
					"gap-s-100 px-s-200 py-s-100 text-tiny inline-flex items-center rounded-full font-medium",
					config.badgeClass
				)}
				aria-label={t(config.labelKey)}
			>
				<Icon className="h-3 w-3" aria-hidden="true" />
				{t(config.labelKey)}
			</span>
			<span className="text-txt-300 text-tiny w-14 text-center tabular-nums">
				{entry.tierA ?? "—"}
			</span>
			<span className="text-txt-300 text-tiny w-14 text-center tabular-nums">
				{entry.tierB ?? "—"}
			</span>
		</div>
	)
}

function groupByCategory(
	conditions: DiffConditionEntry[]
): Map<string, DiffConditionEntry[]> {
	const map = new Map<string, DiffConditionEntry[]>()
	for (const c of conditions) {
		const group = map.get(c.category) ?? []
		group.push(c)
		map.set(c.category, group)
	}
	return map
}

const StrategyVersionDiffDialog = ({
	strategyId,
	versions,
	open,
	onOpenChange,
}: StrategyVersionDiffDialogProps) => {
	const t = useTranslations("playbook.versioning")
	const locale = useLocale()
	const [isPending, startTransition] = useTransition()
	const [diffData, setDiffData] = useState<StrategyVersionDiffData | null>(null)
	const [error, setError] = useState<string | null>(null)

	const sortedVersions = useMemo(
		() => [...versions].sort((a, b) => b.version - a.version),
		[versions]
	)

	const [versionAId, setVersionAId] = useState<string>(
		() => sortedVersions[1]?.id ?? sortedVersions[0]?.id ?? ""
	)
	const [versionBId, setVersionBId] = useState<string>(
		() => sortedVersions[0]?.id ?? ""
	)

	const dateFormatter = useMemo(
		() => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }),
		[locale]
	)

	const formatVersionLabel = (v: StrategyVersionSummary): string => {
		const base = `v${v.version}`
		if (v.label) {
			return `${base} · ${v.label}`
		}
		return `${base} · ${dateFormatter.format(new Date(v.createdAt))}`
	}

	useEffect(() => {
		if (!open || !versionAId || !versionBId || versionAId === versionBId) {
			return
		}
		setError(null)
		startTransition(async () => {
			const result = await getStrategyVersionDiff(
				strategyId,
				versionAId,
				versionBId
			)
			if (result.status === "success") {
				setDiffData(result.data ?? null)
			} else {
				setError(result.message)
				setDiffData(null)
			}
		})
	}, [strategyId, versionAId, versionBId, open])

	const grouped = useMemo(
		() => (diffData ? groupByCategory(diffData.conditions) : null),
		[diffData]
	)

	const summaryStats = useMemo(() => {
		if (!diffData) {
			return null
		}
		const added = diffData.conditions.filter(
			(c) => getDiffStatus(c) === "added"
		).length
		const removed = diffData.conditions.filter(
			(c) => getDiffStatus(c) === "removed"
		).length
		const modified = diffData.conditions.filter(
			(c) => getDiffStatus(c) === "tier-changed"
		).length
		return { added, removed, modified }
	}, [diffData])

	const sameVersionSelected = versionAId === versionBId

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent id="strategy-version-diff-dialog" className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("diff.title")}</DialogTitle>
					<DialogDescription>{t("diff.description")}</DialogDescription>
				</DialogHeader>

				<div className="gap-s-300 flex items-center">
					<div className="flex-1">
						<label className="text-tiny text-txt-300 mb-s-100 block font-medium">
							{t("diff.versionALabel")}
						</label>
						<Select value={versionAId} onValueChange={setVersionAId}>
							<SelectTrigger
								id="strategy-version-diff-select-a"
								className="w-full"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{sortedVersions.map((v) => (
									<SelectItem key={v.id} value={v.id}>
										{formatVersionLabel(v)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<span className="text-txt-300 mt-m-500 text-small">→</span>
					<div className="flex-1">
						<label className="text-tiny text-txt-300 mb-s-100 block font-medium">
							{t("diff.versionBLabel")}
						</label>
						<Select value={versionBId} onValueChange={setVersionBId}>
							<SelectTrigger
								id="strategy-version-diff-select-b"
								className="w-full"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{sortedVersions.map((v) => (
									<SelectItem key={v.id} value={v.id}>
										{formatVersionLabel(v)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				{sameVersionSelected ? (
					<p className="text-txt-300 text-small py-m-400 text-center">
						{t("diff.sameVersion")}
					</p>
				) : isPending ? (
					<div className="py-m-400 text-center">
						<span className="text-txt-300 text-small">{t("diff.loading")}</span>
					</div>
				) : error ? (
					<p className="text-fb-error text-small py-m-400 text-center">
						{error}
					</p>
				) : grouped ? (
					<div className="gap-m-400 flex max-h-[400px] flex-col overflow-y-auto">
						{summaryStats &&
						(summaryStats.added > 0 ||
							summaryStats.removed > 0 ||
							summaryStats.modified > 0) ? (
							<div className="gap-s-300 text-tiny text-txt-300 flex items-center">
								{summaryStats.added > 0 && (
									<span className="text-fb-success">
										{t("diff.summaryAdded", { count: summaryStats.added })}
									</span>
								)}
								{summaryStats.removed > 0 && (
									<span className="text-fb-error">
										{t("diff.summaryRemoved", { count: summaryStats.removed })}
									</span>
								)}
								{summaryStats.modified > 0 && (
									<span className="text-acc-100">
										{t("diff.summaryModified", {
											count: summaryStats.modified,
										})}
									</span>
								)}
							</div>
						) : (
							<p className="text-txt-300 text-small text-center">
								{t("diff.noChanges")}
							</p>
						)}

						<div className="gap-s-100 pr-s-100 flex flex-col">
							<div className="gap-s-300 px-s-300 text-tiny text-txt-300 grid grid-cols-[1fr_auto_auto_auto] font-medium">
								<span>{t("diff.colCondition")}</span>
								<span>{t("diff.colStatus")}</span>
								<span className="w-14 text-center">{t("diff.colTierA")}</span>
								<span className="w-14 text-center">{t("diff.colTierB")}</span>
							</div>
							{[...grouped.entries()].map(([category, conditions]) => (
								<div key={category} className="gap-s-100 flex flex-col">
									<span className="text-tiny text-txt-300 px-s-300 pt-s-200 font-medium tracking-wide uppercase">
										{category}
									</span>
									{conditions.map((entry) => (
										<DiffRow key={entry.conditionId} entry={entry} t={t} />
									))}
								</div>
							))}
						</div>
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	)
}

export { StrategyVersionDiffDialog }
