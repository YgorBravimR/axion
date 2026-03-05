"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ExecutionList } from "./execution-list"
import { ExecutionForm } from "./execution-form"
import { PositionSummary } from "./position-summary"
import { convertToScaledMode } from "@/app/actions/executions"
import type { TradeExecution } from "@/db/schema"
import type { ExecutionSummary, PositionStatus } from "@/types"
import { Layers, Loader2 } from "lucide-react"
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

interface TradeExecutionsSectionProps {
	tradeId: string
	executionMode: "simple" | "scaled"
	direction: "long" | "short"
	executions: TradeExecution[]
	tickSize?: number
	tickValue?: number
}

export const TradeExecutionsSection = ({
	tradeId,
	executionMode,
	direction,
	executions,
	tickSize,
	tickValue,
}: TradeExecutionsSectionProps) => {
	const t = useTranslations("execution")
	const tCommon = useTranslations("common")
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [editingExecution, setEditingExecution] = useState<TradeExecution | null>(null)

	// Calculate summary from executions
	const calculateSummary = (): ExecutionSummary => {
		const entries = executions.filter((e) => e.executionType === "entry")
		const exits = executions.filter((e) => e.executionType === "exit")

		const totalEntryQuantity = entries.reduce(
			(sum, e) => sum + Number(e.quantity),
			0
		)
		const totalExitQuantity = exits.reduce(
			(sum, e) => sum + Number(e.quantity),
			0
		)

		const avgEntryPrice =
			totalEntryQuantity > 0
				? entries.reduce(
						(sum, e) => sum + Number(e.price) * Number(e.quantity),
						0
				  ) / totalEntryQuantity
				: 0

		const avgExitPrice =
			totalExitQuantity > 0
				? exits.reduce(
						(sum, e) => sum + Number(e.price) * Number(e.quantity),
						0
				  ) / totalExitQuantity
				: 0

		const totalCommission = executions.reduce(
			(sum, e) => sum + (Number(e.commission) || 0),
			0
		)
		const totalFees = executions.reduce((sum, e) => sum + (Number(e.fees) || 0), 0)

		let positionStatus: PositionStatus = "open"
		if (totalExitQuantity === 0) positionStatus = "open"
		else if (totalExitQuantity < totalEntryQuantity) positionStatus = "partial"
		else if (totalExitQuantity === totalEntryQuantity) positionStatus = "closed"
		else positionStatus = "over_exit"

		return {
			totalEntryQuantity,
			totalExitQuantity,
			avgEntryPrice,
			avgExitPrice,
			remainingQuantity: totalEntryQuantity - totalExitQuantity,
			positionStatus,
			entryCount: entries.length,
			exitCount: exits.length,
			totalCommission,
			totalFees,
		}
	}

	const handleConvertToScaled = () => {
		startTransition(async () => {
			const result = await convertToScaledMode(tradeId)
			if (result.status === "success") {
				router.refresh()
			}
		})
	}

	const handleAddExecution = () => {
		setEditingExecution(null)
		setIsFormOpen(true)
	}

	const handleEditExecution = (execution: TradeExecution) => {
		setEditingExecution(execution)
		setIsFormOpen(true)
	}

	const handleFormSuccess = () => {
		router.refresh()
	}

	// If in simple mode, show convert option
	if (executionMode === "simple") {
		return (
			<Card id="trade-executions-simple-card" className="p-m-400 sm:p-m-500 lg:p-m-600">
				<div className="flex flex-col gap-s-300 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-s-300">
						<Layers className="h-5 w-5 shrink-0 text-txt-300" />
						<div>
							<h3 className="text-small sm:text-body font-semibold text-txt-100">
								{t("scaledMode")}
							</h3>
							<p className="text-small text-txt-300">{t("convertDescription")}</p>
						</div>
					</div>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button id="trade-executions-convert-to-scaled" variant="outline" disabled={isPending}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								{t("convertToScaled")}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>{t("convertToScaled")}</AlertDialogTitle>
								<AlertDialogDescription>
									{t("convertDescription")}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel id="convert-scaled-cancel">{tCommon("cancel")}</AlertDialogCancel>
								<AlertDialogAction id="convert-scaled-confirm" onClick={handleConvertToScaled}>
									{tCommon("confirm")}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</Card>
		)
	}

	// Scaled mode - show executions
	const summary = calculateSummary()

	return (
		<div className="space-y-m-400 sm:space-y-m-500">
			{/* Position Summary */}
			{executions.length > 0 && (
				<PositionSummary
					summary={summary}
					direction={direction}
					tickSize={tickSize}
					tickValue={tickValue}
				/>
			)}

			{/* Execution List */}
			<Card id="trade-executions-scaled-card" className="p-m-400 sm:p-m-500 lg:p-m-600">
				<ExecutionList
					executions={executions}
					direction={direction}
					onAddExecution={handleAddExecution}
					onEditExecution={handleEditExecution}
					onExecutionDeleted={handleFormSuccess}
				/>
			</Card>

			{/* Execution Form Modal */}
			<ExecutionForm
				tradeId={tradeId}
				execution={editingExecution}
				existingExecutions={executions}
				open={isFormOpen}
				onOpenChange={setIsFormOpen}
				onSuccess={handleFormSuccess}
			/>
		</div>
	)
}
