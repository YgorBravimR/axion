"use client"

import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from "react"
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
import { useToast } from "@/components/ui/toast"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
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
		const checkVision = async () => {
			const result = await checkVisionAvailability()
			const isAvailable = result.data?.available ?? false
			setVisionAvailable(isAvailable)
		}
		checkVision()
	}, [])

	// ==========================================
	// Handlers
	// ==========================================

	const handleFileSelect = useCallback(async (file: File) => {
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
						const provider = (result.data as OcrParseResult & { provider?: string }).provider ?? "ai"
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
	}, [showToast, visionAvailable, showLoading, hideLoading, tOverlay])

	const handleDrop = useCallback(
		(e: DragEvent) => {
			e.preventDefault()
			setIsDragging(false)
			const file = e.dataTransfer.files[0]
			if (file) handleFileSelect(file)
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
			if (file) handleFileSelect(file)
		},
		[handleFileSelect]
	)

	const handleClear = () => {
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
	}

	const handleRemoveTrade = (tradeId: string) => {
		setEditedTrades((prev) => prev.filter((t) => t.id !== tradeId))
	}

	const handleToggleTradeExpand = (tradeId: string) => {
		setEditedTrades((prev) =>
			prev.map((t) => (t.id === tradeId ? { ...t, isExpanded: !t.isExpanded } : t))
		)
	}

	const handleUpdateTrade = (tradeId: string, updates: Partial<EditableTrade>) => {
		setEditedTrades((prev) =>
			prev.map((t) => (t.id === tradeId ? { ...t, ...updates } : t))
		)
	}

	const handleRemoveExecution = (tradeId: string, executionId: string) => {
		setEditedTrades((prev) =>
			prev.map((t) =>
				t.id === tradeId
					? { ...t, executions: t.executions.filter((ex) => ex.id !== executionId) }
					: t
			)
		)
	}

	const handleUpdateExecution = (
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
	}

	const handleImport = async () => {
		const validTrades = editedTrades.filter((t) => t.executions.length > 0 && t.asset)

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
			const importInputs: OcrImportInput[] = validTrades.map((trade) => {
				const executions = trade.executions.map((ex) => {
					const [hours, minutes, seconds] = ex.time.split(":").map(Number)
					const executionDate = new Date(baseDate)
					executionDate.setHours(hours, minutes, seconds, 0)

					return {
						executionType: ex.type,
						executionDate,
						price: ex.price,
						quantity: ex.quantity,
					}
				})

				const firstExecution = executions[0]
				const lastExit = [...executions].reverse().find((e) => e.executionType === "exit")

				return {
					asset: trade.asset,
					originalContractCode: trade.originalContractCode,
					direction: trade.direction,
					entryDate: firstExecution.executionDate,
					exitDate: lastExit?.executionDate,
					executions,
				}
			})

			const result = await bulkCreateTradesFromOcr(importInputs)

			if (result.status === "success") {
				showToast("success", result.message)
				router.push("/journal")
			} else {
				showToast("error", result.message)
				setStep("review")
			}
		} catch (error) {
			showToast("error", tCommon("unexpectedError"))
			setStep("review")
		} finally {
			hideLoading()
			setIsImporting(false)
		}
	}

	// ==========================================
	// Computed Values
	// ==========================================

	const totalTrades = editedTrades.filter((t) => t.executions.length > 0).length
	const totalExecutions = editedTrades.reduce((sum, t) => sum + t.executions.length, 0)

	// ==========================================
	// Render
	// ==========================================

	return (
		<div className="space-y-m-600">
			{/* Requirements Section */}
			<div className="rounded-lg border border-bg-300 bg-bg-200">
				<button
					type="button"
					className="flex w-full items-center justify-between p-m-400 text-left"
					onClick={() => setRequirementsExpanded(!requirementsExpanded)}
				>
					<div className="flex items-center gap-s-200">
						<Info className="h-4 w-4 text-acc-100" />
						<span className="text-small font-medium text-txt-100">
							{t("requirements.title")}
						</span>
					</div>
					{requirementsExpanded ? (
						<ChevronUp className="h-4 w-4 text-txt-300" />
					) : (
						<ChevronDown className="h-4 w-4 text-txt-300" />
					)}
				</button>

				{requirementsExpanded && (
					<div className="border-t border-bg-300 p-s-300 sm:p-m-400">
						<p className="text-small text-txt-300">{t("requirements.description")}</p>

						<div className="mt-m-400 grid gap-m-400 md:grid-cols-2">
							<div>
								<h4 className="text-tiny font-medium text-txt-200">
									{t("requirements.requiredColumns")}
								</h4>
								<ul className="mt-s-200 space-y-s-100 text-small text-txt-300">
									<li className="flex items-center gap-s-200">
										<span className="text-trade-buy">✓</span> {t("requirements.columns.ativo")}
									</li>
									<li className="flex items-center gap-s-200">
										<span className="text-trade-buy">✓</span> {t("requirements.columns.abertura")}
									</li>
									<li className="flex items-center gap-s-200">
										<span className="text-trade-buy">✓</span> {t("requirements.columns.qtd")}
									</li>
									<li className="flex items-center gap-s-200">
										<span className="text-trade-buy">✓</span> {t("requirements.columns.precoCompra")}
									</li>
									<li className="flex items-center gap-s-200">
										<span className="text-trade-buy">✓</span> {t("requirements.columns.precoVenda")}
									</li>
								</ul>
							</div>

							<div>
								<h4 className="text-tiny font-medium text-txt-200">
									{t("requirements.settings")}
								</h4>
								<ul className="mt-s-200 space-y-s-100 text-small text-txt-300">
									<li>• {t("requirements.settingsItems.headers")}</li>
									<li>• {t("requirements.settingsItems.expand")}</li>
									<li>• {t("requirements.settingsItems.contrast")}</li>
								</ul>
							</div>
						</div>

						<p className="mt-m-400 text-tiny text-txt-400">
							💡 {t("requirements.tip")}
						</p>
					</div>
				)}
			</div>

			{/* Upload Area */}
			{step === "upload" && (
				<div
					className={cn(
						"rounded-lg border-2 border-dashed p-m-500 sm:p-l-700 lg:p-l-800 text-center transition-colors",
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

					<ImageIcon className="mx-auto h-12 w-12 text-txt-300" />
					<h3 className="mt-m-400 text-body font-semibold text-txt-100">
						{t("dropImage")}
					</h3>
					<p className="mt-s-200 text-small text-txt-300">{t("orClick")}</p>

					{/* OCR Engine Indicator */}
					<div className="mt-m-400 flex items-center justify-center gap-s-200">
						{visionAvailable === null ? (
							<span className="text-tiny text-txt-400">{t("checkingEngine")}</span>
						) : visionAvailable ? (
							<span className="flex items-center gap-s-200 rounded-full bg-trade-buy/20 px-s-300 py-s-100 text-tiny font-medium text-trade-buy">
								<Sparkles className="h-3 w-3" />
								{t("visionEngine")}
							</span>
						) : (
							<span className="flex items-center gap-s-200 rounded-full bg-warning/20 px-s-300 py-s-100 text-tiny font-medium text-warning">
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
							<Upload className="mr-2 h-4 w-4" />
							{t("selectImage")}
						</Button>
					</div>
				</div>
			)}

			{/* Processing */}
			{step === "processing" && progress && (
				<div className="rounded-lg border border-bg-300 bg-bg-200 p-l-800 text-center">
					<Loader2 className="mx-auto h-12 w-12 animate-spin text-acc-100" />
					<h3 className="mt-m-400 text-body font-semibold text-txt-100">
						{t("processing")}
					</h3>
					<p className="mt-s-200 text-small text-txt-300">{progress.message}</p>

					<div className="mx-auto mt-m-400 h-2 w-64 overflow-hidden rounded-full bg-bg-300">
						<div
							className="h-full bg-acc-100 transition-all duration-300"
							style={{ width: `${progress.progress}%` }}
						/>
					</div>
					<p className="mt-s-200 text-tiny text-txt-400">{progress.progress}%</p>
				</div>
			)}

			{/* Review */}
			{step === "review" && parseResult && (
				<div className="space-y-m-500">
					{/* Image Preview */}
					<div className="flex items-center justify-between rounded-lg bg-bg-200 p-s-300 sm:p-m-400">
						<div className="flex items-center gap-s-300">
							<FileText className="h-5 w-5 text-txt-300" />
							<span className="text-small font-medium text-txt-100">{fileName}</span>
						</div>
						<Button id="ocr-import-clear" variant="ghost" size="icon" onClick={handleClear} aria-label={tCommon("clear")}>
							<X className="h-4 w-4" />
						</Button>
					</div>

					{/* Column Detection Status */}
					<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400">
						<h3 className="text-small font-semibold text-txt-100">
							{t("columnDetection.title")}
						</h3>
						<div className="mt-s-300 flex flex-wrap gap-s-300">
							{REQUIRED_COLUMNS.map((col) => {
								const detected = parseResult.columnDetection.columns.some(
									(c) => c.type === col
								)
								return (
									<span
										key={col}
										className={cn(
											"rounded-full px-s-300 py-s-100 text-tiny font-medium",
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
						<div className="rounded-lg border border-fb-error/30 bg-fb-error/10 p-s-300 sm:p-m-400">
							<div className="flex items-center gap-s-200 text-fb-error">
								<AlertCircle className="h-4 w-4" />
								<span className="text-small font-medium">
									{t("errorsCount", { count: parseResult.errors.length })}
								</span>
							</div>
							<ul className="mt-s-300 space-y-s-200 text-small text-txt-200">
								{parseResult.errors.map((error, i) => (
									<li key={i}>
										{t("errorLine", { line: error.line, message: error.message })}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Warnings */}
					{parseResult.warnings.length > 0 && (
						<div className="rounded-lg border border-warning/30 bg-warning/10 p-s-300 sm:p-m-400">
							<div className="flex items-center gap-s-200 text-warning">
								<AlertTriangle className="h-4 w-4" />
								<span className="text-small font-medium">
									{t("warningsCount", { count: parseResult.warnings.length })}
								</span>
							</div>
							<ul className="mt-s-300 space-y-s-200 text-small text-txt-200">
								{parseResult.warnings.slice(0, 5).map((warning, i) => (
									<li key={i}>
										{t("warningLine", { line: warning.line, message: warning.message })}
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
					<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400">
						<div className="flex items-center justify-between">
							<div>
								<h3 className="text-small font-semibold text-txt-100">
									{t("tradeDate")}
								</h3>
								<p className="text-tiny text-txt-300">
									{t("tradeDateDesc")}
								</p>
							</div>
							<DatePicker
								id="ocr-trade-date"
								value={editedDate ? new Date(editedDate + "T12:00:00") : undefined}
								onChange={(date) => setEditedDate(date ? formatDateKey(date) : "")}
								className="w-48"
							/>
						</div>
					</div>

					{/* Summary Stats */}
					<div className="grid grid-cols-2 gap-s-200 sm:gap-m-400 sm:grid-cols-4">
						<div className="rounded-lg bg-bg-200 p-s-300 sm:p-m-400 text-center">
							<p className="text-h3 font-bold text-acc-100">{totalTrades}</p>
							<p className="text-tiny text-txt-300">{t("tradesDetected")}</p>
						</div>
						<div className="rounded-lg bg-bg-200 p-s-300 sm:p-m-400 text-center">
							<p className="text-h3 font-bold text-trade-buy">{totalExecutions}</p>
							<p className="text-tiny text-txt-300">{t("totalExecutions")}</p>
						</div>
						<div className="rounded-lg bg-bg-200 p-s-300 sm:p-m-400 text-center">
							<p className="text-h3 font-bold text-txt-100">
								{parseResult.confidence.toFixed(0)}%
							</p>
							<p className="text-tiny text-txt-300">{t("confidence")}</p>
						</div>
						<div className="rounded-lg bg-bg-200 p-s-300 sm:p-m-400 text-center">
							<div className="flex items-center justify-center gap-s-100">
								{ocrProvider && ocrProvider !== "tesseract" ? (
									<Sparkles className="h-4 w-4 text-trade-buy" />
								) : (
									<Cpu className="h-4 w-4 text-warning" />
								)}
								<p className="text-small font-bold text-txt-100 capitalize">
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
							className="rounded-lg border border-bg-300 bg-bg-200 overflow-hidden"
						>
							{/* Trade Header */}
							<div className="flex items-center justify-between border-b border-bg-300 p-s-300 sm:p-m-400">
								<button
									type="button"
									className="flex items-center gap-s-300"
									onClick={() => handleToggleTradeExpand(trade.id)}
								>
									{trade.isExpanded ? (
										<ChevronUp className="h-4 w-4 text-txt-300" />
									) : (
										<ChevronDown className="h-4 w-4 text-txt-300" />
									)}
									<span className="text-small font-semibold text-txt-100">
										{t("tradeNumber", { number: tradeIndex + 1 })}
									</span>
									<span className="rounded bg-bg-100 px-s-200 py-s-100 text-tiny font-medium text-txt-200">
										{trade.asset}
									</span>
									<span
										className={cn(
											"rounded px-s-200 py-s-100 text-tiny font-medium",
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
								</button>
								<Button
									id={`ocr-remove-trade-${trade.id}`}
									variant="ghost"
									size="icon"
									onClick={() => handleRemoveTrade(trade.id)}
									aria-label={tCommon("removeTrade")}
								>
									<Trash2 className="h-4 w-4 text-fb-error" />
								</Button>
							</div>

							{trade.isExpanded && (
								<div className="p-s-300 sm:p-m-400">
									{/* Trade Details */}
									<div className="mb-m-400 grid gap-m-400 md:grid-cols-3">
										<div>
											<label className="text-tiny text-txt-300" htmlFor={`${trade.id}-asset`}>
												{tTrade("asset")}
											</label>
											<Input
												id={`${trade.id}-asset`}
												value={trade.asset}
												onChange={(e) =>
													handleUpdateTrade(trade.id, { asset: e.target.value.toUpperCase() })
												}
												className="mt-s-100"
											/>
											{trade.originalContractCode !== trade.asset && (
												<p className="mt-s-100 text-tiny text-txt-400">
													{t("originalLabel", { code: trade.originalContractCode })}
												</p>
											)}
										</div>

										<div>
											<label className="text-tiny text-txt-300" htmlFor={`${trade.id}-direction`}>
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
												className="mt-s-100 w-full rounded-md border border-bg-300 bg-bg-100 px-s-300 py-s-200 text-small text-txt-100"
											>
												<option value="long">{tTrade("direction.long")}</option>
												<option value="short">{tTrade("direction.short")}</option>
											</select>
										</div>

										<div className="flex items-end">
											<div className="text-tiny text-txt-300">
												<p>
													{t("entriesCount", { count: trade.executions.filter((e) => e.type === "entry").length, qty: trade.executions.filter((e) => e.type === "entry").reduce((s, e) => s + e.quantity, 0) })}
												</p>
												<p>
													{t("exitsCount", { count: trade.executions.filter((e) => e.type === "exit").length, qty: trade.executions.filter((e) => e.type === "exit").reduce((s, e) => s + e.quantity, 0) })}
												</p>
											</div>
										</div>
									</div>

									{/* Executions Table */}
									<div className="overflow-x-auto rounded border border-bg-300">
										<table className="w-full">
											<thead>
												<tr className="border-b border-bg-300 bg-bg-100">
													<th className="px-m-400 py-s-300 text-left text-tiny font-medium text-txt-300">
														{tCommon("type")}
													</th>
													<th className="px-m-400 py-s-300 text-left text-tiny font-medium text-txt-300">
														{tCommon("time")}
													</th>
													<th className="px-m-400 py-s-300 text-right text-tiny font-medium text-txt-300">
														{tCommon("qty")}
													</th>
													<th className="px-m-400 py-s-300 text-right text-tiny font-medium text-txt-300">
														{tCommon("price")}
													</th>
													<th className="px-m-400 py-s-300 text-center text-tiny font-medium text-txt-300">
														{tCommon("actions")}
													</th>
												</tr>
											</thead>
											<tbody>
												{trade.executions.map((ex) => (
													<tr
														key={ex.id}
														className="border-b border-bg-300 last:border-0"
													>
														<td className="px-m-400 py-s-300">
															<select
																value={ex.type}
																onChange={(e) =>
																	handleUpdateExecution(trade.id, ex.id, {
																		type: e.target.value as "entry" | "exit",
																	})
																}
																className={cn(
																	"rounded px-s-200 py-s-100 text-tiny font-medium",
																	ex.type === "entry"
																		? "bg-trade-buy/20 text-trade-buy"
																		: "bg-trade-sell/20 text-trade-sell"
																)}
															>
																<option value="entry">{tCommon("entry")}</option>
																<option value="exit">{tCommon("exit")}</option>
															</select>
														</td>
														<td className="px-m-400 py-s-300 text-small text-txt-200">
															{ex.time}
														</td>
														<td className="px-m-400 py-s-300">
															<Input
																id={`ocr-execution-quantity-${ex.id}`}
																type="number"
																value={ex.quantity}
																onChange={(e) =>
																	handleUpdateExecution(trade.id, ex.id, {
																		quantity: parseInt(e.target.value, 10) || 0,
																	})
																}
																className="w-20 text-right text-small"
															/>
														</td>
														<td className="px-m-400 py-s-300">
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
																className="w-28 text-right text-small"
															/>
														</td>
														<td className="px-m-400 py-s-300 text-center">
															<Button
																id={`ocr-remove-execution-${trade.id}-${ex.id}`}
																variant="ghost"
																size="icon"
																onClick={() => handleRemoveExecution(trade.id, ex.id)}
																aria-label={tCommon("removeExecution")}
															>
																<Trash2 className="h-4 w-4 text-fb-error" />
															</Button>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							)}
						</div>
					))}

					{/* No trades message */}
					{editedTrades.length === 0 && (
						<div className="rounded-lg border border-bg-300 bg-bg-200 p-l-800 text-center">
							<p className="text-small text-txt-300">{t("noExecutionsFound")}</p>
						</div>
					)}

					{/* Raw Text Preview (Collapsed) */}
					<div className="rounded-lg border border-bg-300 bg-bg-200">
						<button
							type="button"
							className="flex w-full items-center justify-between p-m-400 text-left"
							onClick={() => setRawTextExpanded(!rawTextExpanded)}
						>
							<span className="text-small font-medium text-txt-200">
								{t("rawText")}
							</span>
							{rawTextExpanded ? (
								<ChevronUp className="h-4 w-4 text-txt-300" />
							) : (
								<ChevronDown className="h-4 w-4 text-txt-300" />
							)}
						</button>
						{rawTextExpanded && (
							<pre className="max-h-48 overflow-auto border-t border-bg-300 p-s-300 sm:p-m-400 text-tiny text-txt-400">
								{parseResult.rawText}
							</pre>
						)}
					</div>

					{/* Success Indicator */}
					{totalTrades > 0 && (
						<div className="flex items-center gap-s-200 rounded-lg border border-trade-buy/30 bg-trade-buy/10 p-s-300 sm:p-m-400 text-trade-buy">
							<CheckCircle2 className="h-4 w-4" />
							<span className="text-small font-medium">
								{t("readyToImport", { trades: totalTrades, executions: totalExecutions })}
							</span>
						</div>
					)}

					{/* Low Confidence Warning */}
					{parseResult.confidence < 70 && (
						<div className="flex items-center gap-s-200 rounded-lg border border-warning/30 bg-warning/10 p-s-300 sm:p-m-400 text-warning">
							<AlertTriangle className="h-4 w-4" />
							<span className="text-small">{t("lowConfidence")}</span>
						</div>
					)}

					{/* Actions */}
					<div className="flex items-center justify-end gap-m-400">
						<Button id="ocr-import-cancel" variant="outline" onClick={handleClear}>
							{tCommon("cancel")}
						</Button>
						<Button
							id="ocr-import-submit"
							onClick={handleImport}
							disabled={isImporting || totalTrades === 0 || !editedDate}
						>
							{isImporting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{tCommon("loading")}
								</>
							) : (
								<>
									<Upload className="mr-2 h-4 w-4" />
									{t("importTrades", { count: totalTrades, suffix: totalTrades !== 1 ? "s" : "" })}
								</>
							)}
						</Button>
					</div>
				</div>
			)}

			{/* Importing */}
			{step === "importing" && (
				<div className="rounded-lg border border-bg-300 bg-bg-200 p-l-800 text-center">
					<Loader2 className="mx-auto h-12 w-12 animate-spin text-acc-100" />
					<h3 className="mt-m-400 text-body font-semibold text-txt-100">
						{t("importingTrades", { count: totalTrades })}
					</h3>
				</div>
			)}

			{/* Help Tip */}
			<p className="text-center text-tiny text-txt-400">
				{t("imageQualityTip")}
			</p>
		</div>
	)
}
