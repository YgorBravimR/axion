"use client"

import {
	useState,
	useMemo,
	useEffect,
	forwardRef,
	useImperativeHandle,
} from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import {
	ArrowUpRight,
	ArrowDownRight,
	Save,
	Loader2,
	Plus,
	Info,
	ImageIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
	createTradeSchema,
	type TradeFormInput,
	type SharedTradeFormState,
	type TradeFormRef,
} from "@/lib/validations/trade"
import { createTrade, updateTrade } from "@/app/actions/trades"
import {
	calculatePnL,
	calculateRMultiple,
	calculateAssetPnL,
} from "@/lib/calculations"
import { fromCents } from "@/lib/money"
import { APP_TIMEZONE } from "@/lib/dates"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
	Tabs,
	AnimatedTabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form"
import type { Trade, Strategy, Tag, Timeframe } from "@/db/schema"
import type { AssetWithType } from "@/app/actions/assets"
import { getTags } from "@/app/actions/tags"
import { TagForm } from "@/components/settings/tag-form"
import { ImageUpload } from "@/components/shared/image-upload"
import { uploadFiles } from "@/lib/upload-files"
import type { PersistedImage, PendingImage } from "@/lib/validations/upload"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"

interface TradeFormProps {
	trade?: Trade & {
		tradeTags?: Array<{ tag: Tag }>
	}
	strategies?: Strategy[]
	tags?: Tag[]
	assets?: AssetWithType[]
	timeframes?: Timeframe[]
	onSuccess?: () => void
	redirectTo?: string
	defaultAssetId?: string
	defaultDate?: string
	initialSharedState?: SharedTradeFormState
}

/**
 * Format Date to datetime-local input value (YYYY-MM-DDTHH:mm) in BRT timezone.
 * Uses Intl.DateTimeFormat to ensure the displayed time is always BRT,
 * regardless of the server/browser's local timezone.
 */
