"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Pencil, GitFork, GitCompare, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { VersionChip } from "@/components/playbook/version-chip"
import { ForkVersionDialog } from "@/components/playbook/fork-version-dialog"
import { StrategyVersionDiffDialog } from "@/components/playbook/strategy-version-diff-dialog"
import { cn } from "@/lib/utils"
import { updateStrategyVersionLabel } from "@/app/actions/strategies"
import { useToast } from "@/components/ui/toast"
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
	const { showToast } = useToast()
	const [forkOpen, setForkOpen] = useState(false)
	const [compareOpen, setCompareOpen] = useState(false)
	const [renameOpen, setRenameOpen] = useState(false)
	const [renameValue, setRenameValue] = useState("")
	const [isPendingRename, startRenameTransition] = useTransition()
	const isHistorical = selectedVersion !== currentVersion
	const canFork = !isHistorical && liveTradeCount > 0
	const canCompare = versions.length > 1
	const selectedVersionId =
		versions.find((v) => v.version === selectedVersion)?.id ?? ""
	const selectedVersionLabel =
		versions.find((v) => v.version === selectedVersion)?.label ?? null

	const handleRenameOpen = (): void => {
		setRenameValue(selectedVersionLabel ?? "")
		setRenameOpen(true)
	}

	const handleRenameSave = (): void => {
		if (!selectedVersionId) {
			return
		}
		startRenameTransition(async () => {
			const result = await updateStrategyVersionLabel(
				strategyId,
				selectedVersionId,
				renameValue || null
			)
			if (result.status === "success") {
				showToast("success", t("label.savedToast"))
				setRenameOpen(false)
			} else {
				showToast("error", result.message)
			}
		})
	}

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
					{canCompare ? (
						<TooltipProvider delayDuration={150}>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										id="strategy-compare-button"
										variant="outline"
										size="sm"
										onClick={() => setCompareOpen(true)}
										className="gap-s-200 inline-flex items-center"
									>
										<GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
										{t("diff.headerButton")}
									</Button>
								</TooltipTrigger>
								<TooltipContent
									id="strategy-compare-button-tooltip"
									side="bottom"
								>
									{t("diff.headerTooltip")}
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					) : null}

					<TooltipProvider delayDuration={150}>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									id="strategy-rename-version-button"
									variant="ghost"
									size="sm"
									onClick={handleRenameOpen}
									className="gap-s-200 px-s-200 inline-flex items-center"
									aria-label={t("label.buttonAriaLabel", {
										version: selectedVersion,
									})}
								>
									<Tag className="h-3.5 w-3.5" aria-hidden="true" />
								</Button>
							</TooltipTrigger>
							<TooltipContent
								id="strategy-rename-version-tooltip"
								side="bottom"
							>
								{t("label.buttonTooltip")}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

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

			{canCompare ? (
				<StrategyVersionDiffDialog
					strategyId={strategyId}
					versions={versions}
					open={compareOpen}
					onOpenChange={setCompareOpen}
				/>
			) : null}

			<Dialog open={renameOpen} onOpenChange={setRenameOpen}>
				<DialogContent id="strategy-version-rename-dialog" className="max-w-sm">
					<DialogHeader>
						<DialogTitle>
							{t("label.dialogTitle", { version: selectedVersion })}
						</DialogTitle>
						<DialogDescription>
							{t("label.dialogDescription")}
						</DialogDescription>
					</DialogHeader>
					<Input
						id="strategy-version-label-input"
						value={renameValue}
						onChange={(e) => setRenameValue(e.target.value)}
						placeholder={t("label.inputPlaceholder")}
						maxLength={100}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleRenameSave()
							}
						}}
					/>
					<DialogFooter>
						<Button
							id="strategy-version-rename-cancel"
							variant="ghost"
							size="sm"
							onClick={() => setRenameOpen(false)}
						>
							{t("label.cancel")}
						</Button>
						<Button
							id="strategy-version-rename-save"
							size="sm"
							onClick={handleRenameSave}
							disabled={isPendingRename}
						>
							{isPendingRename ? t("label.saving") : t("label.save")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export { StrategyDetailHeader }
