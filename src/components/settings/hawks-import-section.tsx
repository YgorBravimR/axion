"use client"

import { useState, useTransition, useRef, useCallback } from "react"
import { useTranslations } from "next-intl"
import {
	Database,
	Upload,
	CheckCircle2,
	Loader2,
	RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FeatureStamp } from "@/components/ui/feature-stamp"
import { HelpText } from "@/components/ui/help-text"
import { useToast } from "@/components/ui/toast"
import { importHawksRenkoSizes } from "@/app/actions/hawks-renko"
import {
	validateCandleImport,
	commitCandleImport,
} from "@/app/actions/candle-import"
import type { CandleValidationResult } from "@/app/actions/candle-import.types"
import { regenerateRenkoBricks } from "@/app/actions/renko-pipeline"
import type { RegenerateRenkoResult } from "@/app/actions/renko-pipeline.types"

// ─── Shared utility ───────────────────────────────────────────────────────────

const readFileAsText = async (file: File): Promise<string> => {
	const tryRead = (encoding: string) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = (e) => resolve(e.target?.result as string)
			reader.onerror = () => reject(new Error("Failed to read file"))
			reader.readAsText(file, encoding)
		})

	const text = await tryRead("UTF-8")
	// ProfitChart exports are often Windows-1252 — fall back when UTF-8 has replacement chars
	return /[�]/.test(text) ? tryRead("ISO-8859-1") : text
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

interface DropZoneProps {
	label: string
	fileName: string | null
	disabled?: boolean
	onFile: (_file: File) => void
}

const DropZone = ({
	label,
	fileName,
	disabled = false,
	onFile,
}: DropZoneProps) => {
	const [dragOver, setDragOver] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			setDragOver(false)
			if (disabled) {
				return
			}
			const file = e.dataTransfer.files[0]
			if (file) {
				onFile(file)
			}
		},
		[disabled, onFile]
	)

	return (
		<div
			className={`border-bg-300 gap-s-200 p-m-400 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed transition-colors ${
				dragOver ? "border-bg-400 bg-bg-300" : "hover:border-bg-400"
			} ${disabled ? "pointer-events-none opacity-50" : ""}`}
			onDragOver={(e) => {
				e.preventDefault()
				setDragOver(true)
			}}
			onDragLeave={() => setDragOver(false)}
			onDrop={handleDrop}
			onClick={() => fileInputRef.current?.click()}
			role="button"
			tabIndex={disabled ? -1 : 0}
			aria-label={label}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					fileInputRef.current?.click()
				}
			}}
		>
			<Upload className="text-txt-300 h-6 w-6" aria-hidden="true" />
			<p className="text-small text-txt-300 text-center">{fileName ?? label}</p>
			<input
				ref={fileInputRef}
				type="file"
				accept=".csv"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0]
					if (file) {
						onFile(file)
					}
				}}
			/>
		</div>
	)
}

// ─── Renko Sizes card ─────────────────────────────────────────────────────────

