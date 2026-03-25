"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/routing"
import { PanelLeftClose, PanelLeftOpen, Plus, RotateCcw } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { navItems } from "@/lib/navigation"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { getFilteredNavItems } from "@/lib/feature-access"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AccountSwitcher } from "./account-switcher"

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
					: "fixed top-0 left-0 z-40 h-dvh transition-[width] duration-500 motion-reduce:transition-none",
				!isSheet && (isCollapsed ? "w-20" : "w-64")
			)}
			aria-label={tCommon("mainNavigation")}
		>
			{/* Logo */}
			<div className="border-bg-300 flex h-16 items-center justify-center border-b">
				<Image
					src="/axion-mark-white.png"
					alt="Axion"
					width={32}
					height={32}
					className={cn(
						"absolute h-8 w-auto object-contain transition-opacity duration-1000 motion-reduce:transition-none",
						isCompact ? "opacity-100" : "opacity-0"
					)}
					priority
				/>
				<Image
					src="/axion-wordmark-white.png"
					alt="Axion"
					width={120}
					height={32}
					className={cn(
						"absolute h-8 w-auto object-contain transition-opacity duration-1000 motion-reduce:transition-none",
						isCompact ? "opacity-0" : "opacity-100"
					)}
					priority
				/>
			</div>

			{/* Sidebar toggle — floats outside the sidebar edge */}
			{!isSheet && !hideCollapseToggle && (
				<button
					type="button"
					onClick={onToggleCollapse}
					className="bg-bg-200 border-bg-300 text-txt-300 hover:text-txt-100 focus-visible:ring-acc-100 absolute top-3.5 -right-5 z-50 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm focus-visible:ring-2 focus-visible:outline-none"
					aria-label={
						isCollapsed ? tCommon("expandSidebar") : tCommon("collapseSidebar")
					}
				>
					{isCollapsed ? (
						<PanelLeftOpen className="h-6 w-6" />
					) : (
						<PanelLeftClose className="h-6 w-6" />
					)}
				</button>
			)}

			{/* New Trade Button */}
			<div className="px-s-200 pt-s-200">
				{pathname === "/journal/new" ? (
					<span
						className={cn(
							"bg-acc-100/10 text-acc-100 text-small flex h-10 items-center gap-3 truncate rounded-md px-3 py-2 font-medium",
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
							"bg-acc-100 hover:bg-acc-100/90 text-small flex h-10 items-center gap-3 truncate rounded-md px-3 py-2 font-medium text-bg-100 transition-colors",
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
				<nav className="space-y-s-100 p-s-200">
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
									"text-small flex h-10 items-center gap-3 rounded-md px-3 py-2 transition-colors",
									isActive
										? "bg-acc-100/10 text-acc-100"
										: "text-txt-200 hover:bg-bg-300 hover:text-txt-100",
									isCompact && "justify-center"
								)}
								aria-current={isActive ? "page" : undefined}
								tabIndex={0}
								onClick={onNavigate}
							>
								<item.icon className="h-5 w-5 shrink-0" />
								{showLabels && (
									<span className="truncate">{t(item.labelKey)}</span>
								)}
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
					isCompact ? "flex flex-col items-center py-4" : "p-4"
				)}
			>
				<AccountSwitcher isCollapsed={isCompact} />
			</div>

			{/* by Bravo badge */}
			{!isCompact && (
				<div className="flex items-center justify-center gap-1.5 pb-3">
					<span className="text-micro text-txt-placeholder tracking-wide">by</span>
					<span className="text-micro text-acc-200 tracking-[0.15em] font-medium">
						BRAVO
					</span>
				</div>
			)}
		</aside>
	)
}

export { Sidebar }
