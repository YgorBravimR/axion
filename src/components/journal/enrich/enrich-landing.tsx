"use client"

import {
	useState,
	useCallback,
	useRef,
	type ChangeEvent,
	type DragEvent,
} from "react"
import { useRouter } from "@/i18n/routing"
import { useTranslations } from "next-intl"
import { Loader2, Upload, FileText, CheckCircle2, X } from "lucide-react"
import { startDryRun } from "@/app/actions/enrichment"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { parseCsvContent } from "@/lib/csv-parser"
import type { CsvParseResult } from "@/lib/csv-parser"
import { cn } from "@/lib/utils"
import { EnrichResumeBanner } from "./enrich-resume-banner"

interface EnrichLandingProps {
	pendingCount: number
	resumeRunId: string | null
}

export const EnrichLanding = ({
	pendingCount,
	resumeRunId,
}: EnrichLandingProps) => {
	const router = useRouter()
	const t = useTranslations("journal.enrichment")
	const { showToast } = useToast()

	// Date range state
	const today = new Date()
	const sevenDaysAgo = new Date(today)
	sevenDaysAgo.setDate(today.getDate() - 7)

	const toDateString = today.toISOString().split("T")[0]!
	const fromDateString = sevenDaysAgo.toISOString().split("T")[0]!

	const [dateFrom, setDateFrom] = useState(fromDateString)
	const [dateTo, setDateTo] = useState(toDateString)

	// CSV upload state
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [csvFileName, setCsvFileName] = useState<string | null>(null)
	const [csvParseResult, setCsvParseResult] = useState<CsvParseResult | null>(
		null
	)
	const [isCsvParsing, setIsCsvParsing] = useState(false)
	const [isDragging, setIsDragging] = useState(false)

	// Submit state
	const [isPending, setIsPending] = useState(false)

	const handleFileSelect = useCallback(
		async (file: File) => {
			if (!file.name.endsWith(".csv")) {
				showToast("error", "Invalid file format. Please upload a .csv file.")
				return
			}

			setCsvFileName(file.name)
			setIsCsvParsing(true)

			try {
				const tryParseWithEncoding = (encoding: string) =>
					new Promise<string>((resolve, reject) => {
						const reader = new FileReader()
						reader.onload = (e) => resolve(e.target?.result as string)
						reader.onerror = () => reject(new Error("Failed to read file"))
						reader.readAsText(file, encoding)
					})

				// Mirror the encoding-detection from csv-import.tsx: try UTF-8 first,
				// fall back to ISO-8859-1 if the result contains U+FFFD replacement
				// chars (the signal that the source was Latin-1).
				let content = await tryParseWithEncoding("UTF-8")
				if (/[�]/.test(content)) {
					content = await tryParseWithEncoding("ISO-8859-1")
				}

				const result = parseCsvContent(content)
				setCsvParseResult(result)

				if (!result.success && result.trades.length === 0) {
					showToast(
						"error",
						t("landing.uploadError", {
							message: result.errors[0]?.message || "Unknown error",
						})
					)
				}
			} catch {
				showToast("error", "Failed to read CSV file")
				setCsvParseResult(null)
				setCsvFileName(null)
			} finally {
				setIsCsvParsing(false)
			}
		},
		[showToast, t]
	)

	const handleInputChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0]
			if (file) {
				void handleFileSelect(file)
			}
		},
		[handleFileSelect]
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

	const handleClearCsv = useCallback(() => {
		setCsvFileName(null)
		setCsvParseResult(null)
		if (fileInputRef.current) {
			fileInputRef.current.value = ""
		}
	}, [])

	// Handle dry-run submission
	const handleStartDryRun = useCallback(async () => {
		setIsPending(true)

		try {
			const dateFromObj = new Date(dateFrom + "T00:00:00Z")
			const dateToObj = new Date(dateTo + "T23:59:59Z")

			const result = await startDryRun({
				dateFrom: dateFromObj,
				dateTo: dateToObj,
				parsedOperationsJson: csvParseResult
					? JSON.stringify(csvParseResult.profitOperations || [])
					: undefined,
			})

			if (result.status === "success" && result.data) {
				showToast(
					"success",
					t("landing.startedToast", { count: result.data.tradeCount })
				)
				router.push(`/journal/enrich/review/${result.data.runId}`)
			} else {
				showToast("error", result.message || t("landing.startError"))
			}
		} catch (error) {
			showToast(
				"error",
				error instanceof Error ? error.message : t("landing.startError")
			)
		} finally {
			setIsPending(false)
		}
	}, [dateFrom, dateTo, csvParseResult, router, showToast, t])

	const handleCancel = useCallback(() => {
		router.push("/journal")
	}, [router])

	return (
		<div className="space-y-m-600">
			{/* Resume banner */}
			{resumeRunId && <EnrichResumeBanner runId={resumeRunId} />}

			{/* Header */}
			<div>
				<h1 className="text-h2 font-bold">{t("landing.title")}</h1>
				<p className="mt-s-200 text-body text-txt-300">
					{t("landing.description")}
				</p>
			</div>

			{/* Main content */}
			<Card className="space-y-m-600 p-m-600">
				{/* Pending count */}
				<div className="bg-acc-100/10 p-m-500 rounded-lg">
					<p className="text-small text-txt-300">{t("landing.pendingLabel")}</p>
					<p className="mt-s-200 text-h1 text-acc-100 font-bold">
						{pendingCount}
					</p>
				</div>

				{/* Date range */}
				<div>
					<label className="text-small text-txt-100 font-semibold">
						{t("landing.dateRangeLabel")}
					</label>
					<div className="mt-s-300 gap-m-400 grid sm:grid-cols-2">
						<div>
							<label htmlFor="date-from" className="text-tiny text-txt-300">
								{t("landing.dateFrom")}
							</label>
							<Input
								id="date-from"
								type="date"
								value={dateFrom}
								onChange={(e) => setDateFrom(e.target.value)}
								disabled={isPending}
								className="mt-s-200"
							/>
						</div>
						<div>
							<label htmlFor="date-to" className="text-tiny text-txt-300">
								{t("landing.dateTo")}
							</label>
							<Input
								id="date-to"
								type="date"
								value={dateTo}
								onChange={(e) => setDateTo(e.target.value)}
								disabled={isPending}
								className="mt-s-200"
							/>
						</div>
					</div>
				</div>

				{/* CSV upload — same dropzone pattern as src/components/journal/csv-import.tsx */}
				<div>
					<p className="text-small text-txt-100 font-semibold">
						{t("landing.uploadCsvLabel")}
					</p>
					<p className="mt-s-100 text-tiny text-txt-300">
						{t("landing.uploadCsvHint")}
					</p>

					{csvFileName && csvParseResult?.success ? (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 mt-s-300 flex items-center justify-between rounded-lg">
							<div className="gap-s-300 flex items-center">
								<CheckCircle2 className="text-acc-100 h-5 w-5" />
								<span className="text-small text-txt-100 font-medium">
									{csvFileName}
								</span>
								<span className="text-tiny text-txt-300">
									(
									{t("landing.uploadParsed", {
										count: csvParseResult.trades.length,
									})}
									)
								</span>
							</div>
							<Button
								variant="ghost"
								size="icon"
								onClick={handleClearCsv}
								disabled={isPending}
								aria-label="Clear file"
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					) : (
						<label
							htmlFor="csv-upload"
							className={cn(
								"p-m-600 mt-s-300 block cursor-pointer rounded-lg border-2 border-dashed text-center transition-colors",
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
								id="csv-upload"
								type="file"
								accept=".csv"
								onChange={handleInputChange}
								disabled={isCsvParsing || isPending}
								className="hidden"
							/>

							{isCsvParsing ? (
								<>
									<Loader2 className="text-acc-100 mx-auto h-12 w-12 animate-spin motion-reduce:animate-none" />
									<h3 className="mt-m-400 text-body text-txt-100 font-semibold">
										{t("landing.uploadParsing")}
									</h3>
								</>
							) : csvFileName ? (
								<>
									<p className="text-small text-fb-error font-semibold">
										{t("landing.uploadError", {
											message:
												csvParseResult?.errors[0]?.message || "Parse failed",
										})}
									</p>
									<p className="mt-s-100 text-tiny text-txt-300">
										{csvFileName}
									</p>
								</>
							) : (
								<>
									<Upload className="text-txt-300 mx-auto h-12 w-12" />
									<h3 className="mt-m-400 text-body text-txt-100 font-semibold">
										{t("landing.dropHere")}
									</h3>
									<p className="mt-s-200 text-small text-txt-300">
										{t("landing.orClick")}
									</p>
									<div className="mt-m-400 flex justify-center">
										<Button
											type="button"
											variant="default"
											onClick={(e) => {
												e.preventDefault()
												fileInputRef.current?.click()
											}}
											disabled={isCsvParsing || isPending}
										>
											<FileText className="mr-s-200 h-4 w-4" />
											{t("landing.selectFile")}
										</Button>
									</div>
								</>
							)}
						</label>
					)}
				</div>

				{/* Candle status */}
				<div>
					<label className="text-small text-txt-100 font-semibold">
						{t("landing.candleStatusLabel")}
					</label>
					<div className="mt-s-300 bg-bg-200 p-m-400 text-small text-txt-300 rounded-lg">
						{t("landing.candleStatusPlaceholder")}
					</div>
				</div>

				{/* Actions */}
				<div className="gap-m-400 pt-m-400 flex">
					<Button variant="outline" onClick={handleCancel} disabled={isPending}>
						{t("landing.cancel")}
					</Button>
					<Button
						onClick={handleStartDryRun}
						disabled={isPending || pendingCount === 0}
					>
						{isPending && <Loader2 className="mr-s-200 h-4 w-4 animate-spin" />}
						{t("landing.runDryRun")}
					</Button>
				</div>
			</Card>
		</div>
	)
}
