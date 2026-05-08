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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

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
	onOpenChange?: (_open: boolean) => void
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
			<Command className="[&_[cmdk-group-heading]]:text-txt-300 [&_[cmdk-group-heading]]:px-s-200 [&_[cmdk-item]]:px-s-200 [&_[cmdk-item]]:py-s-300 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
				{children}
			</Command>
		</DialogContent>
	</Dialog>
)

const CommandInput = forwardRef<
	ElementRef<typeof CommandPrimitive.Input>,
	ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
	<div
		className="border-bg-300 px-s-300 flex items-center border-b"
		cmdk-input-wrapper=""
	>
		<Search className="mr-s-200 text-txt-300 h-4 w-4 shrink-0 opacity-50" />
		<CommandPrimitive.Input
			ref={ref}
			className={cn(
				"placeholder:text-txt-placeholder py-s-300 text-small flex h-11 w-full rounded-md bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-50",
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
		className={cn("max-h-[300px] overflow-x-hidden overflow-y-auto", className)}
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
		className="py-m-600 text-small text-txt-300 text-center"
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
			"text-txt-100 p-s-100 [&_[cmdk-group-heading]]:px-s-200 [&_[cmdk-group-heading]]:text-tiny [&_[cmdk-group-heading]]:text-txt-300 overflow-hidden [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium",
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
		className={cn("-mx-s-100 bg-bg-300 h-px", className)}
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
			"gap-s-200 px-s-200 text-small data-[selected=true]:bg-bg-300 data-[selected=true]:text-txt-100 relative flex cursor-default items-center rounded-sm py-1.5 outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
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
		className={cn("text-tiny text-txt-300 ml-auto tracking-widest", className)}
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
