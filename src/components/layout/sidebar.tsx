"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/routing"
import { ChevronLeft, ChevronRight, Plus, RotateCcw } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { navItems } from "@/lib/navigation"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { getFilteredNavItems } from "@/lib/feature-access"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AccountSwitcher } from "./account-switcher"
import { UserMenu } from "./user-menu"

interface SidebarProps {
	isCollapsed: boolean
	onToggleCollapse: () => void
	isReplayAccount?: boolean
	replayDate?: string
	variant?: "default" | "sheet"
	onNavigate?: () => void
	hideCollapseToggle?: boolean
}

const Sidebar = ({
	isCollapsed,
	onToggleCollapse,
	isReplayAccount = false,
	replayDate,
	variant = "default",
	onNavigate,
	hideCollapseToggle = false,
}: SidebarProps) => {
	const t = useTranslations("nav")
	const tReplay = useTranslations("commandCenter.dateNavigator")
	const tCommon = useTranslations("common")
	const pathname = usePathname()
	const { role } = useFeatureAccess()
	const filteredNavItems = getFilteredNavItems(navItems, role)

	const isSheet = variant === "sheet"
	const isCompact = isCollapsed && !isSheet
	const showLabels = !isCollapsed || isSheet

	return (
		<aside
			className={cn(
				"border-bg-300 bg-bg-200 flex flex-col border-r",
				isSheet
					? "h-full w-full"
					: "fixed top-0 left-0 z-40 h-dvh transition-[width] duration-300",
				!isSheet && (isCollapsed ? "w-16" : "w-64")
			)}
		>
			{/* Logo */}
			<div className="border-bg-300 flex h-16 items-center justify-between border-b px-4">
				{isCompact ? (
					<Image
						src="/logo_nobg.png"
						alt="Bravo"
						width={32}
						height={32}
						className="h-8 w-8 object-contain"
						priority
					/>
				) : (
					<Image
						src="/bravo-nobg.png"
						alt="Bravo"
						width={140}
						height={40}
						className="h-10 w-auto object-contain"
						priority
					/>
				)}
				{!isSheet && !hideCollapseToggle && (
					<button
						type="button"
						onClick={onToggleCollapse}
						className="text-txt-200 hover:bg-bg-300 hover:text-txt-100 focus-visible:ring-acc-100 rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none"
						aria-label={
							isCollapsed
								? tCommon("expandSidebar")
								: tCommon("collapseSidebar")
						}
					>
						{isCollapsed ? (
							<ChevronRight className="h-5 w-5" />
						) : (
							<ChevronLeft className="h-5 w-5" />
						)}
					</button>
				)}
			</div>

			{/* New Trade Button */}
			<div className="px-2 pt-2">
				{pathname === "/journal/new" ? (
					<span
						className={cn(
							"bg-acc-100/10 text-acc-100 text-small flex items-center gap-3 rounded-md px-3 py-2 font-medium",
							isCompact && "justify-center"
						)}
						aria-current="page"
					>
						<Plus className="h-5 w-5 shrink-0" />
						{showLabels && <span>{t("newTrade")}</span>}
					</span>
				) : (
					<Link
						href="/journal/new"
						className={cn(
							"bg-acc-100 hover:bg-acc-100/90 text-small flex items-center gap-3 rounded-md px-3 py-2 font-medium text-white transition-colors",
							isCompact && "justify-center"
						)}
						aria-label={t("newTrade")}
						onClick={onNavigate}
					>
						<Plus className="h-5 w-5 shrink-0" />
						{showLabels && <span>{t("newTrade")}</span>}
					</Link>
				)}
			</div>

			{/* Navigation */}
			<ScrollArea className="flex-1">
			<nav className="space-y-1 p-2">
				{filteredNavItems.map((item) => {
					const isActive =
						item.href === "/"
							? pathname === "/"
							: pathname.startsWith(item.href)

					return (
						<Link
							key={item.href}
							href={item.href}
							className={cn(
								"text-small flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
								isActive
									? "bg-acc-100/10 text-acc-100"
									: "text-txt-200 hover:bg-bg-300 hover:text-txt-100",
								isCompact && "justify-center"
							)}
							aria-current={isActive ? "page" : undefined}
							tabIndex={isActive ? -1 : 0}
							onClick={onNavigate}
							ref={
								isActive
									? (el) => {
											if (el && el === document.activeElement) el.blur()
										}
									: undefined
							}
						>
							<item.icon className="h-5 w-5 shrink-0" />
							{showLabels && <span>{t(item.labelKey)}</span>}
						</Link>
					)
				})}
			</nav>
			</ScrollArea>

			{/* Replay Mode Badge */}
			{isReplayAccount && replayDate && (
				<div
					className={cn(
						"border-bg-300 border-t px-3 py-2",
						isCompact && "flex justify-center px-0"
					)}
				>
					{isCompact ? (
						<div
							className="bg-acc-100/10 flex h-8 w-8 items-center justify-center rounded-md"
							aria-label={tReplay("replayMode")}
							title={`${tReplay("replayMode")} — ${replayDate}`}
						>
							<RotateCcw className="text-acc-100 h-4 w-4" />
						</div>
					) : (
						<div className="gap-s-200 bg-acc-100/10 px-s-300 py-s-200 flex flex-col rounded-md">
							<div className="flex items-center gap-2">
								<RotateCcw
									className="text-acc-100 h-3.5 w-3.5 shrink-0"
									aria-hidden="true"
								/>
								<span className="text-tiny text-acc-100 font-medium">
									{tReplay("replayMode")}
								</span>
							</div>
							<span className="text-tiny text-txt-300">{replayDate}</span>
						</div>
					)}
				</div>
			)}

			{/* Account Switcher */}
			<div
				className={cn(
					"border-bg-300 border-t",
					isCompact ? "flex flex-col items-center gap-2 py-4" : "space-y-2 p-4"
				)}
			>
				<AccountSwitcher isCollapsed={isCompact} />
				<UserMenu isCollapsed={isCompact} />
			</div>
		</aside>
	)
}

export { Sidebar }
