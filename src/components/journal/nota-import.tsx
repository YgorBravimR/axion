"use client"

import {
	useState,
	useRef,
	useCallback,
	type DragEvent,
	type ChangeEvent,
} from "react"
import { useRouter } from "next/navigation"
import {
	Upload,
	FileText,
	X,
	Loader2,
	CheckCircle2,
	AlertTriangle,
	Info,
} from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import {
	parseNotaPdf,
	matchNotaFills,
	enrichTradesFromNota,
} from "@/app/actions/nota-import"
import { NotaMatchCard } from "./nota-match-card"
import type {
	NotaParseResult,
	NotaEnrichmentPreview,
	ConfirmedEnrichment,
} from "@/lib/nota-parser/types"

type Step = "upload" | "review" | "enriching"

export const NotaImport = () => {
	const t = useTranslations("journal.nota")
	const tCommon = useTranslations("common")
	const tOverlay = useTranslations("overlay")
	const locale = useLocale()
	const router = useRouter()
	const { showToast } = useToast()
	const { showLoading, updateLoading, hideLoading } = useLoadingOverlay()
	const fileInputRef = useRef<HTMLInputElement>(null)

	// Step state
	const [step, setStep] = useState<Step>("upload")
	const [isDragging, setIsDragging] = useState(false)
	const [isProcessing, setIsProcessing] = useState(false)

	// File data
	const [fileName, setFileName] = useState<string | null>(null)

	// Parse + Match results
	const [parseResult, setParseResult] = useState<NotaParseResult | null>(null)
	const [preview, setPreview] = useState<NotaEnrichmentPreview | null>(null)

	// Selection state for matches
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const [reEnrichIds, setReEnrichIds] = useState<Set<string>>(new Set())

	// Enriching state
	const [isEnriching, setIsEnriching] = useState(false)

	const handleFileSelect = useCallback(
		async (file: File) => {
			if (!file.name.toLowerCase().endsWith(".pdf")) {
				showToast("error", t("invalidPdfFile"))
				return
			}

			if (file.size > 10 * 1024 * 1024) {
				showToast("error", t("fileTooLarge"))
				return
			}

			setFileName(file.name)
			setIsProcessing(true)
			showLoading({ message: t("parsing") })

			try {
				// Step 1: Parse PDF (hash is computed server-side)
				const formData = new FormData()
				formData.append("file", file)

				const parseResponse = await parseNotaPdf(formData)

				if (parseResponse.status === "error") {
					showToast("error", parseResponse.message)
					setIsProcessing(false)
					hideLoading()
					return
				}

				const parsed = parseResponse.data!
				setParseResult(parsed)

				// Step 2: Match fills to existing trades
				updateLoading({ message: t("matching") })

				const matchResponse = await matchNotaFills(
					parsed.fills,
					parsed.notaDate.toString(),
					parsed.brokerName
				)

				if (matchResponse.status === "error") {
					showToast("error", matchResponse.message)
					setIsProcessing(false)
					hideLoading()
					return
				}

				const matchPreview = matchResponse.data!
				setPreview(matchPreview)

				// Auto-select all "matched" trades
				const autoSelected = new Set(
					matchPreview.matches
						.filter((m) => m.status === "matched")
						.map((m) => m.tradeId)
				)
				setSelectedIds(autoSelected)
				setReEnrichIds(new Set())

				setStep("review")
				setIsProcessing(false)
				hideLoading()
			} catch {
				showToast("error", t("failedToProcess"))
				setIsProcessing(false)
				hideLoading()
			}
		},
		[showToast, showLoading, updateLoading, hideLoading, t]
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

	const handleClear = () => {
		setStep("upload")
		setFileName(null)
		setParseResult(null)
		setPreview(null)
		setSelectedIds(new Set())
		setReEnrichIds(new Set())
		setIsProcessing(false)
		if (fileInputRef.current) {
			fileInputRef.current.value = ""
		}
	}

	const handleToggleSelect = (tradeId: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev)
			if (next.has(tradeId)) {
				next.delete(tradeId)
			} else {
				next.add(tradeId)
			}
			return next
		})
	}

	const handleToggleReEnrich = (tradeId: string) => {
		setReEnrichIds((prev) => {
			const next = new Set(prev)
			if (next.has(tradeId)) {
				next.delete(tradeId)
				// Also deselect
				setSelectedIds((s) => {
					const ns = new Set(s)
					ns.delete(tradeId)
					return ns
				})
			} else {
				next.add(tradeId)
				// Also select
				setSelectedIds((s) => new Set(s).add(tradeId))
			}
			return next
		})
	}

	const handleEnrich = async () => {
		if (!preview || !parseResult || selectedIds.size === 0) return

		setIsEnriching(true)
		showLoading({ message: t("enriching") })

		try {
			// Build confirmed enrichments from selected matches
			const confirmedMatches: ConfirmedEnrichment[] = preview.matches
				.filter((m) => selectedIds.has(m.tradeId))
				.map((m) => ({
					tradeId: m.tradeId,
					entryFills: m.entryFills,
					exitFills: m.exitFills,
					reEnrich: reEnrichIds.has(m.tradeId),
				}))

			const result = await enrichTradesFromNota(
				confirmedMatches,
				parseResult.notaDate.toString(),
				parseResult.brokerName,
				fileName!,
				parseResult.fileHash
			)

			hideLoading()

			if (result.status === "success") {
				const data = result.data!
				showToast(
					"success",
					t("success", {
						count: data.tradesEnriched,
						executions: data.executionsInserted,
					})
				)
				setTimeout(() => router.push("/journal"), 500)
			} else {
				showToast("error", result.message)
			}
		} catch {
			showToast("error", tCommon("unexpectedError"))
		} finally {
			hideLoading()
			setIsEnriching(false)
		}
	}

	const selectedCount = selectedIds.size

	// Count matches by status for the summary
	const matchCounts =
		preview?.matches.reduce(
			(acc, m) => {
				acc[m.status] = (acc[m.status] || 0) + 1
				return acc
			},
			{} as Record<string, number>
		) ?? {}

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
			{/* Step 1: Upload Area */}
			{step === "upload" && (
				<div
					className={cn(
						"p-m-600 sm:p-l-700 lg:p-l-800 rounded-lg border-2 border-dashed text-center transition-colors",
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
						accept=".pdf"
						onChange={handleInputChange}
						className="hidden"
						id="nota-file-input"
					/>

					{isProcessing ? (
						<>
							<Loader2 className="text-acc-100 mx-auto h-12 w-12 animate-spin" />
							<h3 className="mt-m-400 text-body text-txt-100 font-semibold">
								{t("parsing")}
							</h3>
							<p className="mt-s-200 text-small text-txt-300">
								{t("description")}
							</p>
						</>
					) : (
						<>
							<Upload className="text-txt-300 mx-auto h-12 w-12" />
							<h3 className="mt-m-400 text-body text-txt-100 font-semibold">
								{t("dropHere")}
							</h3>
							<p className="mt-s-200 text-small text-txt-300">{t("orClick")}</p>

							<div className="mt-m-500 flex items-center justify-center">
								<Button
									id="nota-import-select-file"
									variant="default"
									onClick={() => fileInputRef.current?.click()}
								>
									<FileText className="mr-2 h-4 w-4" />
									{t("selectFile")}
								</Button>
							</div>
						</>
					)}
				</div>
			)}

			{/* Step 2: Review Matches */}
			{step === "review" && preview && parseResult && (
				<div className="space-y-m-400 sm:space-y-m-500">
					{/* File + Nota Info Header */}
					<div className="bg-bg-200 p-s-300 sm:p-m-400 rounded-lg">
						<div className="flex items-center justify-between">
							<div className="gap-s-300 flex items-center">
								<FileText className="text-txt-300 h-5 w-5" />
								<span className="text-small text-txt-100 font-medium">
									{fileName}
								</span>
							</div>
							<Button
								id="nota-import-clear"
								variant="ghost"
								size="icon"
								onClick={handleClear}
								aria-label={tCommon("clearFile")}
							>
								<X className="h-4 w-4" />
							</Button>
						</div>

						{/* Nota metadata */}
						<div className="mt-s-300 sm:mt-m-400 gap-s-300 sm:gap-m-500 grid grid-cols-2 md:grid-cols-4">
							<div>
								<span className="text-tiny text-txt-300 block">
									{t("notaDate")}
								</span>
								<span className="text-small text-txt-100 font-medium">
									{new Date(parseResult.notaDate).toLocaleDateString(locale)}
								</span>
							</div>
							<div>
								<span className="text-tiny text-txt-300 block">
									{t("broker")}
								</span>
								<span className="text-small text-txt-100 font-medium">
									{parseResult.brokerName}
								</span>
							</div>
							<div>
								<span className="text-tiny text-txt-300 block">
									{t("notaNumber")}
								</span>
								<span className="text-small text-txt-100 font-medium">
									{parseResult.notaNumber}
								</span>
							</div>
							<div>
								<span className="text-tiny text-txt-300 block">
									{t("totalFills", { count: parseResult.fills.length })}
								</span>
								<span className="text-small text-txt-100 font-medium">
									{t("matchSummary", {
										matched: preview.matches.length,
										unmatched: preview.unmatchedFills.length,
									})}
								</span>
							</div>
						</div>
					</div>

					{/* Match summary badges */}
					<div className="gap-s-200 flex flex-wrap">
						{(matchCounts.matched ?? 0) > 0 && (
							<span className="bg-trade-buy/10 text-trade-buy text-tiny gap-s-100 flex items-center rounded-full px-3 py-1 font-medium">
								<CheckCircle2 className="h-3 w-3" />
								{matchCounts.matched} {t("matched")}
							</span>
						)}
						{(matchCounts.already_enriched ?? 0) > 0 && (
							<span className="bg-bg-300/30 text-txt-300 text-tiny gap-s-100 flex items-center rounded-full px-3 py-1 font-medium">
								<Info className="h-3 w-3" />
								{matchCounts.already_enriched} {t("alreadyEnriched")}
							</span>
						)}
						{(matchCounts.quantity_mismatch ?? 0) +
							(matchCounts.price_mismatch ?? 0) >
							0 && (
							<span className="bg-warning/10 text-warning text-tiny gap-s-100 flex items-center rounded-full px-3 py-1 font-medium">
								<AlertTriangle className="h-3 w-3" />
								{(matchCounts.quantity_mismatch ?? 0) +
									(matchCounts.price_mismatch ?? 0)}{" "}
								{t("priceMismatch")}
							</span>
						)}
					</div>

					{/* Match cards */}
					<div className="space-y-s-200">
						{preview.matches.map((match) => (
							<NotaMatchCard
								key={match.tradeId}
								match={match}
								isSelected={selectedIds.has(match.tradeId)}
								reEnrich={reEnrichIds.has(match.tradeId)}
								onToggleSelect={() => handleToggleSelect(match.tradeId)}
								onToggleReEnrich={() => handleToggleReEnrich(match.tradeId)}
							/>
						))}
					</div>

					{/* Unmatched fills warning */}
					{preview.unmatchedFills.length > 0 && (
						<div className="border-warning/30 bg-warning/10 p-s-300 sm:p-m-400 rounded-lg border">
							<div className="gap-s-200 flex items-center">
								<AlertTriangle className="text-warning h-4 w-4 shrink-0" />
								<span className="text-small text-warning font-medium">
									{t("unmatchedFillsWarning", {
										count: preview.unmatchedFills.length,
									})}
								</span>
							</div>
							<div className="mt-s-200 space-y-s-100">
								{preview.unmatchedFills.map((fill, idx) => (
									<div
										key={`unmatched-${idx}`}
										className="text-tiny text-txt-300 gap-s-200 flex items-center"
									>
										<span
											className={
												fill.side === "C"
													? "text-action-buy"
													: "text-action-sell"
											}
										>
											{fill.side === "C" ? t("buy") : t("sell")}
										</span>
										<span className="text-txt-200">{fill.normalizedAsset}</span>
										<span>{fill.quantity}x</span>
										<span>
											{fill.price.toLocaleString(locale, {
												minimumFractionDigits: 2,
											})}
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Unmatched trades info */}
					{preview.unmatchedTrades.length > 0 && (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
							<div className="gap-s-200 flex items-center">
								<Info className="text-txt-300 h-4 w-4 shrink-0" />
								<span className="text-small text-txt-300">
									{t("unmatchedTradesInfo", {
										count: preview.unmatchedTrades.length,
									})}
								</span>
							</div>
						</div>
					)}

					{/* Financial summary */}
					{parseResult.netTotal > 0 && (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
							<h4 className="text-small text-txt-100 font-semibold">
								{t("financialSummary")}
							</h4>
							<div className="mt-s-200 gap-x-m-500 gap-y-s-100 grid grid-cols-2 md:grid-cols-3">
								{parseResult.totalBrokerage > 0 && (
									<div className="flex justify-between">
										<span className="text-tiny text-txt-300">
											{t("brokerage")}
										</span>
										<span className="text-tiny text-txt-200">
											{parseResult.totalBrokerage.toLocaleString(locale, {
												minimumFractionDigits: 2,
											})}
										</span>
									</div>
								)}
								{parseResult.settlementFee > 0 && (
									<div className="flex justify-between">
										<span className="text-tiny text-txt-300">
											{t("settlementFee")}
										</span>
										<span className="text-tiny text-txt-200">
											{parseResult.settlementFee.toLocaleString(locale, {
												minimumFractionDigits: 2,
											})}
										</span>
									</div>
								)}
								{parseResult.registrationFee > 0 && (
									<div className="flex justify-between">
										<span className="text-tiny text-txt-300">
											{t("registrationFee")}
										</span>
										<span className="text-tiny text-txt-200">
											{parseResult.registrationFee.toLocaleString(locale, {
												minimumFractionDigits: 2,
											})}
										</span>
									</div>
								)}
								{parseResult.bmfFees > 0 && (
									<div className="flex justify-between">
										<span className="text-tiny text-txt-300">
											{t("bmfFees")}
										</span>
										<span className="text-tiny text-txt-200">
											{parseResult.bmfFees.toLocaleString(locale, {
												minimumFractionDigits: 2,
											})}
										</span>
									</div>
								)}
								{parseResult.irrf > 0 && (
									<div className="flex justify-between">
										<span className="text-tiny text-txt-300">{t("irrf")}</span>
										<span className="text-tiny text-txt-200">
											{parseResult.irrf.toLocaleString(locale, {
												minimumFractionDigits: 2,
											})}
										</span>
									</div>
								)}
								<div className="border-bg-300 pt-s-100 col-span-full flex justify-between border-t">
									<span className="text-tiny text-txt-100 font-medium">
										{t("netTotal")}
									</span>
									<span
										className={cn("text-tiny font-medium", parseResult.netTotalDebitCredit === "C" ? "text-trade-buy" : "text-trade-sell")}
									>
										{parseResult.netTotal.toLocaleString(locale, {
											minimumFractionDigits: 2,
										})}{" "}
										{parseResult.netTotalDebitCredit === "C" ? "C" : "D"}
									</span>
								</div>
							</div>
						</div>
					)}

					{/* Action buttons */}
					<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 gap-s-300 flex flex-wrap items-center justify-between rounded-lg border">
						<Button
							id="nota-import-cancel"
							variant="outline"
							onClick={handleClear}
						>
							{tCommon("cancel")}
						</Button>

						<div className="gap-m-400 flex items-center">
							{selectedCount > 0 && (
								<span className="text-small text-txt-300">
									{tCommon("tradesSelected", { count: selectedCount })}
								</span>
							)}
							<Button
								id="nota-import-enrich"
								onClick={handleEnrich}
								disabled={isEnriching || selectedCount === 0}
								className="min-w-[180px]"
							>
								{isEnriching ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										{t("enriching")}
									</>
								) : (
									<>
										<CheckCircle2 className="mr-2 h-4 w-4" />
										{t("enrichButton", { count: selectedCount })}
									</>
								)}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Help / Description */}
			{step === "upload" && !isProcessing && (
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
					<h3 className="text-small text-txt-100 font-semibold">
						{t("title")}
					</h3>
					<p className="mt-s-300 text-small text-txt-300">{t("description")}</p>
					<div className="mt-m-400 border-acc-100/30 bg-acc-100/10 p-s-300 rounded-md border">
						<p className="text-small text-acc-100 font-medium">
							{t("sinacorTitle")}
						</p>
						<p className="mt-s-100 text-tiny text-txt-300">
							{t("sinacorDesc")}
						</p>
					</div>
				</div>
			)}
		</div>
	)
}
