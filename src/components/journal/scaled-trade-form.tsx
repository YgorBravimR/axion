"use client"

import {
	useState,
	useMemo,
	useCallback,
	forwardRef,
	useImperativeHandle,
	type FormEvent,
} from "react"
import { useRouter } from "next/navigation"
import {
	ArrowUpRight,
	ArrowDownRight,
	Save,
	Loader2,
	Plus,
	Info,
} from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { cn } from "@/lib/utils"
import { createScaledTrade } from "@/app/actions/trades"
import { fromCents } from "@/lib/money"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
	InlineExecutionRow,
	type ExecutionRowData,
} from "./inline-execution-row"
import type {
	SharedTradeFormState,
	TradeFormRef,
} from "@/lib/validations/trade"
import type { Strategy, Tag, Timeframe } from "@/db/schema"
import type { AssetWithType } from "@/app/actions/assets"
import { formatDateKey, formatBrtTimeShort, BRT_OFFSET } from "@/lib/dates"

interface ScaledTradeFormProps {
	strategies?: Strategy[]
	tags?: Tag[]
	assets?: AssetWithType[]
	timeframes?: Timeframe[]
	onSuccess?: () => void
	onModeChange?: () => void
	redirectTo?: string
	defaultAssetId?: string
	defaultDate?: string
	initialSharedState?: SharedTradeFormState
}

const generateId = (): string => Math.random().toString(36).substring(2, 11)

const createEmptyExecution = (
	type: "entry" | "exit",
	referenceDate?: Date
): ExecutionRowData => ({
	id: generateId(),
	executionType: type,
	date: formatDateKey(referenceDate ?? new Date()),
	time: formatBrtTimeShort(referenceDate ?? new Date()),
	price: "",
	quantity: "",
	commission: "0",
})

