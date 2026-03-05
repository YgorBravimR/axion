"use client"

import { useState, type ReactNode } from "react"
import { Sidebar } from "./sidebar"
import { cn } from "@/lib/utils"

interface MainLayoutProps {
	children: ReactNode
}

const MainLayout = ({ children }: MainLayoutProps) => {
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

	return (
		<>
			<Sidebar
				isCollapsed={isSidebarCollapsed}
				onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
			/>
			<main
				className={cn(
					"min-h-dvh transition-[margin-left] duration-300",
					isSidebarCollapsed ? "ml-16" : "ml-64"
				)}
			>
				{children}
			</main>
		</>
	)
}

export { MainLayout }
