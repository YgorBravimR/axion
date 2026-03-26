"use client"

import { useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Menu, Search, Bell } from "lucide-react"
import Image from "next/image"
import { Sidebar } from "@/components/layout/sidebar"
import { CommandMenu } from "@/components/layout/command-menu"
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb"
import { UserMenu } from "@/components/layout/user-menu"
import { ThemeSynchronizer } from "@/components/providers/theme-synchronizer"
import { Button } from "@/components/ui/button"
import { PageGuideProvider, PageGuideTrigger } from "@/components/ui/page-guide"
import { BugReportProvider } from "@/components/bug-report/bug-report-provider"
import { BugReportPanel } from "@/components/bug-report/bug-report-panel"
import { BugReportCaptureProvider } from "@/components/bug-report/bug-report-capture-provider"
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useBreakpoint } from "@/hooks/use-is-mobile"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import type { Brand } from "@/lib/brands"

interface AppShellProps {
	children: ReactNode
	isReplayAccount?: boolean
	replayDate?: string
	serverBrand?: Brand
}

/**
 * Client-side shell that manages sidebar state, theme, and brand synchronizers.
 * Extracted from the (app) layout so the layout itself can be a server component.
 *
 * Three-tier responsive layout:
 * - Mobile  (< 768px): sidebar behind a Sheet (hamburger menu)
 * - Tablet  (768–1023px): auto-collapsed sidebar (icon-only, w-16)
 * - Desktop (≥ 1024px): full sidebar with collapse toggle
 */
const AppShell = ({
	children,
	isReplayAccount = false,
	replayDate,
	serverBrand,
}: AppShellProps) => {
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
	const breakpoint = useBreakpoint()
	const tCommon = useTranslations("common")

	const isMobile = breakpoint === "mobile"
	const isTablet = breakpoint === "tablet"

	// Tablet always shows collapsed sidebar; desktop respects user toggle
	const effectiveCollapsed = isTablet ? true : isSidebarCollapsed

	/** Dispatches Cmd+K (or Ctrl+K) to open the existing CommandMenu */
	const handleSearchClick = useCallback(() => {
		const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
		document.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "k",
				code: "KeyK",
				metaKey: isMac,
				ctrlKey: !isMac,
				bubbles: true,
			})
		)
	}, [])

	return (
		<BugReportProvider>
			<BugReportCaptureProvider>
				<PageGuideProvider>
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-acc-100 focus:px-m-400 focus:py-s-200 focus:text-bg-100 focus:outline-none"
			>
				{tCommon("skipToContent")}
			</a>
			<ThemeSynchronizer />
			<CommandMenu />

			{isMobile ? (
				<>
					{/* Mobile top bar */}
					<header className="border-bg-300 bg-bg-200 fixed top-0 right-0 left-0 z-40 flex h-14 items-center border-b px-m-400" aria-label={tCommon("appHeader")}>
						<Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
							<SheetTrigger asChild>
								<button
									type="button"
									className="text-txt-200 hover:bg-bg-300 hover:text-txt-100 focus-visible:ring-acc-100 -ml-2 rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none"
									aria-label={tCommon("openMenu")}
								>
									<Menu className="h-5 w-5" />
								</button>
							</SheetTrigger>

							<SheetContent
								id="mobile-sidebar-sheet"
								side="left"
								className="w-64 p-0"
							>
								<SheetTitle className="sr-only">
									{tCommon("openMenu")}
								</SheetTitle>
								<Sidebar
									isCollapsed={false}
									onToggleCollapse={() => {}}
									isReplayAccount={isReplayAccount}
									replayDate={replayDate}
									variant="sheet"
									onNavigate={() => setIsMobileMenuOpen(false)}
								/>
							</SheetContent>
						</Sheet>

						<Image
							src="/axion-wordmark-white.png"
							alt="Axion"
							width={100}
							height={28}
							className="ml-2 h-7 w-auto object-contain"
							priority
						/>

						<div className="gap-s-200 ml-auto flex items-center">
							<Button
								id="mobile-notifications"
								type="button"
								variant="ghost"
								size="icon"
								aria-label={tCommon("notifications")}
							>
								<Bell className="h-5 w-5" />
							</Button>
							<UserMenu isCollapsed />
						</div>
					</header>

					{/* Mobile main content */}
					<main id="main-content" className="min-h-dvh pt-14">{children}</main>
				</>
			) : (
				<>
					{/* Tablet & Desktop sidebar */}
					<Sidebar
						isCollapsed={effectiveCollapsed}
						onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
						isReplayAccount={isReplayAccount}
						replayDate={replayDate}
						hideCollapseToggle={isTablet}
					/>

					{/* Main content */}
					<div
						className={cn(
							"flex min-h-dvh flex-col transition-[margin-left] duration-300 motion-reduce:transition-none",
							effectiveCollapsed ? "ml-20" : "ml-64"
						)}
					>
						{/* Top bar: breadcrumbs | search | notifications + user */}
						<div className="border-bg-300 bg-bg-200 gap-m-400 flex h-12 shrink-0 items-center border-b px-m-600 lg:px-l-700 lg:pl-l-800">
							<PageBreadcrumb />
							<div className="flex-1" />
							{/* Fixed-width slot so search bar position is stable */}
							<div className="flex w-8 shrink-0 items-center justify-center">
								<PageGuideTrigger />
							</div>
							{/* Search trigger — opens CommandMenu via Cmd+K */}
							<Button
								id="desktop-search-trigger"
								type="button"
								variant="outline"
								size="sm"
								onClick={handleSearchClick}
								className="gap-s-200 px-s-300 py-s-100 text-tiny text-txt-placeholder hidden w-56 cursor-pointer items-center md:flex lg:w-72"
								aria-label={tCommon("searchPlaceholder")}
							>
								<Search className="h-3.5 w-3.5 shrink-0" />
								<span className="truncate">{tCommon("searchPlaceholder")}</span>
							</Button>
							<Button
								id="desktop-notifications"
								type="button"
								variant="ghost"
								size="icon"
								aria-label={tCommon("notifications")}
							>
								<Bell className="h-4.5 w-4.5" />
							</Button>
							<UserMenu isCollapsed />
						</div>

						{/* Scrollable main area */}
						<ScrollArea className="h-[calc(100dvh-3rem)]">
							<main id="main-content">{children}</main>
						</ScrollArea>
					</div>
				</>
			)}
				</PageGuideProvider>
				<BugReportPanel />
			</BugReportCaptureProvider>
		</BugReportProvider>
	)
}

export { AppShell }
