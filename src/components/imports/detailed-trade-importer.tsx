/**
 * Detailed Trade Importer Component
 * 3-step flow for importing broker statement CSVs:
 * Step 1: Select broker and upload file
 * Step 2: Review detected trades with warnings
 * Step 3: Confirm import
 */

"use client"

import { useState } from "react"
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
import type { BrokerName } from "@/lib/csv-parsers"
import type { ImportPreview } from "@/lib/csv-parsers"
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

	/**
	 * Handle broker selection and CSV upload
	 */
	const handleSelectStep = async () => {
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
						t("errors.cooldownActive", { time: new Date(data.retryAfter * 1000).toLocaleString() })
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
			const message = err instanceof Error ? err.message : t("errors.unknownError")
			setError(message)
			setStep("error")
		} finally {
			setLoading(false)
		}
	}

	/**
	 * Confirm import and commit trades
	 */
	const handleConfirmImport = async () => {
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
				t("tradesImported", { count: data.importedTradesCount, broker: brokerName })
			)

			// Redirect after 2 seconds
			setTimeout(() => {
				router.refresh()
				router.push(`/app/account/${accountId}`)
			}, 2000)
		} catch (err) {
			const message = err instanceof Error ? err.message : t("errors.unknownError")
			setError(message)
			setStep("error")
		} finally {
			setLoading(false)
		}
	}

	// Step 1: Select Broker & Upload
	if (step === "select") {
		return (
			<div className="space-y-6 border border-bg-300 rounded-lg p-6 bg-bg-100">
				<div>
					<h3 className="text-lg font-semibold text-txt-100">
						{t("title")}
					</h3>
					<p className="text-sm text-txt-300 mt-1">
						{t("description")}
					</p>
				</div>

				<div className="space-y-4">
					{/* Broker Selection */}
					<div className="space-y-2">
						<Label id="broker" htmlFor="broker" className="text-txt-100">
							{t("broker")}
						</Label>
						<Select value={brokerName} onValueChange={(v) => setBrokerName(v as BrokerName)}>
							<SelectTrigger id="broker" className="w-full">
								<SelectValue placeholder={t("selectBroker")} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="CLEAR">Clear</SelectItem>
								<SelectItem value="XP">XP</SelectItem>
								<SelectItem value="GENIAL">Genial</SelectItem>
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
							<p className="text-xs text-txt-200">
								{t("selected", { name: csvFile.name, size: (csvFile.size / 1024).toFixed(2) })}
							</p>
						)}
					</div>

					{/* Error Display */}
					{error && (
						<div className="flex gap-2 p-3 rounded bg-red-100 border border-red-300">
							<AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
							<p className="text-sm text-red-700">{error}</p>
						</div>
					)}
				</div>

				<Button
					id="select-step-button"
					onClick={handleSelectStep}
					disabled={!brokerName || !csvFile || loading}
					className="w-full"
				>
					{loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
					{loading ? t("parsingCsv") : tCommon("next")}
				</Button>
			</div>
		)
	}

	// Step 2: Preview Trades
	if (step === "preview" && preview) {
		return (
			<div className="space-y-6 border border-bg-300 rounded-lg p-6 bg-bg-100">
				<div>
					<h3 className="text-lg font-semibold text-txt-100">{t("reviewTitle")}</h3>
					<p className="text-sm text-txt-300 mt-1">
						{preview.brokerName} • {t("executionsSummary", { executions: preview.detectdExecutionCount, trades: preview.detectedTradeCount })}
					</p>
				</div>

				{/* Summary Stats */}
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div className="p-3 rounded bg-bg-200 border border-bg-300">
						<p className="text-xs text-txt-300 mb-1">{t("successfulTrades")}</p>
						<p className="text-xl font-semibold text-txt-100">
							{preview.successfulTrades}
						</p>
					</div>
					<div className="p-3 rounded bg-bg-200 border border-bg-300">
						<p className="text-xs text-txt-300 mb-1">{t("totalGrossPnl")}</p>
						<p
							className={cn(
								"text-xl font-semibold",
								preview.totalGrossPnl >= 0 ? "text-green-600" : "text-red-600"
							)}
						>
							{preview.totalGrossPnl.toFixed(2)}
						</p>
					</div>
					<div className="p-3 rounded bg-bg-200 border border-bg-300">
						<p className="text-xs text-txt-300 mb-1">{t("netPnl")}</p>
						<p
							className={cn(
								"text-xl font-semibold",
								preview.totalNetPnl >= 0 ? "text-green-600" : "text-red-600"
							)}
						>
							{preview.totalNetPnl.toFixed(2)}
						</p>
					</div>
				</div>

				{/* Warnings */}
				{preview.warningTrades > 0 && (
					<div className="p-3 rounded bg-yellow-100 border border-yellow-300">
						<p className="text-sm font-medium text-yellow-900">
							{t("warningText", { count: preview.warningTrades })}
						</p>
					</div>
				)}

				{/* Trade List */}
				<div className="space-y-3">
					<h4 className="text-sm font-medium text-txt-100">{t("trades")}</h4>
					<ScrollArea className="max-h-96"><div className="space-y-2">
						{preview.trades.map((trade, idx) => (
							<div key={idx} className="p-3 rounded border border-bg-300 bg-bg-200">
								<div className="flex justify-between items-start mb-2">
									<div>
										<p className="font-semibold text-txt-100">
											{trade.asset} • {trade.direction.toUpperCase()}
										</p>
										<p className="text-xs text-txt-300">
											{t("entry", { price: trade.entryPrice.toFixed(2) })} • {t("exit", { price: trade.exitPrice ? trade.exitPrice.toFixed(2) : "—" })}
										</p>
									</div>
									<p
										className={cn(
											"font-semibold",
											trade.netPnl && trade.netPnl >= 0
												? "text-green-600"
												: "text-red-600"
										)}
									>
										{trade.netPnl ? trade.netPnl.toFixed(2) : "—"}
									</p>
								</div>
								{trade.warnings.length > 0 && (
									<p className="text-xs text-yellow-700 mt-1">
										{trade.warnings.join("; ")}
									</p>
								)}
							</div>
						))}
					</div></ScrollArea>
				</div>

				{/* Error Display */}
				{error && (
					<div className="flex gap-2 p-3 rounded bg-red-100 border border-red-300">
						<AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
						<p className="text-sm text-red-700">{error}</p>
					</div>
				)}

				<div className="flex gap-2">
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
						{loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
						{loading ? t("importing") : t("confirmImport")}
					</Button>
				</div>
			</div>
		)
	}

	// Step 3: Importing
	if (step === "importing") {
		return (
			<div className="space-y-6 border border-bg-300 rounded-lg p-6 bg-bg-100 text-center">
				<Loader2 className="w-12 h-12 animate-spin text-acc-100 mx-auto" />
				<div>
					<h3 className="text-lg font-semibold text-txt-100">{t("importingTitle")}</h3>
					<p className="text-sm text-txt-300 mt-1">
						{t("encryptingAndStoring", { count: preview?.detectedTradeCount ?? 0 })}
					</p>
				</div>
			</div>
		)
	}

	// Step 4: Success
	if (step === "success") {
		return (
			<div className="space-y-6 border border-green-300 rounded-lg p-6 bg-green-50 text-center">
				<CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
				<div>
					<h3 className="text-lg font-semibold text-green-900">{t("successTitle")}</h3>
					<p className="text-sm text-green-700 mt-1">
						{t("tradesImported", { count: preview?.detectedTradeCount ?? 0, broker: brokerName })}
					</p>
				</div>
				<p className="text-xs text-green-600">{t("redirecting")}</p>
			</div>
		)
	}

	// Step 5: Error
	if (step === "error") {
		return (
			<div className="space-y-6 border border-red-300 rounded-lg p-6 bg-red-50">
				<div className="flex gap-3">
					<AlertCircle className="w-12 h-12 text-red-600 flex-shrink-0" />
					<div>
						<h3 className="text-lg font-semibold text-red-900">{t("failedTitle")}</h3>
						<p className="text-sm text-red-700 mt-1">{error}</p>
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
