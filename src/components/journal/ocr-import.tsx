"use client"

import {
	useState,
	useRef,
	useCallback,
	useEffect,
	useMemo,
	type DragEvent,
	type ChangeEvent,
} from "react"
import { useRouter } from "next/navigation"
import {
	Upload,
	Image as ImageIcon,
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	X,
	Loader2,
	ChevronDown,
	ChevronUp,
	Info,
	FileText,
	Trash2,
	Sparkles,
	Cpu,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table"
import {
	recognizeImage,
	parseProfitChartOcr,
	type OcrProgressInfo,
	type OcrParseResult,
	type OcrImportInput,
	type ProfitChartExecution,
	REQUIRED_COLUMNS,
} from "@/lib/ocr"
import {
	bulkCreateTradesFromOcr,
	checkVisionAvailability,
	extractTradesWithVision,
} from "@/app/actions/ocr-import"
import { cn } from "@/lib/utils"
import { formatDateKey } from "@/lib/dates"
import { DatePicker } from "@/components/ui/date-picker"

// ==========================================
// Types
// ==========================================

type Step = "upload" | "processing" | "review" | "importing"

interface EditableExecution extends ProfitChartExecution {
	id: string
}

interface EditableTrade {
	id: string
	asset: string
	originalContractCode: string
	direction: "long" | "short"
	executions: EditableExecution[]
	isExpanded: boolean
}

// ==========================================
// Component
// ==========================================

export const OcrImport = () => {
	const t = useTranslations("journal.ocr")
	const tTrade = useTranslations("trade")
	const tCommon = useTranslations("common")
	const tOverlay = useTranslations("overlay")
	const router = useRouter()
	const { showToast } = useToast()
	const { showLoading, hideLoading } = useLoadingOverlay()
	const fileInputRef = useRef<HTMLInputElement>(null)

	// State
	const [step, setStep] = useState<Step>("upload")
	const [image, setImage] = useState<string | null>(null)
	const [fileName, setFileName] = useState<string | null>(null)
	const [progress, setProgress] = useState<OcrProgressInfo | null>(null)
	const [parseResult, setParseResult] = useState<OcrParseResult | null>(null)
	const [rawTextExpanded, setRawTextExpanded] = useState(false)
	const [requirementsExpanded, setRequirementsExpanded] = useState(true)

	// Editable state for review - now supports multiple trades
	const [editedDate, setEditedDate] = useState("")
	const [editedTrades, setEditedTrades] = useState<EditableTrade[]>([])

	const [isDragging, setIsDragging] = useState(false)
	const [isImporting, setIsImporting] = useState(false)

	// Vision OCR state
	const [visionAvailable, setVisionAvailable] = useState<boolean | null>(null)
	const [ocrProvider, setOcrProvider] = useState<string | null>(null)

	// Check Vision availability on mount
	useEffect(() => {
		let isMounted = true
		const checkVision = async () => {
			const result = await checkVisionAvailability()
			if (!isMounted) {
				return
			}
			const isAvailable = result.data?.available ?? false
			setVisionAvailable(isAvailable)
		}
		void checkVision()
		return () => {
			isMounted = false
		}
	}, [])

	// ==========================================
	// Handlers
	// ==========================================

	const handleFileSelect = useCallback(
		async (file: File) => {
			const validTypes = ["image/png", "image/jpeg", "image/webp", "image/jpg"]
			if (!validTypes.includes(file.type)) {
				showToast("error", t("invalidImageFile"))
				return
			}

			const reader = new FileReader()
			reader.onload = async (e) => {
				const imageData = e.target?.result as string
				setImage(imageData)
				setFileName(file.name)
				setStep("processing")
				showLoading({ message: tOverlay("processingImage") })

				try {
					let parsed: OcrParseResult

					// Try AI Vision cascade first if available
					if (visionAvailable) {
						setProgress({
							status: "recognizing",
							progress: 50,
							message: t("analyzingVision"),
						})

						// Extract base64 without the data URL prefix
						const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "")
						const mimeType = file.type

						const result = await extractTradesWithVision(base64Data, mimeType)

						if (result.status === "success" && result.data) {
							const provider =
								(result.data as OcrParseResult & { provider?: string })
									.provider ?? "ai"
							setOcrProvider(provider)
							parsed = result.data
						} else {
							// Fall back to Tesseract if all AI providers fail
							setOcrProvider("tesseract")
							setProgress({
								status: "recognizing",
								progress: 30,
								message: t("visionFallback"),
							})
							const ocrResult = await recognizeImage(imageData, setProgress)
							parsed = parseProfitChartOcr(ocrResult)
						}
					} else {
						// Use Tesseract as fallback
						setOcrProvider("tesseract")
						const ocrResult = await recognizeImage(imageData, setProgress)
						parsed = parseProfitChartOcr(ocrResult)
					}

					setParseResult(parsed)

					// Initialize editable state from parsed trades
					const trades = parsed.trades.map((trade) => ({
						id: trade.id,
						asset: trade.summary.asset,
						originalContractCode: trade.summary.originalContractCode,
						direction: trade.summary.direction ?? ("long" as const),
						executions: trade.executions.map((ex, idx) => ({
							...ex,
							id: `${trade.id}-ex-${idx}`,
						})),
						isExpanded: true,
					}))

					setEditedTrades(trades)
					setEditedDate(formatDateKey(new Date()))

					hideLoading()
					setStep("review")
				} catch {
					hideLoading()
					showToast("error", t("failedToProcess"))
					setStep("upload")
				}
			}
			reader.onerror = () => {
				showToast("error", t("failedToReadFile"))
			}
			reader.readAsDataURL(file)
		},
		[showToast, visionAvailable, showLoading, hideLoading, tOverlay]
	)

	const handleDrop = useCallback(
		(e: DragEvent) => {
			e.preventDefault()
			setIsDragging(false)
			const file = e.dataTransfer.files[0]
			if (file) {
				void handleFileSelect(file)
			}
		},
		[handleFileSelect]
	)

	const handleDragOver = useCallback((e: DragEvent) => {
		e.preventDefault()
		setIsDragging(true)
	}, [])

	const handleDragLeave = useCallback((e: DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
	}, [])

	const handleInputChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0]
			if (file) {
				void handleFileSelect(file)
			}
		},
		[handleFileSelect]
	)

	const handleClear = useCallback(() => {
		setStep("upload")
		setImage(null)
		setFileName(null)
		setProgress(null)
		setParseResult(null)
		setEditedTrades([])
		setOcrProvider(null)
		if (fileInputRef.current) {
			fileInputRef.current.value = ""
		}
	}, [])

	const handleRemoveTrade = useCallback((tradeId: string) => {
		setEditedTrades((prev) => prev.filter((t) => t.id !== tradeId))
	}, [])

	const handleToggleTradeExpand = useCallback((tradeId: string) => {
		setEditedTrades((prev) =>
			prev.map((t) =>
				t.id === tradeId ? { ...t, isExpanded: !t.isExpanded } : t
			)
		)
	}, [])

	const handleUpdateTrade = useCallback(
		(tradeId: string, updates: Partial<EditableTrade>) => {
			setEditedTrades((prev) =>
				prev.map((t) => (t.id === tradeId ? { ...t, ...updates } : t))
			)
		},
		[]
	)

	const handleRemoveExecution = useCallback(
		(tradeId: string, executionId: string) => {
			setEditedTrades((prev) =>
				prev.map((t) =>
					t.id === tradeId
						? {
								...t,
								executions: t.executions.filter((ex) => ex.id !== executionId),
							}
						: t
				)
			)
		},
		[]
	)

	const handleUpdateExecution = useCallback(
		(
			tradeId: string,
			executionId: string,
			updates: Partial<EditableExecution>
		) => {
			setEditedTrades((prev) =>
				prev.map((t) =>
					t.id === tradeId
						? {
								...t,
								executions: t.executions.map((ex) =>
									ex.id === executionId ? { ...ex, ...updates } : ex
								),
							}
						: t
				)
			)
		},
		[]
	)

	const handleImport = useCallback(async () => {
		const validTrades = editedTrades.filter(
			(t) => t.executions.length > 0 && t.asset
		)

		if (validTrades.length === 0) {
			showToast("error", t("noValidTrades"))
			return
		}

		setIsImporting(true)
		setStep("importing")
		showLoading({
			message: tOverlay("importingOcr", { count: validTrades.length }),
		})

		try {
			// Parse the date
			const baseDate = new Date(editedDate)

			// Build import inputs for all trades
			const importInputs: OcrImportInput[] = validTrades.flatMap((trade) => {
				const executions = trade.executions.map((ex) => {
					const [hours, minutes, seconds] = ex.time.split(":").map(Number)
					if (
						hours === undefined ||
						minutes === undefined ||
						seconds === undefined
					) {
						throw new Error(`Invalid time format for execution: ${ex.time}`)
					}
					const executionDate = new Date(baseDate)
					executionDate.setHours(hours, minutes, seconds, 0)

					return {
						executionType: ex.type,
						executionDate,
						price: ex.price,
						quantity: ex.quantity,
					}
				})

				const [firstExecution] = executions
				if (!firstExecution) {
					return []
				}
				const lastExit = [...executions]
					.reverse()
					.find((e) => e.executionType === "exit")

				return [
					{
						asset: trade.asset,
						originalContractCode: trade.originalContractCode,
						direction: trade.direction,
						entryDate: firstExecution.executionDate,
						exitDate: lastExit?.executionDate,
						executions,
					},
				]
			})

			const result = await bulkCreateTradesFromOcr(importInputs)

			if (result.status === "success") {
				showToast("success", result.message)
				router.push("/journal")
			} else {
				showToast("error", result.message)
				setStep("review")
			}
		} catch {
			showToast("error", tCommon("unexpectedError"))
			setStep("review")
		} finally {
			hideLoading()
			setIsImporting(false)
		}
	}, [
		editedTrades,
		editedDate,
		showToast,
		showLoading,
		hideLoading,
		router,
		t,
		tCommon,
		tOverlay,
	])

	// ==========================================
	// Computed Values
	// ==========================================

	const totalTrades = useMemo(
		() => editedTrades.filter((t) => t.executions.length > 0).length,
		[editedTrades]
	)
	const totalExecutions = useMemo(
		() => editedTrades.reduce((sum, t) => sum + t.executions.length, 0),
		[editedTrades]
	)

	// ==========================================
	// Render
	// ==========================================

	return (
		<div className="space-y-m-600">
			{/* Requirements Section */}
			<div className="border-bg-300 bg-bg-200 rounded-lg border">
				<Button
					id="ocr-requirements-toggle"
					type="button"
					variant="ghost"
					className="p-m-400 flex w-full items-center justify-between text-left"
					onClick={() => setRequirementsExpanded(!requirementsExpanded)}
				>
					<div className="gap-s-200 flex items-center">
						<Info className="text-acc-100 h-4 w-4" />
						<span className="text-small text-txt-100 font-medium">
							{t("requirements.title")}
						</span>
					</div>
					{requirementsExpanded ? (
						<ChevronUp className="text-txt-300 h-4 w-4" />
					) : (
						<ChevronDown className="text-txt-300 h-4 w-4" />
					)}
				</Button>

				{requirementsExpanded && (
					<div className="border-bg-300 p-s-300 sm:p-m-400 border-t">
						<p className="text-small text-txt-300">
							{t("requirements.description")}
						</p>

						<div className="mt-m-400 gap-m-400 grid md:grid-cols-2">
							<div>
								<h4 className="text-tiny text-txt-200 font-medium">
									{t("requirements.requiredColumns")}
								</h4>
								<ul className="mt-s-200 space-y-s-100 text-small text-txt-300">
									<li className="gap-s-200 flex items-center">
										<span className="text-trade-buy">✓</span>{" "}
										{t("requirements.columns.ativo")}
									</li>
									<li className="gap-s-200 flex items-center">
										<span className="text-trade-buy">✓</span>{" "}
										{t("requirements.columns.abertura")}
									</li>
									<li className="gap-s-200 flex items-center">
										<span className="text-trade-buy">✓</span>{" "}
										{t("requirements.columns.qtd")}
									</li>
									<li className="gap-s-200 flex items-center">
										<span className="text-trade-buy">✓</span>{" "}
										{t("requirements.columns.precoCompra")}
									</li>
									<li className="gap-s-200 flex items-center">
										<span className="text-trade-buy">✓</span>{" "}
										{t("requirements.columns.precoVenda")}
									</li>
								</ul>
							</div>

							<div>
								<h4 className="text-tiny text-txt-200 font-medium">
									{t("requirements.settings")}
								</h4>
								<ul className="mt-s-200 space-y-s-100 text-small text-txt-300">
									<li>• {t("requirements.settingsItems.headers")}</li>
									<li>• {t("requirements.settingsItems.expand")}</li>
									<li>• {t("requirements.settingsItems.contrast")}</li>
								</ul>
							</div>
						</div>

						<p className="mt-m-400 text-tiny text-txt-300">
							💡 {t("requirements.tip")}
						</p>
					</div>
				)}
			</div>

			{/* Upload Area */}
			{step === "upload" && (
				<div
					className={cn(
						"p-m-500 sm:p-l-700 lg:p-l-800 rounded-lg border-2 border-dashed text-center transition-colors",
						isDragging
							? "border-acc-100 bg-acc-100/10"
							: "border-bg-300 hover:border-txt-300"
					)}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
				>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/png,image/jpeg,image/webp"
						onChange={handleInputChange}
						className="hidden"
						id="ocr-file-input"
					/>

					<ImageIcon className="text-txt-300 mx-auto h-12 w-12" />
					<h3 className="mt-m-400 text-body text-txt-100 font-semibold">
						{t("dropImage")}
					</h3>
					<p className="mt-s-200 text-small text-txt-300">{t("orClick")}</p>

					{/* OCR Engine Indicator */}
					<div className="mt-m-400 gap-s-200 flex items-center justify-center">
						{visionAvailable === null ? (
							<span className="text-tiny text-txt-300">
								{t("checkingEngine")}
							</span>
						) : visionAvailable ? (
							<span className="gap-s-200 bg-trade-buy/20 px-s-300 py-s-100 text-tiny text-trade-buy flex items-center rounded-full font-medium">
								<Sparkles className="h-3 w-3" />
								{t("visionEngine")}
							</span>
						) : (
							<span className="gap-s-200 bg-warning/20 px-s-300 py-s-100 text-tiny text-warning flex items-center rounded-full font-medium">
								<Cpu className="h-3 w-3" />
								{t("tesseractEngine")}
							</span>
						)}
					</div>

					<div className="mt-m-500 flex items-center justify-center">
						<Button
							id="ocr-import-select-image"
							variant="default"
							onClick={() => fileInputRef.current?.click()}
						>
							<Upload className="mr-s-200 h-4 w-4" />
							{t("selectImage")}
						</Button>
					</div>
				</div>
			)}

			{/* Processing */}
			{step === "processing" && progress && (
				<div className="border-bg-300 bg-bg-200 p-l-800 rounded-lg border text-center">
					<Loader2 className="text-acc-100 mx-auto h-12 w-12 animate-spin motion-reduce:animate-none" />
					<h3 className="mt-m-400 text-body text-txt-100 font-semibold">
						{t("processing")}
					</h3>
					<p className="mt-s-200 text-small text-txt-300">{progress.message}</p>

					<div className="mt-m-400 bg-bg-300 mx-auto h-2 w-64 overflow-hidden rounded-full">
						<div
							className="bg-acc-100 h-full transition-all duration-300"
							style={{ width: `${progress.progress}%` }}
						/>
					</div>
					<p className="mt-s-200 text-tiny text-txt-300">
						{progress.progress}%
					</p>
				</div>
			)}

			{/* Review */}
			{step === "review" && parseResult && (
				<div className="space-y-m-500">
					{/* Image Preview */}
					<div className="bg-bg-200 p-s-300 sm:p-m-400 flex items-center justify-between rounded-lg">
						<div className="gap-s-300 flex items-center">
							<FileText className="text-txt-300 h-5 w-5" />
							<span className="text-small text-txt-100 font-medium">
								{fileName}
							</span>
						</div>
						<Button
							id="ocr-import-clear"
							variant="ghost"
							size="icon"
							onClick={handleClear}
							aria-label={tCommon("clear")}
						>
							<X className="h-4 w-4" />
						</Button>
					</div>

					{/* Column Detection Status */}
					<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
						<h3 className="text-small text-txt-100 font-semibold">
							{t("columnDetection.title")}
						</h3>
						<div className="mt-s-300 gap-s-300 flex flex-wrap">
							{REQUIRED_COLUMNS.map((col) => {
								const detected = parseResult.columnDetection.columns.some(
									(c) => c.type === col
								)
								return (
									<span
										key={col}
										className={cn(
											"px-s-300 py-s-100 text-tiny rounded-full font-medium",
											detected
												? "bg-trade-buy/20 text-trade-buy"
												: "bg-fb-error/20 text-fb-error"
										)}
									>
										{detected ? "✓" : "✗"} {col}
									</span>
								)
							})}
						</div>
						{!parseResult.columnDetection.hasAllRequired && (
							<p className="mt-s-300 text-small text-fb-error">
								{t("columnDetection.missingRequired")}
							</p>
						)}
					</div>

					{/* Errors */}
					{parseResult.errors.length > 0 && (
						<div className="border-fb-error/30 bg-fb-error/10 p-s-300 sm:p-m-400 rounded-lg border">
							<div className="gap-s-200 text-fb-error flex items-center">
								<AlertCircle className="h-4 w-4" />
								<span className="text-small font-medium">
									{t("errorsCount", { count: parseResult.errors.length })}
								</span>
							</div>
							<ul className="mt-s-300 space-y-s-200 text-small text-txt-200">
								{parseResult.errors.map((error, i) => (
									<li key={i}>
										{t("errorLine", {
											line: error.line,
											message: error.message,
										})}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Warnings */}
					{parseResult.warnings.length > 0 && (
						<div className="border-warning/30 bg-warning/10 p-s-300 sm:p-m-400 rounded-lg border">
							<div className="gap-s-200 text-warning flex items-center">
								<AlertTriangle className="h-4 w-4" />
								<span className="text-small font-medium">
									{t("warningsCount", { count: parseResult.warnings.length })}
								</span>
							</div>
							<ul className="mt-s-300 space-y-s-200 text-small text-txt-200">
								{parseResult.warnings.slice(0, 5).map((warning, i) => (
									<li key={i}>
										{t("warningLine", {
											line: warning.line,
											message: warning.message,
										})}
									</li>
								))}
								{parseResult.warnings.length > 5 && (
									<li className="text-txt-300">
										{t("andMore", { count: parseResult.warnings.length - 5 })}
									</li>
								)}
							</ul>
						</div>
					)}

					{/* Date Picker (shared for all trades) */}
					<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
						<div className="flex items-center justify-between">
							<div>
								<h3 className="text-small text-txt-100 font-semibold">
									{t("tradeDate")}
								</h3>
								<p className="text-tiny text-txt-300">{t("tradeDateDesc")}</p>
							</div>
							<DatePicker
								id="ocr-trade-date"
								value={
									editedDate ? new Date(editedDate + "T12:00:00") : undefined
								}
								onChange={(date) =>
									setEditedDate(date ? formatDateKey(date) : "")
								}
								className="w-48"
							/>
						</div>
					</div>

					{/* Summary Stats */}
					<div className="gap-s-200 sm:gap-m-400 grid grid-cols-2 sm:grid-cols-4">
						<div className="bg-bg-200 p-s-300 sm:p-m-400 rounded-lg text-center">
							<p className="text-h3 text-acc-100 font-bold">{totalTrades}</p>
							<p className="text-tiny text-txt-300">{t("tradesDetected")}</p>
						</div>
						<div className="bg-bg-200 p-s-300 sm:p-m-400 rounded-lg text-center">
							<p className="text-h3 text-trade-buy font-bold">
								{totalExecutions}
							</p>
							<p className="text-tiny text-txt-300">{t("totalExecutions")}</p>
						</div>
						<div className="bg-bg-200 p-s-300 sm:p-m-400 rounded-lg text-center">
							<p className="text-h3 text-txt-100 font-bold">
								{parseResult.confidence.toFixed(0)}%
							</p>
							<p className="text-tiny text-txt-300">{t("confidence")}</p>
						</div>
						<div className="bg-bg-200 p-s-300 sm:p-m-400 rounded-lg text-center">
							<div className="gap-s-100 flex items-center justify-center">
								{ocrProvider && ocrProvider !== "tesseract" ? (
									<Sparkles className="text-trade-buy h-4 w-4" />
								) : (
									<Cpu className="text-warning h-4 w-4" />
								)}
								<p className="text-small text-txt-100 font-bold capitalize">
									{ocrProvider ?? t("unknown")}
								</p>
							</div>
							<p className="text-tiny text-txt-300">{t("ocrProvider")}</p>
						</div>
					</div>

					{/* Trades List */}
					{editedTrades.map((trade, tradeIndex) => (
						<div
							key={trade.id}
							className="border-bg-300 bg-bg-200 overflow-hidden rounded-lg border"
						>
							{/* Trade Header */}
							<div className="border-bg-300 p-s-300 sm:p-m-400 flex items-center justify-between border-b">
								<Button
									id={`ocr-trade-toggle-${trade.id}`}
									type="button"
									variant="ghost"
									className="gap-s-300 flex items-center"
									onClick={() => handleToggleTradeExpand(trade.id)}
								>
									{trade.isExpanded ? (
										<ChevronUp className="text-txt-300 h-4 w-4" />
									) : (
										<ChevronDown className="text-txt-300 h-4 w-4" />
									)}
									<span className="text-small text-txt-100 font-semibold">
										{t("tradeNumber", { number: tradeIndex + 1 })}
									</span>
									<span className="bg-bg-100 px-s-200 py-s-100 text-tiny text-txt-200 rounded-sm font-medium">
										{trade.asset}
									</span>
									<span
										className={cn(
											"px-s-200 py-s-100 text-tiny rounded-sm font-medium",
											trade.direction === "long"
												? "bg-trade-buy/20 text-trade-buy"
												: "bg-trade-sell/20 text-trade-sell"
										)}
									>
										{trade.direction.toUpperCase()}
									</span>
									<span className="text-tiny text-txt-300">
										{t("executionsCount", { count: trade.executions.length })}
									</span>
								</Button>
								<Button
									id={`ocr-remove-trade-${trade.id}`}
									variant="ghost"
									size="icon"
									onClick={() => handleRemoveTrade(trade.id)}
									aria-label={tCommon("removeTrade")}
								>
									<Trash2 className="text-fb-error h-4 w-4" />
								</Button>
							</div>

							{trade.isExpanded && (
								<div className="p-s-300 sm:p-m-400">
									{/* Trade Details */}
									<div className="mb-m-400 gap-m-400 grid md:grid-cols-3">
										<div>
											<label
												className="text-tiny text-txt-300"
												htmlFor={`${trade.id}-asset`}
											>
												{tTrade("asset")}
											</label>
											<Input
												id={`${trade.id}-asset`}
												value={trade.asset}
												onChange={(e) =>
													handleUpdateTrade(trade.id, {
														asset: e.target.value.toUpperCase(),
													})
												}
												className="mt-s-100"
											/>
											{trade.originalContractCode !== trade.asset && (
												<p className="mt-s-100 text-tiny text-txt-300">
													{t("originalLabel", {
														code: trade.originalContractCode,
													})}
												</p>
											)}
										</div>

										<div>
											<label
												className="text-tiny text-txt-300"
												htmlFor={`${trade.id}-direction`}
											>
												{tTrade("direction.label")}
											</label>
											<select
												id={`${trade.id}-direction`}
												value={trade.direction}
												onChange={(e) =>
													handleUpdateTrade(trade.id, {
														direction: e.target.value as "long" | "short",
													})
												}
												className="mt-s-100 border-bg-300 bg-bg-100 px-s-300 py-s-200 text-small text-txt-100 w-full rounded-md border"
											>
												<option value="long">{tTrade("direction.long")}</option>
												<option value="short">
													{tTrade("direction.short")}
												</option>
											</select>
										</div>

										<div className="flex items-end">
											<div className="text-tiny text-txt-300">
												<p>
													{t("entriesCount", {
														count: trade.executions.filter(
															(e) => e.type === "entry"
														).length,
														qty: trade.executions
															.filter((e) => e.type === "entry")
															.reduce((s, e) => s + e.quantity, 0),
													})}
												</p>
												<p>
													{t("exitsCount", {
														count: trade.executions.filter(
															(e) => e.type === "exit"
														).length,
														qty: trade.executions
															.filter((e) => e.type === "exit")
															.reduce((s, e) => s + e.quantity, 0),
													})}
												</p>
											</div>
										</div>
									</div>

									{/* Executions Table */}
									<div className="border-bg-300 rounded-sm border">
										<Table className="w-full">
											<TableHeader>
												<TableRow className="border-bg-300 bg-bg-100 border-b">
													<TableHead className="px-m-400 py-s-300 text-tiny text-txt-300 text-left font-medium">
														{tCommon("type")}
													</TableHead>
													<TableHead className="px-m-400 py-s-300 text-tiny text-txt-300 text-left font-medium">
														{tCommon("time")}
													</TableHead>
													<TableHead className="px-m-400 py-s-300 text-tiny text-txt-300 text-right font-medium">
														{tCommon("qty")}
													</TableHead>
													<TableHead className="px-m-400 py-s-300 text-tiny text-txt-300 text-right font-medium">
														{tCommon("price")}
													</TableHead>
													<TableHead className="px-m-400 py-s-300 text-tiny text-txt-300 text-center font-medium">
														{tCommon("actions")}
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{trade.executions.map((ex) => (
													<TableRow
														key={ex.id}
														className="border-bg-300 border-b last:border-0"
													>
														<TableCell className="px-m-400 py-s-300">
															<Select
																value={ex.type}
																onValueChange={(value) =>
																	handleUpdateExecution(trade.id, ex.id, {
																		type: value as "entry" | "exit",
																	})
																}
															>
																<SelectTrigger
																	id={`ocr-execution-type-${ex.id}`}
																	className={cn(
																		"px-s-200 py-s-100 text-tiny rounded-sm font-medium",
																		ex.type === "entry"
																			? "bg-trade-buy/20 text-trade-buy"
																			: "bg-trade-sell/20 text-trade-sell"
																	)}
																>
																	<SelectValue />
																</SelectTrigger>
																<SelectContent>
																	<SelectItem value="entry">
																		{tCommon("entry")}
																	</SelectItem>
																	<SelectItem value="exit">
																		{tCommon("exit")}
																	</SelectItem>
																</SelectContent>
															</Select>
														</TableCell>
														<TableCell className="px-m-400 py-s-300 text-small text-txt-200">
															{ex.time}
														</TableCell>
														<TableCell className="px-m-400 py-s-300">
															<Input
																id={`ocr-execution-quantity-${ex.id}`}
																type="number"
																value={ex.quantity}
																onChange={(e) =>
																	handleUpdateExecution(trade.id, ex.id, {
																		quantity: parseInt(e.target.value, 10) || 0,
																	})
																}
																className="text-small w-20 text-right"
															/>
														</TableCell>
														<TableCell className="px-m-400 py-s-300">
															<Input
																id={`ocr-execution-price-${ex.id}`}
																type="number"
																step="0.001"
																value={ex.price}
																onChange={(e) =>
																	handleUpdateExecution(trade.id, ex.id, {
																		price: parseFloat(e.target.value) || 0,
																	})
																}
																className="text-small w-28 text-right"
															/>
														</TableCell>
														<TableCell className="px-m-400 py-s-300 text-center">
															<Button
																id={`ocr-remove-execution-${trade.id}-${ex.id}`}
																variant="ghost"
																size="icon"
																onClick={() =>
																	handleRemoveExecution(trade.id, ex.id)
																}
																aria-label={tCommon("removeExecution")}
															>
																<Trash2 className="text-fb-error h-4 w-4" />
															</Button>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								</div>
							)}
						</div>
					))}

					{/* No trades message */}
					{editedTrades.length === 0 && (
						<div className="border-bg-300 bg-bg-200 p-l-800 rounded-lg border text-center">
							<p className="text-small text-txt-300">
								{t("noExecutionsFound")}
							</p>
						</div>
					)}

					{/* Raw Text Preview (Collapsed) */}
					<div className="border-bg-300 bg-bg-200 rounded-lg border">
						<Button
							id="ocr-raw-text-toggle"
							type="button"
							variant="ghost"
							className="p-m-400 flex w-full items-center justify-between text-left"
							onClick={() => setRawTextExpanded(!rawTextExpanded)}
						>
							<span className="text-small text-txt-200 font-medium">
								{t("rawText")}
							</span>
							{rawTextExpanded ? (
								<ChevronUp className="text-txt-300 h-4 w-4" />
							) : (
								<ChevronDown className="text-txt-300 h-4 w-4" />
							)}
						</Button>
						{rawTextExpanded && (
							<pre className="border-bg-300 p-s-300 sm:p-m-400 text-tiny text-txt-300 max-h-48 overflow-auto border-t">
								{parseResult.rawText}
							</pre>
						)}
					</div>

					{/* Success Indicator */}
					{totalTrades > 0 && (
						<div className="gap-s-200 border-trade-buy/30 bg-trade-buy/10 p-s-300 sm:p-m-400 text-trade-buy flex items-center rounded-lg border">
							<CheckCircle2 className="h-4 w-4" />
							<span className="text-small font-medium">
								{t("readyToImport", {
									trades: totalTrades,
									executions: totalExecutions,
								})}
							</span>
						</div>
					)}

					{/* Low Confidence Warning */}
					{parseResult.confidence < 70 && (
						<div className="gap-s-200 border-warning/30 bg-warning/10 p-s-300 sm:p-m-400 text-warning flex items-center rounded-lg border">
							<AlertTriangle className="h-4 w-4" />
							<span className="text-small">{t("lowConfidence")}</span>
						</div>
					)}

					{/* Actions */}
					<div className="gap-m-400 flex items-center justify-end">
						<Button
							id="ocr-import-cancel"
							variant="outline"
							onClick={handleClear}
						>
							{tCommon("cancel")}
						</Button>
						<Button
							id="ocr-import-submit"
							onClick={handleImport}
							disabled={isImporting || totalTrades === 0 || !editedDate}
						>
							{isImporting ? (
								<>
									<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
									{tCommon("loading")}
								</>
							) : (
								<>
									<Upload className="mr-s-200 h-4 w-4" />
									{t("importTrades", {
										count: totalTrades,
										suffix: totalTrades !== 1 ? "s" : "",
									})}
								</>
							)}
						</Button>
					</div>
				</div>
			)}

			{/* Importing */}
			{step === "importing" && (
				<div className="border-bg-300 bg-bg-200 p-l-800 rounded-lg border text-center">
					<Loader2 className="text-acc-100 mx-auto h-12 w-12 animate-spin motion-reduce:animate-none" />
					<h3 className="mt-m-400 text-body text-txt-100 font-semibold">
						{t("importingTrades", { count: totalTrades })}
					</h3>
				</div>
			)}

			{/* Help Tip */}
			<p className="text-tiny text-txt-300 text-center">
				{t("imageQualityTip")}
			</p>
		</div>
	)
}
