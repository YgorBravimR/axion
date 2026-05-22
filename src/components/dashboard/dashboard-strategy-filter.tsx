"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { X } from "lucide-react"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { SegmentedToggle } from "@/components/ui/segmented-toggle"
import { Button } from "@/components/ui/button"
import { listStrategyFilterOptions } from "@/app/actions/strategies"
import type { StrategyFilterOption } from "@/app/actions/strategies.types"

export interface DashboardStrategyFilterValue {
	readonly strategyId: string | null
	readonly strategyVersionId: string | null
}

interface DashboardStrategyFilterProps {
	readonly value: DashboardStrategyFilterValue
	readonly onChange: (_next: DashboardStrategyFilterValue) => void
	readonly disabled?: boolean
}

const NO_STRATEGY = "__none__"
const ALL_VERSIONS = "__all__"

/**
 * Dashboard cohort filter — picks a single strategy (or none) plus an optional
 * version cohort within that strategy. Versioning v1 ships single-strategy
 * filtering; multi-strategy comparison is deferred to v2.
 *
 * Empty state (no strategy selected) renders only the strategy selector — the
 * dashboard stays visually unchanged for users who haven't opted into cohort
 * splitting. Once a strategy with 2+ versions is picked, a secondary
 * SegmentedToggle appears with "All / v1 / v2 / …" to switch the cohort.
 */
const DashboardStrategyFilter = ({
	value,
	onChange,
	disabled,
}: DashboardStrategyFilterProps) => {
	const t = useTranslations("dashboard.strategyFilter")
	const [options, setOptions] = useState<readonly StrategyFilterOption[]>([])
	const [isLoading, setIsLoading] = useState<boolean>(true)

	useEffect(() => {
		let cancelled = false
		void (async () => {
			const result = await listStrategyFilterOptions()
			if (cancelled) {
				return
			}
			if (result.status === "success" && result.data) {
				setOptions(result.data)
			}
			setIsLoading(false)
		})()
		return () => {
			cancelled = true
		}
	}, [])

	const selectedStrategy = useMemo(
		() => options.find((s) => s.id === value.strategyId) ?? null,
		[options, value.strategyId]
	)

	// When the picked strategy disappears from the option set (e.g. archived
	// in another tab), drop the filter so the dashboard doesn't render with a
	// stale strategy id that no longer matches any trade.

	useEffect(() => {
		if (value.strategyId && options.length > 0 && !selectedStrategy) {
			onChange({ strategyId: null, strategyVersionId: null })
		}
	}, [options.length, selectedStrategy, value.strategyId])

	const handleStrategyChange = (strategyId: string): void => {
		if (strategyId === NO_STRATEGY) {
			onChange({ strategyId: null, strategyVersionId: null })
			return
		}
		// Picking a new strategy resets the version cohort to "all versions".
		onChange({ strategyId, strategyVersionId: null })
	}

	const handleVersionChange = (versionKey: string): void => {
		if (versionKey === ALL_VERSIONS) {
			onChange({ strategyId: value.strategyId, strategyVersionId: null })
			return
		}
		onChange({ strategyId: value.strategyId, strategyVersionId: versionKey })
	}

	const handleClear = (): void => {
		onChange({ strategyId: null, strategyVersionId: null })
	}

	const versionOptions = useMemo(() => {
		if (!selectedStrategy) {
			return []
		}
		// Versions arrive newest-first from the server. Render
		// "All / vN / vN-1 / …" so the highest version sits next to "All".
		const sorted = [...selectedStrategy.versions].sort(
			(a, b) => b.version - a.version
		)
		return [
			{ value: ALL_VERSIONS, label: t("allVersions") },
			...sorted.map((v) => ({
				value: v.id,
				label: t("versionLabel", { version: v.version }),
			})),
		]
	}, [selectedStrategy, t])

	const segmentValue = value.strategyVersionId ?? ALL_VERSIONS

	return (
		<div
			id="dashboard-strategy-filter"
			className="gap-s-200 flex flex-wrap items-center"
		>
			<Select
				value={value.strategyId ?? NO_STRATEGY}
				onValueChange={handleStrategyChange}
				disabled={disabled || isLoading}
			>
				<SelectTrigger
					id="dashboard-strategy-filter-trigger"
					className="min-w-[12rem]"
					aria-label={t("strategySelectAriaLabel")}
				>
					<SelectValue placeholder={t("strategyPlaceholder")} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NO_STRATEGY}>{t("allStrategies")}</SelectItem>
					{options.map((option) => (
						<SelectItem key={option.id} value={option.id}>
							{option.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{selectedStrategy && selectedStrategy.versions.length > 1 ? (
				<SegmentedToggle
					value={segmentValue}
					options={versionOptions}
					onChange={handleVersionChange}
					disabled={disabled}
					aria-label={t("versionSegmentAriaLabel", {
						name: selectedStrategy.name,
					})}
				/>
			) : null}

			{selectedStrategy ? (
				<Button
					id="dashboard-strategy-filter-clear"
					type="button"
					variant="ghost"
					size="sm"
					onClick={handleClear}
					disabled={disabled}
					aria-label={t("clearAriaLabel")}
					className="gap-s-200 inline-flex items-center"
				>
					<X className="h-3.5 w-3.5" aria-hidden="true" />
					{t("clear")}
				</Button>
			) : null}
		</div>
	)
}

export { DashboardStrategyFilter }
