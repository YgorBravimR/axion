"use client"

import type { ComponentProps } from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const Tabs = ({
	className,
	orientation = "horizontal",
	...props
}: ComponentProps<typeof TabsPrimitive.Root>) => (
	<TabsPrimitive.Root
		data-slot="tabs"
		data-orientation={orientation}
		orientation={orientation}
		className={cn(
			"group/tabs gap-s-200 flex data-[orientation=horizontal]:flex-col",
			className
		)}
		{...props}
	/>
)

const tabsListVariants = cva(
	"rounded-lg p-[3px] group-data-[orientation=horizontal]/tabs:h-9 data-[variant=line]:rounded-none group/tabs-list text-txt-300 inline-flex max-w-full items-center justify-start overflow-x-auto scrollbar-none sm:w-fit sm:justify-center group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:overflow-x-visible",
	{
		variants: {
			variant: {
				default: "bg-bg-300",
				line: "gap-s-100 bg-transparent",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
)

const TabsList = ({
	className,
	variant = "default",
	...props
}: ComponentProps<typeof TabsPrimitive.List> &
	VariantProps<typeof tabsListVariants>) => (
	<TabsPrimitive.List
		data-slot="tabs-list"
		data-variant={variant}
		className={cn(tabsListVariants({ variant }), className)}
		{...props}
	/>
)

const TabsTrigger = ({
	className,
	...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) => (
	<TabsPrimitive.Trigger
		data-slot="tabs-trigger"
		className={cn(
			"focus-visible:border-acc-100 focus-visible:ring-acc-100/30 focus-visible:outline-acc-100 text-txt-300 hover:text-txt-100 gap-s-200 px-s-200 py-s-100 text-small relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md border border-transparent font-medium whitespace-nowrap transition-colors group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
			"group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
			"data-[state=active]:bg-bg-100 data-[state=active]:text-txt-100",
			"after:bg-txt-100 after:absolute after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
			className
		)}
		{...props}
	/>
)

const TabsContent = ({
	className,
	...props
}: ComponentProps<typeof TabsPrimitive.Content>) => (
	<TabsPrimitive.Content
		data-slot="tabs-content"
		className={cn("flex-1 outline-none", className)}
		{...props}
	/>
)

const AnimatedTabsContent = ({
	className,
	...props
}: ComponentProps<typeof TabsPrimitive.Content>) => (
	<TabsPrimitive.Content
		data-slot="tabs-content"
		forceMount
		className={cn(
			"flex-1 outline-none data-[state=active]:animate-[tab-fade-in_200ms_ease-out] data-[state=inactive]:hidden motion-reduce:animate-none",
			className
		)}
		{...props}
	/>
)

export {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
	AnimatedTabsContent,
	tabsListVariants,
}
