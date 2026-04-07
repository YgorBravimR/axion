"use client"

import {
	forwardRef,
	type ElementRef,
	type ComponentPropsWithoutRef,
	type HTMLAttributes,
	type ReactNode,
} from "react"
import { Command as CommandPrimitive } from "cmdk"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@/components/ui/dialog"

const Command = forwardRef<
	ElementRef<typeof CommandPrimitive>,
	ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
	<CommandPrimitive
		ref={ref}
		className={cn(
			"bg-bg-200 text-txt-100 flex h-full w-full flex-col overflow-hidden rounded-lg",
			className
		)}
		{...props}
	/>
))
Command.displayName = CommandPrimitive.displayName

interface CommandDialogProps {
	children: ReactNode
	open?: boolean
	onOpenChange?: (open: boolean) => void
	title?: string
}

const CommandDialog = ({
	children,
	title = "Command Palette",
	...props
}: CommandDialogProps) => (
	<Dialog {...props}>
		<DialogContent
			id="command-palette-dialog"
			className="overflow-hidden p-0 shadow-lg"
			aria-describedby={undefined}
		>
			<DialogTitle className="sr-only">{title}</DialogTitle>
			<Command className="[&_[cmdk-group-heading]]:text-txt-300 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
				{children}
			</Command>
		</DialogContent>
	</Dialog>
)

const CommandInput = forwardRef<
	ElementRef<typeof CommandPrimitive.Input>,
	ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
	<div className="flex items-center border-b border-bg-300 px-3" cmdk-input-wrapper="">
		<Search className="mr-2 h-4 w-4 shrink-0 text-txt-300 opacity-50" />
		<CommandPrimitive.Input
			ref={ref}
			className={cn(
				"placeholder:text-txt-placeholder flex h-11 w-full rounded-md bg-transparent py-3 text-small outline-none disabled:cursor-not-allowed disabled:opacity-50",
				className
			)}
			{...props}
		/>
	</div>
))
CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = forwardRef<
	ElementRef<typeof CommandPrimitive.List>,
	ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.List
		ref={ref}
		className={cn(
			"max-h-[300px] overflow-y-auto overflow-x-hidden",
			className
		)}
		{...props}
	/>
))
CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = forwardRef<
	ElementRef<typeof CommandPrimitive.Empty>,
	ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
	<CommandPrimitive.Empty
		ref={ref}
		className="py-6 text-center text-small text-txt-300"
		{...props}
	/>
))
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

const CommandGroup = forwardRef<
	ElementRef<typeof CommandPrimitive.Group>,
	ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Group
		ref={ref}
		className={cn(
			"text-txt-100 overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-tiny [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-txt-300",
			className
		)}
		{...props}
	/>
))
CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandSeparator = forwardRef<
	ElementRef<typeof CommandPrimitive.Separator>,
	ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Separator
		ref={ref}
		className={cn("-mx-1 h-px bg-bg-300", className)}
		{...props}
	/>
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

const CommandItem = forwardRef<
	ElementRef<typeof CommandPrimitive.Item>,
	ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Item
		ref={ref}
		className={cn(
			"relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-small outline-none data-[selected=true]:bg-bg-300 data-[selected=true]:text-txt-100 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
			className
		)}
		{...props}
	/>
))
CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandShortcut = ({
	className,
	...props
}: HTMLAttributes<HTMLSpanElement>) => (
	<span
		className={cn(
			"ml-auto text-tiny tracking-widest text-txt-300",
			className
		)}
		{...props}
	/>
)
CommandShortcut.displayName = "CommandShortcut"

export {
	Command,
	CommandDialog,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandShortcut,
	CommandSeparator,
}