const RenkoSizesCard = () => {
	const t = useTranslations("hawks.settings.import.sizes")
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [fileName, setFileName] = useState<string | null>(null)
	const [csvText, setCsvText] = useState<string | null>(null)
	const [imported, setImported] = useState<number | null>(null)

	const handleFile = useCallback(
		async (file: File) => {
			if (!file.name.endsWith(".csv")) {
				showToast("error", t("invalidFile"))
				return
			}
			setFileName(file.name)
			setImported(null)
			setCsvText(await readFileAsText(file))
		},
		[showToast, t]
	)

	const handleImport = useCallback(() => {
		if (!csvText) {
			return
		}
		startTransition(async () => {
			const result = await importHawksRenkoSizes(csvText)
			if (result.success) {
				setImported(result.imported)
				showToast("success", t("success", { count: result.imported }))
			} else {
				showToast("error", result.error ?? t("errorFallback"))
			}
		})
	}, [csvText, showToast, t])

	return (
		<div className="border-bg-300 bg-bg-200 space-y-m-400 p-s-300 sm:p-m-400 rounded-lg border">
			<div className="gap-s-300 flex items-start">
				<FeatureStamp icon={Database} />
				<div>
					<h3 className="text-body text-txt-100 font-semibold">{t("title")}</h3>
					<HelpText id="hawks-sizes-desc" className="mt-s-100">
						{t("description")}
					</HelpText>
				</div>
			</div>

			<DropZone
				label={t("dropHint")}
				fileName={fileName}
				disabled={isPending}
				onFile={(f) => void handleFile(f)}
			/>

			<div className="flex items-center justify-between">
				<div>
					{imported !== null && (
						<span className="text-fb-success gap-s-200 text-small flex items-center">
							<CheckCircle2 className="h-4 w-4" aria-hidden="true" />
							{t("success", { count: imported })}
						</span>
					)}
				</div>
				<Button
					id="hawks-import-sizes-button"
					onClick={handleImport}
					disabled={!csvText || isPending}
					size="sm"
				>
					{isPending && (
						<Loader2
							className="mr-s-200 h-3 w-3 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
					)}
					{isPending ? t("importing") : t("button")}
				</Button>
			</div>
		</div>
	)
}

// ─── Renko Candle card ────────────────────────────────────────────────────────

type CandlePhase = "idle" | "ready" | "validated"

