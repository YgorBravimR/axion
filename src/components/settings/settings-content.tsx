"use client"

import { useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import {
	Tabs,
	TabsList,
	TabsTrigger,
	AnimatedTabsContent,
} from "@/components/ui/tabs"
import { useUrlParams } from "@/hooks/use-url-params"
import { AssetList } from "./asset-list"
import { TimeframeList } from "./timeframe-list"
import { TagList } from "./tag-list"
import { UserProfileSettings } from "./user-profile-settings"
import { AccountSettings } from "./account-settings"
import { UserList } from "./user-list"
import { ConditionList } from "./condition-list"
import { IndicatorList } from "./indicator-list"
import { BugReportsList } from "./bug-reports-list"
import type { AssetWithType } from "@/app/actions/assets.types"
import type { AssetType, Timeframe } from "@/db/schema"
import type { UserWithAccounts } from "@/app/actions/user-management.types"
import type { IndicatorGroupWithDefinitions } from "@/types/indicator"
import {
	User,
	Briefcase,
	Coins,
	Clock,
	Tag,
	Users,
	Filter,
	Bug,
	BarChart3,
} from "lucide-react"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { settingsGuide } from "@/components/ui/page-guide/guide-configs/settings"

/** Params that belong to specific tabs — cleared on tab switch to prevent leaking */
const TAB_SPECIFIC_PARAMS = [
	"tagType",
	"conditionCat",
	"tfType",
	"inactive",
	"assetQ",
	"assetType",
	"userQ",
	"indQ",
] as const

/** Pre-built clear-params object — same shape every render, no allocation on tab change */
const CLEAR_TAB_PARAMS = Object.fromEntries(
	TAB_SPECIFIC_PARAMS.map((param) => [param, null])
) as Record<string, null>

const BASE_TABS = ["profile"] as const
const ADMIN_TABS = [
	"account",
	"tags",
	"conditions",
	"indicators",
	"assets",
	"timeframes",
	"users",
	"bugs",
] as const

interface SettingsContentProps {
	assets: AssetWithType[]
	assetTypes: AssetType[]
	timeframes: Timeframe[]
	isAdmin?: boolean
	usersWithAccounts?: UserWithAccounts[]
	currentUserId?: string
	indicatorGroups?: IndicatorGroupWithDefinitions[]
}

export const SettingsContent = ({
	assets,
	assetTypes,
	timeframes,
	isAdmin = false,
	usersWithAccounts = [],
	currentUserId = "",
	indicatorGroups = [],
}: SettingsContentProps) => {
	const t = useTranslations("settings.tabs")
	const urlParams = useUrlParams()
	useRegisterPageGuide(settingsGuide)

	const validTabs = useMemo(
		() => (isAdmin ? [...BASE_TABS, ...ADMIN_TABS] : [...BASE_TABS]),
		[isAdmin]
	)
	const tabFromUrl = urlParams.get("tab") ?? ""
	const activeTab = validTabs.includes(tabFromUrl as (typeof validTabs)[number])
		? tabFromUrl
		: "profile"

	const handleTabChange = useCallback(
		(value: string) => {
			urlParams.set({ ...CLEAR_TAB_PARAMS, tab: value })
		},
		[urlParams]
	)

	return (
		<Tabs value={activeTab} onValueChange={handleTabChange} className="h-full">
			<div id="settings-tabs" className="mb-m-400 sm:mb-m-500 relative">
				<TabsList
					variant="line"
					className="scrollbar-none w-full overflow-x-auto scroll-smooth"
				>
					<TabsTrigger value="profile" className="gap-s-200 shrink-0">
						<User className="h-4 w-4" aria-hidden="true" />
						{t("profile")}
					</TabsTrigger>
					{isAdmin && (
						<>
							<TabsTrigger value="account" className="gap-s-200 shrink-0">
								<Briefcase className="h-4 w-4" aria-hidden="true" />
								{t("account")}
							</TabsTrigger>
							<TabsTrigger value="tags" className="gap-s-200 shrink-0">
								<Tag className="h-4 w-4" aria-hidden="true" />
								{t("tags")}
							</TabsTrigger>
							<TabsTrigger value="conditions" className="gap-s-200 shrink-0">
								<Filter className="h-4 w-4" aria-hidden="true" />
								{t("conditions")}
							</TabsTrigger>
							<TabsTrigger value="indicators" className="gap-s-200 shrink-0">
								<BarChart3 className="h-4 w-4" aria-hidden="true" />
								{t("indicators")}
							</TabsTrigger>
							<TabsTrigger value="assets" className="gap-s-200 shrink-0">
								<Coins className="h-4 w-4" aria-hidden="true" />
								{t("assets")}
							</TabsTrigger>
							<TabsTrigger value="timeframes" className="gap-s-200 shrink-0">
								<Clock className="h-4 w-4" aria-hidden="true" />
								{t("timeframes")}
							</TabsTrigger>
							<TabsTrigger value="users" className="gap-s-200 shrink-0">
								<Users className="h-4 w-4" aria-hidden="true" />
								{t("users")}
							</TabsTrigger>
							<TabsTrigger value="bugs" className="gap-s-200 shrink-0">
								<Bug className="h-4 w-4" aria-hidden="true" />
								{t("bugs")}
							</TabsTrigger>
						</>
					)}
				</TabsList>
				<div
					className="from-bg-100 pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-12 bg-linear-to-l to-transparent md:hidden"
					aria-hidden="true"
				/>
				<div
					className="from-bg-100 pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-12 bg-linear-to-r to-transparent md:hidden"
					aria-hidden="true"
				/>
			</div>

			<AnimatedTabsContent value="profile">
				{activeTab === "profile" && <UserProfileSettings />}
			</AnimatedTabsContent>

			{isAdmin && (
				<>
					<AnimatedTabsContent value="account">
						{activeTab === "account" && <AccountSettings assets={assets} />}
					</AnimatedTabsContent>

					<AnimatedTabsContent value="tags">
						{activeTab === "tags" && <TagList />}
					</AnimatedTabsContent>

					<AnimatedTabsContent value="conditions">
						{activeTab === "conditions" && <ConditionList />}
					</AnimatedTabsContent>

					<AnimatedTabsContent value="indicators">
						{activeTab === "indicators" && (
							<IndicatorList groups={indicatorGroups} />
						)}
					</AnimatedTabsContent>

					<AnimatedTabsContent value="assets">
						{activeTab === "assets" && (
							<AssetList assets={assets} assetTypes={assetTypes} />
						)}
					</AnimatedTabsContent>

					<AnimatedTabsContent value="timeframes">
						{activeTab === "timeframes" && (
							<TimeframeList timeframes={timeframes} />
						)}
					</AnimatedTabsContent>

					<AnimatedTabsContent value="users">
						{activeTab === "users" && (
							<UserList
								users={usersWithAccounts}
								currentUserId={currentUserId}
							/>
						)}
					</AnimatedTabsContent>

					<AnimatedTabsContent value="bugs">
						{activeTab === "bugs" && <BugReportsList />}
					</AnimatedTabsContent>
				</>
			)}
		</Tabs>
	)
}
