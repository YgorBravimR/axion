"use client"

import type { ComponentProps } from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = ({
	...props
}: ComponentProps<typeof SelectPrimitive.Root>) => {
	return <SelectPrimitive.Root data-slot="select" {...props} />
}

const SelectGroup = ({
	...props
}: ComponentProps<typeof SelectPrimitive.Group>) => {
	return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

const SelectValue = ({
	...props
}: ComponentProps<typeof SelectPrimitive.Value>) => {
	return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

const SelectTrigger = ({
	className,
	size = "default",
	children,
	id,
	...props
}: ComponentProps<typeof SelectPrimitive.Trigger> & {
	size?: "sm" | "default"
	id: string
}) => {
	return (
		<SelectPrimitive.Trigger
			id={id}
			data-slot="select-trigger"
			data-size={size}
			className={cn(
				"border-bg-300 data-[placeholder]:text-txt-300 [&_svg:not([class*='text-'])]:text-txt-300 focus-visible:border-acc-100 focus-visible:ring-acc-100/30 flex w-fit items-center justify-between gap-s-200 rounded-md border bg-transparent px-s-300 py-s-200 text-body md:text-small whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-s-200 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				"aria-[invalid=true]:border-fb-error aria-[invalid=true]:ring-fb-error/30 aria-[invalid=true]:ring-2",
				className
			)}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon asChild>
				<ChevronDownIcon className="size-4 opacity-50" />
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	)
}

const SelectContent = ({
	className,
	children,
	position = "item-aligned",
	align = "center",
	...props
}: ComponentProps<typeof SelectPrimitive.Content>) => {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				data-slot="select-content"
				className={cn(
					"bg-bg-100 text-txt-100 border-bg-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
					position === "popper" &&
						"data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
					className
				)}
				position={position}
				align={align}
				{...props}
			>
				<SelectScrollUpButton />
				<SelectPrimitive.Viewport
					className={cn(
						"p-s-100",
						position === "popper" &&
							"h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-s-100"
					)}
				>
					{children}
				</SelectPrimitive.Viewport>
				<SelectScrollDownButton />
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	)
}

const SelectLabel = ({
	className,
	...props
}: ComponentProps<typeof SelectPrimitive.Label>) => {
	return (
		<SelectPrimitive.Label
			data-slot="select-label"
			className={cn("text-txt-300 px-s-200 py-s-200 text-tiny", className)}
			{...props}
		/>
	)
}

const SelectItem = ({
	className,
	children,
	...props
}: ComponentProps<typeof SelectPrimitive.Item>) => {
	return (
		<SelectPrimitive.Item
			data-slot="select-item"
			className={cn(
				"focus:bg-bg-200 focus:text-txt-100 [&_svg:not([class*='text-'])]:text-txt-300 relative flex w-full cursor-default items-center gap-s-200 rounded-sm py-s-200 pr-l-700 pl-s-200 text-body md:text-small outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-s-200",
				className
			)}
			{...props}
		>
			<span
				data-slot="select-item-indicator"
				className="absolute right-2 flex size-3.5 items-center justify-center"
			>
				<SelectPrimitive.ItemIndicator>
					<CheckIcon className="size-4" />
				</SelectPrimitive.ItemIndicator>
			</span>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	)
}

const SelectSeparator = ({
	className,
	...props
}: ComponentProps<typeof SelectPrimitive.Separator>) => {
	return (
		<SelectPrimitive.Separator
			data-slot="select-separator"
			className={cn("bg-bg-300 pointer-events-none -mx-s-100 my-s-100 h-px", className)}
			{...props}
		/>
	)
}

const SelectScrollUpButton = ({
	className,
	...props
}: ComponentProps<typeof SelectPrimitive.ScrollUpButton>) => {
	return (
		<SelectPrimitive.ScrollUpButton
			data-slot="select-scroll-up-button"
			className={cn(
				"flex cursor-default items-center justify-center py-s-100",
				className
			)}
			{...props}
		>
			<ChevronUpIcon className="size-4" />
		</SelectPrimitive.ScrollUpButton>
	)
}

const SelectScrollDownButton = ({
	className,
	...props
}: ComponentProps<typeof SelectPrimitive.ScrollDownButton>) => {
	return (
		<SelectPrimitive.ScrollDownButton
			data-slot="select-scroll-down-button"
			className={cn(
				"flex cursor-default items-center justify-center py-s-100",
				className
			)}
			{...props}
		>
			<ChevronDownIcon className="size-4" />
		</SelectPrimitive.ScrollDownButton>
	)
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