export const ScaledTradeForm = forwardRef<TradeFormRef, ScaledTradeFormProps>(
	(
		{
			strategies = [],
			tags = [],
			assets = [],
			timeframes: configuredTimeframes = [],
			onSuccess,
			onModeChange,
			redirectTo,
			defaultAssetId,
			defaultDate,
			initialSharedState,
		},
		ref
	) => {
		const router = useRouter()
		const { showToast } = useToast()
		const t = useTranslations("trade")
		const tScaled = useTranslations("trade.scaled")
		const tExec = useTranslations("execution")
		const tJournal = useTranslations("journal.form")
		const tCommon = useTranslations("common")
		const locale = useLocale()
		const [isSubmitting, setIsSubmitting] = useState(false)

		// Basic info - restore from shared state, then fallback to defaults
		const [asset, setAsset] = useState(() => {
			if (initialSharedState?.asset) return initialSharedState.asset
			if (defaultAssetId) {
				const match = assets.find((a) => a.id === defaultAssetId || a.symbol === defaultAssetId)
				return match?.symbol || ""
			}
			return ""
		})
		const [direction, setDirection] = useState<"long" | "short">(
			initialSharedState?.direction ?? "long"
		)
		const [timeframeId, setTimeframeId] = useState<string | null>(
			initialSharedState?.timeframeId ?? null
		)
		const [strategyId, setStrategyId] = useState<string | null>(
			initialSharedState?.strategyId ?? null
		)

		// Risk management
		const [stopLoss, setStopLoss] = useState(initialSharedState?.stopLoss ?? "")
		const [takeProfit, setTakeProfit] = useState(
			initialSharedState?.takeProfit ?? ""
		)

		// Journal
		const [preTradeThoughts, setPreTradeThoughts] = useState(
			initialSharedState?.preTradeThoughts ?? ""
		)
		const [postTradeReflection, setPostTradeReflection] = useState(
			initialSharedState?.postTradeReflection ?? ""
		)
		const [lessonLearned, setLessonLearned] = useState(
			initialSharedState?.lessonLearned ?? ""
		)
		const [followedPlan, setFollowedPlan] = useState<boolean | undefined>(
			initialSharedState?.followedPlan
		)
		const [disciplineNotes, setDisciplineNotes] = useState(
			initialSharedState?.disciplineNotes ?? ""
		)
		const [setupRank, setSetupRank] = useState<
			"A" | "AA" | "AAA" | null | undefined
		>(initialSharedState?.setupRank)

		// Tags
		const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
			initialSharedState?.tagIds ?? []
		)

		// Resolve effective date for replay accounts (memoized to avoid re-creating on each render)
		const effectiveNow = useMemo(
			() => (defaultDate ? new Date(defaultDate) : new Date()),
			[defaultDate]
		)
		const [entries, setEntries] = useState<ExecutionRowData[]>([
			createEmptyExecution("entry", effectiveNow),
		])
		const [exits, setExits] = useState<ExecutionRowData[]>([])

		const selectedAsset = useMemo(
			() => assets.find((a) => a.symbol === asset) ?? null,
			[assets, asset]
		)

		const hasConfiguredAssets = assets.length > 0
		const hasConfiguredTimeframes = configuredTimeframes.length > 0

		// Calculate position summary
		const positionSummary = useMemo(() => {
			const validEntries = entries.filter(
				(e) =>
					e.price &&
					e.quantity &&
					parseFloat(e.price) > 0 &&
					parseFloat(e.quantity) > 0
			)
			const validExits = exits.filter(
				(e) =>
					e.price &&
					e.quantity &&
					parseFloat(e.price) > 0 &&
					parseFloat(e.quantity) > 0
			)

			const totalEntryQty = validEntries.reduce(
				(sum, e) => sum + parseFloat(e.quantity),
				0
			)
			const totalExitQty = validExits.reduce(
				(sum, e) => sum + parseFloat(e.quantity),
				0
			)

			const avgEntryPrice =
				totalEntryQty > 0
					? validEntries.reduce(
							(sum, e) => sum + parseFloat(e.price) * parseFloat(e.quantity),
							0
						) / totalEntryQty
					: 0

			const avgExitPrice =
				totalExitQty > 0
					? validExits.reduce(
							(sum, e) => sum + parseFloat(e.price) * parseFloat(e.quantity),
							0
						) / totalExitQty
					: 0

			const totalCommission = [...validEntries, ...validExits].reduce(
				(sum, e) => sum + (parseFloat(e.commission) || 0),
				0
			)

			// Calculate P&L
			let grossPnl = 0
			if (totalExitQty > 0 && avgEntryPrice > 0 && avgExitPrice > 0) {
				const priceDiff =
					direction === "long"
						? avgExitPrice - avgEntryPrice
						: avgEntryPrice - avgExitPrice
				// Use the smaller of entry/exit qty for closed P&L
				const closedQty = Math.min(totalEntryQty, totalExitQty)

				if (selectedAsset) {
					// Use tick-based calculation
					const tickSize = parseFloat(selectedAsset.tickSize)
					const tickValue = fromCents(selectedAsset.tickValue)
					const ticks = priceDiff / tickSize
					grossPnl = ticks * tickValue * closedQty
				} else {
					grossPnl = priceDiff * closedQty
				}
			}

			const netPnl = grossPnl - totalCommission

			// Determine position status
			let status: "open" | "partial" | "closed" = "open"
			if (totalExitQty >= totalEntryQty && totalEntryQty > 0) {
				status = "closed"
			} else if (totalExitQty > 0 && totalExitQty < totalEntryQty) {
				status = "partial"
			}

			return {
				totalEntryQty,
				totalExitQty,
				avgEntryPrice,
				avgExitPrice,
				totalCommission,
				grossPnl,
				netPnl,
				status,
				validEntries: validEntries.length,
				validExits: validExits.length,
			}
		}, [entries, exits, direction, selectedAsset])

		// Calculate risk amount from stop loss and position
		const calculatedRisk = useMemo(() => {
			const sl = parseFloat(stopLoss)
			if (
				!sl ||
				positionSummary.avgEntryPrice <= 0 ||
				positionSummary.totalEntryQty <= 0
			)
				return null

			const priceDiff = Math.abs(positionSummary.avgEntryPrice - sl)

			if (selectedAsset) {
				// Use tick-based calculation
				const tickSize = parseFloat(selectedAsset.tickSize)
				const tickValue = fromCents(selectedAsset.tickValue)
				const ticksAtRisk = priceDiff / tickSize
				return ticksAtRisk * tickValue * positionSummary.totalEntryQty
			}

			// Fallback to simple calculation
			return priceDiff * positionSummary.totalEntryQty
		}, [
			stopLoss,
			positionSummary.avgEntryPrice,
			positionSummary.totalEntryQty,
			selectedAsset,
		])

		// Calculate R-multiple
		const calculatedR = useMemo(() => {
			if (
				!calculatedRisk ||
				calculatedRisk <= 0 ||
				positionSummary.netPnl === 0
			)
				return null
			return positionSummary.netPnl / calculatedRisk
		}, [calculatedRisk, positionSummary.netPnl])

		// Real-time SL/TP cross-field validation indicators
		const stopLossWarning = useMemo(() => {
			const sl = parseFloat(stopLoss)
			const entry = positionSummary.avgEntryPrice
			if (!sl || entry <= 0) return null
			if (direction === "long" && sl >= entry)
				return t("validation.stopLossMustBeBelowEntry")
			if (direction === "short" && sl <= entry)
				return t("validation.stopLossMustBeAboveEntry")
			return null
		}, [stopLoss, positionSummary.avgEntryPrice, direction])

		const takeProfitWarning = useMemo(() => {
			const tp = parseFloat(takeProfit)
			const entry = positionSummary.avgEntryPrice
			if (!tp || entry <= 0) return null
			if (direction === "long" && tp <= entry)
				return t("validation.takeProfitMustBeAboveEntry")
			if (direction === "short" && tp >= entry)
				return t("validation.takeProfitMustBeBelowEntry")
			return null
		}, [takeProfit, positionSummary.avgEntryPrice, direction])

		// Expose shared state for parent to capture before mode switch
		useImperativeHandle(ref, () => ({
			getSharedState: (): SharedTradeFormState => ({
				asset,
				direction,
				timeframeId,
				strategyId,
				stopLoss: stopLoss || undefined,
				takeProfit: takeProfit || undefined,
				preTradeThoughts: preTradeThoughts || undefined,
				postTradeReflection: postTradeReflection || undefined,
				lessonLearned: lessonLearned || undefined,
				followedPlan,
				disciplineNotes: disciplineNotes || undefined,
				setupRank,
				tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
			}),
		}))

		const handleExecutionChange = useCallback(
			(
				type: "entry" | "exit",
				id: string,
				field: keyof ExecutionRowData,
				value: string
			) => {
				const setter = type === "entry" ? setEntries : setExits
				setter((prev) =>
					prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
				)
			},
			[]
		)

		const handleAddExecution = useCallback(
			(type: "entry" | "exit") => {
				const setter = type === "entry" ? setEntries : setExits
				setter((prev) => [...prev, createEmptyExecution(type, effectiveNow)])
			},
			[effectiveNow]
		)

		const handleRemoveExecution = useCallback(
			(type: "entry" | "exit", id: string) => {
				const setter = type === "entry" ? setEntries : setExits
				setter((prev) => prev.filter((e) => e.id !== id))
			},
			[]
		)

		const handleTagToggle = (tagId: string) => {
			setSelectedTagIds((prev) =>
				prev.includes(tagId)
					? prev.filter((id) => id !== tagId)
					: [...prev, tagId]
			)
		}

		const handleSubmit = async (e: FormEvent) => {
			e.preventDefault()
			setIsSubmitting(true)

			try {
				// Validate basic info
				if (!asset) {
					showToast("error", tScaled("selectAssetError"))
					setIsSubmitting(false)
					return
				}

				if (positionSummary.validEntries === 0) {
					showToast("error", tScaled("addEntryError"))
					setIsSubmitting(false)
					return
				}

				// Validate SL/TP against average entry price
				if (stopLossWarning) {
					showToast("error", stopLossWarning)
					setIsSubmitting(false)
					return
				}
				if (takeProfitWarning) {
					showToast("error", takeProfitWarning)
					setIsSubmitting(false)
					return
				}

				// Build executions array — times are in BRT, add BRT offset
				const executions = [
					...entries
						.filter((e) => e.price && e.quantity)
						.map((e) => ({
							executionType: "entry" as const,
							executionDate: new Date(`${e.date}T${e.time}:00${BRT_OFFSET}`),
							price: parseFloat(e.price),
							quantity: parseFloat(e.quantity),
							commission: parseFloat(e.commission) || 0,
						})),
					...exits
						.filter((e) => e.price && e.quantity)
						.map((e) => ({
							executionType: "exit" as const,
							executionDate: new Date(`${e.date}T${e.time}:00${BRT_OFFSET}`),
							price: parseFloat(e.price),
							quantity: parseFloat(e.quantity),
							commission: parseFloat(e.commission) || 0,
						})),
				]

				const result = await createScaledTrade({
					asset,
					direction,
					timeframeId: timeframeId || undefined,
					strategyId: strategyId || undefined,
					stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
					takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
					riskAmount: calculatedRisk ?? undefined,
					preTradeThoughts: preTradeThoughts || undefined,
					postTradeReflection: postTradeReflection || undefined,
					lessonLearned: lessonLearned || undefined,
					followedPlan,
					disciplineNotes: disciplineNotes || undefined,
					setupRank: setupRank || undefined,
					tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
					executions,
				})

				if (result.status === "success") {
					showToast("success", tScaled("createdSuccess"))
					onSuccess?.()
					router.push(redirectTo || "/journal")
				} else {
					showToast("error", result.message || tScaled("createError"))
				}
			} catch {
				showToast("error", t("tradeUnexpectedError"))
			} finally {
				setIsSubmitting(false)
			}
		}

		const setupTags = tags.filter((t) => t.type === "setup")
		const mistakeTags = tags.filter((t) => t.type === "mistake")

		return (
			<form
				onSubmit={handleSubmit}
				className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600"
			>
				<Tabs defaultValue="executions" className="w-full">
					<TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
						<TabsTrigger value="executions">{tExec("title")}</TabsTrigger>
						<TabsTrigger value="basic">{tJournal("basicInfo")}</TabsTrigger>
						<TabsTrigger value="journal">{tJournal("journal")}</TabsTrigger>
						<TabsTrigger value="tags">{tJournal("tagsSection")}</TabsTrigger>
					</TabsList>

					{/* Executions Tab */}
					<TabsContent
						value="executions"
						className="space-y-m-400 sm:space-y-m-500 pt-m-400 sm:pt-m-500"
					>
						{/* Direction Toggle */}
						<div className="space-y-s-200">
							<Label id="label-scaled-direction">{t("direction.label")}</Label>
							<div className="gap-m-400 flex">
								<button
									type="button"
									onClick={() => setDirection("long")}
									aria-label={t("direction.long")}
									aria-pressed={direction === "long"}
									className={cn(
										"gap-s-200 p-m-400 flex flex-1 items-center justify-center rounded-lg border-2 transition-colors",
										direction === "long"
											? "border-action-buy bg-action-buy/10 text-action-buy"
											: "border-bg-300 text-txt-200 hover:border-action-buy/50"
									)}
								>
									<ArrowUpRight className="h-5 w-5" />
									<span className="font-medium">{t("direction.long")}</span>
								</button>
								<button
									type="button"
									onClick={() => setDirection("short")}
									aria-label={t("direction.short")}
									aria-pressed={direction === "short"}
									className={cn(
										"gap-s-200 p-m-400 flex flex-1 items-center justify-center rounded-lg border-2 transition-colors",
										direction === "short"
											? "border-action-sell bg-action-sell/10 text-action-sell"
											: "border-bg-300 text-txt-200 hover:border-action-sell/50"
									)}
								>
									<ArrowDownRight className="h-5 w-5" />
									<span className="font-medium">{t("direction.short")}</span>
								</button>
							</div>
						</div>

						{/* Asset */}
						<div className="space-y-s-200">
							<div className="gap-s-200 flex items-center">
								<Label id="label-scaled-asset">{t("assetRequired")}</Label>
								{selectedAsset && (
									<Tooltip>
										<TooltipTrigger asChild>
											<Info className="text-txt-300 h-4 w-4" />
										</TooltipTrigger>
										<TooltipContent id="tooltip-scaled-asset-info">
											<div className="text-tiny space-y-1">
												<p>
													<span className="text-txt-300">{t("type")}:</span>{" "}
													{selectedAsset.assetType.name}
												</p>
												<p>
													<span className="text-txt-300">{t("tickSize")}:</span>{" "}
													{parseFloat(selectedAsset.tickSize)}
												</p>
												<p>
													<span className="text-txt-300">
														{t("tickValue")}:
													</span>{" "}
													{selectedAsset.currency}{" "}
													{fromCents(selectedAsset.tickValue)}
												</p>
											</div>
										</TooltipContent>
									</Tooltip>
								)}
							</div>
							<Select
								value={asset}
								onValueChange={setAsset}
								disabled={!hasConfiguredAssets}
							>
								<SelectTrigger id="scaled-trade-asset">
									<SelectValue
										placeholder={
											hasConfiguredAssets ? t("selectAsset") : t("noAssets")
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{assets.map((a) => (
										<SelectItem key={a.id} value={a.symbol}>
											<span className="font-mono">{a.symbol}</span>
											<span className="text-txt-300 ml-2">{a.name}</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Entries Section */}
						<div className="space-y-s-300">
							<div className="flex items-center justify-between">
								<Label id="label-scaled-entries" className="text-action-buy">
									{tScaled("entries")}
								</Label>
								<Button
									id="scaled-trade-add-entry"
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => handleAddExecution("entry")}
									className="text-tiny h-7"
								>
									<Plus className="mr-1 h-3 w-3" />
									{tScaled("addEntry")}
								</Button>
							</div>

							<div className="relative after:absolute after:right-0 after:top-0 after:bottom-0 after:w-6 after:bg-linear-to-l after:from-bg-200 after:to-transparent after:pointer-events-none sm:after:hidden">
							<div className="space-y-s-200 overflow-x-auto">
								{/* Header */}
								<div className="gap-s-200 text-tiny text-txt-300 grid min-w-[480px] grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr]">
									<span>{tExec("date")}</span>
									<span>{tExec("time")}</span>
									<span>{tExec("price")}</span>
									<span>{tExec("quantity")}</span>
									<span>{tExec("commission")}</span>
									<span></span>
								</div>

								{entries.map((entry) => (
									<InlineExecutionRow
										key={entry.id}
										data={entry}
										onChange={(id, field, value) =>
											handleExecutionChange("entry", id, field, value)
										}
										onRemove={(id) => handleRemoveExecution("entry", id)}
										canRemove={entries.length > 1}
										currency={selectedAsset?.currency ?? "$"}
									/>
								))}
							</div>
							</div>

							{positionSummary.totalEntryQty > 0 && (
								<p className="text-small text-txt-200">
									{tScaled("contractsSummary", {
										count: positionSummary.totalEntryQty,
										price: positionSummary.avgEntryPrice.toFixed(2),
									})}
								</p>
							)}
						</div>

						{/* Exits Section */}
						<div className="space-y-s-300">
							<div className="flex items-center justify-between">
								<Label id="label-scaled-exits" className="text-action-sell">
									{tScaled("exits")}
								</Label>
								<Button
									id="scaled-trade-add-exit"
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => handleAddExecution("exit")}
									className="text-tiny h-7"
								>
									<Plus className="mr-1 h-3 w-3" />
									{tScaled("addExit")}
								</Button>
							</div>

							{exits.length > 0 ? (
								<div className="relative after:absolute after:right-0 after:top-0 after:bottom-0 after:w-6 after:bg-linear-to-l after:from-bg-200 after:to-transparent after:pointer-events-none sm:after:hidden">
								<div className="space-y-s-200 overflow-x-auto">
									{/* Header */}
									<div className="gap-s-200 text-tiny text-txt-300 grid min-w-[480px] grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr]">
										<span>{tExec("date")}</span>
										<span>{tExec("time")}</span>
										<span>{tExec("price")}</span>
										<span>{tExec("quantity")}</span>
										<span>{tExec("commission")}</span>
										<span></span>
									</div>

									{exits.map((exit) => (
										<InlineExecutionRow
											key={exit.id}
											data={exit}
											onChange={(id, field, value) =>
												handleExecutionChange("exit", id, field, value)
											}
											onRemove={(id) => handleRemoveExecution("exit", id)}
											canRemove={true}
											currency={selectedAsset?.currency ?? "$"}
										/>
									))}
								</div>
								</div>
							) : (
								<div className="border-bg-300 p-m-400 rounded-lg border border-dashed text-center">
									<p className="text-small text-txt-300">
										{tScaled("noExits")}
									</p>
								</div>
							)}

							{positionSummary.totalExitQty > 0 && (
								<p className="text-small text-txt-200">
									{tScaled("contractsSummary", {
										count: positionSummary.totalExitQty,
										price: positionSummary.avgExitPrice.toFixed(2),
									})}
								</p>
							)}
						</div>

						{/* Position Summary */}
						{positionSummary.validEntries > 0 && (
							<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
								<p className="text-small text-txt-100 font-medium">
									{tScaled("positionSummary")}
								</p>
								<div className="mt-s-300 gap-s-300 text-small grid grid-cols-2 sm:grid-cols-4">
									<div>
										<p className="text-tiny text-txt-300">
											{tScaled("status")}
										</p>
										<p
											className={cn(
												"font-medium",
												positionSummary.status === "closed"
													? "text-txt-100"
													: positionSummary.status === "partial"
														? "text-warning"
														: "text-trade-buy"
											)}
										>
											{positionSummary.status === "open"
												? tScaled("statusOpen")
												: positionSummary.status === "partial"
													? tScaled("statusPartial")
													: tScaled("statusClosed")}
										</p>
									</div>
									<div>
										<p className="text-tiny text-txt-300">
											{tScaled("entriesCount")}
										</p>
										<p className="text-txt-100 font-medium">
											{positionSummary.validEntries} (
											{positionSummary.totalEntryQty})
										</p>
									</div>
									<div>
										<p className="text-tiny text-txt-300">
											{tScaled("exitsCount")}
										</p>
										<p className="text-txt-100 font-medium">
											{positionSummary.validExits} (
											{positionSummary.totalExitQty})
										</p>
									</div>
									<div>
										<p className="text-tiny text-txt-300">{t("fees")}</p>
										<p className="text-txt-100 font-medium">
											{selectedAsset?.currency ?? "$"}
											{positionSummary.totalCommission.toFixed(2)}
										</p>
									</div>
								</div>

								{positionSummary.status !== "open" && (
									<div className="mt-m-400 border-bg-300 pt-m-400 border-t">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-tiny text-txt-300">
													{tScaled("netPnl")}
												</p>
												<p
													className={cn(
														"text-h3 font-bold",
														positionSummary.netPnl >= 0
															? "text-trade-buy"
															: "text-trade-sell"
													)}
												>
													{positionSummary.netPnl >= 0 ? "+" : ""}
													{selectedAsset?.currency ?? "$"}
													{positionSummary.netPnl.toFixed(2)}
													{calculatedR !== null && (
														<span className="text-body ml-2">
															({calculatedR >= 0 ? "+" : ""}
															{calculatedR.toFixed(2)}R)
														</span>
													)}
												</p>
											</div>
											<div className="text-right">
												<p className="text-tiny text-txt-300">
													{tScaled("grossPnl")}
												</p>
												<p className="text-txt-100">
													{selectedAsset?.currency ?? "$"}
													{positionSummary.grossPnl.toFixed(2)}
												</p>
											</div>
										</div>
									</div>
								)}
							</div>
						)}

						{/* Risk Management */}
						<div className="space-y-m-400">
							<Label id="label-scaled-risk-management">
								{tScaled("riskManagement")}
							</Label>
							<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-3">
								<div className="space-y-s-200">
									<Label
										id="label-scaled-stop-loss"
										htmlFor="stopLoss"
										className="text-small text-txt-300"
									>
										{t("stopLoss")}
									</Label>
									<Input
										id="stopLoss"
										type="number"
										step="any"
										placeholder="0.00"
										className={cn(stopLossWarning && "border-fb-error")}
										value={stopLoss}
										onChange={(e) => setStopLoss(e.target.value)}
									/>
									{stopLossWarning && (
										<span className="text-tiny text-fb-error">
											{stopLossWarning}
										</span>
									)}
								</div>
								<div className="space-y-s-200">
									<Label
										id="label-scaled-take-profit"
										htmlFor="takeProfit"
										className="text-small text-txt-300"
									>
										{t("takeProfit")}
									</Label>
									<Input
										id="takeProfit"
										type="number"
										step="any"
										placeholder="0.00"
										className={cn(takeProfitWarning && "border-fb-error")}
										value={takeProfit}
										onChange={(e) => setTakeProfit(e.target.value)}
									/>
									{takeProfitWarning && (
										<span className="text-tiny text-fb-error">
											{takeProfitWarning}
										</span>
									)}
								</div>
								<div className="space-y-s-200">
									<Label
										id="label-scaled-risk-amount"
										className="text-small text-txt-300"
									>
										{t("riskAmount")} ({selectedAsset?.currency ?? "$"})
									</Label>
									<div className="border-bg-300 bg-bg-100 px-s-300 flex h-10 items-center rounded-md border">
										{calculatedRisk !== null ? (
											<span className="text-small text-txt-100 font-medium">
												{selectedAsset?.currency ?? "$"}{" "}
												{calculatedRisk.toLocaleString(locale, {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												})}
											</span>
										) : (
											<span className="text-small text-txt-300">
												{tScaled("enterStopAndEntries")}
											</span>
										)}
									</div>
								</div>
							</div>
						</div>
					</TabsContent>

					{/* Basic Info Tab */}
					<TabsContent
						value="basic"
						className="space-y-m-400 sm:space-y-m-500 pt-m-400 sm:pt-m-500"
					>
						<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2">
							<div className="space-y-s-200">
								<Label id="label-scaled-timeframe">{t("timeframe")}</Label>
								<Select
									value={timeframeId || ""}
									onValueChange={(value) => setTimeframeId(value || null)}
									disabled={!hasConfiguredTimeframes}
								>
									<SelectTrigger id="scaled-trade-timeframe">
										<SelectValue
											placeholder={
												hasConfiguredTimeframes
													? t("selectTimeframe")
													: t("noTimeframes")
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{configuredTimeframes.map((tf) => (
											<SelectItem key={tf.id} value={tf.id}>
												{tf.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{strategies.length > 0 && (
								<div className="space-y-s-200">
									<Label id="label-scaled-strategy">{t("strategy")}</Label>
									<Select
										value={strategyId || ""}
										onValueChange={(value) => setStrategyId(value || null)}
									>
										<SelectTrigger id="scaled-trade-strategy">
											<SelectValue placeholder={t("selectStrategy")} />
										</SelectTrigger>
										<SelectContent>
											{strategies.map((strategy) => (
												<SelectItem key={strategy.id} value={strategy.id}>
													{strategy.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
						</div>

						{/* Switch to simple mode */}
						<div className="border-bg-300 bg-bg-100 p-m-400 rounded-lg border">
							<p className="text-small text-txt-200">{tScaled("needSimple")}</p>
							<Button
								id="scaled-trade-switch-mode"
								type="button"
								variant="link"
								className="text-brand-500 h-auto p-0"
								onClick={onModeChange}
							>
								{t("mode.switchToSimple")}
							</Button>
						</div>
					</TabsContent>

					{/* Journal Tab */}
					<TabsContent
						value="journal"
						className="space-y-m-400 sm:space-y-m-500 pt-m-400 sm:pt-m-500"
					>
						<div className="space-y-s-200">
							<Label
								id="label-scaled-pre-trade-thoughts"
								htmlFor="preTradeThoughts"
							>
								{t("preTradeThoughts")}
							</Label>
							<Textarea
								id="preTradeThoughts"
								placeholder={t("preTradeHint")}
								rows={4}
								value={preTradeThoughts}
								onChange={(e) => setPreTradeThoughts(e.target.value)}
							/>
						</div>

						<div className="space-y-s-200">
							<Label
								id="label-scaled-post-trade-reflection"
								htmlFor="postTradeReflection"
							>
								{t("postTradeReflection")}
							</Label>
							<Textarea
								id="postTradeReflection"
								placeholder={t("postTradeHint")}
								rows={4}
								value={postTradeReflection}
								onChange={(e) => setPostTradeReflection(e.target.value)}
							/>
						</div>

						<div className="space-y-s-200">
							<Label id="label-scaled-lesson-learned" htmlFor="lessonLearned">
								{t("lessonLearned")}
							</Label>
							<Textarea
								id="lessonLearned"
								placeholder={t("lessonHint")}
								rows={3}
								value={lessonLearned}
								onChange={(e) => setLessonLearned(e.target.value)}
							/>
						</div>

						{/* Compliance */}
						<div className="space-y-s-200">
							<Label id="label-scaled-followed-plan">
								{t("didYouFollowPlan")}
							</Label>
							<div className="gap-m-400 flex">
								<button
									type="button"
									onClick={() => setFollowedPlan(true)}
									aria-label={`${t("followedPlan")}: ${tCommon("yes")}`}
									aria-pressed={followedPlan === true}
									className={cn(
										"p-m-400 flex-1 rounded-lg border-2 text-center transition-colors",
										followedPlan === true
											? "border-trade-buy bg-trade-buy/10 text-trade-buy"
											: "border-bg-300 text-txt-200 hover:border-trade-buy/50"
									)}
								>
									{tCommon("yes")}
								</button>
								<button
									type="button"
									onClick={() => setFollowedPlan(false)}
									aria-label={`${t("followedPlan")}: ${tCommon("no")}`}
									aria-pressed={followedPlan === false}
									className={cn(
										"p-m-400 flex-1 rounded-lg border-2 text-center transition-colors",
										followedPlan === false
											? "border-trade-sell bg-trade-sell/10 text-trade-sell"
											: "border-bg-300 text-txt-200 hover:border-trade-sell/50"
									)}
								>
									{tCommon("no")}
								</button>
							</div>
						</div>

						{followedPlan === false && (
							<div className="space-y-s-200">
								<Label
									id="label-scaled-discipline-notes"
									htmlFor="disciplineNotes"
								>
									{t("whatWentWrong")}
								</Label>
								<Textarea
									id="disciplineNotes"
									placeholder={t("describeBreach")}
									rows={3}
									value={disciplineNotes}
									onChange={(e) => setDisciplineNotes(e.target.value)}
								/>
							</div>
						)}
					</TabsContent>

					{/* Tags Tab */}
					<TabsContent
						value="tags"
						className="space-y-m-400 sm:space-y-m-500 pt-m-400 sm:pt-m-500"
					>
						{setupTags.length > 0 && (
							<div className="space-y-s-200">
								<Label id="label-scaled-setup-type">{t("setupType")}</Label>
								<div className="gap-s-200 flex flex-wrap">
									{setupTags.map((tag) => (
										<button
											key={tag.id}
											type="button"
											onClick={() => handleTagToggle(tag.id)}
											aria-label={`${t("tags")}: ${tag.name}`}
											aria-pressed={selectedTagIds.includes(tag.id)}
											className={cn(
												"px-m-400 py-s-200 text-small rounded-full border transition-colors",
												selectedTagIds.includes(tag.id)
													? "border-trade-buy bg-trade-buy/10 text-trade-buy"
													: "border-bg-300 text-txt-200 hover:border-trade-buy/50"
											)}
										>
											{tag.name}
										</button>
									))}
								</div>
							</div>
						)}

						{mistakeTags.length > 0 && (
							<div className="space-y-s-200">
								<Label id="label-scaled-mistakes">{t("mistakes")}</Label>
								<div className="gap-s-200 flex flex-wrap">
									{mistakeTags.map((tag) => (
										<button
											key={tag.id}
											type="button"
											onClick={() => handleTagToggle(tag.id)}
											aria-label={`${t("tags")}: ${tag.name}`}
											aria-pressed={selectedTagIds.includes(tag.id)}
											className={cn(
												"px-m-400 py-s-200 text-small rounded-full border transition-colors",
												selectedTagIds.includes(tag.id)
													? "border-warning bg-warning/10 text-warning"
													: "border-bg-300 text-txt-200 hover:border-warning/50"
											)}
										>
											{tag.name}
										</button>
									))}
								</div>
							</div>
						)}

						{tags.length === 0 && (
							<div className="border-bg-300 bg-bg-200 p-m-400 sm:p-m-500 lg:p-m-600 rounded-lg border text-center">
								<p className="text-txt-200">{t("noTagsYet")}</p>
								<p className="mt-s-200 text-small text-txt-300">
									{t("createTagsHint")}
								</p>
							</div>
						)}
					</TabsContent>
				</Tabs>

				{/* Submit Button */}
				<div className="gap-s-300 sm:gap-m-400 border-bg-300 pt-m-400 sm:pt-m-500 flex flex-col-reverse border-t sm:flex-row sm:justify-end">
					<Button
						id="scaled-trade-cancel"
						type="button"
						variant="outline"
						onClick={() => router.back()}
						disabled={isSubmitting}
					>
						{tCommon("cancel")}
					</Button>
					<Button
						id="scaled-trade-submit"
						type="submit"
						disabled={isSubmitting}
					>
						{isSubmitting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{tScaled("creating")}
							</>
						) : (
							<>
								<Save className="mr-2 h-4 w-4" />
								{tScaled("createScaledTrade")}
							</>
						)}
					</Button>
				</div>
			</form>
		)
	}
)

ScaledTradeForm.displayName = "ScaledTradeForm"
