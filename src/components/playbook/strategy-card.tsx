"use client"

import { memo, useState, useCallback, useEffect, useRef } from "react"
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
import { ColoredValue } from "@/components/shared"
import { formatCompactCurrencyWithSign } from "@/lib/formatting"
import type { StrategyWithStats } from "@/app/actions/strategies"

interface StrategyCardProps {
	strategy: StrategyWithStats
	onEdit: (strategy: StrategyWithStats) => void
	onDelete: (strategyId: string) => void
}

const StrategyCardBase = ({
	strategy,
	onEdit,
	onDelete,
}: StrategyCardProps) => {
	const t = useTranslations("playbook")
	const tCommon = useTranslations("common")
	const [showMenu, setShowMenu] = useState(false)
	const { isPremium } = useFeatureAccess()
	const menuRef = useRef<HTMLDivElement>(null)
	const menuButtonRef = useRef<HTMLButtonElement>(null)

	const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			setShowMenu(false)
			menuButtonRef.current?.focus()
		}
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault()
			const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
			if (!items?.length) return
			const currentIndex = Array.from(items).findIndex((el) => el === document.activeElement)
			const nextIndex = e.key === "ArrowDown"
				? (currentIndex + 1) % items.length
				: (currentIndex - 1 + items.length) % items.length
			items[nextIndex].focus()
		}
	}, [])

	useEffect(() => {
		if (showMenu) {
			const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
			firstItem?.focus()
		}
	}, [showMenu])

	const complianceColor =
		strategy.compliance >= 80
			? "text-trade-buy"
			: strategy.compliance >= 50
				? "text-warning"
				: "text-trade-sell"

	return (
		<div className="group border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 hover:border-bg-300/80 relative rounded-lg border transition-shadow hover:shadow-md">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div className="gap-s-300 flex items-center">
					<div className="bg-acc-100/20 text-acc-100 flex h-10 w-10 items-center justify-center rounded-lg">
						<Target className="h-5 w-5" />
					</div>
					<div>
						<div className="gap-s-200 flex items-center">
							<span className="bg-bg-300 text-txt-200 px-s-200 py-s-100 text-tiny rounded-sm font-mono">
								{strategy.code}
							</span>
							<Link href={`/playbook/${strategy.id}`} className="text-body text-txt-100 font-semibold hover:underline">
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
				<div className="relative">
					<Button
						ref={menuButtonRef}
						id="playbook-strategy-menu"
						variant="ghost"
						size="sm"
						className="h-11 w-11 p-0"
						onClick={() => setShowMenu(!showMenu)}
						aria-label={t("strategy.optionsMenu")}
						aria-expanded={showMenu}
						aria-haspopup="menu"
					>
						<MoreVertical className="h-4 w-4" aria-hidden="true" />
					</Button>
					{showMenu && (
						<>
							<div
								className="fixed inset-0 z-10"
								onClick={() => setShowMenu(false)}
								aria-hidden="true"
							/>
							{/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
							<div
								ref={menuRef}
								role="menu"
								aria-label={t("strategy.optionsMenu")}
								className="border-bg-300 bg-bg-100 absolute top-full right-0 z-20 mt-s-100 w-40 max-w-[calc(100vw-2rem)] rounded-lg border py-s-100 shadow-lg"
								onKeyDown={handleMenuKeyDown}
							>
								<Link
									href={`/playbook/${strategy.id}`}
									role="menuitem"
									tabIndex={-1}
									className="text-txt-200 hover:bg-bg-200 gap-s-200 px-s-300 py-s-300 text-small flex w-full items-center text-left"
								>
									<Eye className="h-4 w-4" />
									{t("strategy.viewDetails")}
								</Link>
								<Button
									id={`strategy-edit-${strategy.id}`}
									type="button"
									variant="ghost"
									role="menuitem"
									tabIndex={-1}
									onClick={() => {
										setShowMenu(false)
										onEdit(strategy)
									}}
									className="gap-s-200 px-s-300 py-s-300 text-small text-txt-200 flex w-full items-center justify-start text-left"
								>
									<Edit className="h-4 w-4" />
									{tCommon("edit")}
								</Button>
								<Button
									id={`strategy-delete-${strategy.id}`}
									type="button"
									variant="ghost"
									role="menuitem"
									tabIndex={-1}
									className="text-fb-error hover:text-fb-error gap-s-200 px-s-300 py-s-300 text-small flex w-full items-center justify-start text-left"
									onClick={() => {
										setShowMenu(false)
										onDelete(strategy.id)
									}}
								>
									<Trash2 className="h-4 w-4" />
									{tCommon("delete")}
								</Button>
							</div>
						</>
					)}
				</div>
			</div>

			{/* Stats Grid */}
			<div className="mt-s-300 sm:mt-m-400 gap-s-200 sm:gap-s-300 grid grid-cols-2 sm:grid-cols-4 [&>div]:min-w-0 [&_p]:truncate">
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
					<span className="text-tiny text-txt-300">{t("compliance.planCompliance")}</span>
					<span className={cn("text-small font-semibold", complianceColor)}>
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
							strategy.compliance >= 80
								? "bg-trade-buy"
								: strategy.compliance >= 50
									? "bg-warning"
									: "bg-trade-sell"
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
							<TrendingUp className="text-trade-buy h-4 w-4" />
							<span className="text-tiny text-txt-300">{t("strategy.target")}</span>
							<span className="text-small text-txt-100 font-medium">
								{Number(strategy.finalR).toFixed(1)}R
							</span>
						</div>
					)}
					{strategy.maxRiskPercent && (
						<div className="gap-s-100 flex items-center">
							<TrendingDown className="text-trade-sell h-4 w-4" />
							<span className="text-tiny text-txt-300">{t("strategy.maxRisk")}</span>
							<span className="text-small text-txt-100 font-medium">
								{Number(strategy.maxRiskPercent).toFixed(1)}%
							</span>
						</div>
					)}
				</div>
			)}

			{/* Conditions & Scenarios counts */}
			{(strategy.scenarioCount > 0 || (isPremium && strategy.conditionCount > 0)) && (
				<div className="mt-s-300 gap-m-400 flex items-center">
					{isPremium && strategy.conditionCount > 0 && (
						<div className="gap-s-100 flex items-center">
							<Filter className="text-txt-300 h-3 w-3" />
							<span className="text-tiny text-txt-300">
								{strategy.conditionCount === 1
									? t("strategy.condition", { count: strategy.conditionCount })
									: t("strategy.conditionPlural", { count: strategy.conditionCount })}
							</span>
						</div>
					)}
					{strategy.scenarioCount > 0 && (
						<div className="gap-s-100 flex items-center">
							<ImageIcon className="text-txt-300 h-3 w-3" />
							<span className="text-tiny text-txt-300">
								{strategy.scenarioCount === 1
									? t("strategy.scenario", { count: strategy.scenarioCount })
									: t("strategy.scenarioPlural", { count: strategy.scenarioCount })}
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
