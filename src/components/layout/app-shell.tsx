"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Menu } from "lucide-react"
import Image from "next/image"
import { Sidebar } from "@/components/layout/sidebar"
import { CommandMenu } from "@/components/layout/command-menu"
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb"
import { ThemeSynchronizer } from "@/components/providers/theme-synchronizer"
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Kbd } from "@/components/ui/kbd"
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

	return (
		<>
			<ThemeSynchronizer />
			{/* <BrandSynchronizer serverBrand={serverBrand} /> */}
			<CommandMenu />

			{isMobile ? (
				<>
					{/* Mobile top bar */}
					<header className="border-bg-300 bg-bg-200 fixed top-0 right-0 left-0 z-40 flex h-14 items-center border-b px-4">
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
							src="/bravo-nobg.png"
							alt="Bravo"
							width={100}
							height={28}
							className="ml-2 h-7 w-auto object-contain"
							priority
						/>

						<div className="ml-auto">
							<PageBreadcrumb />
						</div>
					</header>

					{/* Mobile main content */}
					<main className="min-h-dvh pt-14">{children}</main>
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
							"flex min-h-dvh flex-col transition-[margin-left] duration-300",
							effectiveCollapsed ? "ml-16" : "ml-64"
						)}
					>
						{/* Breadcrumb bar */}
						<div className="border-bg-300 bg-bg-200 flex h-12 shrink-0 items-center justify-between border-b px-4 lg:px-6">
							<PageBreadcrumb />
							<Kbd keys={["mod", "K"]} />
						</div>

						{/* Scrollable main area */}
						<ScrollArea className="h-[calc(100dvh-3rem)]">
							<main>{children}</main>
						</ScrollArea>
					</div>
				</>
			)}
		</>
	)
}

export { AppShell }
