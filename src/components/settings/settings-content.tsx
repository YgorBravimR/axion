"use client"

import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Tabs, TabsList, TabsTrigger, AnimatedTabsContent } from "@/components/ui/tabs"
import { AssetList } from "./asset-list"
import { TimeframeList } from "./timeframe-list"
import { TagList } from "./tag-list"
import { UserProfileSettings } from "./user-profile-settings"
import { AccountSettings } from "./account-settings"
import { UserList } from "./user-list"
import { ConditionList } from "./condition-list"
import type { AssetWithType } from "@/app/actions/assets"
import type { AssetType, Timeframe } from "@/db/schema"
import type { UserWithAccounts } from "@/app/actions/user-management"
import { User, Briefcase, Coins, Clock, Tag, Users, Filter } from "lucide-react"

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
	const searchParams = useSearchParams()

	const baseTabs = ["profile", "account", "tags"]
	const adminTabs = ["conditions", "assets", "timeframes", "users"]
	const validTabs = isAdmin ? [...baseTabs, ...adminTabs] : baseTabs
	const tabFromUrl = searchParams.get("tab") ?? ""
	const defaultTab = validTabs.includes(tabFromUrl) ? tabFromUrl : "profile"

	return (
		<Tabs defaultValue={defaultTab} className="h-full">
			<div className="relative mb-m-400 sm:mb-m-500">
				<TabsList variant="line" className="w-full overflow-x-auto scrollbar-none">
					<TabsTrigger value="profile" className="shrink-0 gap-s-200">
						<User className="h-4 w-4" />
						{t("profile")}
					</TabsTrigger>
					<TabsTrigger value="account" className="shrink-0 gap-s-200">
						<Briefcase className="h-4 w-4" />
						{t("account")}
					</TabsTrigger>
					<TabsTrigger value="tags" className="shrink-0 gap-s-200">
						<Tag className="h-4 w-4" />
						{t("tags")}
					</TabsTrigger>
					{isAdmin && (
						<TabsTrigger value="conditions" className="shrink-0 gap-s-200">
							<Filter className="h-4 w-4" />
							{t("conditions")}
						</TabsTrigger>
					)}
					{isAdmin && (
						<>
							<TabsTrigger value="assets" className="shrink-0 gap-s-200">
								<Coins className="h-4 w-4" />
								{t("assets")}
							</TabsTrigger>
							<TabsTrigger value="timeframes" className="shrink-0 gap-s-200">
								<Clock className="h-4 w-4" />
								{t("timeframes")}
							</TabsTrigger>
							<TabsTrigger value="users" className="shrink-0 gap-s-200">
								<Users className="h-4 w-4" />
								{t("users")}
							</TabsTrigger>
						</>
					)}
				</TabsList>
				<div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-12 bg-linear-to-l from-bg-100 to-transparent md:hidden" aria-hidden="true" />
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
						<UserList
							users={usersWithAccounts}
							currentUserId={currentUserId}
						/>
					</AnimatedTabsContent>
				</>
			)}
		</Tabs>
	)
}
