"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/routing"
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
	buildNavItems,
	isGroup,
	NEW_TRADE_FEATURE_KEY,
	type NavItem,
	type NavEntry,
	type NavGroupKey,
} from "@/lib/navigation"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { getFilteredNavStructure } from "@/lib/feature-access"
import { AccountSwitcher } from "./account-switcher"

interface SidebarProps {
	isCollapsed: boolean
	onToggleCollapse: () => void
	variant?: "default" | "sheet"
	onNavigate?: () => void
	hideCollapseToggle?: boolean
	navStructure: NavEntry[]
}

const STORAGE_KEY = "axion:sidebar:groups"

const isItemActive = (
	href: string,
	pathname: string,
	allItems: NavItem[]
): boolean => {
	if (href === "/") {
		return pathname === "/"
	}
	if (!pathname.startsWith(href)) {
		return false
	}
	return !allItems.some(
		(other) =>
			other.href !== href &&
			other.href.startsWith(href) &&
			pathname.startsWith(other.href)
	)
}

const Sidebar = ({
	isCollapsed,
	onToggleCollapse,
	variant = "default",
	onNavigate,
	hideCollapseToggle = false,
	navStructure,
}: SidebarProps) => {
	const t = useTranslations("nav")
	const tCommon = useTranslations("common")
	const pathname = usePathname()
	const { role, canAccess } = useFeatureAccess()
	const filteredStructure = useMemo(
		() => getFilteredNavStructure(navStructure, role),
		[navStructure, role]
	)
	const navItems = useMemo(() => buildNavItems(navStructure), [navStructure])
	const canCreateTrade = useMemo(
		() => canAccess(NEW_TRADE_FEATURE_KEY),
		[canAccess]
	)

	const isSheet = variant === "sheet"
	const isCompact = isCollapsed && !isSheet
	const showLabels = !isCollapsed || isSheet

	// Group open/closed state — defaults: open if active child, else closed
	const computeInitialState = () => {
		const state: Partial<Record<NavGroupKey, boolean>> = {}
		for (const entry of filteredStructure) {
			if (isGroup(entry)) {
				state[entry.groupKey] = entry.items.some((item) =>
					isItemActive(item.href, pathname, navItems)
				)
			}
		}
		return state
	}

	const [groupsOpen, setGroupsOpen] = useState<
		Partial<Record<NavGroupKey, boolean>>
	>(() => computeInitialState())

	// Hydrate from localStorage on mount
	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY)
			if (!raw) {
				return
			}
			const parsed = JSON.parse(raw) as Partial<Record<NavGroupKey, boolean>>
			setGroupsOpen((prev) => ({ ...prev, ...parsed }))
		} catch {
			// ignore corrupted storage
		}
	}, [])

	const toggleGroup = (key: NavGroupKey) => {
		setGroupsOpen((prev) => {
			const next = { ...prev, [key]: !prev[key] }
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
			} catch {
				// ignore quota
			}
			return next
		})
	}

	const renderItem = (item: NavItem) => {
		const isActive = isItemActive(item.href, pathname, navItems)
		const itemLabel = t(item.labelKey)
		const link = (
			<Link
				key={item.href}
				href={item.href}
				className={cn(
					"text-small gap-s-300 px-s-300 py-s-200 flex h-10 items-center rounded-md transition-colors",
					isActive
						? "bg-bg-300 text-txt-100"
						: "text-txt-200 hover:bg-bg-300 hover:text-txt-100",
					isCompact && "justify-center"
				)}
				aria-current={isActive ? "page" : undefined}
				onClick={onNavigate}
				title={isCompact ? itemLabel : undefined}
			>
				<item.icon className="h-5 w-5 shrink-0" />
				{showLabels && <span className="truncate">{itemLabel}</span>}
			</Link>
		)
		return link
	}

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
			<div className="border-bg-300 relative flex h-16 items-center justify-center border-b">
				<Image
					src="/axion-mark-white.png"
					alt="Axion"
					width={3487}
					height={2348}
					data-axion-logo="invertable"
					className={cn(
						"absolute inset-0 h-8 w-auto object-contain transition-opacity duration-200 motion-reduce:transition-none",
						isCompact ? "opacity-100" : "opacity-0"
					)}
					priority
				/>
				<Image
					src="/axion-wordmark-white.png"
					alt="Axion"
					width={3818}
					height={1163}
					data-axion-logo="invertable"
					className={cn(
						"absolute inset-0 h-8 w-auto object-contain transition-opacity duration-200 motion-reduce:transition-none",
						isCompact ? "opacity-0" : "opacity-100"
					)}
					priority
				/>
			</div>

			{/* Sidebar toggle — floats outside the sidebar edge */}
			{!isSheet && !hideCollapseToggle && (
				<Button
					id="sidebar-collapse"
					type="button"
					variant="ghost"
					size="icon"
					onClick={onToggleCollapse}
					className="bg-bg-200 border-bg-300 text-txt-300 hover:text-txt-100 absolute top-3.5 -right-5 z-50 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm before:absolute before:inset-[-8px] before:content-['']"
					aria-label={
						isCollapsed ? tCommon("expandSidebar") : tCommon("collapseSidebar")
					}
				>
					{isCollapsed ? (
						<PanelLeftOpen aria-hidden="true" className="h-6 w-6" />
					) : (
						<PanelLeftClose aria-hidden="true" className="h-6 w-6" />
					)}
				</Button>
			)}

			{/* New Trade Button — trader+ only */}
			{canCreateTrade && (
				<div className="px-s-200 pt-s-200">
					{pathname === "/journal/new" ? (
						<span
							className={cn(
								"bg-acc-100/10 text-acc-100 text-small gap-s-300 px-s-300 py-s-200 flex h-10 items-center truncate rounded-md font-medium",
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
								"bg-acc-100 hover:bg-acc-100/90 text-small gap-s-300 px-s-300 py-s-200 text-bg-100 flex h-10 items-center truncate rounded-md font-medium transition-colors",
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
			)}

			{/* Navigation */}
			<div className="flex-1 overflow-y-auto">
				<nav className="space-y-s-100 p-s-200">
					{filteredStructure.map((entry) => {
						if (!isGroup(entry)) {
							return renderItem(entry)
						}

						// Compact: render children flat (no group chrome)
						if (isCompact) {
							return (
								<div key={entry.groupKey} className="space-y-s-100">
									{entry.items.map((item) => renderItem(item))}
								</div>
							)
						}

						const open = groupsOpen[entry.groupKey] ?? false
						const hasActive = entry.items.some((item) =>
							isItemActive(item.href, pathname, navItems)
						)
						const GroupIcon = entry.icon

						return (
							<div key={entry.groupKey} className="space-y-s-100">
								<button
									type="button"
									onClick={() => toggleGroup(entry.groupKey)}
									aria-expanded={open}
									className={cn(
										"text-small gap-s-300 px-s-300 py-s-200 focus-visible:ring-acc-100 flex h-10 w-full items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
										hasActive
											? "text-txt-100"
											: "text-txt-200 hover:bg-bg-300 hover:text-txt-100"
									)}
								>
									<GroupIcon className="h-5 w-5 shrink-0" />
									<span className="flex-1 truncate text-left">
										{t(entry.groupKey)}
									</span>
									<ChevronRight
										className={cn(
											"h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
											open && "rotate-90"
										)}
										aria-hidden="true"
									/>
								</button>
								{open && (
									<div className="space-y-s-100 md:ml-m-400 border-bg-300 pl-s-200 ml-0 border-l">
										{entry.items.map((item) => renderItem(item))}
									</div>
								)}
							</div>
						)
					})}
				</nav>
			</div>

			{/* Account Switcher */}
			<div
				className={cn(
					"border-bg-300 border-t",
					isCompact ? "py-m-400 flex flex-col items-center" : "p-m-400"
				)}
			>
				<AccountSwitcher isCollapsed={isCompact} />
			</div>

			{/* by Bravo badge */}
			<div
				className={cn(
					"pb-s-300 flex items-center justify-center gap-1.5 transition-opacity duration-200 motion-reduce:transition-none",
					isCompact ? "pointer-events-none opacity-0" : "opacity-100"
				)}
			>
				<span className="text-tiny text-txt-placeholder tracking-wide">by</span>
				<span className="text-tiny text-heritage-gold font-medium tracking-[0.15em]">
					BRAVO
				</span>
			</div>
		</aside>
	)
}

export { Sidebar }
