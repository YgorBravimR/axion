"use client"

import { useState, useTransition } from "react"
import { useTranslations, useLocale } from "next-intl"
import { cn } from "@/lib/utils"
import { formatBrtShortDateTime } from "@/lib/dates"
import { Button } from "@/components/ui/button"
import { deleteExecution } from "@/app/actions/executions"
import type { TradeExecution } from "@/db/schema"
import { Plus, ArrowUp, ArrowDown, Trash2, Pencil, Loader2 } from "lucide-react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface ExecutionListProps {
	executions: TradeExecution[]
	direction: "long" | "short"
	onAddExecution: () => void
	onEditExecution: (execution: TradeExecution) => void
	onExecutionDeleted?: () => void
	className?: string
}

export const ExecutionList = ({
	executions,
	direction,
	onAddExecution,
	onEditExecution,
	onExecutionDeleted,
	className,
}: ExecutionListProps) => {
	const t = useTranslations("execution")
	const tCommon = useTranslations("common")
	const locale = useLocale()
	const [isPending, startTransition] = useTransition()
	const [deletingId, setDeletingId] = useState<string | null>(null)

	// Sort all executions chronologically (no entry/exit grouping)
	const sortedExecutions = executions.toSorted(
		(a, b) =>
			new Date(a.executionDate).getTime() - new Date(b.executionDate).getTime()
	)

	// Calculate totals
	const entries = executions.filter((e) => e.executionType === "entry")
	const exits = executions.filter((e) => e.executionType === "exit")
	const totalEntryQty = entries.reduce((sum, e) => sum + Number(e.quantity), 0)
	const totalExitQty = exits.reduce((sum, e) => sum + Number(e.quantity), 0)

	// Calculate average prices
	const avgEntryPrice =
		totalEntryQty > 0
			? entries.reduce(
					(sum, e) => sum + Number(e.price) * Number(e.quantity),
					0
				) / totalEntryQty
			: 0

	const avgExitPrice =
		totalExitQty > 0
			? exits.reduce(
					(sum, e) => sum + Number(e.price) * Number(e.quantity),
					0
				) / totalExitQty
			: 0

	const handleDelete = (id: string) => {
		setDeletingId(id)
		startTransition(async () => {
			const result = await deleteExecution(id)
			if (result.status === "success") {
				onExecutionDeleted?.()
			}
			setDeletingId(null)
		})
	}

	const formatPrice = (price: string | number): string => {
		const num = typeof price === "string" ? parseFloat(price) : price
		return num.toLocaleString(locale, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})
	}

	const formatQuantity = (qty: string | number): string => {
		const num = typeof qty === "string" ? parseFloat(qty) : qty
		return num.toLocaleString(locale, {
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
		})
	}

	return (
		<div className={cn("space-y-s-300 sm:space-y-m-400", className)}>
			<div className="flex items-center justify-between">
				<h3 className="text-body text-txt-100 font-semibold">{t("title")}</h3>
				<Button
					id="execution-list-add"
					variant="outline"
					size="sm"
					onClick={onAddExecution}
					aria-label={t("add")}
				>
					<Plus className="mr-1 h-4 w-4" aria-hidden="true" />
					{t("add")}
				</Button>
			</div>

			{executions.length === 0 ? (
				<div className="border-stroke-100 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border text-center">
					<p className="text-small text-txt-300">{t("noExecutions")}</p>
					<Button
						id="execution-list-add-first"
						variant="ghost"
						size="sm"
						className="mt-s-200"
						onClick={onAddExecution}
						aria-label={t("addFirst")}
					>
						<Plus className="mr-1 h-4 w-4" aria-hidden="true" />
						{t("addFirst")}
					</Button>
				</div>
			) : (
				<div className="space-y-s-300">
					{/* Chronological Execution List */}
					<div className="gap-s-300 text-small text-txt-300 flex items-center">
						<span>
							{t("entries")}: {entries.length}
						</span>
						<span>
							{t("exits")}: {exits.length}
						</span>
					</div>
					<div className="space-y-s-200">
						{sortedExecutions.map((execution) => (
							<ExecutionRow
								key={execution.id}
								execution={execution}
								type={execution.executionType as "entry" | "exit"}
								direction={direction}
								onEdit={() => onEditExecution(execution)}
								onDelete={() => handleDelete(execution.id)}
								isDeleting={deletingId === execution.id}
								formatPrice={formatPrice}
								formatQuantity={formatQuantity}
								t={t}
								tCommon={tCommon}
							/>
						))}
					</div>

					{/* Summary */}
					<div className="border-stroke-100 bg-bg-200 p-s-200 sm:p-s-300 rounded-lg border">
						<div className="gap-s-200 sm:gap-s-300 text-small grid grid-cols-2">
							<div>
								<span className="text-txt-200">{t("totalIn")}:</span>
								<span className="ml-s-200 text-txt-100">
									{formatQuantity(totalEntryQty)}
								</span>
							</div>
							<div>
								<span className="text-txt-200">{t("totalOut")}:</span>
								<span className="ml-s-200 text-txt-100">
									{formatQuantity(totalExitQty)}
								</span>
							</div>
							<div>
								<span className="text-txt-200">{t("avgEntry")}:</span>
								<span className="ml-s-200 text-txt-100">
									{formatPrice(avgEntryPrice)}
								</span>
							</div>
							<div>
								<span className="text-txt-200">{t("avgExit")}:</span>
								<span className="ml-s-200 text-txt-100">
									{totalExitQty > 0 ? formatPrice(avgExitPrice) : "-"}
								</span>
							</div>
							<div className="col-span-2">
								<span className="text-txt-200">{t("remaining")}:</span>
								<span
									className={cn(
										"ml-s-200 font-semibold",
										totalEntryQty - totalExitQty > 0
											? "text-fb-warning"
											: "text-trade-buy"
									)}
								>
									{formatQuantity(totalEntryQty - totalExitQty)}
								</span>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

interface ExecutionRowProps {
	execution: TradeExecution
	type: "entry" | "exit"
	direction: "long" | "short"
	onEdit: () => void
	onDelete: () => void
	isDeleting: boolean
	formatPrice: (price: string | number) => string
	formatQuantity: (qty: string | number) => string
	t: ReturnType<typeof useTranslations>
	tCommon: ReturnType<typeof useTranslations>
}

const ExecutionRow = ({
	execution,
	type,
	direction,
	onEdit,
	onDelete,
	isDeleting,
	formatPrice,
	formatQuantity,
	t,
	tCommon,
}: ExecutionRowProps) => {
	// Color by side (buy/sell), not by entry/exit -- clearer for short positions
	const isBuy =
		(direction === "long" && type === "entry") ||
		(direction === "short" && type === "exit")

	return (
		<div
			className={cn(
				"px-s-200 sm:px-s-300 py-s-200 flex flex-wrap items-center justify-between gap-s-200 rounded-md border",
				isBuy
					? "border-action-buy/20 bg-action-buy/5"
					: "border-action-sell/20 bg-action-sell/5"
			)}
		>
			<div className="gap-s-200 sm:gap-m-400 flex items-center min-w-0">
				{/* Side indicator -- buy (up arrow) or sell (down arrow) */}
				{isBuy ? (
					<ArrowUp
						className="text-action-buy h-3.5 w-3.5 shrink-0"
						aria-label={t("entry")}
					/>
				) : (
					<ArrowDown
						className="text-action-sell h-3.5 w-3.5 shrink-0"
						aria-label={t("exit")}
					/>
				)}
				<div className="text-small">
					<span className="text-txt-300">
						{formatBrtShortDateTime(new Date(execution.executionDate))}
					</span>
				</div>
				<div className="text-small">
					<span className="text-txt-100 font-semibold">
						{formatQuantity(execution.quantity)}
					</span>
					<span className="mx-s-100 text-txt-300">@</span>
					<span className="text-txt-100">{formatPrice(execution.price)}</span>
				</div>
				{execution.orderType && (
					<span className="bg-bg-300 px-s-200 py-s-100 text-caption text-txt-300 rounded">
						{execution.orderType}
					</span>
				)}
			</div>
			<div className="gap-s-200 flex items-center">
				<Button
					id={`execution-edit-${execution.id}`}
					variant="ghost"
					size="icon"
					className="h-9 w-9"
					onClick={onEdit}
					aria-label={t("edit")}
				>
					<Pencil className="h-3.5 w-3.5" aria-hidden="true" />
				</Button>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							id={`execution-delete-${execution.id}`}
							variant="ghost"
							size="icon"
							className="text-fb-error hover:text-fb-error h-9 w-9"
							disabled={isDeleting}
							aria-label={t("delete")}
						>
							{isDeleting ? (
								<Loader2
									className="h-3.5 w-3.5 animate-spin"
									aria-hidden="true"
								/>
							) : (
								<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
							)}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
							<AlertDialogDescription>
								{t("deleteDescription")}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel id="execution-delete-cancel">
								{tCommon("cancel")}
							</AlertDialogCancel>
							<AlertDialogAction
								id="execution-delete-confirm"
								className="bg-fb-error hover:bg-fb-error/90"
								onClick={onDelete}
							>
								{tCommon("delete")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	)
}