const RenkoCandleCard = () => {
	const t = useTranslations("hawks.settings.import.candles")
	const tCommon = useTranslations("common")
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [phase, setPhase] = useState<CandlePhase>("idle")
	const [fileName, setFileName] = useState<string | null>(null)
	const [csvText, setCsvText] = useState<string | null>(null)
	const [assetSymbol, setAssetSymbol] = useState("WIN")
	const [timeframeCode, setTimeframeCode] = useState("5m")
	const [validation, setValidation] = useState<CandleValidationResult | null>(
		null
	)
	const [imported, setImported] = useState<number | null>(null)

	const handleFile = useCallback(
		async (file: File) => {
			if (!file.name.endsWith(".csv")) {
				showToast("error", t("invalidFile"))
				return
			}
			setFileName(file.name)
			setValidation(null)
			setImported(null)
			setPhase("idle")
			setCsvText(await readFileAsText(file))
			setPhase("ready")
		},
		[showToast, t]
	)

	const handleValidate = useCallback(() => {
		if (!csvText) {
			return
		}
		const fd = new FormData()
		fd.append("csv", new Blob([csvText], { type: "text/csv" }), "data.csv")
		fd.append("assetSymbol", assetSymbol)
		fd.append("timeframeCode", timeframeCode)
		startTransition(async () => {
			const result = await validateCandleImport(fd)
			if (result.status === "success" && result.data) {
				setValidation(result.data)
				setPhase("validated")
			} else {
				showToast("error", result.message ?? t("errorFallback"))
			}
		})
	}, [csvText, assetSymbol, timeframeCode, showToast, t])

	const handleCommit = useCallback(() => {
		if (!validation || !csvText) {
			return
		}
		const fd = new FormData()
		fd.append("csv", new Blob([csvText], { type: "text/csv" }), "data.csv")
		fd.append("assetId", validation.assetId)
		fd.append("timeframeId", validation.timeframeId)
		startTransition(async () => {
			const result = await commitCandleImport(fd)
			if (result.status === "success" && result.data) {
				setImported(result.data.totalRows)
				showToast("success", t("success", { count: result.data.totalRows }))
				setPhase("idle")
				setCsvText(null)
				setFileName(null)
				setValidation(null)
			} else {
				showToast("error", result.message ?? t("errorFallback"))
			}
		})
	}, [validation, showToast, t, csvText])

	const handleReset = useCallback(() => {
		setPhase("idle")
		setCsvText(null)
		setFileName(null)
		setValidation(null)
	}, [])

	const dateFrom = validation?.dateFrom
		? new Date(validation.dateFrom).toLocaleDateString()
		: null
	const dateTo = validation?.dateTo
		? new Date(validation.dateTo).toLocaleDateString()
		: null

	return (
		<div className="border-bg-300 bg-bg-200 space-y-m-400 p-s-300 sm:p-m-400 rounded-lg border">
			<div className="gap-s-300 flex items-start">
				<FeatureStamp icon={Database} />
				<div>
					<h3 className="text-body text-txt-100 font-semibold">{t("title")}</h3>
					<HelpText id="hawks-candle-desc" className="mt-s-100">
						{t("description")}
					</HelpText>
				</div>
			</div>

			{/* Asset + Timeframe inputs */}
			<div className="gap-m-400 grid grid-cols-2">
				<div className="space-y-s-200">
					<Label id="candle-import-asset-label" htmlFor="candle-import-asset">
						{t("assetLabel")}
					</Label>
					<Input
						id="candle-import-asset"
						value={assetSymbol}
						onChange={(e) => setAssetSymbol(e.target.value.toUpperCase())}
						placeholder={t("assetPlaceholder")}
						disabled={phase === "validated" || isPending}
					/>
				</div>
				<div className="space-y-s-200">
					<Label
						id="candle-import-timeframe-label"
						htmlFor="candle-import-timeframe"
					>
						{t("timeframeLabel")}
					</Label>
					<Input
						id="candle-import-timeframe"
						value={timeframeCode}
						onChange={(e) => setTimeframeCode(e.target.value.toLowerCase())}
						placeholder={t("timeframePlaceholder")}
						disabled={phase === "validated" || isPending}
					/>
				</div>
			</div>

			{/* Drop zone — hidden once validated (file already committed) */}
			{phase !== "validated" && (
				<DropZone
					label={t("dropHint")}
					fileName={fileName}
					disabled={isPending}
					onFile={(f) => void handleFile(f)}
				/>
			)}

			{/* Validation preview */}
			{phase === "validated" && validation && (
				<div className="border-bg-300 bg-bg-100 space-y-s-200 p-m-400 rounded-md border">
					<div className="gap-s-300 flex flex-wrap items-center">
						<span className="text-body text-txt-100 font-medium">
							{t("rowCount", { count: validation.rowCount })}
						</span>
						{dateFrom && dateTo && (
							<span className="text-small text-txt-200">
								{dateFrom} – {dateTo}
							</span>
						)}
					</div>
					<div className="gap-s-200 flex flex-wrap">
						<span className="text-small text-txt-200">
							{t("indicators", {
								count: validation.registeredIndicatorCount,
							})}
						</span>
						{validation.skippedIndicatorCount > 0 && (
							<span className="text-small text-txt-300">
								· {t("skipped", { count: validation.skippedIndicatorCount })}
							</span>
						)}
					</div>
				</div>
			)}

			{/* Success */}
			{imported !== null && (
				<span className="text-fb-success gap-s-200 text-small flex items-center">
					<CheckCircle2 className="h-4 w-4" aria-hidden="true" />
					{t("success", { count: imported })}
				</span>
			)}

			{/* Actions */}
			<div className="flex justify-end">
				{phase === "ready" && (
					<Button
						id="hawks-candle-validate-button"
						onClick={handleValidate}
						disabled={isPending}
						size="sm"
					>
						{isPending && (
							<Loader2
								className="mr-s-200 h-3 w-3 animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
						)}
						{isPending ? t("validating") : t("validateButton")}
					</Button>
				)}
				{phase === "validated" && (
					<div className="gap-s-200 flex">
						<Button
							id="hawks-candle-cancel-button"
							variant="outline"
							size="sm"
							onClick={handleReset}
							disabled={isPending}
						>
							{tCommon("cancel")}
						</Button>
						<Button
							id="hawks-candle-commit-button"
							onClick={handleCommit}
							disabled={isPending}
							size="sm"
						>
							{isPending && (
								<Loader2
									className="mr-s-200 h-3 w-3 animate-spin motion-reduce:animate-none"
									aria-hidden="true"
								/>
							)}
							{isPending ? t("importing") : t("importButton")}
						</Button>
					</div>
				)}
			</div>
		</div>
	)
}

