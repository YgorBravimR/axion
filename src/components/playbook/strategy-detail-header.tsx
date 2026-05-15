"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Pencil, GitFork } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { VersionChip } from "@/components/playbook/version-chip"
import { ForkVersionDialog } from "@/components/playbook/fork-version-dialog"
import { cn } from "@/lib/utils"
import type {
	StrategyVersionSnapshot,
	StrategyVersionSummary,
} from "@/app/actions/strategies.types"
import type { StrategyConditionInput } from "@/types/trading-condition"

interface StrategyDetailHeaderProps {
	readonly strategyId: string
	readonly strategyName: string
	readonly currentVersion: number
	readonly selectedVersion: number
	readonly nextVersion: number
	readonly liveTradeCount: number
	readonly versions: readonly StrategyVersionSummary[]
	readonly forkSource: StrategyVersionSnapshot
	readonly forkConditions: readonly StrategyConditionInput[]
}

/**
 * Header band at the top of the strategy detail page. Renders the strategy
 * name (h1), the version chip + LIVE/HISTORICAL badge, and the action cluster
 * (Edit + optional Fork).
 *
 * The Edit button is disabled when the user is viewing a historical version —
 * conditions on those versions are frozen by the versioning rules, and editing
 * would require a fork. The Fork button only appears on the live version when
 * trades are linked to it (i.e. the live version is locked); on an empty live
 * version, Edit works directly and Fork has no purpose.
 */
const StrategyDetailHeader = ({
	strategyId,
	strategyName,
	currentVersion,
	selectedVersion,
	nextVersion,
	liveTradeCount,
	versions,
	forkSource,
	forkConditions,
}: StrategyDetailHeaderProps) => {
	const t = useTranslations("playbook.versioning")
	const [forkOpen, setForkOpen] = useState(false)
	const isHistorical = selectedVersion !== currentVersion
	const canFork = !isHistorical && liveTradeCount > 0

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
			<div className="gap-s-300 flex flex-col sm:flex-row sm:items-center sm:justify-between">
				<div className="gap-s-200 flex min-w-0 flex-col sm:flex-row sm:items-center">
					<h1 className="text-h3 text-txt-100 truncate font-semibold">
						{strategyName}
					</h1>
					<VersionChip
						versions={versions}
						selectedVersion={selectedVersion}
						currentVersion={currentVersion}
					/>
				</div>
				<div className="gap-s-200 flex items-center">
					<TooltipProvider delayDuration={150}>
						<Tooltip>
							<TooltipTrigger asChild>
								{isHistorical ? (
									<Button
										id="strategy-edit-button-disabled"
										variant="outline"
										size="sm"
										disabled
										aria-disabled="true"
										className={cn("gap-s-200 inline-flex items-center")}
									>
										<Pencil className="h-3.5 w-3.5" aria-hidden="true" />
										{t("editButton.label")}
									</Button>
								) : (
									<Button
										id="strategy-edit-button"
										variant="outline"
										size="sm"
										asChild
									>
										<Link
											href={`/playbook/${strategyId}/edit`}
											className="gap-s-200 inline-flex items-center"
										>
											<Pencil className="h-3.5 w-3.5" aria-hidden="true" />
											{t("editButton.label")}
										</Link>
									</Button>
								)}
							</TooltipTrigger>
							{isHistorical ? (
								<TooltipContent id="strategy-edit-button-tooltip" side="bottom">
									{t("editButton.disabledTooltip")}
								</TooltipContent>
							) : null}
						</Tooltip>
					</TooltipProvider>

					{canFork ? (
						<Button
							id="strategy-fork-button"
							variant="default"
							size="sm"
							onClick={() => setForkOpen(true)}
							className="gap-s-200 inline-flex items-center"
						>
							<GitFork className="h-3.5 w-3.5" aria-hidden="true" />
							{t("fork.headerButton", { nextVersion })}
						</Button>
					) : null}
				</div>
			</div>

			{canFork ? (
				<ForkVersionDialog
					strategyId={strategyId}
					sourceVersion={currentVersion}
					nextVersion={nextVersion}
					source={forkSource}
					conditions={forkConditions}
					open={forkOpen}
					onOpenChange={setForkOpen}
				/>
			) : null}
		</div>
	)
}

export { StrategyDetailHeader }
