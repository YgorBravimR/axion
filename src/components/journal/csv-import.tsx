"use client"

import {
	useState,
	useRef,
	useCallback,
	useMemo,
	type DragEvent,
	type ChangeEvent,
} from "react"
import { useRouter } from "next/navigation"
import {
	Upload,
	FileText,
	Download,
	X,
	Loader2,
	CheckCircle2,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/toast"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import { parseCsvContent, generateCsvTemplate } from "@/lib/csv-parser"
import type { CsvParseResult } from "@/lib/csv-parser"
import {
	validateCsvTrades,
	importCsvTrades,
	type ProcessedCsvTrade,
	type CsvValidationResult,
} from "@/app/actions/csv-import"
import { APP_TIMEZONE } from "@/lib/dates"
import { CsvImportSummary, type FilterStatus } from "./csv-import-summary"
import { CsvTradeCard } from "./csv-trade-card"
import { CsvSlTpGenerator } from "./csv-sl-tp-generator"

export const CsvImport = () => {
	const t = useTranslations("journal.csv")
	const tOverlay = useTranslations("overlay")
	const router = useRouter()
	const { showToast } = useToast()
	const { showLoading, updateLoading, hideLoading } = useLoadingOverlay()
	const fileInputRef = useRef<HTMLInputElement>(null)

	// File state
	const [isDragging, setIsDragging] = useState(false)
	const [fileName, setFileName] = useState<string | null>(null)
	const [parseResult, setParseResult] = useState<CsvParseResult | null>(null)

	// Validation state
	const [validationResult, setValidationResult] =
		useState<CsvValidationResult | null>(null)
	const [processedTrades, setProcessedTrades] = useState<ProcessedCsvTrade[]>(
		[]
	)
	const [isValidating, setIsValidating] = useState(false)

	// UI state
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const [filter, setFilter] = useState<FilterStatus>("all")

	// Replay alert state
	const [showReplayAlert, setShowReplayAlert] = useState(false)
	const [replayTradeCount, setReplayTradeCount] = useState(0)

	// Import state
	const [isImporting, setIsImporting] = useState(false)
	const [importProgress, setImportProgress] = useState(0)

	// Filtered trades based on filter selection
	const filteredTrades = useMemo(() => {
		if (filter === "all") return processedTrades
		return processedTrades.filter((t) => t.status === filter)
	}, [processedTrades, filter])

	// Selectable trades (not skipped)
	const selectableTrades = useMemo(
		() => processedTrades.filter((t) => t.status !== "skipped"),
		[processedTrades]
	)

	const allSelected = useMemo(() => {
		if (selectableTrades.length === 0) return false
		return selectableTrades.every((t) => selectedIds.has(t.id))
	}, [selectableTrades, selectedIds])

	// File handling
	const handleFileSelect = useCallback(
		async (file: File) => {
			if (!file.name.endsWith(".csv")) {
				showToast("error", "Please select a CSV file")
				return
			}

			setFileName(file.name)
			setValidationResult(null)
			setProcessedTrades([])
			setExpandedIds(new Set())
			setSelectedIds(new Set())

			// Try reading with different encodings
			const tryParseWithEncoding = async (encoding: string) => {
				return new Promise<string>((resolve, reject) => {
					const reader = new FileReader()
					reader.onload = (e) => resolve(e.target?.result as string)
					reader.onerror = () => reject(new Error("Failed to read file"))
					reader.readAsText(file, encoding)
				})
			}

			try {
				// Try UTF-8 first
				let content = await tryParseWithEncoding("UTF-8")

				// Check for encoding issues
				const hasEncodingIssues = /[\ufffd]/.test(content)
				if (hasEncodingIssues) {
					content = await tryParseWithEncoding("ISO-8859-1")
				}

				const result = parseCsvContent(content)
				setParseResult(result)

				if (result.trades.length === 0) {
					showToast("error", "No trades found in CSV")
					return
				}

				// Validate trades on server
				setIsValidating(true)
				showLoading({ message: tOverlay("validatingTrades") })
				const validation = await validateCsvTrades(result.trades)

				if (validation.status === "error") {
					showToast("error", validation.message)
					setIsValidating(false)
					hideLoading()
					return
				}

				setValidationResult(validation.data!)

				// Check for replay trades on non-replay accounts
				const replayCount = result.trades.filter((t) => t.isReplayTrade).length
				if (validation.data!.accountType !== "replay" && replayCount > 0) {
					setReplayTradeCount(replayCount)
					setShowReplayAlert(true)
					setIsValidating(false)
					hideLoading()
					return
				}

				// Normal flow: set all trades and auto-select
				setProcessedTrades(validation.data!.trades)
				const validIds = new Set(
					validation
						.data!.trades.filter((t) => t.status !== "skipped")
						.map((t) => t.id)
				)
				setSelectedIds(validIds)

				setIsValidating(false)
				hideLoading()
			} catch {
				hideLoading()
				showToast("error", "Failed to read file")
			}
		},
		[showToast, showLoading, hideLoading, tOverlay]
	)

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

	const handleDownloadTemplate = () => {
		const template = generateCsvTemplate()
		const blob = new Blob([template], { type: "text/csv" })
		const url = URL.createObjectURL(blob)
		const a = document.createElement("a")
		a.href = url
		a.download = "trade-import-template.csv"
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	const handleClear = () => {
		setParseResult(null)
		setValidationResult(null)
		setProcessedTrades([])
		setFileName(null)
		setExpandedIds(new Set())
		setSelectedIds(new Set())
		if (fileInputRef.current) {
			fileInputRef.current.value = ""
		}
	}

	// Replay alert handlers
	const handleAcceptReplayTrades = () => {
		if (!validationResult) return
		setProcessedTrades(validationResult.trades)
		const validIds = new Set(
			validationResult.trades
				.filter((t) => t.status !== "skipped")
				.map((t) => t.id)
		)
		setSelectedIds(validIds)
		setShowReplayAlert(false)
	}

	const handleRejectReplayTrades = () => {
		if (!validationResult) return
		const nonReplayTrades = validationResult.trades.filter(
			(t) => !t.originalData.isReplayTrade
		)
		if (nonReplayTrades.length === 0) {
			showToast("error", t("replayAlert.allReplay"))
			handleClear()
			setShowReplayAlert(false)
			return
		}
		setProcessedTrades(nonReplayTrades)
		const validIds = new Set(
			nonReplayTrades.filter((t) => t.status !== "skipped").map((t) => t.id)
		)
		setSelectedIds(validIds)
		setShowReplayAlert(false)
	}

	// Trade selection
	const handleToggleSelect = (tradeId: string) => {
		setSelectedIds((prev) => {
			const newSet = new Set(prev)
			if (newSet.has(tradeId)) {
				newSet.delete(tradeId)
			} else {
				newSet.add(tradeId)
			}
			return newSet
		})
	}

	const handleSelectAll = (selected: boolean) => {
		if (selected) {
			setSelectedIds(new Set(selectableTrades.map((t) => t.id)))
		} else {
			setSelectedIds(new Set())
		}
	}

	// Trade expansion
	const handleToggleExpand = (tradeId: string) => {
		setExpandedIds((prev) => {
			const newSet = new Set(prev)
			if (newSet.has(tradeId)) {
				newSet.delete(tradeId)
			} else {
				newSet.add(tradeId)
			}
			return newSet
		})
	}

	// Trade editing
	const handleEditTrade = (
		tradeId: string,
		edits: ProcessedCsvTrade["edits"]
	) => {
		setProcessedTrades((prev) =>
			prev.map((t) => (t.id === tradeId ? { ...t, edits } : t))
		)
	}

	// Import
	const handleImport = async () => {
		const selectedTrades = processedTrades.filter((t) => selectedIds.has(t.id))

		if (selectedTrades.length === 0) {
			showToast("error", "No trades selected")
			return
		}

		setIsImporting(true)
		setImportProgress(0)
		showLoading({
			message: tOverlay("importingTrades", { count: selectedTrades.length }),
			progress: 0,
		})

		try {
			// Simulate progress for UX
			const progressInterval = setInterval(() => {
				setImportProgress((prev) => {
					const next = Math.min(prev + 10, 90)
					updateLoading({ progress: next })
					return next
				})
			}, 200)

			const result = await importCsvTrades(selectedTrades)

			clearInterval(progressInterval)
			setImportProgress(100)
			updateLoading({ progress: 100 })

			if (result.status === "success") {
				showToast("success", result.message)
				setTimeout(() => router.push("/journal"), 500)
			} else {
				showToast("error", result.message)
			}
		} catch {
			showToast("error", "An unexpected error occurred")
		} finally {
			hideLoading()
			setIsImporting(false)
		}
	}

	const selectedCount = selectedIds.size

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
			{/* Upload Area */}
			{!validationResult && (
				<div
					className={`p-m-600 sm:p-l-700 lg:p-l-800 rounded-lg border-2 border-dashed text-center transition-colors ${
						isDragging
							? "border-acc-100 bg-acc-100/10"
							: "border-bg-300 hover:border-txt-300"
					}`}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
				>
					<input
						ref={fileInputRef}
						type="file"
						accept=".csv"
						onChange={handleInputChange}
						className="hidden"
						id="csv-file-input"
					/>

					{isValidating ? (
						<>
							<Loader2 className="text-acc-100 mx-auto h-12 w-12 animate-spin" />
							<h3 className="mt-m-400 text-body text-txt-100 font-semibold">
								Validating trades...
							</h3>
							<p className="mt-s-200 text-small text-txt-300">
								Looking up assets and calculating P&L
							</p>
						</>
					) : (
						<>
							<Upload className="text-txt-300 mx-auto h-12 w-12" />
							<h3 className="mt-m-400 text-body text-txt-100 font-semibold">
								{t("dropHere")}
							</h3>
							<p className="mt-s-200 text-small text-txt-300">{t("orClick")}</p>

							<div className="mt-m-400 sm:mt-m-500 gap-s-300 sm:gap-m-400 flex flex-wrap items-center justify-center">
								<Button
									id="csv-import-select-file"
									variant="default"
									onClick={() => fileInputRef.current?.click()}
								>
									<FileText className="mr-2 h-4 w-4" />
									{t("selectFile")}
								</Button>
								<Button
									id="csv-import-download-template"
									variant="outline"
									onClick={handleDownloadTemplate}
								>
									<Download className="mr-2 h-4 w-4" />
									{t("downloadTemplate")}
								</Button>
							</div>
						</>
					)}
				</div>
			)}

			{/* Validation Results */}
			{validationResult && (
				<div className="space-y-m-400 sm:space-y-m-500">
					{/* File Info */}
					<div className="bg-bg-200 p-s-300 sm:p-m-400 flex items-center justify-between rounded-lg">
						<div className="gap-s-300 flex items-center">
							<FileText className="text-txt-300 h-5 w-5" />
							<span className="text-small text-txt-100 font-medium">
								{fileName}
							</span>
							<span className="text-tiny text-txt-300">
								({validationResult.summary.total} trades)
							</span>
						</div>
						<Button
							id="csv-import-clear-file"
							variant="ghost"
							size="icon"
							onClick={handleClear}
							aria-label="Clear file"
						>
							<X className="h-4 w-4" />
						</Button>
					</div>

					{/* Summary */}
					<CsvImportSummary
						trades={processedTrades}
						filter={filter}
						onFilterChange={setFilter}
						selectedCount={selectedCount}
						selectableCount={selectableTrades.length}
						onSelectAll={handleSelectAll}
						allSelected={allSelected}
					/>

					{/* SL/TP Generator */}
					<CsvSlTpGenerator
						processedTrades={processedTrades}
						onApply={setProcessedTrades}
					/>

					{/* Trade Cards */}
					<div className="space-y-s-200">
						{filteredTrades.map((trade) => (
							<CsvTradeCard
								key={trade.id}
								trade={trade}
								isExpanded={expandedIds.has(trade.id)}
								isSelected={selectedIds.has(trade.id)}
								onToggleExpand={() => handleToggleExpand(trade.id)}
								onToggleSelect={() => handleToggleSelect(trade.id)}
								onEdit={(edits) => handleEditTrade(trade.id, edits)}
								strategies={validationResult.strategies}
								timeframes={validationResult.timeframes}
								tags={validationResult.tags}
							/>
						))}
					</div>

					{/* Actions */}
					<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 gap-s-300 flex flex-wrap items-center justify-between rounded-lg border">
						<Button
							id="csv-import-cancel"
							variant="outline"
							onClick={handleClear}
						>
							Cancel
						</Button>

						<div className="gap-m-400 flex items-center">
							{selectedCount > 0 && (
								<span className="text-small text-txt-300">
									{selectedCount} trades selected
								</span>
							)}
							<Button
								id="csv-import-submit"
								onClick={handleImport}
								disabled={isImporting || selectedCount === 0}
								className="min-w-[160px]"
							>
								{isImporting ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Importing...
									</>
								) : (
									<>
										<CheckCircle2 className="mr-2 h-4 w-4" />
										Import {selectedCount} Trades
									</>
								)}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Help Section */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<h3 className="text-small text-txt-100 font-semibold">
					{t("formatGuide")}
				</h3>

				{/* ProfitChart Support */}
				<div className="mt-s-300 border-acc-100/30 bg-acc-100/10 p-s-300 rounded-md border">
					<p className="text-small text-acc-100 font-medium">
						✓ ProfitChart Export Supported
					</p>
					<p className="mt-s-100 text-tiny text-txt-300">
						Exports from ProfitChart are automatically detected and imported.
						Just export your trades and upload the file directly. Assets like
						WING26 are automatically normalized to WIN.
					</p>
				</div>

				<p className="mt-m-400 text-small text-txt-300">
					{t("requiredColumns")}
				</p>
				<ul className="mt-s-300 gap-s-200 text-small text-txt-200 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
					<li>
						<code className="bg-bg-100 px-s-100 text-tiny rounded">asset</code>
					</li>
					<li>
						<code className="bg-bg-100 px-s-100 text-tiny rounded">
							direction
						</code>
					</li>
					<li>
						<code className="bg-bg-100 px-s-100 text-tiny rounded">
							entry_date
						</code>
					</li>
					<li>
						<code className="bg-bg-100 px-s-100 text-tiny rounded">
							entry_price
						</code>
					</li>
					<li>
						<code className="bg-bg-100 px-s-100 text-tiny rounded">
							position_size
						</code>
					</li>
				</ul>
				<p className="mt-m-400 text-small text-txt-300">
					{t("optionalColumns")}
				</p>
			</div>

			{/* Replay Trades Alert Dialog */}
			<AlertDialog open={showReplayAlert} onOpenChange={setShowReplayAlert}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("replayAlert.title")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("replayAlert.description", { count: replayTradeCount })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{validationResult && (
						<div className="border-bg-300 bg-bg-100 p-s-300 max-h-48 overflow-y-auto rounded-md border">
							<ul className="space-y-s-100 text-small text-txt-200">
								{validationResult.trades
									.filter((t) => t.originalData.isReplayTrade)
									.map((trade) => (
										<li key={trade.id} className="gap-s-200 flex items-center">
											<span className="bg-warn-100/20 px-s-100 text-tiny text-warn-100 rounded font-medium">
												[R]
											</span>
											<span className="font-medium">
												{trade.originalData.asset}
											</span>
											<span className="text-txt-300">
												{trade.originalData.direction === "long"
													? "Long"
													: "Short"}
											</span>
											<span className="text-txt-300">
												{trade.originalData.entryDate
													? new Date(
															trade.originalData.entryDate
														).toLocaleDateString(undefined, {
															timeZone: APP_TIMEZONE,
														})
													: ""}
											</span>
										</li>
									))}
							</ul>
						</div>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel
							id="csv-replay-alert-reject"
							onClick={handleRejectReplayTrades}
						>
							{t("replayAlert.reject")}
						</AlertDialogCancel>
						<AlertDialogAction
							id="csv-replay-alert-accept"
							onClick={handleAcceptReplayTrades}
						>
							{t("replayAlert.accept")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
