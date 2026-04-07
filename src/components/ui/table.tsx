import { forwardRef } from "react"
import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

const Table = forwardRef<
	HTMLTableElement,
	HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
	<div className="relative w-full overflow-auto">
		<table
			ref={ref}
			className={cn("w-full caption-bottom text-small", className)}
			{...props}
		/>
	</div>
))
Table.displayName = "Table"

const TableHeader = forwardRef<
	HTMLTableSectionElement,
	HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
	<thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = forwardRef<
	HTMLTableSectionElement,
	HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
	<tbody
		ref={ref}
		className={cn("[&_tr:last-child]:border-0", className)}
		{...props}
	/>
))
TableBody.displayName = "TableBody"

const TableFooter = forwardRef<
	HTMLTableSectionElement,
	HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
	<tfoot
		ref={ref}
		className={cn(
			"border-t border-bg-300 bg-bg-100 font-medium",
			className
		)}
		{...props}
	/>
))
TableFooter.displayName = "TableFooter"

const TableRow = forwardRef<
	HTMLTableRowElement,
	HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
	<tr
		ref={ref}
		className={cn(
			"border-b border-bg-300 transition-colors hover:bg-bg-100 data-[state=selected]:bg-bg-100",
			className
		)}
		{...props}
	/>
))
TableRow.displayName = "TableRow"

const TableHead = forwardRef<
	HTMLTableCellElement,
	ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
	<th
		ref={ref}
		className={cn(
			"h-10 px-s-300 text-left align-middle text-caption font-medium text-txt-300 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
			className
		)}
		{...props}
	/>
))
TableHead.displayName = "TableHead"

const TableCell = forwardRef<
	HTMLTableCellElement,
	TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
	<td
		ref={ref}
		className={cn(
			"px-s-300 py-s-200 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
			className
		)}
		{...props}
	/>
))
TableCell.displayName = "TableCell"

const TableCaption = forwardRef<
	HTMLTableCaptionElement,
	HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
	<caption
		ref={ref}
		className={cn("mt-m-400 text-small text-txt-300", className)}
		{...props}
	/>
))
TableCaption.displayName = "TableCaption"

export {
	Table,
	TableHeader,
	TableBody,
	TableFooter,
	TableHead,
	TableRow,
	TableCell,
	TableCaption,
}
