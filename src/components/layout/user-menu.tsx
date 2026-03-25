"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { LogOut, Settings, Loader2 } from "lucide-react"
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

	useEffect(() => {
		const fetchUser = async () => {
			try {
				const userData = await getCurrentUser()
				setUser(userData)
			} finally {
				setIsLoading(false)
			}
		}
		fetchUser()
	}, [])

	const handleLogout = () => {
		startTransition(async () => {
			await logoutUser()
		})
	}

	const getInitials = (name: string | null) => {
		if (!name) return "U"
		const parts = name.split(" ")
		if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
		return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
	}

	if (isLoading) {
		return (
			<div className={cn(
				"flex items-center justify-center",
				isCollapsed ? "h-10 w-10" : "h-10 w-full px-3"
			)}>
				<Loader2 className="h-4 w-4 animate-spin text-txt-300" />
			</div>
		)
	}

	if (isCollapsed) {
		return (
			<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex h-10 w-10 items-center justify-center rounded-full bg-acc-100/20 text-acc-100 hover:bg-acc-100/30"
						aria-label={t("userMenu")}
						disabled={isPending}
					>
						<span className="text-sm font-medium">
							{getInitials(user?.name ?? null)}
						</span>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent id="dropdown-user-menu-collapsed" side="right" align="end" className="w-56">
					<DropdownMenuLabel>
						<p className="truncate">{user?.name}</p>
						<p className="text-xs font-normal text-txt-300 truncate">
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
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={handleLogout}
						className="cursor-pointer text-destructive focus:text-destructive"
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
						"flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-bg-300",
						isPending && "opacity-50"
					)}
					disabled={isPending}
				>
					<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-acc-100/20 text-acc-100">
						<span className="text-sm font-medium">
							{getInitials(user?.name ?? null)}
						</span>
					</div>
					<div className="flex-1 truncate">
						<p className="text-sm font-medium text-txt-100 truncate">
							{user?.name}
						</p>
						<p className="text-xs text-txt-300 truncate">{user?.email}</p>
					</div>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent id="dropdown-user-menu-expanded" side="right" align="end" className="w-56">
				<DropdownMenuLabel>
					<p className="truncate">{user?.name}</p>
					<p className="text-xs font-normal text-txt-300 truncate">
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
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={handleLogout}
					className="cursor-pointer text-destructive focus:text-destructive"
				>
					<LogOut className="h-4 w-4" />
					<span>{t("logout")}</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
