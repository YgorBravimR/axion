"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { LogOut, Settings, Loader2, Bug } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Link } from "@/i18n/routing"
import { logoutUser, getCurrentUser, type SafeUser } from "@/app/actions/auth"
import { useBugReport } from "@/components/bug-report/bug-report-provider"
import { cn } from "@/lib/utils"

interface UserMenuProps {
	isCollapsed: boolean
}

export const UserMenu = ({ isCollapsed }: UserMenuProps) => {
	const t = useTranslations("auth.accountSwitcher")
	const [isOpen, setIsOpen] = useState(false)
	const [isPending, startTransition] = useTransition()
	const [isLoading, setIsLoading] = useState(true)
	const [user, setUser] = useState<SafeUser | null>(null)
	const { openBugReport } = useBugReport()

	useEffect(() => {
		let mounted = true
		const fetchUser = async () => {
			try {
				const userData = await getCurrentUser()
				if (!mounted) {
					return
				}
				setUser(userData)
			} finally {
				if (mounted) {
					setIsLoading(false)
				}
			}
		}
		void fetchUser()
		return () => {
			mounted = false
		}
	}, [])

	const handleLogout = () => {
		startTransition(async () => {
			await logoutUser()
		})
	}

	const getInitials = (name: string | null) => {
		if (!name) {
			return "U"
		}
		const parts = name.split(" ")
		if (parts.length === 1) {
			return parts[0].charAt(0).toUpperCase()
		}
		return (
			parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
		).toUpperCase()
	}

	if (isLoading) {
		return (
			<div
				className={cn(
					"flex items-center justify-center",
					isCollapsed ? "h-11 w-11" : "px-s-300 h-10 w-full"
				)}
			>
				<Loader2 className="text-txt-300 h-4 w-4 animate-spin motion-reduce:animate-none" />
			</div>
		)
	}

	if (isCollapsed) {
		return (
			<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="bg-acc-100/20 text-acc-100 hover:bg-acc-100/30 flex h-11 w-11 items-center justify-center rounded-full"
						aria-label={t("userMenu")}
						disabled={isPending}
					>
						<span className="text-small font-medium">
							{getInitials(user?.name ?? null)}
						</span>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					id="dropdown-user-menu-collapsed"
					side="right"
					align="end"
					className="w-56"
				>
					<DropdownMenuLabel>
						<p className="truncate">{user?.name}</p>
						<p className="text-tiny text-txt-300 truncate font-normal">
							{user?.email}
						</p>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild>
						<Link
							href="/settings"
							className="cursor-pointer"
							onClick={() => setIsOpen(false)}
						>
							<Settings className="h-4 w-4" />
							<span>{t("settings")}</span>
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => {
							openBugReport()
							setIsOpen(false)
						}}
						className="cursor-pointer"
					>
						<Bug className="h-4 w-4" />
						<span>{t("reportBug")}</span>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={handleLogout}
						className="text-destructive focus:text-destructive cursor-pointer"
					>
						<LogOut className="h-4 w-4" />
						<span>{t("logout")}</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		)
	}

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"gap-s-300 px-s-300 py-s-200 hover:bg-bg-300 flex w-full items-center rounded-md text-left",
						isPending && "opacity-50"
					)}
					disabled={isPending}
				>
					<div className="bg-acc-100/20 text-acc-100 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
						<span className="text-small font-medium">
							{getInitials(user?.name ?? null)}
						</span>
					</div>
					<div className="flex-1 truncate">
						<p className="text-small text-txt-100 truncate font-medium">
							{user?.name}
						</p>
						<p className="text-tiny text-txt-300 truncate">{user?.email}</p>
					</div>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				id="dropdown-user-menu-expanded"
				side="right"
				align="end"
				className="w-56"
			>
				<DropdownMenuLabel>
					<p className="truncate">{user?.name}</p>
					<p className="text-tiny text-txt-300 truncate font-normal">
						{user?.email}
					</p>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link
						href="/settings"
						className="cursor-pointer"
						onClick={() => setIsOpen(false)}
					>
						<Settings className="h-4 w-4" />
						<span>{t("settings")}</span>
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => {
						openBugReport()
						setIsOpen(false)
					}}
					className="cursor-pointer"
				>
					<Bug className="h-4 w-4" />
					<span>{t("reportBug")}</span>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={handleLogout}
					className="text-destructive focus:text-destructive cursor-pointer"
				>
					<LogOut className="h-4 w-4" />
					<span>{t("logout")}</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
