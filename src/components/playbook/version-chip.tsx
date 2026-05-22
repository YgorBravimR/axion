"use client"

import { useRouter, usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { ChevronDown, Check } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { StrategyVersionSummary } from "@/app/actions/strategies.types"

interface VersionChipProps {
	readonly versions: readonly StrategyVersionSummary[]
	readonly selectedVersion: number
	readonly currentVersion: number
}

/**
 * Sticky chip in the strategy detail header that shows the version the user
 * is viewing, whether it's LIVE (= the strategy's currentVersion) or
 * HISTORICAL (a prior version pinned by trades), and — when multiple
 * versions exist — opens a dropdown to switch between them.
 *
 * Switching versions updates the URL query param `?v=<n>`. The detail page
 * server component reads it and re-renders. We deliberately don't push state
 * via React context — the URL is the source of truth so the view is
 * shareable and Back/Forward navigation works as expected.
 */
const VersionChip = ({
	versions,
	selectedVersion,
	currentVersion,
}: VersionChipProps) => {
	const t = useTranslations("playbook.versioning")
	const router = useRouter()
	const pathname = usePathname()
	const locale = useLocale()

	const isLive = selectedVersion === currentVersion
	const hasMultipleVersions = versions.length > 1

	const dateFormatter = new Intl.DateTimeFormat(locale, {
		month: "short",
		year: "numeric",
	})

	const handleSelect = (version: number): void => {
		if (version === selectedVersion) {
			return
		}
		const url =
			version === currentVersion ? pathname : `${pathname}?v=${version}`
		router.push(url)
	}

	const chipBody = (
		<>
			<span className="text-small text-txt-100 font-semibold tabular-nums">
				v{selectedVersion}
			</span>
			<span
				className={cn(
					"text-tiny px-s-200 py-s-100 rounded-full font-medium tracking-wide uppercase",
					isLive
						? "bg-acc-100/15 text-acc-100 border-acc-100/30 border"
						: "bg-bg-300 text-txt-300 border-bg-300 border"
				)}
			>
				{isLive ? t("badge.live") : t("badge.historical")}
			</span>
			{hasMultipleVersions ? (
				<ChevronDown className="text-txt-300 h-3.5 w-3.5" aria-hidden="true" />
			) : null}
		</>
	)

	if (!hasMultipleVersions) {
		return (
			<div
				id="strategy-version-chip-static"
				className="border-bg-300 bg-bg-200 gap-s-200 px-s-300 py-s-200 inline-flex items-center rounded-md border"
				aria-label={t("chip.ariaSingle", { version: selectedVersion })}
			>
				{chipBody}
			</div>
		)
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				id="strategy-version-chip-trigger"
				className={cn(
					"border-bg-300 bg-bg-200 hover:bg-bg-300 focus-visible:ring-acc-100",
					"gap-s-200 px-s-300 py-s-200 inline-flex items-center rounded-md border",
					"transition-colors focus-visible:ring-2 focus-visible:outline-none"
				)}
				aria-label={t("chip.ariaMulti", {
					version: selectedVersion,
					status: isLive ? t("badge.live") : t("badge.historical"),
				})}
			>
				{chipBody}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				id="strategy-version-chip-menu"
				align="start"
				className="min-w-[240px]"
			>
				{versions.map((v) => {
					const versionIsLive = v.version === currentVersion
					const isSelected = v.version === selectedVersion
					return (
						<DropdownMenuItem
							key={v.id}
							onSelect={() => handleSelect(v.version)}
							className="gap-s-300 flex items-center justify-between"
						>
							<div className="gap-s-200 flex items-center">
								<Check
									className={cn(
										"h-3.5 w-3.5",
										isSelected ? "text-acc-100" : "text-transparent"
									)}
									aria-hidden="true"
								/>
								<span className="text-small text-txt-100 font-medium tabular-nums">
									v{v.version}
								</span>
								{versionIsLive ? (
									<span className="text-tiny text-acc-100 bg-acc-100/10 px-s-200 py-s-100 rounded-full">
										{t("badge.live")}
									</span>
								) : null}
							</div>
							<div className="flex flex-col items-end gap-0">
								<div className="text-tiny text-txt-300 gap-s-200 flex items-center">
									<span className="tabular-nums">
										{t("dropdown.tradeCount", { count: v.tradeCount })}
									</span>
									<span aria-hidden="true">·</span>
									<span>{dateFormatter.format(new Date(v.createdAt))}</span>
								</div>
								{v.label ? (
									<span className="text-tiny text-txt-200 italic">
										{v.label}
									</span>
								) : null}
							</div>
						</DropdownMenuItem>
					)
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

export { VersionChip }
