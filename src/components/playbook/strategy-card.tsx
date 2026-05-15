"use client"

import { memo } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { Link } from "@/i18n/routing"
import {
	Target,
	TrendingUp,
	TrendingDown,
	MoreVertical,
	Edit,
	Trash2,
	Eye,
	Filter,
	ImageIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { ColoredValue } from "@/components/shared"
import { formatCompactCurrencyWithSign } from "@/lib/formatting"
import { getComplianceTone } from "@/lib/compliance"
import type { StrategyWithStats } from "@/app/actions/strategies.types"

interface StrategyCardProps {
	strategy: StrategyWithStats
	onEdit: (_strategy: StrategyWithStats) => void
	onDelete: (_strategyId: string) => void
}

const StrategyCardBase = ({
	strategy,
	onEdit,
	onDelete,
}: StrategyCardProps) => {
	const t = useTranslations("playbook")
	const tCommon = useTranslations("common")
	const { isPremium } = useFeatureAccess()

	const complianceTone = getComplianceTone(strategy.compliance)

	return (
		<div className="group border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 hover:border-bg-300/80 relative rounded-lg border transition-shadow hover:shadow-md">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div className="gap-s-300 flex items-center">
					<div className="bg-bg-300 text-txt-200 flex h-10 w-10 items-center justify-center rounded-lg">
						<Target className="h-5 w-5" aria-hidden="true" />
					</div>
					<div>
						<div className="gap-s-200 flex items-center">
							<span className="bg-bg-300 text-txt-200 px-s-200 py-s-100 text-tiny rounded-sm font-mono">
								{strategy.code}
							</span>
							<Link
								href={`/playbook/${strategy.id}`}
								className="text-body text-txt-100 font-semibold hover:underline"
							>
								{strategy.name}
							</Link>
						</div>
						{strategy.description && (
							<p className="text-tiny text-txt-300 mt-s-100 line-clamp-1">
								{strategy.description}
							</p>
						)}
					</div>
				</div>

				{/* Menu */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							id="playbook-strategy-menu"
							variant="ghost"
							size="sm"
							className="h-11 w-11 p-0"
							aria-label={t("strategy.optionsMenu")}
						>
							<MoreVertical className="h-4 w-4" aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						id="strategy-menu-content"
						align="end"
						className="w-40"
					>
						<DropdownMenuItem asChild>
							<Link href={`/playbook/${strategy.id}`}>
								<Eye className="mr-s-200 h-4 w-4" aria-hidden="true" />
								{t("strategy.viewDetails")}
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem
							id={`strategy-edit-${strategy.id}`}
							onSelect={() => onEdit(strategy)}
						>
							<Edit className="mr-s-200 h-4 w-4" aria-hidden="true" />
							{tCommon("edit")}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							id={`strategy-delete-${strategy.id}`}
							onSelect={() => onDelete(strategy.id)}
							className="text-fb-error focus:text-fb-error focus:bg-fb-error/10"
						>
							<Trash2 className="mr-s-200 h-4 w-4" aria-hidden="true" />
							{tCommon("delete")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Stats Grid */}
			<div className="mt-s-300 sm:mt-m-400 gap-s-200 sm:gap-s-300 grid grid-cols-2 sm:grid-cols-4 [&_p]:truncate [&>div]:min-w-0">
				<div className="bg-bg-100 p-s-300 rounded-lg text-center">
					<p className="text-tiny text-txt-300">{t("strategy.trades")}</p>
					<p className="text-body text-txt-100 mt-s-100 font-bold tabular-nums">
						{strategy.tradeCount}
					</p>
				</div>
				<div className="bg-bg-100 p-s-300 rounded-lg text-center">
					<p className="text-tiny text-txt-300">{t("strategy.pnl")}</p>
					<ColoredValue
						value={strategy.totalPnl}
						showSign
						formatFn={(v) => formatCompactCurrencyWithSign(v, "R$")}
						className="mt-s-100 text-body font-bold tabular-nums"
					/>
				</div>
				<div className="bg-bg-100 p-s-300 rounded-lg text-center">
					<p className="text-tiny text-txt-300">{t("strategy.winRate")}</p>
					<p className="text-body text-txt-100 mt-s-100 font-bold tabular-nums">
						{strategy.winRate.toFixed(1)}%
					</p>
				</div>
				<div className="bg-bg-100 p-s-300 rounded-lg text-center">
					<p className="text-tiny text-txt-300">{t("strategy.avgR")}</p>
					<ColoredValue
						value={strategy.avgR}
						type="r-multiple"
						showSign
						className="mt-s-100 text-body font-bold tabular-nums"
					/>
				</div>
			</div>

			{/* Compliance Bar */}
			<div className="mt-m-400">
				<div className="flex items-center justify-between">
					<span className="text-tiny text-txt-300">
						{t("compliance.planCompliance")}
					</span>
					<span className={cn("text-small font-semibold", complianceTone.text)}>
						{strategy.compliance.toFixed(0)}%
					</span>
				</div>
				<div
					className="bg-bg-300 mt-s-200 h-2 w-full overflow-hidden rounded-full"
					role="progressbar"
					aria-valuenow={Math.round(strategy.compliance)}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label={t("compliance.planCompliance")}
				>
					<div
						className={cn(
							"h-full rounded-full transition-[width]",
							complianceTone.fill
						)}
						style={{ width: `${Math.min(strategy.compliance, 100)}%` }}
					/>
				</div>
			</div>

			{/* Target R and Risk */}
			{(strategy.finalR || strategy.maxRiskPercent) && (
				<div className="mt-m-400 gap-m-400 flex items-center">
					{strategy.finalR && (
						<div className="gap-s-100 flex items-center">
							<TrendingUp className="text-txt-300 h-4 w-4" aria-hidden="true" />
							<span className="text-tiny text-txt-300">
								{t("strategy.target")}
							</span>
							<span className="text-small text-txt-100 font-medium">
								{Number(strategy.finalR).toFixed(1)}R
							</span>
						</div>
					)}
					{strategy.maxRiskPercent && (
						<div className="gap-s-100 flex items-center">
							<TrendingDown
								className="text-txt-300 h-4 w-4"
								aria-hidden="true"
							/>
							<span className="text-tiny text-txt-300">
								{t("strategy.maxRisk")}
							</span>
							<span className="text-small text-txt-100 font-medium">
								{Number(strategy.maxRiskPercent).toFixed(1)}%
							</span>
						</div>
					)}
				</div>
			)}

			{/* Conditions & Scenarios counts */}
			{(strategy.scenarioCount > 0 ||
				(isPremium && strategy.conditionCount > 0)) && (
				<div className="mt-s-300 gap-m-400 flex items-center">
					{isPremium && strategy.conditionCount > 0 && (
						<div className="gap-s-100 flex items-center">
							<Filter className="text-txt-300 h-3 w-3" aria-hidden="true" />
							<span className="text-tiny text-txt-300">
								{strategy.conditionCount === 1
									? t("strategy.condition", { count: strategy.conditionCount })
									: t("strategy.conditionPlural", {
											count: strategy.conditionCount,
										})}
							</span>
						</div>
					)}
					{strategy.scenarioCount > 0 && (
						<div className="gap-s-100 flex items-center">
							<ImageIcon className="text-txt-300 h-3 w-3" aria-hidden="true" />
							<span className="text-tiny text-txt-300">
								{strategy.scenarioCount === 1
									? t("strategy.scenario", { count: strategy.scenarioCount })
									: t("strategy.scenarioPlural", {
											count: strategy.scenarioCount,
										})}
							</span>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

const StrategyCard = memo(StrategyCardBase)

export { StrategyCard }