const formatDateTimeLocal = (date: Date): string => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: APP_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).formatToParts(date)

	const get = (type: string) => parts.find((p) => p.type === type)!.value
	return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`
}

// End-of-day in datetime-local format — prevents selecting future days (in BRT)
const getEndOfDayLocal = (referenceDate?: Date): string => {
	const date = referenceDate ?? new Date()
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: APP_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date)

	const get = (type: string) => parts.find((p) => p.type === type)!.value
	const year = get("year")
	const month = get("month")
	const day = get("day")
	return `${year}-${month}-${day}T23:59`
}

type TradeWithTags = Trade & { tradeTags?: Array<{ tag: Tag }> }

/** Build form values from an existing trade (used for both initial state and reset) */
const buildTradeFormValues = (
	trade: TradeWithTags
): Partial<TradeFormInput> => ({
	asset: trade.asset,
	direction: trade.direction,
	timeframeId: trade.timeframeId ?? undefined,
	entryDate: formatDateTimeLocal(new Date(trade.entryDate)),
	exitDate: trade.exitDate
		? formatDateTimeLocal(new Date(trade.exitDate))
		: undefined,
	entryPrice: Number(trade.entryPrice),
	exitPrice: trade.exitPrice ? Number(trade.exitPrice) : undefined,
	positionSize: Number(trade.positionSize),
	stopLoss: trade.stopLoss ? Number(trade.stopLoss) : undefined,
	takeProfit: trade.takeProfit ? Number(trade.takeProfit) : undefined,
	pnl: trade.pnl ? fromCents(trade.pnl) : undefined,
	mfe: trade.mfe ? Number(trade.mfe) : undefined,
	mae: trade.mae ? Number(trade.mae) : undefined,
	contractsExecuted: trade.contractsExecuted
		? Number(trade.contractsExecuted)
		: undefined,
	preTradeThoughts: trade.preTradeThoughts ?? undefined,
	postTradeReflection: trade.postTradeReflection ?? undefined,
	lessonLearned: trade.lessonLearned ?? undefined,
	strategyId: trade.strategyId ?? undefined,
	followedPlan: trade.followedPlan ?? undefined,
	disciplineNotes: trade.disciplineNotes ?? undefined,
	setupRank: trade.setupRank ?? undefined,
	screenshotUrl: trade.screenshotUrl ?? undefined,
	screenshotS3Key: trade.screenshotS3Key ?? undefined,
	tagIds: trade.tradeTags?.map((tt) => tt.tag.id) ?? [],
})

const TradeForm = forwardRef<TradeFormRef, TradeFormProps>(
	(
		{
			trade,
			strategies = [],
			tags = [],
			assets = [],
			timeframes: configuredTimeframes = [],
			onSuccess,
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
		const tJournal = useTranslations("journal.form")
		const tCommon = useTranslations("common")
		const [isSubmitting, setIsSubmitting] = useState(false)
		const [selectedAsset, setSelectedAsset] = useState<AssetWithType | null>(
			() => {
				if (trade?.asset && assets.length > 0) {
					return assets.find((a) => a.symbol === trade.asset) ?? null
				}
				// Restore asset from shared state (mode switch)
				if (initialSharedState?.asset && assets.length > 0) {
					return (
						assets.find((a) => a.symbol === initialSharedState.asset) ?? null
					)
				}
				// Pre-select asset if defaultAssetId is provided (supports both id and symbol)
				if (defaultAssetId && assets.length > 0) {
					return assets.find((a) => a.id === defaultAssetId || a.symbol === defaultAssetId) ?? null
				}
				return null
			}
		)

		const isEditing = !!trade
		const hasConfiguredAssets = assets.length > 0
		const hasConfiguredTimeframes = configuredTimeframes.length > 0

		// Inline tag creation
		const [isTagFormOpen, setIsTagFormOpen] = useState(false)
		const [localTags, setLocalTags] = useState<Tag[]>(tags)

		// Trade screenshot state (local-first)
		const [persistedScreenshot, setPersistedScreenshot] =
			useState<PersistedImage | null>(() => {
				if (trade?.screenshotUrl && trade?.screenshotS3Key) {
					return { url: trade.screenshotUrl, s3Key: trade.screenshotS3Key }
				}
				return null
			})
		const [pendingScreenshot, setPendingScreenshot] =
			useState<PendingImage | null>(null)

		const handleTagCreated = async () => {
			// Refresh tags from server after inline creation
			const result = await getTags()
			if (result.status === "success" && result.data) {
				setLocalTags(result.data)
			}
		}

		const effectiveNow = defaultDate ? new Date(defaultDate) : new Date()

		// Resolve default asset symbol for new trades
		const resolvedDefaultAssetSymbol = (() => {
			if (initialSharedState?.asset) return initialSharedState.asset
			if (defaultAssetId && assets.length > 0) {
				const match = assets.find((a) => a.id === defaultAssetId || a.symbol === defaultAssetId)
				return match?.symbol
			}
			return undefined
		})()

		const defaultValues: Partial<TradeFormInput> = trade
			? buildTradeFormValues(trade)
			: {
					direction: initialSharedState?.direction ?? "long",
					entryDate: formatDateTimeLocal(effectiveNow),
					exitDate: formatDateTimeLocal(effectiveNow),
					tagIds: initialSharedState?.tagIds ?? [],
					...(resolvedDefaultAssetSymbol && { asset: resolvedDefaultAssetSymbol }),
					...(initialSharedState && {
						asset: initialSharedState.asset,
						timeframeId: initialSharedState.timeframeId,
						strategyId: initialSharedState.strategyId,
						stopLoss: initialSharedState.stopLoss
							? Number(initialSharedState.stopLoss)
							: undefined,
						takeProfit: initialSharedState.takeProfit
							? Number(initialSharedState.takeProfit)
							: undefined,
						preTradeThoughts: initialSharedState.preTradeThoughts,
						postTradeReflection: initialSharedState.postTradeReflection,
						lessonLearned: initialSharedState.lessonLearned,
						followedPlan: initialSharedState.followedPlan,
						disciplineNotes: initialSharedState.disciplineNotes,
						setupRank: initialSharedState.setupRank,
					}),
				}

		const form = useForm<TradeFormInput>({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			resolver: zodResolver(createTradeSchema) as any,
			defaultValues,
		})

		const {
			handleSubmit,
			watch,
			setValue,
			reset,
			formState: { errors },
		} = form

		// Reset form when trade prop changes (for edit mode)
		useEffect(() => {
			if (trade) {
				reset(buildTradeFormValues(trade))
				const asset = assets.find((a) => a.symbol === trade.asset)
				setSelectedAsset(asset ?? null)
			}
		}, [trade, reset, assets])

		// Expose shared state for parent to capture before mode switch
		useImperativeHandle(ref, () => ({
			getSharedState: (): SharedTradeFormState => {
				const values = form.getValues()
				return {
					asset: values.asset,
					direction: values.direction,
					timeframeId: values.timeframeId,
					strategyId: values.strategyId,
					stopLoss: values.stopLoss ? String(values.stopLoss) : undefined,
					takeProfit: values.takeProfit ? String(values.takeProfit) : undefined,
					preTradeThoughts: values.preTradeThoughts,
					postTradeReflection: values.postTradeReflection,
					lessonLearned: values.lessonLearned,
					followedPlan: values.followedPlan,
					disciplineNotes: values.disciplineNotes,
					setupRank: values.setupRank,
					tagIds: values.tagIds,
				}
			},
		}))

		const direction = watch("direction")
		const entryPrice = watch("entryPrice")
		const exitPrice = watch("exitPrice")
		const positionSize = watch("positionSize")
		const stopLoss = watch("stopLoss")
		const takeProfit = watch("takeProfit")
		const selectedTagIds = watch("tagIds") || []
		const tValidation = useTranslations("trade.validation")

		// Real-time SL/TP cross-field validation indicators
		const stopLossWarning = useMemo(() => {
			if (!entryPrice || !stopLoss || !direction) return null
			const entry = Number(entryPrice)
			const sl = Number(stopLoss)
			if (isNaN(entry) || isNaN(sl)) return null
			if (direction === "long" && sl >= entry)
				return tValidation("stopLossMustBeBelowEntry")
			if (direction === "short" && sl <= entry)
				return tValidation("stopLossMustBeAboveEntry")
			return null
		}, [entryPrice, stopLoss, direction, tValidation])

		const takeProfitWarning = useMemo(() => {
			if (!entryPrice || !takeProfit || !direction) return null
			const entry = Number(entryPrice)
			const tp = Number(takeProfit)
			if (isNaN(entry) || isNaN(tp)) return null
			if (direction === "long" && tp <= entry)
				return tValidation("takeProfitMustBeAboveEntry")
			if (direction === "short" && tp >= entry)
				return tValidation("takeProfitMustBeBelowEntry")
			return null
		}, [entryPrice, takeProfit, direction, tValidation])

		// Auto-calculate planned risk from stop loss using asset-based calculation when available
		const calculatedRisk = useMemo(() => {
			if (!entryPrice || !stopLoss || !positionSize) return null
			const entry = Number(entryPrice)
			const sl = Number(stopLoss)
			const size = Number(positionSize)
			if (isNaN(entry) || isNaN(sl) || isNaN(size)) return null

			if (selectedAsset) {
				// Use asset-based calculation (tick size and tick value)
				const priceDiff = Math.abs(entry - sl)
				const tickSize = parseFloat(selectedAsset.tickSize)
				const tickValue = fromCents(selectedAsset.tickValue)
				const ticksAtRisk = priceDiff / tickSize
				return ticksAtRisk * tickValue * size
			}

			// Fallback to simple price-based calculation
			const riskPerUnit = Math.abs(entry - sl)
			return riskPerUnit * size
		}, [entryPrice, stopLoss, positionSize, selectedAsset])

		// Auto-calculate planned R target from TP/SL ratio (always derived, never user input)
		const calculatedPlannedR = useMemo(() => {
			if (!entryPrice || !stopLoss || !takeProfit) return null
			const entry = Number(entryPrice)
			const sl = Number(stopLoss)
			const tp = Number(takeProfit)
			if (isNaN(entry) || isNaN(sl) || isNaN(tp)) return null
			const riskPerUnit = direction === "long" ? entry - sl : sl - entry
			if (riskPerUnit === 0) return null
			const rewardPerUnit = direction === "long" ? tp - entry : entry - tp
			return Math.abs(rewardPerUnit / riskPerUnit)
		}, [entryPrice, stopLoss, takeProfit, direction])

		const contractsExecutedValue = watch("contractsExecuted")

		// Calculate P&L preview using asset-based calculation when available
		const calculatedPnLResult = useMemo(() => {
			if (!entryPrice || !exitPrice || !positionSize) return null

			const entry = Number(entryPrice)
			const exit = Number(exitPrice)
			const size = Number(positionSize)
			const dir = direction || "long"
			// Default contractsExecuted to positionSize * 2 (entry + exit) if not specified
			const contracts = contractsExecutedValue
				? Number(contractsExecutedValue)
				: size * 2

			if (selectedAsset) {
				// Use asset-based calculation with tick size and tick value
				// tickValue is stored in cents, convert to dollars
				// TODO: Get commission/fees from account settings in Task #9
				return calculateAssetPnL({
					entryPrice: entry,
					exitPrice: exit,
					positionSize: size,
					direction: dir,
					tickSize: parseFloat(selectedAsset.tickSize),
					tickValue: fromCents(selectedAsset.tickValue),
					commission: 0,
					fees: 0,
					contractsExecuted: contracts,
				})
			}

			// Fallback to simple P&L calculation
			const simplePnl = calculatePnL({
				direction: dir,
				entryPrice: entry,
				exitPrice: exit,
				positionSize: size,
			})

			return {
				ticksGained: 0,
				grossPnl: simplePnl,
				netPnl: simplePnl,
				totalCosts: 0,
			}
		}, [
			entryPrice,
			exitPrice,
			positionSize,
			direction,
			selectedAsset,
			contractsExecutedValue,
		])

		const calculatedPnL = calculatedPnLResult?.netPnl ?? null

		// Calculate R-Multiple preview
		const calculatedR =
			calculatedPnL !== null && calculatedRisk
				? calculateRMultiple(calculatedPnL, calculatedRisk)
				: null

		const handleTagToggle = (tagId: string) => {
			const current = selectedTagIds || []
			const updated = current.includes(tagId)
				? current.filter((id) => id !== tagId)
				: [...current, tagId]
			setValue("tagIds", updated)
		}

		const onSubmit = async (data: TradeFormInput) => {
			setIsSubmitting(true)
			try {
				// Upload pending screenshot if present
				let screenshotUrl = ""
				let screenshotS3Key = ""

				if (pendingScreenshot) {
					const entityId = trade?.id ?? crypto.randomUUID()
					const { uploaded, errors } = await uploadFiles({
						pendingImages: [pendingScreenshot],
						path: "trades",
						entityId,
					})

					if (errors.length > 0) {
						showToast("error", errors[0])
						setIsSubmitting(false)
						return
					}

					if (uploaded.length > 0) {
						screenshotUrl = uploaded[0].url
						screenshotS3Key = uploaded[0].s3Key
					}
				} else if (persistedScreenshot) {
					screenshotUrl = persistedScreenshot.url
					screenshotS3Key = persistedScreenshot.s3Key
				}

				const submitData = {
					...data,
					riskAmount: calculatedRisk ?? undefined,
					screenshotUrl,
					screenshotS3Key,
				}
				const result = isEditing
					? await updateTrade(trade.id, submitData)
					: await createTrade(submitData)

				if (result.status === "success") {
					showToast(
						"success",
						isEditing ? t("tradeUpdatedSuccess") : t("tradeCreatedSuccess")
					)
					onSuccess?.()
					// Redirect to specified location or journal list
					router.push(redirectTo || "/journal")
				} else {
					showToast("error", result.message || t("tradeSaveError"))
				}
			} catch {
				showToast("error", t("tradeUnexpectedError"))
			} finally {
				setIsSubmitting(false)
			}
		}

		const setupTags = localTags.filter((t) => t.type === "setup")
		const mistakeTags = localTags.filter((t) => t.type === "mistake")

		// Map fields to tabs for error highlighting
		const basicFields = [
			"asset",
			"entryDate",
			"entryPrice",
			"positionSize",
			"direction",
			"timeframeId",
			"exitDate",
			"exitPrice",
			"strategyId",
		] as const
		const riskFields = ["stopLoss", "takeProfit", "mfe", "mae"] as const
		const journalFields = [
			"preTradeThoughts",
			"postTradeReflection",
			"lessonLearned",
			"followedPlan",
			"disciplineNotes",
		] as const
		const tagFields = ["tagIds"] as const

		const hasBasicErrors = basicFields.some((field) => errors[field])
		const hasRiskErrors = riskFields.some((field) => errors[field])
		const hasJournalErrors = journalFields.some((field) => errors[field])
		const hasTagErrors = tagFields.some((field) => errors[field])

		return (
			<Form {...form}>
				<form
					onSubmit={handleSubmit(onSubmit)}
					className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600"
				>
					<Tabs defaultValue="basic" className="w-full">
						<TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
							<TabsTrigger
								value="basic"
								className={cn(
									hasBasicErrors &&
										"text-fb-error data-[state=active]:text-fb-error"
								)}
							>
								{tJournal("basic")}
								{hasBasicErrors && (
									<span className="bg-fb-error ml-1 h-2 w-2 rounded-full" />
								)}
							</TabsTrigger>
							<TabsTrigger
								value="risk"
								className={cn(
									hasRiskErrors &&
										"text-fb-error data-[state=active]:text-fb-error"
								)}
							>
								{tJournal("risk")}
								{hasRiskErrors && (
									<span className="bg-fb-error ml-1 h-2 w-2 rounded-full" />
								)}
							</TabsTrigger>
							<TabsTrigger
								value="journal"
								className={cn(
									hasJournalErrors &&
										"text-fb-error data-[state=active]:text-fb-error"
								)}
							>
								{tJournal("journal")}
								{hasJournalErrors && (
									<span className="bg-fb-error ml-1 h-2 w-2 rounded-full" />
								)}
							</TabsTrigger>
							<TabsTrigger
								value="tags"
								className={cn(
									hasTagErrors &&
										"text-fb-error data-[state=active]:text-fb-error"
								)}
							>
								{tJournal("tagsSection")}
								{hasTagErrors && (
									<span className="bg-fb-error ml-1 h-2 w-2 rounded-full" />
								)}
							</TabsTrigger>
						</TabsList>

						{/* Basic Info Tab */}
						<AnimatedTabsContent
							value="basic"
							className="space-y-m-400 sm:space-y-m-500 pt-m-400 sm:pt-m-500"
						>
							{/* Direction Toggle */}
							<div className="space-y-s-200">
								<Label id="label-trade-direction">{t("direction.label")}</Label>
								<div className="gap-m-400 flex">
									<button
										type="button"
										onClick={() => setValue("direction", "long")}
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
										onClick={() => setValue("direction", "short")}
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

							{/* Asset and Timeframe */}
							<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="asset"
									render={({ field }) => (
										<FormItem>
											<div className="gap-s-200 flex items-center">
												<FormLabel id="form-label-asset">
													{t("assetRequired")}
												</FormLabel>
												{selectedAsset && (
													<Tooltip>
														<TooltipTrigger asChild>
															<Info className="text-txt-300 h-4 w-4" />
														</TooltipTrigger>
														<TooltipContent id="tooltip-trade-asset-info">
															<div className="text-tiny space-y-1">
																<p>
																	<span className="text-txt-300">
																		{t("type")}:
																	</span>{" "}
																	{selectedAsset.assetType.name}
																</p>
																<p>
																	<span className="text-txt-300">
																		{t("tickSize")}:
																	</span>{" "}
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
												value={field.value || ""}
												onValueChange={(value) => {
													field.onChange(value)
													const asset = assets.find((a) => a.symbol === value)
													setSelectedAsset(asset ?? null)
												}}
												disabled={!hasConfiguredAssets}
											>
												<FormControl>
													<SelectTrigger id="trade-asset">
														<SelectValue
															placeholder={
																hasConfiguredAssets
																	? t("selectAsset")
																	: t("noAssets")
															}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{assets.map((asset) => (
														<SelectItem key={asset.id} value={asset.symbol}>
															<span className="font-mono">{asset.symbol}</span>
															<span className="text-txt-300 ml-2">
																{asset.name}
															</span>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{!hasConfiguredAssets && (
												<p className="text-tiny text-txt-300">
													{t("noAssets")}
												</p>
											)}
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="timeframeId"
									render={({ field }) => (
										<FormItem>
											<FormLabel id="form-label-timeframe">
												{t("timeframe")}
											</FormLabel>
											<Select
												value={field.value || ""}
												onValueChange={(value) => field.onChange(value || null)}
												disabled={!hasConfiguredTimeframes}
											>
												<FormControl>
													<SelectTrigger id="trade-timeframe">
														<SelectValue
															placeholder={
																hasConfiguredTimeframes
																	? t("selectTimeframe")
																	: t("noTimeframes")
															}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{configuredTimeframes.map((tf) => (
														<SelectItem key={tf.id} value={tf.id}>
															{tf.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{!hasConfiguredTimeframes && (
												<p className="text-tiny text-txt-300">
													{t("noTimeframes")}
												</p>
											)}
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Dates */}
							<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="entryDate"
									render={({ field }) => (
										<FormItem>
											<FormLabel id="form-label-entry-date">
												{t("entryDateRequired")}
											</FormLabel>
											<FormControl>
												<Input
													id="trade-entry-date"
													type="datetime-local"
													max={getEndOfDayLocal(effectiveNow)}
													value={
														typeof field.value === "string" ? field.value : ""
													}
													onChange={field.onChange}
													onBlur={field.onBlur}
													name={field.name}
													ref={field.ref}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="exitDate"
									render={({ field }) => (
										<FormItem>
											<FormLabel id="form-label-exit-date">
												{t("exitDate")}
											</FormLabel>
											<FormControl>
												<Input
													id="trade-exit-date"
													type="datetime-local"
													max={getEndOfDayLocal(effectiveNow)}
													value={
														typeof field.value === "string" ? field.value : ""
													}
													onChange={field.onChange}
													onBlur={field.onBlur}
													name={field.name}
													ref={field.ref}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Prices */}
							<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="entryPrice"
									render={({ field }) => (
										<FormItem>
											<FormLabel id="form-label-entry-price">
												{t("entryPriceRequired")}
											</FormLabel>
											<FormControl>
												<Input
													id="trade-entry-price"
													type="number"
													step="any"
													placeholder="0.00"
													{...field}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="exitPrice"
									render={({ field }) => (
										<FormItem>
											<FormLabel id="form-label-exit-price">
												{t("exitPrice")}
											</FormLabel>
											<FormControl>
												<Input
													id="trade-exit-price"
													type="number"
													step="any"
													placeholder="0.00"
													{...field}
													value={field.value ?? ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Position Size */}
							<FormField
								control={form.control}
								name="positionSize"
								render={({ field }) => (
									<FormItem>
										<FormLabel id="form-label-position-size">
											{t("positionSizeRequired")}
										</FormLabel>
										<FormControl>
											<Input
												id="trade-position-size"
												type="number"
												step="any"
												placeholder={t("positionSizeHint")}
												{...field}
												onChange={(e) =>
													field.onChange(
														e.target.value ? Number(e.target.value) : undefined
													)
												}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Strategy */}
							{strategies.length > 0 && (
								<FormField
									control={form.control}
									name="strategyId"
									render={({ field }) => (
										<FormItem>
											<FormLabel id="form-label-strategy">
												{t("strategy")}
											</FormLabel>
											<Select
												value={field.value || ""}
												onValueChange={field.onChange}
											>
												<FormControl>
													<SelectTrigger id="trade-strategy">
														<SelectValue placeholder={t("selectStrategy")} />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{strategies.map((strategy) => (
														<SelectItem key={strategy.id} value={strategy.id}>
															{strategy.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							{/* Setup Rank — visible when a strategy is selected */}
							{watch("strategyId") && (
								<div className="space-y-s-200">
									<Label id="label-trade-setup-rank">{t("setupRank")}</Label>
									<p className="text-tiny text-txt-300">{t("setupRankHint")}</p>
									<div className="gap-s-200 flex">
										{(["A", "AA", "AAA"] as const).map((rank) => (
											<button
												key={rank}
												type="button"
												onClick={() =>
													setValue(
														"setupRank",
														watch("setupRank") === rank ? null : rank
													)
												}
												aria-label={`${t("setupRank")}: ${rank}`}
												aria-pressed={watch("setupRank") === rank}
												className={cn(
													"py-s-300 flex-1 rounded-lg border-2 text-center font-semibold transition-colors",
													watch("setupRank") === rank
														? "border-acc-100 bg-acc-100/10 text-acc-100"
														: "border-bg-300 text-txt-200 hover:border-acc-100/50"
												)}
											>
												{rank}
											</button>
										))}
									</div>
								</div>
							)}
						</AnimatedTabsContent>

						{/* Risk Management Tab */}
						<AnimatedTabsContent
							value="risk"
							className="space-y-m-400 sm:space-y-m-500 pt-m-400 sm:pt-m-500"
						>
							{/* Stop Loss and Take Profit */}
							<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="stopLoss"
									render={({ field }) => (
										<FormItem>
											<FormLabel id="form-label-stop-loss">
												{t("stopLoss")}
											</FormLabel>
											<FormControl>
												<Input
													id="trade-stop-loss"
													type="number"
													step="any"
													placeholder="0.00"
													className={cn(stopLossWarning && "border-fb-error")}
													{...field}
													value={field.value ?? ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined
														)
													}
												/>
											</FormControl>
											{stopLossWarning && (
												<span className="text-tiny text-fb-error">
													{stopLossWarning}
												</span>
											)}
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="takeProfit"
									render={({ field }) => (
										<FormItem>
											<FormLabel id="form-label-take-profit">
												{t("takeProfit")}
											</FormLabel>
											<FormControl>
												<Input
													id="trade-take-profit"
													type="number"
													step="any"
													placeholder="0.00"
													className={cn(takeProfitWarning && "border-fb-error")}
													{...field}
													value={field.value ?? ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined
														)
													}
												/>
											</FormControl>
											{takeProfitWarning && (
												<span className="text-tiny text-fb-error">
													{takeProfitWarning}
												</span>
											)}
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Risk Amount (always calculated from entry, stop loss, and position size) */}
							<div className="space-y-s-200">
								<div className="gap-s-200 flex items-center">
									<Label id="label-trade-planned-risk">
										{t("plannedRisk")} ({selectedAsset?.currency ?? "$"})
									</Label>
									<Tooltip>
										<TooltipTrigger asChild>
											<Info className="text-txt-300 h-4 w-4 cursor-help" />
										</TooltipTrigger>
										<TooltipContent id="tooltip-trade-auto-risk">
											<p className="text-tiny max-w-[200px]">
												{t("autoCalculatedRisk")}
											</p>
										</TooltipContent>
									</Tooltip>
								</div>
								<div className="border-bg-300 bg-bg-100 px-s-300 flex h-10 items-center rounded-md border">
									{calculatedRisk !== null ? (
										<span className="text-small text-txt-100 font-medium">
											{selectedAsset?.currency ?? "$"}{" "}
											{calculatedRisk.toLocaleString("pt-BR", {
												minimumFractionDigits: 2,
												maximumFractionDigits: 2,
											})}
										</span>
									) : (
										<span className="text-small text-txt-300">
											{t("enterStopToCalculate")}
										</span>
									)}
								</div>
								<p className="text-tiny text-txt-300">
									{t("autoCalculatedRisk")}
								</p>
							</div>

							{/* Planned R-Multiple (calculated from TP/SL) */}
							<div className="space-y-s-200">
								<Label id="label-trade-planned-r-target">
									{t("plannedRTarget")}
								</Label>
								<div className="border-bg-300 bg-bg-100 px-s-300 flex h-10 items-center rounded-md border">
									{calculatedPlannedR !== null ? (
										<span className="text-small text-txt-100 font-medium">
											{calculatedPlannedR.toFixed(2)}R
										</span>
									) : (
										<span className="text-small text-txt-300">
											{t("enterTpSlToCalculate")}
										</span>
									)}
								</div>
								<p className="text-tiny text-txt-300">{t("autoCalculatedR")}</p>
							</div>

							{/* MFE/MAE */}
							<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="mfe"
									render={({ field }) => (
										<FormItem>
											<FormLabel id="form-label-mfe">{t("mfeFull")}</FormLabel>
											<FormControl>
												<Input
													id="trade-mfe"
													type="number"
													step="any"
													placeholder={t("mfeHint")}
													{...field}
													value={field.value ?? ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="mae"
									render={({ field }) => (
										<FormItem>
											<FormLabel id="form-label-mae">{t("maeFull")}</FormLabel>
											<FormControl>
												<Input
													id="trade-mae"
													type="number"
													step="any"
													placeholder={t("maeHint")}
													{...field}
													value={field.value ?? ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Contracts Executed (for fee calculation) */}
							<FormField
								control={form.control}
								name="contractsExecuted"
								render={({ field }) => (
									<FormItem>
										<div className="gap-s-200 flex items-center">
											<FormLabel id="form-label-contracts-executed">
												{t("contractsExecuted")}
											</FormLabel>
											<Tooltip>
												<TooltipTrigger asChild>
													<Info className="text-txt-300 h-4 w-4" />
												</TooltipTrigger>
												<TooltipContent id="tooltip-trade-contracts-executed">
													<div className="text-tiny max-w-xs space-y-1">
														<p>{t("contractsExecutedDesc")}</p>
														<p>{t("contractsExecutedDefault")}</p>
														<p>{t("contractsExecutedScaling")}</p>
													</div>
												</TooltipContent>
											</Tooltip>
										</div>
										<FormControl>
											<Input
												id="trade-contracts-executed"
												type="number"
												step="1"
												placeholder={
													positionSize
														? t("contractsExecutedPlaceholder", {
																count: Number(positionSize) * 2,
															})
														: t("contractsAutoCalculated")
												}
												{...field}
												value={field.value ?? ""}
												onChange={(e) =>
													field.onChange(
														e.target.value ? Number(e.target.value) : undefined
													)
												}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* P&L Preview */}
							{calculatedPnLResult !== null && (
								<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
									<p className="text-small text-txt-300">
										{t("calculatedPnl")}
									</p>
									<p
										className={cn(
											"text-h3 font-bold",
											calculatedPnLResult.netPnl >= 0
												? "text-trade-buy"
												: "text-trade-sell"
										)}
									>
										{calculatedPnLResult.netPnl >= 0 ? "+" : ""}
										{selectedAsset?.currency ?? "$"}
										{calculatedPnLResult.netPnl.toFixed(2)}
										{calculatedR !== null && (
											<span className="text-body ml-2">
												({calculatedR >= 0 ? "+" : ""}
												{calculatedR.toFixed(2)}R)
											</span>
										)}
									</p>
									{selectedAsset && calculatedPnLResult.ticksGained !== 0 && (
										<div className="mt-s-200 gap-m-400 text-tiny text-txt-300 flex">
											<span>
												{calculatedPnLResult.ticksGained.toFixed(1)}{" "}
												{t("ticks")}
											</span>
											{calculatedPnLResult.totalCosts > 0 && (
												<span>
													{t("costs")}: {selectedAsset.currency}
													{calculatedPnLResult.totalCosts.toFixed(2)}
												</span>
											)}
										</div>
									)}
								</div>
							)}
						</AnimatedTabsContent>

						{/* Journal Tab */}
						<AnimatedTabsContent
							value="journal"
							className="space-y-m-400 sm:space-y-m-500 pt-m-400 sm:pt-m-500"
						>
							<FormField
								control={form.control}
								name="preTradeThoughts"
								render={({ field }) => (
									<FormItem>
										<FormLabel id="form-label-pre-trade-thoughts">
											{t("preTradeThoughts")}
										</FormLabel>
										<FormControl>
											<Textarea
												id="trade-pre-trade-thoughts"
												placeholder={t("preTradeHint")}
												rows={4}
												{...field}
												value={field.value || ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="postTradeReflection"
								render={({ field }) => (
									<FormItem>
										<FormLabel id="form-label-post-trade-reflection">
											{t("postTradeReflection")}
										</FormLabel>
										<FormControl>
											<Textarea
												id="trade-post-trade-reflection"
												placeholder={t("postTradeHint")}
												rows={4}
												{...field}
												value={field.value || ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="lessonLearned"
								render={({ field }) => (
									<FormItem>
										<FormLabel id="form-label-lesson-learned">
											{t("lessonLearned")}
										</FormLabel>
										<FormControl>
											<Textarea
												id="trade-lesson-learned"
												placeholder={t("lessonHint")}
												rows={3}
												{...field}
												value={field.value || ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Compliance */}
							<div className="space-y-s-200">
								<Label id="label-trade-followed-plan">
									{t("didYouFollowPlan")}
								</Label>
								<div className="gap-m-400 flex">
									<button
										type="button"
										onClick={() => setValue("followedPlan", true)}
										aria-label={`${t("followedPlan")}: ${tCommon("yes")}`}
										aria-pressed={watch("followedPlan") === true}
										className={cn(
											"p-m-400 flex-1 rounded-lg border-2 text-center transition-colors",
											watch("followedPlan") === true
												? "border-trade-buy bg-trade-buy/10 text-trade-buy"
												: "border-bg-300 text-txt-200 hover:border-trade-buy/50"
										)}
									>
										{tCommon("yes")}
									</button>
									<button
										type="button"
										onClick={() => setValue("followedPlan", false)}
										aria-label={`${t("followedPlan")}: ${tCommon("no")}`}
										aria-pressed={watch("followedPlan") === false}
										className={cn(
											"p-m-400 flex-1 rounded-lg border-2 text-center transition-colors",
											watch("followedPlan") === false
												? "border-trade-sell bg-trade-sell/10 text-trade-sell"
												: "border-bg-300 text-txt-200 hover:border-trade-sell/50"
										)}
									>
										{tCommon("no")}
									</button>
								</div>
							</div>

							{watch("followedPlan") === false && (
								<FormField
									control={form.control}
									name="disciplineNotes"
									render={({ field }) => (
										<FormItem>
											<FormLabel id="form-label-discipline-notes">
												{t("whatWentWrong")}
											</FormLabel>
											<FormControl>
												<Textarea
													id="trade-discipline-notes"
													placeholder={t("describeBreach")}
													rows={3}
													{...field}
													value={field.value || ""}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							{/* Trade Screenshot */}
							<div className="space-y-s-200">
								<div className="gap-s-200 flex items-center">
									<ImageIcon className="text-txt-300 h-4 w-4" />
									<Label id="label-trade-screenshot">
										{t("tradeScreenshot")}
									</Label>
								</div>
								<p className="text-tiny text-txt-300">
									{t("tradeScreenshotHint")}
								</p>
								<ImageUpload
									persistedImages={
										persistedScreenshot ? [persistedScreenshot] : []
									}
									pendingImages={pendingScreenshot ? [pendingScreenshot] : []}
									onFileAdd={(img) => setPendingScreenshot(img)}
									onPendingRemove={() => setPendingScreenshot(null)}
									onPersistedRemove={() => setPersistedScreenshot(null)}
									maxImages={1}
								/>
							</div>
						</AnimatedTabsContent>

						{/* Tags Tab */}
						<AnimatedTabsContent
							value="tags"
							className="space-y-m-400 sm:space-y-m-500 pt-m-400 sm:pt-m-500"
						>
							{/* Setup Tags */}
							{setupTags.length > 0 && (
								<div className="space-y-s-200">
									<Label id="label-trade-setup-type">{t("setupType")}</Label>
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

							{/* Mistake Tags */}
							{mistakeTags.length > 0 && (
								<div className="space-y-s-200">
									<Label id="label-trade-mistakes">{t("mistakes")}</Label>
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

							{/* Inline Create Tag */}
							<div className="gap-s-300 flex items-center">
								<Button
									id="trade-form-create-tag"
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setIsTagFormOpen(true)}
								>
									<Plus className="mr-1 h-4 w-4" />
									{t("inlineCreateTag")}
								</Button>
							</div>

							{localTags.length === 0 && (
								<div className="border-bg-300 bg-bg-200 p-m-400 sm:p-m-500 lg:p-m-600 rounded-lg border text-center">
									<p className="text-txt-200">{t("noTagsYet")}</p>
									<p className="mt-s-200 text-small text-txt-300">
										{t("createTagsHint")}
									</p>
								</div>
							)}

							{/* Inline Tag Form Dialog */}
							<TagForm
								open={isTagFormOpen}
								onOpenChange={setIsTagFormOpen}
								onSuccess={handleTagCreated}
							/>
						</AnimatedTabsContent>
					</Tabs>

					{/* Submit Button */}
					<div className="gap-s-300 sm:gap-m-400 border-bg-300 pt-m-400 sm:pt-m-500 flex flex-col-reverse border-t sm:flex-row sm:justify-end">
						<Button
							id="trade-form-cancel"
							type="button"
							variant="outline"
							onClick={() => router.back()}
							disabled={isSubmitting}
						>
							{tCommon("cancel")}
						</Button>
						<Button
							id="trade-form-submit"
							type="submit"
							disabled={isSubmitting}
						>
							{isSubmitting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{tCommon("saving")}
								</>
							) : (
								<>
									<Save className="mr-2 h-4 w-4" />
									{isEditing ? t("updateTrade") : t("saveTrade")}
								</>
							)}
						</Button>
					</div>
				</form>
			</Form>
		)
	}
)

TradeForm.displayName = "TradeForm"

export { TradeForm }
