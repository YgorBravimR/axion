/**
 * Detailed Trade Importer Component
 * 3-step flow for importing broker statement CSVs:
 * Step 1: Select broker and upload file
 * Step 2: Review detected trades with warnings
 * Step 3: Confirm import
 */

"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import type { BrokerName, ImportPreview } from "@/lib/csv-parsers"
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Step = "select" | "preview" | "importing" | "success" | "error"

interface DetailedTradeImporterProps {
	accountId: string
}

export const DetailedTradeImporter = ({
	accountId,
}: DetailedTradeImporterProps) => {
	const router = useRouter()
	const { showToast } = useToast()
	const t = useTranslations("imports")
	const tCommon = useTranslations("common")

	const [step, setStep] = useState<Step>("select")
	const [brokerName, setBrokerName] = useState<BrokerName | "">("")
	const [csvFile, setCsvFile] = useState<File | null>(null)
	const [preview, setPreview] = useState<ImportPreview | null>(null)
	const [importId, setImportId] = useState<string>("")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string>("")
	const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Clear any pending redirect timer on unmount
	useEffect(() => {
		return () => {
			if (redirectTimerRef.current) {
				clearTimeout(redirectTimerRef.current)
			}
		}
	}, [])

	/**
	 * Handle broker selection and CSV upload
	 */
	const handleSelectStep = useCallback(async () => {
		if (!brokerName || !csvFile) {
			setError(t("errors.selectBrokerAndFile"))
			return
		}

		setLoading(true)
		setError("")

		try {
			// Read CSV file
			const csvContent = await csvFile.text()

			// Send to API for preview
			const response = await fetch("/api/imports/detailed-trades", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					accountId,
					brokerName,
					csvContent,
				}),
			})

			const data = await response.json()

			if (!response.ok) {
				if (response.status === 429) {
					setError(
						t("errors.cooldownActive", {
							time: new Date(data.retryAfter * 1000).toLocaleString(),
						})
					)
				} else {
					setError(data.error || t("errors.failedToParse"))
				}
				setStep("error")
				return
			}

			// Show preview
			setPreview(data.preview)
			setImportId(data.preview.importId)
			setStep("preview")
		} catch (err) {
			const message =
				err instanceof Error ? err.message : t("errors.unknownError")
			setError(message)
			setStep("error")
		} finally {
			setLoading(false)
		}
	}, [accountId, brokerName, csvFile, t])

	/**
	 * Confirm import and commit trades
	 */
	const handleConfirmImport = useCallback(async () => {
		if (!importId) {
			setError(t("errors.missingImportId"))
			return
		}

		setLoading(true)
		setError("")
		setStep("importing")

		try {
			const response = await fetch("/api/imports/detailed-trades/confirm", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ importId, accountId }),
			})

			const data = await response.json()

			if (!response.ok) {
				setError(data.error || t("errors.failedToImport"))
				setStep("error")
				return
			}

			setStep("success")
			showToast(
				"success",
				t("tradesImported", {
					count: data.importedTradesCount,
					broker: brokerName,
				})
			)

			// Redirect after 2 seconds
			redirectTimerRef.current = setTimeout(() => {
				router.refresh()
				router.push(`/app/account/${accountId}`)
			}, 2000)
		} catch (err) {
			const message =
				err instanceof Error ? err.message : t("errors.unknownError")
			setError(message)
			setStep("error")
		} finally {
			setLoading(false)
		}
	}, [accountId, importId, brokerName, preview, router, showToast, t])

	// Step 1: Select Broker & Upload
	if (step === "select") {
		return (
			<div
				aria-live="polite"
				className="border-bg-300 p-m-600 bg-bg-100 space-y-6 rounded-lg border"
			>
				<div>
					<h3 className="text-h3 text-txt-100 font-semibold">{t("title")}</h3>
					<p className="text-small text-txt-300 mt-s-100">{t("description")}</p>
				</div>

				<div className="space-y-4">
					{/* Broker Selection */}
					<div className="space-y-2">
						<Label id="broker" htmlFor="broker" className="text-txt-100">
							{t("broker")}
						</Label>
						<Select
							value={brokerName}
							onValueChange={(v) => setBrokerName(v as BrokerName)}
						>
							<SelectTrigger id="broker" className="w-full">
								<SelectValue placeholder={t("selectBroker")} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="CLEAR">{t("brokers.clear")}</SelectItem>
								<SelectItem value="XP">{t("brokers.xp")}</SelectItem>
								<SelectItem value="GENIAL">{t("brokers.genial")}</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* File Upload */}
					<div className="space-y-2">
						<Label id="csv-file" htmlFor="csv-file" className="text-txt-100">
							{t("csvFile")}
						</Label>
						<Input
							id="csv-file"
							type="file"
							accept=".csv"
							onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
							className="cursor-pointer"
						/>
						{csvFile && (
							<p className="text-tiny text-txt-200">
								{t("selected", {
									name: csvFile.name,
									size: (csvFile.size / 1024).toFixed(2),
								})}
							</p>
						)}
					</div>

					{/* Error Display */}
					{error && (
						<div
							role="alert"
							aria-live="assertive"
							className="gap-s-200 p-s-300 bg-fb-error/10 border-fb-error/30 flex rounded-sm border"
						>
							<AlertCircle className="text-fb-error h-5 w-5 shrink-0" />
							<p className="text-small text-fb-error">{error}</p>
						</div>
					)}
				</div>

				<Button
					id="select-step-button"
					onClick={handleSelectStep}
					disabled={!brokerName || !csvFile || loading}
					className="w-full"
				>
					{loading && (
						<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
					)}
					{loading ? t("parsingCsv") : tCommon("next")}
				</Button>
			</div>
		)
	}

	// Step 2: Preview Trades
	if (step === "preview" && preview) {
		return (
			<div
				aria-live="polite"
				className="border-bg-300 p-m-600 bg-bg-100 space-y-6 rounded-lg border"
			>
				<div>
					<h3 className="text-h3 text-txt-100 font-semibold">
						{t("reviewTitle")}
					</h3>
					<p className="text-small text-txt-300 mt-s-100">
						{preview.brokerName} •{" "}
						{t("executionsSummary", {
							executions: preview.detectdExecutionCount,
							trades: preview.detectedTradeCount,
						})}
					</p>
				</div>

				{/* Summary Stats */}
				<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-3">
					<div className="p-s-300 bg-bg-200 border-bg-300 rounded-sm border">
						<p className="text-tiny text-txt-300 mb-s-100">
							{t("successfulTrades")}
						</p>
						<p className="text-h2 text-txt-100 font-semibold">
							{preview.successfulTrades}
						</p>
					</div>
					<div className="p-s-300 bg-bg-200 border-bg-300 rounded-sm border">
						<p className="text-tiny text-txt-300 mb-s-100">
							{t("totalGrossPnl")}
						</p>
						<p
							className={cn(
								"text-h2 font-semibold",
								preview.totalGrossPnl >= 0 ? "text-fb-success" : "text-fb-error"
							)}
						>
							{preview.totalGrossPnl.toFixed(2)}
						</p>
					</div>
					<div className="p-s-300 bg-bg-200 border-bg-300 rounded-sm border">
						<p className="text-tiny text-txt-300 mb-s-100">{t("netPnl")}</p>
						<p
							className={cn(
								"text-h2 font-semibold",
								preview.totalNetPnl >= 0 ? "text-fb-success" : "text-fb-error"
							)}
						>
							{preview.totalNetPnl.toFixed(2)}
						</p>
					</div>
				</div>

				{/* Warnings */}
				{preview.warningTrades > 0 && (
					<div className="p-s-300 bg-warning/10 border-warning/30 rounded-sm border">
						<p className="text-small text-warning font-medium">
							{t("warningText", { count: preview.warningTrades })}
						</p>
					</div>
				)}

				{/* Trade List */}
				<div className="space-y-3">
					<h4 className="text-small text-txt-100 font-medium">{t("trades")}</h4>
					<ScrollArea className="max-h-96">
						<div className="space-y-2">
							{preview.trades.map((trade, idx) => (
								<div
									key={`${trade.asset}-${trade.direction}-${trade.entryPrice}-${idx}`}
									className="p-s-300 border-bg-300 bg-bg-200 rounded-sm border"
								>
									<div className="mb-s-200 flex items-start justify-between">
										<div>
											<p className="text-txt-100 font-semibold">
												{trade.asset} • {trade.direction.toUpperCase()}
											</p>
											<p className="text-tiny text-txt-300">
												{t("entry", { price: trade.entryPrice.toFixed(2) })} •{" "}
												{t("exit", {
													price: trade.exitPrice
														? trade.exitPrice.toFixed(2)
														: "—",
												})}
											</p>
										</div>
										<p
											className={cn(
												"font-semibold",
												trade.netPnl && trade.netPnl >= 0
													? "text-fb-success"
													: "text-fb-error"
											)}
										>
											{trade.netPnl ? trade.netPnl.toFixed(2) : "—"}
										</p>
									</div>
									{trade.warnings.length > 0 && (
										<p className="text-tiny text-warning mt-s-100">
											{trade.warnings.join("; ")}
										</p>
									)}
								</div>
							))}
						</div>
					</ScrollArea>
				</div>

				{/* Error Display */}
				{error && (
					<div
						role="alert"
						aria-live="assertive"
						className="gap-s-200 p-s-300 bg-fb-error/10 border-fb-error/30 flex rounded-sm border"
					>
						<AlertCircle className="text-fb-error h-5 w-5 shrink-0" />
						<p className="text-small text-fb-error">{error}</p>
					</div>
				)}

				<div className="gap-s-200 flex">
					<Button
						id="preview-back-button"
						variant="outline"
						onClick={() => setStep("select")}
						className="flex-1"
					>
						{tCommon("back")}
					</Button>
					<Button
						id="preview-confirm-button"
						onClick={handleConfirmImport}
						disabled={loading}
						className="flex-1"
					>
						{loading && (
							<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
						)}
						{loading ? t("importing") : t("confirmImport")}
					</Button>
				</div>
			</div>
		)
	}

	// Step 3: Importing
	if (step === "importing") {
		return (
			<div
				aria-live="polite"
				className="border-bg-300 p-m-600 bg-bg-100 space-y-6 rounded-lg border text-center"
			>
				<Loader2 className="text-acc-100 mx-auto h-12 w-12 animate-spin motion-reduce:animate-none" />
				<div>
					<h3 className="text-h3 text-txt-100 font-semibold">
						{t("importingTitle")}
					</h3>
					<p className="text-small text-txt-300 mt-s-100">
						{t("encryptingAndStoring", {
							count: preview?.detectedTradeCount ?? 0,
						})}
					</p>
				</div>
			</div>
		)
	}

	// Step 4: Success
	if (step === "success") {
		return (
			<div className="border-fb-success/30 p-m-600 bg-fb-success/10 space-y-6 rounded-lg border text-center">
				<CheckCircle2 className="text-fb-success mx-auto h-12 w-12" />
				<div>
					<h3 className="text-h3 text-txt-100 font-semibold">
						{t("successTitle")}
					</h3>
					<p className="text-small text-txt-200 mt-s-100">
						{t("tradesImported", {
							count: preview?.detectedTradeCount ?? 0,
							broker: brokerName,
						})}
					</p>
				</div>
				<p className="text-tiny text-fb-success">{t("redirecting")}</p>
			</div>
		)
	}

	// Step 5: Error
	if (step === "error") {
		return (
			<div
				role="alert"
				aria-live="assertive"
				className="border-fb-error/30 p-m-600 bg-fb-error/10 space-y-6 rounded-lg border"
			>
				<div className="gap-s-300 flex">
					<AlertCircle className="text-fb-error h-12 w-12 shrink-0" />
					<div>
						<h3 className="text-h3 text-txt-100 font-semibold">
							{t("failedTitle")}
						</h3>
						<p className="text-small text-fb-error mt-s-100">{error}</p>
					</div>
				</div>
				<Button
					id="error-retry-button"
					onClick={() => {
						setStep("select")
						setError("")
						setCsvFile(null)
					}}
					className="w-full"
				>
					{t("tryAgain")}
				</Button>
			</div>
		)
	}

	return null
}
