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

	const validTabs = ["profile", "account", "tags", "conditions", "assets", "timeframes", "users"]
	const tabFromUrl = searchParams.get("tab") ?? ""
	const defaultTab = validTabs.includes(tabFromUrl) ? tabFromUrl : "profile"

	return (
		<Tabs defaultValue={defaultTab} className="h-full">
			<TabsList variant="line" className="mb-m-400 sm:mb-m-500">
				<TabsTrigger value="profile" className="gap-s-200">
					<User className="h-4 w-4" />
					{t("profile")}
				</TabsTrigger>
				<TabsTrigger value="account" className="gap-s-200">
					<Briefcase className="h-4 w-4" />
					{t("account")}
				</TabsTrigger>
				<TabsTrigger value="tags" className="gap-s-200">
					<Tag className="h-4 w-4" />
					{t("tags")}
				</TabsTrigger>
				<TabsTrigger value="conditions" className="gap-s-200">
					<Filter className="h-4 w-4" />
					{t("conditions")}
				</TabsTrigger>
				{isAdmin && (
					<>
						<TabsTrigger value="assets" className="gap-s-200">
							<Coins className="h-4 w-4" />
							{t("assets")}
						</TabsTrigger>
						<TabsTrigger value="timeframes" className="gap-s-200">
							<Clock className="h-4 w-4" />
							{t("timeframes")}
						</TabsTrigger>
						<TabsTrigger value="users" className="gap-s-200">
							<Users className="h-4 w-4" />
							{t("users")}
						</TabsTrigger>
					</>
				)}
			</TabsList>

			<AnimatedTabsContent value="profile">
				<UserProfileSettings />
			</AnimatedTabsContent>

			<AnimatedTabsContent value="account">
				<AccountSettings assets={assets} />
			</AnimatedTabsContent>

			<AnimatedTabsContent value="tags">
				<TagList />
			</AnimatedTabsContent>

			<AnimatedTabsContent value="conditions">
				<ConditionList />
			</AnimatedTabsContent>

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
