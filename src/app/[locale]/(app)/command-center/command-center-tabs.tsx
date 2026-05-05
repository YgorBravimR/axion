"use client"

import { useState, lazy, Suspense } from "react"
import { Tabs, TabsList, TabsTrigger, AnimatedTabsContent } from "@/components/ui/tabs"
import { Target, Activity, Calculator, CalendarDays, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { CommandCenterContent, type CommandCenterContentProps } from "./command-center-content"
import type { Asset } from "@/db/schema"
import type { StrategyWithStats } from "@/app/actions/strategies"
import type { AssetSettingWithAsset } from "@/app/actions/command-center"
import type { RiskManagementProfile } from "@/types/risk-profile"
import type { LiveTradingStatusResult } from "@/types/live-trading-status"

const MarketMonitorContent = lazy(() =>
	import("@/components/market/market-monitor-content").then((m) => ({
		default: m.MarketMonitorContent,
	}))
)

const PositionCalculator = lazy(() =>
	import("@/components/calculator/position-calculator").then((m) => ({
		default: m.PositionCalculator,
	}))
)

const MonthlyPlanTab = lazy(() =>
	import("@/components/monthly-plan/monthly-plan-tab").then((m) => ({
		default: m.MonthlyPlanTab,
	}))
)

interface CommandCenterTabsProps extends CommandCenterContentProps {
	calculatorAssets: Asset[]
	accountSettings: {
		defaultRiskPerTrade: string | null
		maxDailyLoss: number | null
	}
	strategies: StrategyWithStats[]
	assetSettings: AssetSettingWithAsset[]
	initialPlan: null
	initialYear: number
	initialMonth: number
	riskProfiles?: RiskManagementProfile[]
	isReplayAccount?: boolean
	initialLiveTradingStatus?: LiveTradingStatusResult | null
}

const tabLoadingFallback = (
	<div className="flex items-center justify-center py-12">
		<Loader2 className="text-txt-300 h-6 w-6 animate-spin motion-reduce:animate-none" />
	</div>
)

const CommandCenterTabs = ({
	calculatorAssets,
	accountSettings,
	strategies,
	assetSettings,
	initialPlan,
	initialYear,
	initialMonth,
	riskProfiles = [],
	isReplayAccount = false,
	initialLiveTradingStatus = null,
	...commandCenterProps
}: CommandCenterTabsProps) => {
	const defaultAssetSymbol = commandCenterProps.account?.defaultAsset ?? undefined
	const t = useTranslations("commandCenter")
	const { canAccess } = useFeatureAccess()
	const showPlanTab = canAccess("command-center:plan-tab")
	const showCommandTab = canAccess("command-center:command-tab")
	const showMonitorTab = !isReplayAccount && canAccess("command-center:monitor-tab")
	const defaultTab = showCommandTab ? "command-center" : "calculator"
	const [activeTab, setActiveTab] = useState(defaultTab)

	return (
		<Tabs
			value={activeTab}
			onValueChange={setActiveTab}
			className="flex h-full flex-col"
		>
			<TabsList variant="line" className="border-bg-300 border-b px-s-200 sm:px-s-200 overflow-x-auto whitespace-nowrap snap-x snap-mandatory" aria-label={t("tabs.navigation")}>
				{showPlanTab && (
					<TabsTrigger
						value="plan"
						className="text-txt-200 data-[state=active]:text-acc-100 gap-s-100 sm:gap-s-200 snap-start"
						aria-label={t("tabs.plan")}
					>
						<CalendarDays className="h-4 w-4" />
						<span className="hidden sm:inline">{t("tabs.plan")}</span>
					</TabsTrigger>
				)}
				{showCommandTab && (
					<TabsTrigger
						value="command-center"
						className="text-txt-200 data-[state=active]:text-acc-100 gap-s-100 sm:gap-s-200 snap-start"
						aria-label={t("tabs.commandCenter")}
					>
						<Target className="h-4 w-4" />
						<span className="hidden sm:inline">{t("tabs.commandCenter")}</span>
					</TabsTrigger>
				)}
				{showMonitorTab && (
					<TabsTrigger
						value="monitor"
						className="text-txt-200 data-[state=active]:text-acc-100 gap-s-100 sm:gap-s-200 snap-start"
						aria-label={t("tabs.monitor")}
					>
						<Activity className="h-4 w-4" />
						<span className="hidden sm:inline">{t("tabs.monitor")}</span>
					</TabsTrigger>
				)}
				<TabsTrigger
					value="calculator"
					className="text-txt-200 data-[state=active]:text-acc-100 gap-s-100 sm:gap-s-200 snap-start"
					aria-label={t("tabs.calculator")}
				>
					<Calculator className="h-4 w-4" />
					<span className="hidden sm:inline">{t("tabs.calculator")}</span>
				</TabsTrigger>
			</TabsList>

			{showPlanTab && (
				<AnimatedTabsContent value="plan" className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600">
					<Suspense fallback={tabLoadingFallback}>
						<MonthlyPlanTab
							initialPlan={initialPlan}
							initialYear={initialYear}
							initialMonth={initialMonth}
							riskProfiles={riskProfiles}
						/>
					</Suspense>
				</AnimatedTabsContent>
			)}

			{showCommandTab && (
				<AnimatedTabsContent value="command-center" className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600">
					<CommandCenterContent
						key={commandCenterProps.viewDate}
						{...commandCenterProps}
						initialLiveTradingStatus={initialLiveTradingStatus}
					/>
				</AnimatedTabsContent>
			)}

			{showMonitorTab && (
				<AnimatedTabsContent
					value="monitor"
					className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600"
				>
					<Suspense fallback={tabLoadingFallback}>
						<MarketMonitorContent />
					</Suspense>
				</AnimatedTabsContent>
			)}

			<AnimatedTabsContent
				value="calculator"
				className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600"
			>
				<Suspense fallback={tabLoadingFallback}>
					<PositionCalculator
						assets={calculatorAssets}
						accountSettings={accountSettings}
						strategies={strategies}
						assetSettings={assetSettings}
						defaultAssetSymbol={defaultAssetSymbol}
					/>
				</Suspense>
			</AnimatedTabsContent>
		</Tabs>
	)
}

export { CommandCenterTabs }
