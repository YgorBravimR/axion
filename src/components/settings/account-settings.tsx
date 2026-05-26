"use client"

import { useState, useTransition, useEffect, useMemo, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/toast"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"

import { RecalculateButton } from "./recalculate-button"
import { RecalculatePnLButton } from "./recalculate-pnl-button"
import { Link } from "@/i18n/routing"
import {
	getCurrentAccount,
	logoutUser,
	getUserAccounts,
	revalidateAfterAccountSwitch,
} from "@/app/actions/auth"
import {
	updateAccount,
	getAccountAssets,
	updateAccountAsset,
	deleteAccount,
	deleteAllTradingData,
} from "@/app/actions/accounts"
import { Loader2, Trash2, DatabaseZap, RotateCcw } from "lucide-react"
import { FeeRateForm } from "@/components/tax"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import type { TradingAccount, Asset } from "@/db/schema"
import { useRegisterSettingsSection } from "./settings-save-bar"
import { SettingsField } from "./settings-field"

interface AccountSettingsProps {
	assets: Array<Asset & { assetType?: { code: string; name: string } | null }>
}

interface AccountForm {
	name: string
	accountType: "personal" | "prop"
	propFirmName: string
	profitSharePercentage: string
	defaultBreakevenTicks: string
	defaultAssetId: string
}

const EMPTY_FORM: AccountForm = {
	name: "",
	accountType: "personal",
	propFirmName: "",
	profitSharePercentage: "100",
	defaultBreakevenTicks: "2",
	defaultAssetId: "",
}

const accountToForm = (account: TradingAccount): AccountForm => ({
	name: account.name,
	accountType: account.accountType,
	propFirmName: account.propFirmName || "",
	profitSharePercentage: account.profitSharePercentage,
	defaultBreakevenTicks: account.defaultBreakevenTicks.toString(),
	defaultAssetId: account.defaultAssetId || "",
})

const formsEqual = (a: AccountForm, b: AccountForm) =>
	a.name === b.name &&
	a.accountType === b.accountType &&
	a.propFirmName === b.propFirmName &&
	a.profitSharePercentage === b.profitSharePercentage &&
	a.defaultBreakevenTicks === b.defaultBreakevenTicks &&
	a.defaultAssetId === b.defaultAssetId

const AccountSettings = ({ assets }: AccountSettingsProps) => {
	const t = useTranslations("settings.account")
	const tGeneral = useTranslations("settings.general")
	const { isAdmin } = useFeatureAccess()
	const tCommon = useTranslations("common")
	const tOverlay = useTranslations("overlay")
	const { showToast } = useToast()
	const { showLoading, hideLoading } = useLoadingOverlay()
	const { update: updateSession } = useSession()
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [isLoading, setIsLoading] = useState(true)
	const [account, setAccount] = useState<TradingAccount | null>(null)
	const [userAccounts, setUserAccounts] = useState<TradingAccount[]>([])
	const [deleteConfirmName, setDeleteConfirmName] = useState("")
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
	const [deleteDataConfirmName, setDeleteDataConfirmName] = useState("")
	const [isDeleteDataDialogOpen, setIsDeleteDataDialogOpen] = useState(false)

	// Account form — saved snapshot vs current draft (no edit-mode toggle)
	const [savedForm, setSavedForm] = useState<AccountForm>(EMPTY_FORM)
	const [accountForm, setAccountForm] = useState<AccountForm>(EMPTY_FORM)

	// Per-asset breakeven overrides — string form values keyed by assetId.
	// Empty string = inherit account default; non-empty = override.
	const [savedAssetForms, setSavedAssetForms] = useState<
		Record<string, string>
	>({})
	const [assetForms, setAssetForms] = useState<Record<string, string>>({})

	useEffect(() => {
		let mounted = true
		const loadData = async () => {
			try {
				const [accountData, assetsResult, allAccounts] = await Promise.all([
					getCurrentAccount(),
					getAccountAssets(),
					getUserAccounts(),
				])
				if (!mounted) {
					return
				}
				setAccount(accountData)
				setUserAccounts(allAccounts)

				const baseAssets =
					assetsResult.status === "success" && assetsResult.data
						? assetsResult.data
						: []

				const initialAssetForms: Record<string, string> = {}
				for (const aa of baseAssets) {
					initialAssetForms[aa.assetId] =
						aa.breakevenTicksOverride != null
							? aa.breakevenTicksOverride.toString()
							: ""
				}
				setSavedAssetForms(initialAssetForms)
				setAssetForms(initialAssetForms)

				if (accountData) {
					const form = accountToForm(accountData)
					setSavedForm(form)
					setAccountForm(form)
				}
			} finally {
				if (mounted) {
					setIsLoading(false)
				}
			}
		}
		void loadData()
		return () => {
			mounted = false
		}
	}, [])

	// --- Account info section --------------------------------------------------

	const accountInfoDirty = !formsEqual(accountForm, savedForm)

	const saveAccountInfo = useCallback(async () => {
		if (!account) {
			return
		}
		const result = await updateAccount(account.id, {
			name: accountForm.name,
			accountType: accountForm.accountType,
			propFirmName:
				accountForm.accountType === "prop"
					? accountForm.propFirmName
					: undefined,
			profitSharePercentage:
				parseFloat(accountForm.profitSharePercentage) || 100,
			defaultBreakevenTicks: parseInt(accountForm.defaultBreakevenTicks) || 0,
			defaultAssetId: accountForm.defaultAssetId || null,
		})
		if (result.status === "success" && result.data) {
			setAccount(result.data)
			const newForm = accountToForm(result.data)
			setSavedForm(newForm)
			setAccountForm(newForm)
			return
		}
		throw new Error(result.error || t("accountUpdateError"))
	}, [account, accountForm, t])

	const resetAccountInfo = useCallback(() => {
		setAccountForm(savedForm)
	}, [savedForm])

	useRegisterSettingsSection({
		id: "account-info",
		label: t("accountInfo"),
		isDirty: accountInfoDirty,
		onSave: saveAccountInfo,
		onReset: resetAccountInfo,
	})

	// --- Per-asset breakeven overrides ----------------------------------------

	const dirtyAssetIds = useMemo(
		() =>
			assets
				.map((a) => a.id)
				.filter((id) => (assetForms[id] ?? "") !== (savedAssetForms[id] ?? "")),
		[assets, assetForms, savedAssetForms]
	)

	const saveAssetOverrides = useCallback(async () => {
		if (dirtyAssetIds.length === 0) {
			return
		}
		await Promise.all(
			dirtyAssetIds.map(async (assetId) => {
				const raw = assetForms[assetId] ?? ""
				const breakevenTicksValue =
					raw.trim() === "" ? null : parseInt(raw) || null
				const result = await updateAccountAsset({
					assetId,
					isEnabled: true,
					breakevenTicksOverride: breakevenTicksValue,
				})
				if (result.status !== "success") {
					throw new Error(result.error || t("assetBreakevenUpdateError"))
				}
			})
		)
		setSavedAssetForms((prev) => {
			const next = { ...prev }
			for (const id of dirtyAssetIds) {
				next[id] = assetForms[id] ?? ""
			}
			return next
		})
	}, [assetForms, dirtyAssetIds, t])

	const resetAssetOverrides = useCallback(() => {
		setAssetForms(savedAssetForms)
	}, [savedAssetForms])

	useRegisterSettingsSection({
		id: "account-asset-overrides",
		label: t("assetOverrides"),
		isDirty: dirtyAssetIds.length > 0,
		onSave: saveAssetOverrides,
		onReset: resetAssetOverrides,
	})

	const handleResetSingleAssetOverride = useCallback((assetId: string) => {
		setAssetForms((prev) => ({ ...prev, [assetId]: "" }))
	}, [])

	// --- Destructive actions (kept independent — not part of master Save) ----

	const handleDeleteAccount = () => {
		if (!account) {
			return
		}
		const switchTarget =
			userAccounts.find((a) => a.isDefault && a.id !== account.id) ??
			userAccounts.find((a) => a.id !== account.id)

		startTransition(async () => {
			const result = await deleteAccount(account.id)
			if (result.status === "success") {
				setIsDeleteDialogOpen(false)
				setDeleteConfirmName("")
				if (result.shouldLogout) {
					await logoutUser()
					return
				}
				if (switchTarget) {
					await updateSession({ accountId: switchTarget.id })
					await revalidateAfterAccountSwitch()
					window.location.reload()
					return
				}
				showToast("success", t("deleteAccountSuccess"))
			} else {
				showToast("error", result.error || t("deleteAccountError"))
			}
		})
	}

	const handleDeleteAllData = async () => {
		if (!account) {
			return
		}
		setIsDeleteDataDialogOpen(false)
		setDeleteDataConfirmName("")
		showLoading({ message: tOverlay("deletingTradingData") })
		const result = await deleteAllTradingData()
		hideLoading()
		if (result.status === "success") {
			showToast("success", t("deleteAllDataSuccess"))
			router.refresh()
		} else {
			showToast("error", result.error || t("deleteAllDataError"))
		}
	}

	const isDefaultAccount = account?.isDefault ?? false
	const isLastAccount = userAccounts.length <= 1
	const canDeleteAccount = !isDefaultAccount || isLastAccount
	const showPropFields =
		accountForm.accountType === "prop" || account?.accountType === "prop"

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="text-txt-300 h-8 w-8 animate-spin motion-reduce:animate-none" />
			</div>
		)
	}

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 pb-l-800 mx-auto max-w-2xl">
			{/* Account Information */}
			<div
				id="settings-account-info"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<h2 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("accountInfo")}
				</h2>
				<div className="mt-m-400 space-y-m-400">
					<SettingsField htmlFor="account-name" label={t("accountName")}>
						<Input
							id="account-name"
							value={accountForm.name}
							onChange={(e) =>
								setAccountForm((prev) => ({ ...prev, name: e.target.value }))
							}
							className="w-full"
						/>
					</SettingsField>
					<SettingsField htmlFor="account-type" label={t("accountType")}>
						<Select
							value={accountForm.accountType}
							onValueChange={(value: "personal" | "prop") =>
								setAccountForm((prev) => ({ ...prev, accountType: value }))
							}
						>
							<SelectTrigger id="account-type" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="personal">{t("personal")}</SelectItem>
								<SelectItem value="prop">{t("propFirm")}</SelectItem>
							</SelectContent>
						</Select>
					</SettingsField>
					{showPropFields && (
						<>
							<SettingsField
								htmlFor="account-prop-firm-name"
								label={t("propFirmName")}
							>
								<Input
									id="account-prop-firm-name"
									value={accountForm.propFirmName}
									onChange={(e) =>
										setAccountForm((prev) => ({
											...prev,
											propFirmName: e.target.value,
										}))
									}
									className="w-full"
									placeholder={t("propFirmNamePlaceholder")}
								/>
							</SettingsField>
							<SettingsField
								htmlFor="account-profit-share-percentage"
								label={t("profitShare")}
							>
								<div className="gap-s-200 flex items-center">
									<Input
										id="account-profit-share-percentage"
										type="number"
										min="0"
										max="100"
										step="0.01"
										value={accountForm.profitSharePercentage}
										onChange={(e) =>
											setAccountForm((prev) => ({
												...prev,
												profitSharePercentage: e.target.value,
											}))
										}
										className="flex-1 text-right"
									/>
									<span className="text-small text-txt-300 w-6 text-left">
										%
									</span>
								</div>
							</SettingsField>
						</>
					)}
					<SettingsField
						htmlFor="account-default-asset"
						label={t("defaultAsset")}
						help={t("defaultAssetHelp")}
					>
						<Select
							value={accountForm.defaultAssetId || "none"}
							onValueChange={(value) =>
								setAccountForm((prev) => ({
									...prev,
									defaultAssetId: value === "none" ? "" : value,
								}))
							}
						>
							<SelectTrigger id="account-default-asset" className="w-full">
								<SelectValue placeholder={t("defaultAssetPlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">{t("defaultAssetNone")}</SelectItem>
								{assets.map((asset) => (
									<SelectItem key={asset.id} value={asset.id}>
										<span className="font-mono">{asset.symbol}</span>
										<span className="text-txt-300 ml-s-200">{asset.name}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</SettingsField>
					<SettingsField
						htmlFor="account-default-breakeven-ticks"
						label={t("breakevenTicks")}
						help={t("breakevenTicksDesc")}
					>
						<div className="gap-s-200 flex items-center">
							<Input
								id="account-default-breakeven-ticks"
								type="number"
								step="1"
								min="0"
								value={accountForm.defaultBreakevenTicks}
								onChange={(e) =>
									setAccountForm((prev) => ({
										...prev,
										defaultBreakevenTicks: e.target.value,
									}))
								}
								className="flex-1 text-right"
							/>
							<span className="text-small text-txt-300 w-10 text-left">
								{t("ticks")}
							</span>
						</div>
					</SettingsField>
				</div>
			</div>

			{/* Trading Costs (BR) */}
			<div
				id="settings-trading-costs"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<h2 className="text-body text-txt-100 mb-s-300 font-semibold">
					{t("tradingCosts")}
				</h2>
				<FeeRateForm />
			</div>

			{/* Per-Asset Breakeven Ticks Overrides */}
			<div
				id="settings-asset-overrides"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<h2 className="text-body text-txt-100 font-semibold">
					{t("assetOverrides")}
				</h2>
				<p className="mt-s-200 text-tiny text-txt-300">
					{t("assetOverridesDesc")}
				</p>
				<div className="mt-m-400 space-y-m-400">
					{assets.map((asset) => {
						const draft = assetForms[asset.id] ?? ""
						const hasOverride = draft.trim() !== ""
						return (
							<SettingsField
								key={asset.id}
								htmlFor={`account-asset-breakeven-ticks-${asset.id}`}
								label={
									<div>
										<p className="text-small text-txt-100 font-medium">
											{asset.symbol}
										</p>
										<p className="text-tiny text-txt-300">{asset.name}</p>
									</div>
								}
							>
								<div className="gap-s-200 flex items-center">
									<Input
										id={`account-asset-breakeven-ticks-${asset.id}`}
										type="number"
										step="1"
										min="0"
										value={draft}
										onChange={(e) =>
											setAssetForms((prev) => ({
												...prev,
												[asset.id]: e.target.value,
											}))
										}
										className="text-small h-8 flex-1 text-right"
										placeholder={
											account?.defaultBreakevenTicks?.toString() ?? "2"
										}
										aria-label={`${asset.symbol} ${t("breakevenTicks")}`}
									/>
									<span className="text-tiny text-txt-300 w-10 text-left">
										{t("ticks")}
									</span>
									<Button
										id={`account-reset-asset-${asset.id}`}
										variant="ghost"
										size="sm"
										onClick={() => handleResetSingleAssetOverride(asset.id)}
										disabled={isPending || !hasOverride}
										className="text-txt-300 hover:text-fb-error h-8 w-8 p-0 disabled:opacity-0"
										aria-label={t("resetToDefault")}
									>
										<RotateCcw className="h-3 w-3" aria-hidden="true" />
									</Button>
								</div>
							</SettingsField>
						)
					})}
				</div>
			</div>

			{/* Data Maintenance */}
			<div
				id="settings-data-maintenance"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<h2 className="text-body text-txt-100 font-semibold">
					{tGeneral("dataMaintenance")}
				</h2>
				<div className="mt-m-400 space-y-s-300 sm:space-y-m-400">
					<div className="pb-s-300 sm:pb-0">
						<p className="text-small text-txt-100">
							{tGeneral("recalculateR")}
						</p>
						<p className="mb-m-400 text-tiny text-txt-300">
							{tGeneral("recalculateRDescription")}
						</p>
						<RecalculateButton />
					</div>
					<div className="border-bg-300 pt-s-300 border-t sm:border-0 sm:pt-0">
						<p className="text-small text-txt-100">
							{tGeneral("recalculatePnL")}
						</p>
						<p className="mb-m-400 text-tiny text-txt-300">
							{tGeneral("recalculatePnLDescription")}
						</p>
						<RecalculatePnLButton />
					</div>
				</div>
			</div>

			{isAdmin && (
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
					<h2 className="text-small sm:text-body text-txt-100 font-semibold">
						{tGeneral("dataImport")}
					</h2>
					<div className="mt-m-400">
						<p className="text-small text-txt-200">
							{tGeneral("dataImportDesc")}
						</p>
						<p className="mt-m-400 text-tiny text-txt-300">
							{tGeneral("goTo")}{" "}
							<Link
								href="/journal/new"
								className="text-acc-100 hover:underline"
							>
								{tGeneral("importNavLink")}
							</Link>{" "}
							{tGeneral("toImport")}
						</p>
					</div>
				</div>
			)}

			{isAdmin && (
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
					<h2 className="text-small sm:text-body text-txt-100 font-semibold">
						{tGeneral("dataExport")}
					</h2>
					<p className="mt-m-400 text-small text-txt-200">
						{tGeneral("dataExportDesc")}
					</p>
					<p className="mt-m-400 text-tiny text-txt-300">
						{tGeneral("exportComingSoon")}
					</p>
				</div>
			)}

			{/* Danger Zone */}
			<div
				id="settings-danger-zone"
				className="bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 border-fb-error/30 rounded-lg border"
			>
				<h2 className="text-small sm:text-body text-fb-error font-semibold">
					{t("dangerZone")}
				</h2>

				<div className="mt-m-400">
					<p className="text-small text-txt-100">{t("deleteAllData")}</p>
					<p className="mt-s-100 text-tiny text-txt-300">
						{t("deleteAllDataDesc")}
					</p>
					<div className="mt-s-300">
						<AlertDialog
							open={isDeleteDataDialogOpen}
							onOpenChange={(open) => {
								setIsDeleteDataDialogOpen(open)
								if (!open) {
									setDeleteDataConfirmName("")
								}
							}}
						>
							<AlertDialogTrigger asChild>
								<Button
									id="account-delete-data-trigger"
									variant="destructive"
									size="sm"
								>
									<DatabaseZap
										className="mr-s-200 h-4 w-4"
										aria-hidden="true"
									/>
									{t("deleteAllData")}
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>{t("deleteAllDataTitle")}</AlertDialogTitle>
									<AlertDialogDescription>
										{t("deleteAllDataDescription", {
											name: account?.name ?? "",
										})}
									</AlertDialogDescription>
								</AlertDialogHeader>
								<div className="space-y-s-200">
									<Label
										id="delete-data-confirm-label"
										htmlFor="delete-data-confirm-input"
										className="text-small text-txt-200"
									>
										{t("deleteAllDataConfirmLabel", {
											name: account?.name ?? "",
										})}
									</Label>
									<Input
										id="delete-data-confirm-input"
										value={deleteDataConfirmName}
										onChange={(e) => setDeleteDataConfirmName(e.target.value)}
										placeholder={account?.name ?? ""}
										aria-label={t("deleteAllDataConfirmLabel", {
											name: account?.name ?? "",
										})}
									/>
								</div>
								<AlertDialogFooter>
									<AlertDialogCancel id="account-delete-data-cancel">
										{tCommon("cancel")}
									</AlertDialogCancel>
									<AlertDialogAction
										id="account-delete-data-confirm"
										variant="destructive"
										disabled={
											deleteDataConfirmName !== account?.name || isPending
										}
										onClick={handleDeleteAllData}
									>
										{isPending && (
											<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
										)}
										{tCommon("confirm")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</div>

				<div className="border-bg-300 mt-m-400 pt-m-400 border-t">
					<p className="text-small text-txt-100">{t("deleteAccount")}</p>
					<p className="mt-s-100 text-tiny text-txt-300">
						{isLastAccount ? t("deleteLastAccountDesc") : t("dangerZoneDesc")}
					</p>
					{!canDeleteAccount && (
						<p className="mt-s-100 text-tiny text-fb-error">
							{t("cannotDeleteDefaultAccount")}
						</p>
					)}
					<div className="mt-s-300">
						<AlertDialog
							open={isDeleteDialogOpen}
							onOpenChange={(open) => {
								setIsDeleteDialogOpen(open)
								if (!open) {
									setDeleteConfirmName("")
								}
							}}
						>
							<AlertDialogTrigger asChild>
								<Button
									id="account-delete-trigger"
									variant="destructive"
									size="sm"
									disabled={!canDeleteAccount}
								>
									<Trash2 className="mr-s-200 h-4 w-4" aria-hidden="true" />
									{t("deleteAccount")}
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>{t("deleteAccountTitle")}</AlertDialogTitle>
									<AlertDialogDescription>
										{isLastAccount
											? t("deleteLastAccountWarning", {
													name: account?.name ?? "",
												})
											: t("deleteAccountDescription", {
													name: account?.name ?? "",
												})}
									</AlertDialogDescription>
								</AlertDialogHeader>
								<div className="space-y-s-200">
									<Label
										id="delete-confirm-label"
										htmlFor="delete-confirm-input"
										className="text-small text-txt-200"
									>
										{t("deleteAccountConfirmLabel", {
											name: account?.name ?? "",
										})}
									</Label>
									<Input
										id="delete-confirm-input"
										value={deleteConfirmName}
										onChange={(e) => setDeleteConfirmName(e.target.value)}
										placeholder={account?.name ?? ""}
										aria-label={t("deleteAccountConfirmLabel", {
											name: account?.name ?? "",
										})}
									/>
								</div>
								<AlertDialogFooter>
									<AlertDialogCancel id="account-delete-cancel">
										{tCommon("cancel")}
									</AlertDialogCancel>
									<AlertDialogAction
										id="account-delete-confirm"
										variant="destructive"
										disabled={deleteConfirmName !== account?.name || isPending}
										onClick={handleDeleteAccount}
									>
										{isPending && (
											<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
										)}
										{tCommon("confirm")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</div>
			</div>
		</div>
	)
}

export { AccountSettings }
