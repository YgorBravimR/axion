"use client"

import {
	useState,
	useTransition,
	useEffect,
	useCallback,
	type ChangeEvent,
} from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { LanguageSwitcher } from "./language-switcher"
import { useToast } from "@/components/ui/toast"
import {
	getCurrentUser,
	updateUserProfile,
	changePassword,
	type SafeUser,
} from "@/app/actions/auth"
import { getUserSettings, updateUserSettings } from "@/app/actions/settings"
import { Loader2 } from "lucide-react"
import { useFeatureAccess } from "@/hooks/use-feature-access"

/**
 * User profile settings component.
 * Allows users to manage their profile, password, display settings, and appearance.
 */
const UserProfileSettings = () => {
	const t = useTranslations("settings.profile")
	const { isAdmin } = useFeatureAccess()
	const tCommon = useTranslations("common")
	const tAuth = useTranslations("auth")
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [isLoading, setIsLoading] = useState(true)
	const [user, setUser] = useState<SafeUser | null>(null)
	const [showAllAccounts, setShowAllAccounts] = useState(false)

	// Profile editing
	const [isEditingProfile, setIsEditingProfile] = useState(false)
	const [profileForm, setProfileForm] = useState({
		name: "",
	})

	// Password change
	const [isChangingPassword, setIsChangingPassword] = useState(false)
	const [passwordForm, setPasswordForm] = useState({
		currentPassword: "",
		newPassword: "",
		confirmPassword: "",
	})

	useEffect(() => {
		const loadData = async () => {
			try {
				const [userData, settingsResult] = await Promise.all([
					getCurrentUser(),
					getUserSettings(),
				])
				setUser(userData)
				if (userData) {
					setProfileForm({ name: userData.name })
				}
				if (settingsResult.status === "success" && settingsResult.data) {
					setShowAllAccounts(settingsResult.data.showAllAccounts)
				}
			} finally {
				setIsLoading(false)
			}
		}
		loadData()
	}, [])

	const handleToggleShowAllAccounts = useCallback(
		(checked: boolean) => {
			setShowAllAccounts(checked)
			startTransition(async () => {
				const result = await updateUserSettings({ showAllAccounts: checked })
				if (result.status === "success") {
					showToast("success", t("settingsUpdated"))
					// Refresh the page to apply the new setting
					router.refresh()
					return
				}
				// Revert on error
				setShowAllAccounts(!checked)
				showToast("error", result.message || t("settingsUpdateError"))
			})
		},
		[router, showToast, t]
	)

	const handleSaveProfile = useCallback(() => {
		startTransition(async () => {
			const result = await updateUserProfile(profileForm)
			if (result.status === "success") {
				setUser((prev) => (prev ? { ...prev, name: profileForm.name } : null))
				setIsEditingProfile(false)
				showToast("success", t("profileUpdated"))
				return
			}
			showToast("error", result.error || t("profileUpdateError"))
		})
	}, [profileForm, showToast, t])

	const handleChangePassword = useCallback(() => {
		if (passwordForm.newPassword !== passwordForm.confirmPassword) {
			showToast("error", tAuth("register.passwordMismatch"))
			return
		}

		startTransition(async () => {
			const result = await changePassword({
				currentPassword: passwordForm.currentPassword,
				newPassword: passwordForm.newPassword,
				confirmPassword: passwordForm.confirmPassword,
			})
			if (result.status === "success") {
				setIsChangingPassword(false)
				setPasswordForm({
					currentPassword: "",
					newPassword: "",
					confirmPassword: "",
				})
				showToast("success", t("passwordChanged"))
				return
			}
			showToast("error", result.error || t("passwordChangeError"))
		})
	}, [passwordForm, showToast, t, tAuth])

	const handleProfileNameChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			setProfileForm((prev) => ({ ...prev, name: e.target.value }))
		},
		[]
	)

	const handleCurrentPasswordChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
		},
		[]
	)

	const handleNewPasswordChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
		},
		[]
	)

	const handleConfirmPasswordChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
		},
		[]
	)

	const handleCancelEditProfile = useCallback(() => {
		setIsEditingProfile(false)
		setProfileForm({ name: user?.name || "" })
	}, [user?.name])

	const handleCancelChangePassword = useCallback(() => {
		setIsChangingPassword(false)
		setPasswordForm({
			currentPassword: "",
			newPassword: "",
			confirmPassword: "",
		})
	}, [])

	const handleStartEditProfile = useCallback(() => {
		setIsEditingProfile(true)
	}, [])

	const handleStartChangePassword = useCallback(() => {
		setIsChangingPassword(true)
	}, [])

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="text-txt-300 h-8 w-8 animate-spin" />
			</div>
		)
	}

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 mx-auto max-w-2xl">
			{/* Profile Information */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<div className="flex items-center justify-between">
					<h2 className="text-body text-txt-100 font-semibold">
						{t("profileInfo")}
					</h2>
					{!isEditingProfile ? (
						<Button
							id="profile-edit-info"
							variant="ghost"
							size="sm"
							onClick={handleStartEditProfile}
						>
							{tCommon("edit")}
						</Button>
					) : null}
				</div>
				<div className="mt-m-400 space-y-m-400">
					<div className="gap-m-400 flex items-center justify-between">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("name")}</p>
						</div>
						{isEditingProfile ? (
							<Input
								id="profile-name"
								value={profileForm.name}
								onChange={handleProfileNameChange}
								className="w-64"
							/>
						) : (
							<span className="text-small text-txt-200">{user?.name}</span>
						)}
					</div>
					<div className="gap-m-400 flex items-center justify-between">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("email")}</p>
							<p className="text-tiny text-txt-300">{t("emailCannotChange")}</p>
						</div>
						<span className="text-small text-txt-200">{user?.email}</span>
					</div>
				</div>
				{isEditingProfile ? (
					<div className="mt-m-500 gap-s-300 flex justify-end">
						<Button
							id="profile-cancel-info"
							variant="ghost"
							size="sm"
							onClick={handleCancelEditProfile}
							disabled={isPending}
						>
							{tCommon("cancel")}
						</Button>
						<Button
							id="profile-save-info"
							size="sm"
							onClick={handleSaveProfile}
							disabled={isPending}
						>
							{isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							{tCommon("save")}
						</Button>
					</div>
				) : null}
			</div>

			{/* Change Password */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<div className="flex items-center justify-between">
					<h2 className="text-body text-txt-100 font-semibold">
						{t("changePassword")}
					</h2>
					{!isChangingPassword ? (
						<Button
							id="profile-edit-password"
							variant="ghost"
							size="sm"
							onClick={handleStartChangePassword}
						>
							{tCommon("edit")}
						</Button>
					) : null}
				</div>
				{isChangingPassword ? (
					<div className="mt-m-400 space-y-m-400">
						<div className="space-y-s-200">
							<Label id="label-current-password" htmlFor="currentPassword">
								{t("currentPassword")}
							</Label>
							<Input
								id="currentPassword"
								type="password"
								value={passwordForm.currentPassword}
								onChange={handleCurrentPasswordChange}
							/>
						</div>
						<div className="space-y-s-200">
							<Label id="label-new-password" htmlFor="newPassword">
								{t("newPassword")}
							</Label>
							<Input
								id="newPassword"
								type="password"
								value={passwordForm.newPassword}
								onChange={handleNewPasswordChange}
							/>
						</div>
						<div className="space-y-s-200">
							<Label id="label-confirm-new-password" htmlFor="confirmPassword">
								{t("confirmNewPassword")}
							</Label>
							<Input
								id="confirmPassword"
								type="password"
								value={passwordForm.confirmPassword}
								onChange={handleConfirmPasswordChange}
							/>
						</div>
						<div className="gap-s-300 flex justify-end">
							<Button
								id="profile-cancel-password"
								variant="ghost"
								size="sm"
								onClick={handleCancelChangePassword}
								disabled={isPending}
							>
								{tCommon("cancel")}
							</Button>
							<Button
								id="profile-save-password"
								size="sm"
								onClick={handleChangePassword}
								disabled={isPending}
							>
								{isPending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : null}
								{t("updatePassword")}
							</Button>
						</div>
					</div>
				) : (
					<p className="mt-m-400 text-small text-txt-300">
						{t("passwordDescription")}
					</p>
				)}
			</div>

			{/* Data Display — admin only */}
			{isAdmin && (
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
					<h2 className="text-body text-txt-100 font-semibold">
						{t("dataDisplay")}
					</h2>
					<div className="mt-m-400 space-y-m-500">
						{/* Show All Accounts Toggle */}
						<div className="flex items-center justify-between">
							<div>
								<p className="text-small text-txt-100">
									{t("showAllAccounts")}
								</p>
								<p className="text-tiny text-txt-300">
									{t("showAllAccountsDescription")}
								</p>
							</div>
							<Switch
								id="show-all-accounts"
								checked={showAllAccounts}
								onCheckedChange={handleToggleShowAllAccounts}
								disabled={isPending}
							/>
						</div>
					</div>
				</div>
			)}

			{/* Appearance */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<h2 className="text-body text-txt-100 font-semibold">
					{t("appearance")}
				</h2>
				<div className="mt-m-400 space-y-m-500">
					{/* Theme */}
					<div className="flex items-center justify-between">
						<div>
							<p className="text-small text-txt-100">{t("theme")}</p>
							<p className="text-tiny text-txt-300">
								{t("themeLight")} / {t("themeDark")}
							</p>
						</div>
						<ThemeToggle />
					</div>
					{/* Color Scheme / Brand */}
					{/* <div className="flex items-center justify-between">
						<div>
							<p className="text-small text-txt-100">{t("colorScheme")}</p>
							<p className="text-tiny text-txt-300">
								{t("colorSchemeDescription")}
							</p>
						</div>
						<BrandSwitcher />
					</div> */}
					{/* Language */}
					<div className="flex items-center justify-between">
						<div>
							<p className="text-small text-txt-100">{t("language")}</p>
							<p className="text-tiny text-txt-300">
								Português (Brasil) / English
							</p>
						</div>
						<LanguageSwitcher />
					</div>
				</div>
			</div>
		</div>
	)
}

export { UserProfileSettings }
