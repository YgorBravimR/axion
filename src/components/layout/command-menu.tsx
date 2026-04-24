"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/routing"
import { Plus } from "lucide-react"
import { navItems } from "@/lib/navigation"
import {
	CommandDialog,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandShortcut,
} from "@/components/ui/command"

const CommandMenu = () => {
	const [open, setOpen] = useState(false)
	const router = useRouter()
	const tNav = useTranslations("nav")
	const tCmd = useTranslations("commandMenu")

	const handleKeyDown = useCallback((event: KeyboardEvent) => {
		if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault()
			setOpen((prev) => !prev)
		}
	}, [])

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [handleKeyDown])

	const handleSelect = useCallback((href: string) => {
		setOpen(false)
		router.push(href)
	}, [router])

	return (
		<CommandDialog
			open={open}
			onOpenChange={setOpen}
			title={tCmd("placeholder")}
		>
			<CommandInput placeholder={tCmd("placeholder")} />
			<CommandList>
				<CommandEmpty>{tCmd("noResults")}</CommandEmpty>

				<CommandGroup heading={tCmd("navigation")}>
					{navItems.map((item) => (
						<CommandItem
							key={item.href}
							value={tNav(item.labelKey)}
							onSelect={() => handleSelect(item.href)}
						>
							<item.icon className="mr-2 h-4 w-4" aria-hidden="true" />
							<span>{tNav(item.labelKey)}</span>
							{item.labelKey === "dashboard" && (
								<CommandShortcut>
									<kbd className="font-mono text-tiny">G D</kbd>
								</CommandShortcut>
							)}
						</CommandItem>
					))}
				</CommandGroup>

				<CommandGroup heading={tCmd("actions")}>
					<CommandItem
						value={tNav("newTrade")}
						onSelect={() => handleSelect("/journal/new")}
					>
						<Plus className="mr-2 h-4 w-4" aria-hidden="true" />
						<span>{tNav("newTrade")}</span>
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	)
}

export { CommandMenu }
