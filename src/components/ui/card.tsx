import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

interface CardProps extends ComponentProps<"div"> {
	id: string
}

const Card = ({ className, ...props }: CardProps) => {
	return (
		<div
			data-slot="card"
			className={cn(
				"bg-bg-200 text-txt-100 gap-m-400 border-bg-300 py-m-400 shadow-medium flex flex-col rounded-md border sm:gap-m-500 sm:py-m-500 lg:gap-m-600 lg:py-m-600",
				className
			)}
			{...props}
		/>
	)
}

const CardHeader = ({ className, ...props }: ComponentProps<"div">) => {
	return (
		<div
			data-slot="card-header"
			className={cn(
				"gap-s-200 px-m-400 [.border-b]:pb-m-400 @container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] sm:px-m-500 sm:[.border-b]:pb-m-500 lg:px-m-600 lg:[.border-b]:pb-m-600",
				className
			)}
			{...props}
		/>
	)
}

const CardTitle = ({ className, ...props }: ComponentProps<"div">) => {
	return (
		<div
			data-slot="card-title"
			className={cn("leading-none font-semibold", className)}
			{...props}
		/>
	)
}

const CardDescription = ({ className, ...props }: ComponentProps<"div">) => {
	return (
		<div
			data-slot="card-description"
			className={cn("text-txt-200 text-small", className)}
			{...props}
		/>
	)
}

const CardAction = ({ className, ...props }: ComponentProps<"div">) => {
	return (
		<div
			data-slot="card-action"
			className={cn(
				"col-start-2 row-span-2 row-start-1 self-start justify-self-end",
				className
			)}
			{...props}
		/>
	)
}

const CardContent = ({ className, ...props }: ComponentProps<"div">) => {
	return (
		<div
			data-slot="card-content"
			className={cn("px-m-400 sm:px-m-500 lg:px-m-600", className)}
			{...props}
		/>
	)
}

const CardFooter = ({ className, ...props }: ComponentProps<"div">) => {
	return (
		<div
			data-slot="card-footer"
			className={cn(
				"px-m-400 [.border-t]:pt-m-400 flex items-center sm:px-m-500 sm:[.border-t]:pt-m-500 lg:px-m-600 lg:[.border-t]:pt-m-600",
				className
			)}
			{...props}
		/>
	)
}

export {
	Card,
	CardHeader,
	CardFooter,
	CardTitle,
	CardAction,
	CardDescription,
	CardContent,
}
