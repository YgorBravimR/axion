"use client"

import { useState, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Menu, Search, Bell } from "lucide-react"
import Image from "next/image"
import { Sidebar } from "@/components/layout/sidebar"
import { CommandMenu } from "@/components/layout/command-menu"
import { MarketStatusPill } from "@/components/layout/market-status-pill"
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
import { useBreakpoint } from "@/hooks/use-is-mobile"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import type { Brand } from "@/lib/brands"
import { buildNavStructure } from "@/lib/navigation"

interface AppShellProps {
	children: ReactNode
	serverBrand?: Brand
	nowIso: string
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
	serverBrand: _serverBrand,
	nowIso,
}: AppShellProps) => {
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
	const breakpoint = useBreakpoint()
	const tCommon = useTranslations("common")
	const navStructure = useMemo(
		() => buildNavStructure(new Date(nowIso)),
		[nowIso]
	)

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
						className="focus:bg-acc-100 focus:px-m-400 focus:py-s-200 focus:text-bg-100 sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:outline-none"
					>
						{tCommon("skipToContent")}
					</a>
					<ThemeSynchronizer />
					<CommandMenu navStructure={navStructure} />

					{isMobile ? (
						<>
							{/* Mobile top bar */}
							<header
								suppressHydrationWarning
								className="border-bg-300 bg-bg-200 px-m-400 fixed top-0 right-0 left-0 z-40 flex h-14 items-center border-b"
								aria-label={tCommon("appHeader")}
							>
								<Sheet
									open={isMobileMenuOpen}
									onOpenChange={setIsMobileMenuOpen}
								>
									<SheetTrigger asChild>
										<button
											type="button"
											className="text-txt-200 hover:bg-bg-300 hover:text-txt-100 focus-visible:ring-acc-100 -ml-s-200 flex h-11 w-11 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
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
											variant="sheet"
											onNavigate={() => setIsMobileMenuOpen(false)}
											navStructure={navStructure}
										/>
									</SheetContent>
								</Sheet>

								<Image
									src="/axion-wordmark-white.png"
									alt="Axion"
									width={100}
									height={28}
									className="ml-s-200 h-7 w-auto object-contain"
									style={{ height: "auto" }}
									priority
								/>

								<div className="gap-s-200 ml-auto flex items-center">
									<Button
										id="mobile-notifications"
										type="button"
										variant="ghost"
										size="icon"
										aria-label={tCommon("notifications")}
										aria-disabled="true"
										title={tCommon("comingSoon")}
										className="h-11 w-11 cursor-not-allowed opacity-50"
									>
										<Bell className="h-5 w-5" />
									</Button>
									<UserMenu isCollapsed />
								</div>
							</header>

							{/* Mobile main content */}
							<main id="main-content" className="min-h-dvh pt-14">
								{children}
							</main>
						</>
					) : (
						<>
							{/* Tablet & Desktop sidebar */}
							<Sidebar
								isCollapsed={effectiveCollapsed}
								onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
								hideCollapseToggle={isTablet}
								navStructure={navStructure}
							/>

							{/* Main content */}
							<div
								suppressHydrationWarning
								className={cn(
									"flex min-h-dvh min-w-0 flex-col transition-[margin-left] duration-300 motion-reduce:transition-none",
									effectiveCollapsed ? "ml-20" : "ml-64"
								)}
							>
								{/* Top bar: breadcrumbs | search | notifications + user */}
								<div className="border-bg-300 bg-bg-200 gap-m-400 px-m-600 lg:px-l-700 lg:pl-l-800 flex h-12 shrink-0 items-center border-b">
									<PageBreadcrumb navStructure={navStructure} />
									<MarketStatusPill />
									<div className="flex-1" />
									{/* Search trigger — opens CommandMenu via Cmd+K */}
									<Button
										id="desktop-search-trigger"
										type="button"
										variant="outline"
										size="sm"
										onClick={handleSearchClick}
										className="gap-s-200 px-s-300 py-s-100 text-tiny text-txt-placeholder hidden cursor-pointer items-center lg:flex lg:w-64 xl:w-80"
										aria-label={tCommon("searchPlaceholder")}
									>
										<Search className="h-3.5 w-3.5 shrink-0" />
										<span className="truncate">
											{tCommon("searchPlaceholder")}
										</span>
									</Button>
									<div className="gap-s-200 ml-auto flex items-center">
										{/* Fixed-width slot so search bar position is stable */}
										<div className="flex w-8 shrink-0 items-center justify-center">
											<PageGuideTrigger />
										</div>
										<Button
											id="desktop-notifications"
											type="button"
											variant="ghost"
											size="icon"
											aria-label={tCommon("notifications")}
											aria-disabled="true"
											title={tCommon("comingSoon")}
											className="cursor-not-allowed opacity-50"
										>
											<Bell className="h-4.5 w-4.5" />
										</Button>
										<UserMenu isCollapsed />
									</div>
								</div>

								{/* Scrollable main area */}
								<div className="h-[calc(100dvh-3.5rem)] overflow-y-auto md:h-[calc(100dvh-3rem)]">
									<main id="main-content">{children}</main>
								</div>
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
