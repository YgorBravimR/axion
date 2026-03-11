"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import {
	ChevronDown,
	ChevronUp,
	CheckCircle2,
	XCircle,
	AlertTriangle,
	Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ProcessedCsvTrade } from "@/app/actions/csv-import"
import { APP_TIMEZONE } from "@/lib/dates"
import type { Strategy, Tag, Timeframe } from "@/db/schema"

interface CsvTradeCardProps {
	trade: ProcessedCsvTrade
	isExpanded: boolean
	isSelected: boolean
	onToggleExpand: () => void
	onToggleSelect: () => void
	onEdit: (edits: ProcessedCsvTrade["edits"]) => void
	strategies: Strategy[]
	timeframes: Timeframe[]
	tags: Tag[]
}

export const CsvTradeCard = ({
	trade,
	isExpanded,
	isSelected,
	onToggleExpand,
	onToggleSelect,
	onEdit,
	strategies,
	timeframes,
	tags,
}: CsvTradeCardProps) => {
	const t = useTranslations("journal.csvCard")
	const tCommon = useTranslations("common")
	const tForm = useTranslations("journal.form")
	const [activeTab, setActiveTab] = useState("basic")

	const formatCurrency = (value: number | null) => {
		if (value === null) return "--"
		const formatted = new Intl.NumberFormat("pt-BR", {
			style: "currency",
			currency: "BRL",
			minimumFractionDigits: 2,
		}).format(value)
		return value >= 0 ? `+${formatted}` : formatted
	}

	const formatPrice = (value: number | string | undefined) => {
		if (!value) return "--"
		return new Intl.NumberFormat("pt-BR", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(Number(value))
	}

	const formatTime = (date: Date | string | number | undefined) => {
		if (!date) return "--"
		const d = date instanceof Date ? date : new Date(date)
		return d.toLocaleTimeString("pt-BR", {
			hour: "2-digit",
			minute: "2-digit",
			timeZone: APP_TIMEZONE,
		})
	}

	const formatDate = (date: Date | string | number | undefined) => {
		if (!date) return "--"
		const d = date instanceof Date ? date : new Date(date)
		return d.toLocaleDateString("pt-BR", { timeZone: APP_TIMEZONE })
	}

	const handleEditField = <K extends keyof ProcessedCsvTrade["edits"]>(
		field: K,
		value: ProcessedCsvTrade["edits"][K]
	) => {
		onEdit({ ...trade.edits, [field]: value })
	}

	const setupTags = tags.filter((t) => t.type === "setup")
	const mistakeTags = tags.filter((t) => t.type === "mistake")

	const handleTagToggle = (tagId: string) => {
		const currentTags = trade.edits.tagIds || []
		const newTags = currentTags.includes(tagId)
			? currentTags.filter((id) => id !== tagId)
			: [...currentTags, tagId]
		handleEditField("tagIds", newTags)
	}

	const isSkipped = trade.status === "skipped"
	const isWarning = trade.status === "warning"

	return (
		<div
			className={cn(
				"rounded-lg border transition-all",
				isSkipped
					? "border-fb-error/30 bg-fb-error/5"
					: isWarning
						? "border-warning/30 bg-warning/5"
						: "border-bg-300 bg-bg-200",
				isExpanded && "ring-acc-100 ring-1"
			)}
		>
			{/* Collapsed Header */}
			<div
				className={cn(
					"gap-s-100 sm:gap-s-200 md:gap-m-400 px-s-300 sm:px-m-400 py-s-300 flex flex-wrap items-center",
					!isSkipped && "cursor-pointer"
				)}
				onClick={() => !isSkipped && onToggleExpand()}
				onKeyDown={(e) => e.key === "Enter" && !isSkipped && onToggleExpand()}
				tabIndex={isSkipped ? -1 : 0}
				role="button"
				aria-expanded={isExpanded}
			>
				{/* Select Checkbox */}
				<div onClick={(e) => e.stopPropagation()}>
					<Checkbox
						id={`csv-trade-select-${trade.rowNumber}`}
						checked={isSelected}
						onCheckedChange={() => onToggleSelect()}
						disabled={isSkipped}
						aria-label={`Select trade ${trade.rowNumber}`}
					/>
				</div>

				{/* Status Icon */}
				<div className="flex-shrink-0">
					{isSkipped ? (
						<XCircle className="text-fb-error h-5 w-5" />
					) : isWarning ? (
						<AlertTriangle className="text-warning h-5 w-5" />
					) : (
						<CheckCircle2 className="text-trade-buy h-5 w-5" />
					)}
				</div>

				{/* Row Number */}
				<span className="text-tiny text-txt-300">#{trade.rowNumber}</span>

				{/* Asset */}
				<div className="gap-s-100 flex items-center">
					<span className="text-small text-txt-100 font-semibold">
						{trade.originalData.normalizedAsset}
					</span>
					{trade.originalData.originalAssetCode !==
						trade.originalData.normalizedAsset && (
						<Tooltip>
							<TooltipTrigger>
								<Info className="text-txt-300 h-3 w-3" />
							</TooltipTrigger>
							<TooltipContent id={`tooltip-csv-asset-${trade.rowNumber}`}>
								{t("original", { value: trade.originalData.originalAssetCode })}
							</TooltipContent>
						</Tooltip>
					)}
				</div>

				{/* Direction */}
				<span
					className={cn(
						"px-s-200 py-s-100 text-tiny rounded font-medium",
						trade.originalData.direction === "long"
							? "bg-action-buy/20 text-action-buy"
							: "bg-action-sell/20 text-action-sell"
					)}
				>
					{trade.originalData.direction.toUpperCase()}
				</span>

				{/* Time Range */}
				<span className="text-small text-txt-200">
					{formatTime(trade.originalData.entryDate)}
					{trade.originalData.exitDate &&
						` → ${formatTime(trade.originalData.exitDate)}`}
				</span>

				{/* Position Size */}
				<span className="text-small text-txt-300">
					{trade.originalData.positionSize} {t("contracts")}
				</span>

				{/* Spacer */}
				<div className="flex-1" />

				{/* Skipped Reason or P&L */}
				{isSkipped ? (
					<span className="text-small text-fb-error">{trade.skipReason}</span>
				) : (
					<div className="gap-m-400 flex items-center">
						{/* Entry → Exit */}
						<span className="text-small text-txt-200">
							{formatPrice(trade.originalData.entryPrice)} →{" "}
							{formatPrice(trade.originalData.exitPrice)}
						</span>

						{/* Net P&L */}
						<span
							className={cn(
								"text-small font-semibold",
								trade.netPnl !== null
									? trade.netPnl >= 0
										? "text-trade-buy"
										: "text-trade-sell"
									: "text-txt-300"
							)}
						>
							{formatCurrency(trade.netPnl)}
						</span>

						{/* Expand Button */}
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation()
								onToggleExpand()
							}}
							className="p-s-100 text-txt-300 hover:bg-bg-100 hover:text-txt-100 rounded"
							aria-label={isExpanded ? tCommon("collapse") : tCommon("expand")}
						>
							{isExpanded ? (
								<ChevronUp className="h-4 w-4" />
							) : (
								<ChevronDown className="h-4 w-4" />
							)}
						</button>
					</div>
				)}
			</div>

			{/* Expanded Content */}
			{isExpanded && !isSkipped && (
				<div className="border-bg-300 p-s-300 sm:p-m-400 border-t">
					{/* P&L Breakdown */}
					{trade.assetConfig && (
						<div className="mb-s-300 sm:mb-m-400 border-bg-300 bg-bg-100 p-s-200 sm:p-s-300 rounded-lg border">
							<div className="flex flex-wrap items-center justify-between gap-s-200">
								<div className="gap-s-200 sm:gap-m-400 text-small flex flex-wrap items-center">
									<span className="text-txt-300">
										{t("ticks")} {trade.ticksGained?.toFixed(1) || "--"}
									</span>
									<span className="text-txt-300">
										{t("gross")} {formatCurrency(trade.grossPnl)}
									</span>
									<span className="text-txt-300">
										{t("costs")}{" "}
										{formatCurrency(
											trade.totalCosts ? -trade.totalCosts : null
										)}
									</span>
								</div>
								<span
									className={cn(
										"text-body font-bold",
										trade.netPnl !== null
											? trade.netPnl >= 0
												? "text-trade-buy"
												: "text-trade-sell"
											: "text-txt-300"
									)}
								>
									{t("net")} {formatCurrency(trade.netPnl)}
								</span>
							</div>
							<div className="mt-s-200 text-tiny text-txt-300">
								{t("commission", { value: (trade.assetConfig.commission / 100 * Number(trade.originalData.positionSize) * 2).toFixed(2) })}
								{" | "}
								{t("fees", { value: (trade.assetConfig.fees / 100 * Number(trade.originalData.positionSize) * 2).toFixed(2) })}
								{" | "}
								{t("tickSize", { value: trade.assetConfig.tickSize })}
								{" | "}
								{t("tickValue", { value: (trade.assetConfig.tickValue / 100).toFixed(2) })}
							</div>
						</div>
					)}

					{/* Tabbed Editor */}
					<Tabs value={activeTab} onValueChange={setActiveTab}>
						<TabsList className="mb-s-300 sm:mb-m-400 w-full justify-start">
							<TabsTrigger value="basic">{tForm("basicInfo")}</TabsTrigger>
							<TabsTrigger value="risk">{tForm("risk")}</TabsTrigger>
							<TabsTrigger value="journal">{tForm("journal")}</TabsTrigger>
							<TabsTrigger value="tags">{tForm("tagsSection")}</TabsTrigger>
						</TabsList>

						{/* Basic Info Tab */}
						<TabsContent value="basic" className="space-y-s-300 sm:space-y-m-400">
							<div className="gap-s-300 sm:gap-m-400 grid grid-cols-2 md:grid-cols-4">
								{/* Date */}
								<div>
									<Label id="label-csv-date" className="text-tiny text-txt-300">
										{t("date")}
									</Label>
									<div className="mt-s-100 text-small text-txt-100">
										{formatDate(trade.originalData.entryDate)}
									</div>
								</div>

								{/* Direction (readonly) */}
								<div>
									<Label
										id="label-csv-direction"
										className="text-tiny text-txt-300"
									>
										{t("direction")}
									</Label>
									<div
										className={cn(
											"mt-s-100 text-small font-medium",
											trade.originalData.direction === "long"
												? "text-action-buy"
												: "text-action-sell"
										)}
									>
										{trade.originalData.direction.toUpperCase()}
									</div>
								</div>

								{/* Strategy */}
								<div>
									<Label
										id="label-csv-strategy"
										className="text-tiny text-txt-300"
									>
										{t("strategy")}
									</Label>
									<Select
										value={trade.edits.strategyId || ""}
										onValueChange={(v) =>
											handleEditField("strategyId", v || undefined)
										}
									>
										<SelectTrigger
											id="csv-trade-strategy"
											className="mt-s-100 h-8"
										>
											<SelectValue placeholder={t("selectPlaceholder")} />
										</SelectTrigger>
										<SelectContent>
											{strategies.map((s) => (
												<SelectItem key={s.id} value={s.id}>
													{s.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Timeframe */}
								<div>
									<Label
										id="label-csv-timeframe"
										className="text-tiny text-txt-300"
									>
										{t("timeframe")}
									</Label>
									<Select
										value={trade.edits.timeframeId || ""}
										onValueChange={(v) =>
											handleEditField("timeframeId", v || undefined)
										}
									>
										<SelectTrigger
											id="csv-trade-timeframe"
											className="mt-s-100 h-8"
										>
											<SelectValue placeholder={t("selectPlaceholder")} />
										</SelectTrigger>
										<SelectContent>
											{timeframes.map((tf) => (
												<SelectItem key={tf.id} value={tf.id}>
													{tf.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							{/* Prices (readonly) */}
							<div className="gap-s-300 sm:gap-m-400 grid grid-cols-2 md:grid-cols-4">
								<div>
									<Label
										id="label-csv-entry-price"
										className="text-tiny text-txt-300"
									>
										{t("entryPrice")}
									</Label>
									<div className="mt-s-100 text-small text-txt-100">
										{formatPrice(trade.originalData.entryPrice)}
									</div>
								</div>
								<div>
									<Label
										id="label-csv-exit-price"
										className="text-tiny text-txt-300"
									>
										{t("exitPrice")}
									</Label>
									<div className="mt-s-100 text-small text-txt-100">
										{formatPrice(trade.originalData.exitPrice)}
									</div>
								</div>
								<div>
									<Label
										id="label-csv-position-size"
										className="text-tiny text-txt-300"
									>
										{t("positionSize")}
									</Label>
									<div className="mt-s-100 text-small text-txt-100">
										{trade.originalData.positionSize}
									</div>
								</div>
								<div>
									<Label id="label-csv-pnl" className="text-tiny text-txt-300">
										{t("pnlFromCsv")}
									</Label>
									<div className="mt-s-100 text-small text-txt-100">
										{trade.originalData.pnl
											? formatCurrency(Number(trade.originalData.pnl))
											: "--"}
									</div>
								</div>
							</div>
						</TabsContent>

						{/* Risk Tab */}
						<TabsContent value="risk" className="space-y-s-300 sm:space-y-m-400">
							<div className="gap-s-300 sm:gap-m-400 grid grid-cols-2 md:grid-cols-4">
								<div>
									<Label
										id={`label-csv-sl-${trade.id}`}
										htmlFor={`sl-${trade.id}`}
										className="text-tiny text-txt-300"
									>
										{t("stopLoss")}
									</Label>
									<Input
										id={`sl-${trade.id}`}
										type="number"
										step="0.01"
										value={trade.edits.stopLoss || ""}
										onChange={(e) =>
											handleEditField(
												"stopLoss",
												e.target.value ? Number(e.target.value) : undefined
											)
										}
										className="mt-s-100 h-8"
										placeholder={t("optionalPlaceholder")}
									/>
								</div>
								<div>
									<Label
										id={`label-csv-tp-${trade.id}`}
										htmlFor={`tp-${trade.id}`}
										className="text-tiny text-txt-300"
									>
										{t("takeProfit")}
									</Label>
									<Input
										id={`tp-${trade.id}`}
										type="number"
										step="0.01"
										value={trade.edits.takeProfit || ""}
										onChange={(e) =>
											handleEditField(
												"takeProfit",
												e.target.value ? Number(e.target.value) : undefined
											)
										}
										className="mt-s-100 h-8"
										placeholder={t("optionalPlaceholder")}
									/>
								</div>
								<div>
									<Label id="label-csv-mfe" className="text-tiny text-txt-300">
										{t("mfeFromCsv")}
									</Label>
									<div className="mt-s-100 text-small text-txt-100">
										{trade.originalData.mfe
											? formatCurrency(Number(trade.originalData.mfe))
											: "--"}
									</div>
								</div>
								<div>
									<Label id="label-csv-mae" className="text-tiny text-txt-300">
										{t("maeFromCsv")}
									</Label>
									<div className="mt-s-100 text-small text-txt-100">
										{trade.originalData.mae
											? formatCurrency(-Number(trade.originalData.mae))
											: "--"}
									</div>
								</div>
							</div>
						</TabsContent>

						{/* Journal Tab */}
						<TabsContent value="journal" className="space-y-s-300 sm:space-y-m-400">
							<div>
								<Label
									id={`label-csv-thoughts-${trade.id}`}
									htmlFor={`thoughts-${trade.id}`}
									className="text-tiny text-txt-300"
								>
									{t("preTradeThoughts")}
								</Label>
								<Textarea
									id={`thoughts-${trade.id}`}
									value={trade.edits.preTradeThoughts || ""}
									onChange={(e) =>
										handleEditField("preTradeThoughts", e.target.value)
									}
									className="mt-s-100 min-h-[80px]"
									placeholder={t("planPlaceholder")}
								/>
							</div>

							<div>
								<Label
									id={`label-csv-reflection-${trade.id}`}
									htmlFor={`reflection-${trade.id}`}
									className="text-tiny text-txt-300"
								>
									{t("postTradeReflection")}
								</Label>
								<Textarea
									id={`reflection-${trade.id}`}
									value={trade.edits.postTradeReflection || ""}
									onChange={(e) =>
										handleEditField("postTradeReflection", e.target.value)
									}
									className="mt-s-100 min-h-[80px]"
									placeholder={t("reflectionPlaceholder")}
								/>
							</div>

							<div>
								<Label
									id={`label-csv-lesson-${trade.id}`}
									htmlFor={`lesson-${trade.id}`}
									className="text-tiny text-txt-300"
								>
									{t("lessonLearned")}
								</Label>
								<Textarea
									id={`lesson-${trade.id}`}
									value={trade.edits.lessonLearned || ""}
									onChange={(e) =>
										handleEditField("lessonLearned", e.target.value)
									}
									className="mt-s-100 min-h-[60px]"
									placeholder={t("lessonPlaceholder")}
								/>
							</div>

							{/* Follow Plan */}
							<div className="gap-m-400 flex items-center">
								<Label
									id="label-csv-followed-plan"
									className="text-tiny text-txt-300"
								>
									{t("followedPlan")}
								</Label>
								<div className="gap-s-200 flex">
									<button
										type="button"
										onClick={() => handleEditField("followedPlan", true)}
										className={cn(
											"px-m-400 py-s-200 text-small rounded-md font-medium transition-colors",
											trade.edits.followedPlan === true
												? "bg-trade-buy text-bg-100"
												: "bg-bg-300 text-txt-200 hover:bg-bg-100"
										)}
									>
										{tCommon("yes")}
									</button>
									<button
										type="button"
										onClick={() => handleEditField("followedPlan", false)}
										className={cn(
											"px-m-400 py-s-200 text-small rounded-md font-medium transition-colors",
											trade.edits.followedPlan === false
												? "bg-fb-error text-white"
												: "bg-bg-300 text-txt-200 hover:bg-bg-100"
										)}
									>
										{tCommon("no")}
									</button>
								</div>
							</div>

							{/* Discipline Notes (shown when followedPlan is false) */}
							{trade.edits.followedPlan === false && (
								<div>
									<Label
										id={`label-csv-discipline-${trade.id}`}
										htmlFor={`discipline-${trade.id}`}
										className="text-tiny text-txt-300"
									>
										{t("whatWentWrong")}
									</Label>
									<Textarea
										id={`discipline-${trade.id}`}
										value={trade.edits.disciplineNotes || ""}
										onChange={(e) =>
											handleEditField("disciplineNotes", e.target.value)
										}
										className="mt-s-100 min-h-[60px]"
										placeholder={t("disciplinePlaceholder")}
									/>
								</div>
							)}
						</TabsContent>

						{/* Tags Tab */}
						<TabsContent value="tags" className="space-y-s-300 sm:space-y-m-400">
							{/* Setup Tags */}
							{setupTags.length > 0 && (
								<div>
									<Label
										id="label-csv-setup-type"
										className="text-tiny text-txt-300"
									>
										{t("setupType")}
									</Label>
									<div className="mt-s-200 gap-s-200 flex flex-wrap">
										{setupTags.map((tag) => (
											<button
												key={tag.id}
												type="button"
												onClick={() => handleTagToggle(tag.id)}
												className={cn(
													"px-s-300 py-s-100 text-tiny rounded-full font-medium transition-colors",
													trade.edits.tagIds?.includes(tag.id)
														? "bg-acc-100 text-bg-100"
														: "bg-bg-300 text-txt-200 hover:bg-bg-100"
												)}
												style={
													trade.edits.tagIds?.includes(tag.id) && tag.color
														? { backgroundColor: tag.color }
														: undefined
												}
											>
												{tag.name}
											</button>
										))}
									</div>
								</div>
							)}

							{/* Mistake Tags */}
							{mistakeTags.length > 0 && (
								<div>
									<Label
										id="label-csv-mistakes"
										className="text-tiny text-txt-300"
									>
										{t("mistakes")}
									</Label>
									<div className="mt-s-200 gap-s-200 flex flex-wrap">
										{mistakeTags.map((tag) => (
											<button
												key={tag.id}
												type="button"
												onClick={() => handleTagToggle(tag.id)}
												className={cn(
													"px-s-300 py-s-100 text-tiny rounded-full font-medium transition-colors",
													trade.edits.tagIds?.includes(tag.id)
														? "bg-warning text-bg-100"
														: "bg-bg-300 text-txt-200 hover:bg-bg-100"
												)}
											>
												{tag.name}
											</button>
										))}
									</div>
								</div>
							)}

							{setupTags.length === 0 && mistakeTags.length === 0 && (
								<p className="text-small text-txt-300">
									{t("noTagsConfigured")}
								</p>
							)}
						</TabsContent>
					</Tabs>
				</div>
			)}
		</div>
	)
}
