"use client"

import { useState, useRef, useCallback } from "react"
import { FileText, Upload, Layers, FileStack, ImageIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { TradeForm } from "./trade-form"
import { ScaledTradeForm } from "./scaled-trade-form"
import { CsvImport } from "./csv-import"
import { OcrImport } from "./ocr-import"
import { NotaImport } from "./nota-import"
import { TradeModeSelector, type TradeMode } from "./trade-mode-selector"
import type {
	SharedTradeFormState,
	TradeFormRef,
} from "@/lib/validations/trade"
import type { Strategy, Tag, Timeframe } from "@/db/schema"
import type { AssetWithType } from "@/app/actions/assets"

interface NewTradeTabsProps {
	strategies: Strategy[]
	tags: Tag[]
	assets?: AssetWithType[]
	timeframes?: Timeframe[]
	redirectTo?: string
	defaultAssetId?: string
	defaultDate?: string
}

type TabValue = "single" | "csv" | "nota" | "screenshot"

export const NewTradeTabs = ({
	strategies,
	tags,
	assets = [],
	timeframes = [],
	redirectTo,
	defaultAssetId,
	defaultDate,
}: NewTradeTabsProps) => {
	const t = useTranslations("journal")
	const tTrade = useTranslations("trade")
	const { canAccess, isAdmin } = useFeatureAccess()
	const [activeTab, setActiveTab] = useState<TabValue>("single")
	const [tradeMode, setTradeMode] = useState<TradeMode>("simple")
	const [sharedState, setSharedState] = useState<
		SharedTradeFormState | undefined
	>()
	const tradeFormRef = useRef<TradeFormRef>(null)
	const scaledFormRef = useRef<TradeFormRef>(null)

	// Capture state from current form before switching modes
	const handleModeChange = useCallback(
		(newMode: TradeMode) => {
			if (newMode === tradeMode) return
			const currentRef = tradeMode === "simple" ? tradeFormRef : scaledFormRef
			const captured = currentRef.current?.getSharedState()
			setSharedState(captured)
			setTradeMode(newMode)
		},
		[tradeMode]
	)

	return (
		<div>
			{/* Tab Buttons */}
			<div className="mb-m-400 sm:mb-m-500 lg:mb-m-600 gap-s-100 sm:gap-s-200 border-bg-300 flex overflow-x-auto border-b">
				<button
					type="button"
					onClick={() => setActiveTab("single")}
					className={cn(
						"gap-s-200 px-s-300 sm:px-m-400 py-s-300 text-small flex shrink-0 items-center border-b-2 font-medium transition-colors",
						activeTab === "single"
							? "border-acc-100 text-acc-100"
							: "text-txt-300 hover:text-txt-100 border-transparent"
					)}
					aria-selected={activeTab === "single"}
					role="tab"
				>
					{tradeMode === "simple" ? (
						<FileText className="h-4 w-4" />
					) : (
						<Layers className="h-4 w-4" />
					)}
					{tradeMode === "simple" ? t("singleEntry") : tTrade("mode.scaled")}
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("csv")}
					className={cn(
						"gap-s-200 px-s-300 sm:px-m-400 py-s-300 text-small flex shrink-0 items-center border-b-2 font-medium transition-colors",
						activeTab === "csv"
							? "border-acc-100 text-acc-100"
							: "text-txt-300 hover:text-txt-100 border-transparent"
					)}
					aria-selected={activeTab === "csv"}
					role="tab"
				>
					<Upload className="h-4 w-4" />
					{t("csvImport")}
				</button>
				{canAccess("journal:nota-tab") && (
					<button
						type="button"
						onClick={() => setActiveTab("nota")}
						className={cn(
							"gap-s-200 px-s-300 sm:px-m-400 py-s-300 text-small flex shrink-0 items-center border-b-2 font-medium transition-colors",
							activeTab === "nota"
								? "border-acc-100 text-acc-100"
								: "text-txt-300 hover:text-txt-100 border-transparent"
						)}
						aria-selected={activeTab === "nota"}
						role="tab"
					>
						<FileStack className="h-4 w-4" />
						{t("nota.title")}
					</button>
				)}
				{canAccess("journal:ocr-tab") && (
					<button
						type="button"
						onClick={() => setActiveTab("screenshot")}
						className={cn(
							"gap-s-200 px-s-300 sm:px-m-400 py-s-300 text-small flex shrink-0 items-center border-b-2 font-medium transition-colors",
							activeTab === "screenshot"
								? "border-acc-100 text-acc-100"
								: "text-txt-300 hover:text-txt-100 border-transparent"
						)}
						aria-selected={activeTab === "screenshot"}
						role="tab"
					>
						<ImageIcon className="h-4 w-4" />
						{t("ocr.title")}
					</button>
				)}
			</div>

			{/* Tab Content */}
			<div role="tabpanel">
				{/* Trade form stays mounted (hidden when other tabs active) to preserve state */}
				<div className={activeTab !== "single" ? "hidden" : ""}>
					<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
						{/* Trade Mode Selector — admin only */}
						{isAdmin && (
							<TradeModeSelector value={tradeMode} onChange={handleModeChange} />
						)}

						{/* Form based on mode */}
						{tradeMode === "simple" ? (
							<TradeForm
								ref={tradeFormRef}
								strategies={strategies}
								tags={tags}
								assets={assets}
								timeframes={timeframes}
								redirectTo={redirectTo}
								defaultAssetId={defaultAssetId}
								defaultDate={defaultDate}
								initialSharedState={sharedState}
							/>
						) : (
							<ScaledTradeForm
								ref={scaledFormRef}
								strategies={strategies}
								tags={tags}
								assets={assets}
								timeframes={timeframes}
								onModeChange={() => handleModeChange("simple")}
								redirectTo={redirectTo}
								defaultAssetId={defaultAssetId}
								defaultDate={defaultDate}
								initialSharedState={sharedState}
							/>
						)}
					</div>
				</div>
				{activeTab === "csv" && <CsvImport />}
				{activeTab === "nota" && canAccess("journal:nota-tab") && <NotaImport />}
				{activeTab === "screenshot" && canAccess("journal:ocr-tab") && <OcrImport />}
			</div>
		</div>
	)
}
