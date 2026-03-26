"use client"

import { useCallback } from "react"
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
import { BugReportsList } from "./bug-reports-list"
import type { AssetWithType } from "@/app/actions/assets"
import type { AssetType, Timeframe } from "@/db/schema"
import type { UserWithAccounts } from "@/app/actions/user-management"
import { User, Briefcase, Coins, Clock, Tag, Users, Filter, Bug } from "lucide-react"
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
] as const

interface SettingsContentProps {
	assets: AssetWithType[]
	assetTypes: AssetType[]
	timeframes: Timeframe[]
	isAdmin?: boolean
	usersWithAccounts?: UserWithAccounts[]
	currentUserId?: string
}

export const SettingsContent = ({
	assets,
	assetTypes,
	timeframes,
	isAdmin = false,
	usersWithAccounts = [],
	currentUserId = "",
}: SettingsContentProps) => {
	const t = useTranslations("settings.tabs")
	const urlParams = useUrlParams()
	useRegisterPageGuide(settingsGuide)

	const baseTabs = ["profile", "account", "tags"]
	const adminTabs = ["conditions", "assets", "timeframes", "users", "bugs"]
	const validTabs = isAdmin ? [...baseTabs, ...adminTabs] : baseTabs
	const tabFromUrl = urlParams.get("tab") ?? ""
	const activeTab = validTabs.includes(tabFromUrl) ? tabFromUrl : "profile"

	const handleTabChange = useCallback(
		(value: string) => {
			const clearParams = Object.fromEntries(
				TAB_SPECIFIC_PARAMS.map((param) => [param, null])
			)
			urlParams.set({ ...clearParams, tab: value })
		},
		[urlParams]
	)

	return (
		<Tabs value={activeTab} onValueChange={handleTabChange} className="h-full">
			<div id="settings-tabs" className="mb-m-400 sm:mb-m-500 relative">
				<TabsList
					variant="line"
					className="scrollbar-none w-full overflow-x-auto"
				>
					<TabsTrigger value="profile" className="gap-s-200 shrink-0">
						<User className="h-4 w-4" />
						{t("profile")}
					</TabsTrigger>
					<TabsTrigger value="account" className="gap-s-200 shrink-0">
						<Briefcase className="h-4 w-4" />
						{t("account")}
					</TabsTrigger>
					<TabsTrigger value="tags" className="gap-s-200 shrink-0">
						<Tag className="h-4 w-4" />
						{t("tags")}
					</TabsTrigger>
					{isAdmin && (
						<TabsTrigger value="conditions" className="gap-s-200 shrink-0">
							<Filter className="h-4 w-4" />
							{t("conditions")}
						</TabsTrigger>
					)}
					{isAdmin && (
						<>
							<TabsTrigger value="assets" className="gap-s-200 shrink-0">
								<Coins className="h-4 w-4" />
								{t("assets")}
							</TabsTrigger>
							<TabsTrigger value="timeframes" className="gap-s-200 shrink-0">
								<Clock className="h-4 w-4" />
								{t("timeframes")}
							</TabsTrigger>
							<TabsTrigger value="users" className="gap-s-200 shrink-0">
								<Users className="h-4 w-4" />
								{t("users")}
							</TabsTrigger>
							<TabsTrigger value="bugs" className="gap-s-200 shrink-0">
								<Bug className="h-4 w-4" />
								{t("bugs")}
							</TabsTrigger>
						</>
					)}
				</TabsList>
				<div
					className="from-bg-100 pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-12 bg-linear-to-l to-transparent md:hidden"
					aria-hidden="true"
				/>
			</div>

			<AnimatedTabsContent value="profile">
				<UserProfileSettings />
			</AnimatedTabsContent>

			<AnimatedTabsContent value="account">
				<AccountSettings assets={assets} />
			</AnimatedTabsContent>

			<AnimatedTabsContent value="tags">
				<TagList />
			</AnimatedTabsContent>

			{isAdmin && (
				<AnimatedTabsContent value="conditions">
					<ConditionList />
				</AnimatedTabsContent>
			)}

			{isAdmin && (
				<>
					<AnimatedTabsContent value="assets">
						<AssetList assets={assets} assetTypes={assetTypes} />
					</AnimatedTabsContent>

					<AnimatedTabsContent value="timeframes">
						<TimeframeList timeframes={timeframes} />
					</AnimatedTabsContent>

					<AnimatedTabsContent value="users">
						<UserList users={usersWithAccounts} currentUserId={currentUserId} />
					</AnimatedTabsContent>

					<AnimatedTabsContent value="bugs">
						<BugReportsList />
					</AnimatedTabsContent>
				</>
			)}
		</Tabs>
	)
}