// ─── Regenerate Renko card ────────────────────────────────────────────────────

const RegenerateRenkoCard = () => {
	const t = useTranslations("hawks.settings.import.regenerate")
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [assetSymbol, setAssetSymbol] = useState("WIN")
	const [result, setResult] = useState<RegenerateRenkoResult | null>(null)

	const handleRegenerate = useCallback(() => {
		const fd = new FormData()
		fd.append("assetSymbol", assetSymbol)
		startTransition(async () => {
			setResult(null)
			const res = await regenerateRenkoBricks(fd)
			if (res.status === "success" && res.data) {
				setResult(res.data)
				showToast("success", res.message)
			} else {
				showToast("error", res.message ?? t("errorFallback"))
			}
		})
	}, [assetSymbol, showToast, t])

	const totalWarnings = result
		? result.perTimeframe.reduce((acc, tf) => acc + tf.warnings.length, 0)
		: 0

	return (
		<div
			id="hawks-renko-regenerate-card"
			className="border-bg-300 bg-bg-200 space-y-m-400 p-s-300 sm:p-m-400 rounded-lg border"
		>
			<div className="gap-s-300 flex items-start">
				<FeatureStamp icon={RefreshCw} />
				<div>
					<h3 className="text-body text-txt-100 font-semibold">{t("title")}</h3>
					<HelpText id="hawks-regenerate-desc" className="mt-s-100">
						{t("description")}
					</HelpText>
				</div>
			</div>

			<div className="space-y-s-200 max-w-xs">
				<Label
					id="renko-regenerate-asset-label"
					htmlFor="renko-regenerate-asset"
				>
					{t("assetLabel")}
				</Label>
				<Input
					id="renko-regenerate-asset"
					value={assetSymbol}
					onChange={(e) => setAssetSymbol(e.target.value.toUpperCase())}
					placeholder={t("assetPlaceholder")}
					disabled={isPending}
				/>
			</div>

			{result && (
				<div className="border-bg-300 bg-bg-100 space-y-s-200 p-m-400 rounded-md border">
					<div className="text-body text-txt-100 font-medium">
						{t("summary", {
							barCount: result.rawBarsLoaded,
							weekCount: result.weeksCovered,
						})}
					</div>
					<ul className="space-y-s-100">
						{result.perTimeframe.map((tf) => (
							<li
								key={tf.code}
								className="text-small text-txt-200 gap-s-200 flex items-center"
							>
								<CheckCircle2
									className="text-fb-success h-4 w-4"
									aria-hidden="true"
								/>
								{t("perTimeframe", {
									code: tf.code,
									count: tf.bricksGenerated,
								})}
							</li>
						))}
					</ul>
					{totalWarnings > 0 && (
						<div className="text-small text-txt-300">
							{t("warnings", { count: totalWarnings })}
						</div>
					)}
				</div>
			)}

			<div className="flex justify-end">
				<Button
					id="hawks-renko-regenerate-button"
					onClick={handleRegenerate}
					disabled={isPending || assetSymbol.length === 0}
					size="sm"
				>
					{isPending && (
						<Loader2
							className="mr-s-200 h-3 w-3 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
					)}
					{isPending ? t("running") : t("button")}
				</Button>
			</div>
		</div>
	)
}

// ─── Section ──────────────────────────────────────────────────────────────────

const HawksImportSection = () => {
	const t = useTranslations("hawks.settings.import")

	return (
		<div className="space-y-m-400">
			<div>
				<h2 className="text-body text-txt-100 font-semibold">
					{t("sectionTitle")}
				</h2>
				<p className="text-small text-txt-300 mt-s-100">
					{t("sectionDescription")}
				</p>
			</div>
			<RenkoSizesCard />
			<RenkoCandleCard />
			<RegenerateRenkoCard />
		</div>
	)
}

export { HawksImportSection }
