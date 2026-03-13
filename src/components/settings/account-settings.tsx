"use client"

import { useState, useTransition, useEffect } from "react"
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
import { cn } from "@/lib/utils"
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
} from "@/app/actions/accounts"
import { Loader2, Trash2 } from "lucide-react"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { fromCents, toCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"
import { DatePicker } from "@/components/ui/date-picker"
import type { TradingAccount, AccountAsset, Asset } from "@/db/schema"

interface AccountSettingsProps {
	assets: Array<Asset & { assetType?: { code: string; name: string } | null }>
}

const AccountSettings = ({ assets }: AccountSettingsProps) => {
	const t = useTranslations("settings.account")
	const tGeneral = useTranslations("settings.general")
	const { isAdmin } = useFeatureAccess()
	const tCommon = useTranslations("common")
	const { showToast } = useToast()
	const { update: updateSession } = useSession()
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [isLoading, setIsLoading] = useState(true)
	const [account, setAccount] = useState<TradingAccount | null>(null)
	const [accountAssets, setAccountAssets] = useState<AccountAsset[]>([])
	const [userAccounts, setUserAccounts] = useState<TradingAccount[]>([])
	const [deleteConfirmName, setDeleteConfirmName] = useState("")
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

	// Account editing
	const [isEditingAccount, setIsEditingAccount] = useState(false)
	const [accountForm, setAccountForm] = useState({
		name: "",
		accountType: "personal" as "personal" | "prop" | "replay",
		propFirmName: "",
		profitSharePercentage: "100",
		defaultCommission: "0",
		defaultFees: "0",
		defaultBreakevenTicks: "2",
		replayStartDate: "",
		defaultAsset: "" as string,
	})

	// Asset fees editing
	const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
	const [assetFeesForm, setAssetFeesForm] = useState({
		commission: "0",
		fees: "0",
		breakevenTicks: "",
	})

	useEffect(() => {
		const loadData = async () => {
			try {
				const [accountData, assetsResult, allAccounts] = await Promise.all([
					getCurrentAccount(),
					getAccountAssets(),
					getUserAccounts(),
				])
				setAccount(accountData)
				setUserAccounts(allAccounts)
				if (assetsResult.status === "success" && assetsResult.data) {
					// Extract the base AccountAsset data from AccountAssetWithDetails
					setAccountAssets(assetsResult.data.map(({ asset, ...rest }) => rest))
				}
				if (accountData) {
					setAccountForm({
						name: accountData.name,
						accountType: accountData.accountType,
						propFirmName: accountData.propFirmName || "",
						profitSharePercentage: accountData.profitSharePercentage,
						defaultCommission: fromCents(
							accountData.defaultCommission
						).toString(),
						defaultFees: fromCents(accountData.defaultFees).toString(),
						defaultBreakevenTicks: accountData.defaultBreakevenTicks.toString(),
						replayStartDate: accountData.replayCurrentDate
							? new Date(accountData.replayCurrentDate)
									.toISOString()
									.split("T")[0]
							: "",
						defaultAsset: accountData.defaultAsset || "",
					})
				}
			} finally {
				setIsLoading(false)
			}
		}
		loadData()
	}, [])

	const handleSaveAccount = () => {
		if (!account) return

		startTransition(async () => {
			const result = await updateAccount(account.id, {
				name: accountForm.name,
				accountType: accountForm.accountType,
				propFirmName:
					accountForm.accountType === "prop"
						? accountForm.propFirmName
						: undefined,
				profitSharePercentage:
					parseFloat(accountForm.profitSharePercentage) || 100,
				defaultCommission: toCents(
					parseFloat(accountForm.defaultCommission) || 0
				),
				defaultFees: toCents(parseFloat(accountForm.defaultFees) || 0),
				defaultBreakevenTicks: parseInt(accountForm.defaultBreakevenTicks) || 0,
				replayStartDate:
					accountForm.accountType === "replay"
						? accountForm.replayStartDate
						: undefined,
				defaultAsset: accountForm.defaultAsset || null,
			})
			if (result.status === "success" && result.data) {
				setAccount(result.data)
				setIsEditingAccount(false)
				showToast("success", t("accountUpdated"))
			} else {
				showToast("error", result.error || t("accountUpdateError"))
			}
		})
	}

	const handleEditAssetFees = (assetId: string) => {
		const existing = accountAssets.find((aa) => aa.assetId === assetId)
		setAssetFeesForm({
			commission: existing
				? fromCents(existing.commissionOverride || 0).toString()
				: "0",
			fees: existing ? fromCents(existing.feesOverride || 0).toString() : "0",
			breakevenTicks:
				existing?.breakevenTicksOverride != null
					? existing.breakevenTicksOverride.toString()
					: "",
		})
		setEditingAssetId(assetId)
	}

	const handleSaveAssetFees = () => {
		if (!editingAssetId) return

		startTransition(async () => {
			const breakevenTicksValue =
				assetFeesForm.breakevenTicks.trim() === ""
					? null
					: parseInt(assetFeesForm.breakevenTicks) || null
			const result = await updateAccountAsset({
				assetId: editingAssetId,
				isEnabled: true,
				commissionOverride: toCents(parseFloat(assetFeesForm.commission) || 0),
				feesOverride: toCents(parseFloat(assetFeesForm.fees) || 0),
				breakevenTicksOverride: breakevenTicksValue,
			})
			if (result.status === "success") {
				// Update local state
				setAccountAssets((prev) => {
					const existing = prev.find((aa) => aa.assetId === editingAssetId)
					const newData = {
						id: existing?.id || "",
						accountId: account?.id || "",
						assetId: editingAssetId,
						isEnabled: true,
						commissionOverride: toCents(
							parseFloat(assetFeesForm.commission) || 0
						),
						feesOverride: toCents(parseFloat(assetFeesForm.fees) || 0),
						breakevenTicksOverride: breakevenTicksValue,
						notes: null,
						createdAt: existing?.createdAt || new Date(),
						updatedAt: new Date(),
					}
					if (existing) {
						return prev.map((aa) =>
							aa.assetId === editingAssetId ? newData : aa
						)
					}
					return [...prev, newData]
				})
				setEditingAssetId(null)
				showToast("success", t("assetFeesUpdated"))
			} else {
				showToast("error", result.error || t("assetFeesUpdateError"))
			}
		})
	}

	const handleResetAssetFees = () => {
		if (!editingAssetId) return

		startTransition(async () => {
			const result = await updateAccountAsset({
				assetId: editingAssetId,
				isEnabled: true,
				commissionOverride: null,
				feesOverride: null,
				breakevenTicksOverride: null,
			})
			if (result.status === "success") {
				setAccountAssets((prev) =>
					prev.map((aa) =>
						aa.assetId === editingAssetId
							? {
									...aa,
									commissionOverride: null,
									feesOverride: null,
									breakevenTicksOverride: null,
									updatedAt: new Date(),
								}
							: aa
					)
				)
				setEditingAssetId(null)
				showToast("success", t("assetFeesReset"))
			} else {
				showToast("error", result.error || t("assetFeesUpdateError"))
			}
		})
	}

	const getAssetFees = (assetId: string) => {
		const override = accountAssets.find((aa) => aa.assetId === assetId)
		const hasOverride =
			override &&
			(override.commissionOverride !== null ||
				override.feesOverride !== null ||
				override.breakevenTicksOverride !== null)
		if (hasOverride) {
			return {
				commission: fromCents(override.commissionOverride || 0),
				fees: fromCents(override.feesOverride || 0),
				breakevenTicks: override.breakevenTicksOverride,
				isOverride: true,
			}
		}
		return {
			commission: fromCents(account?.defaultCommission || 0),
			fees: fromCents(account?.defaultFees || 0),
			breakevenTicks: null as number | null,
			isOverride: false,
		}
	}

	const handleDeleteAccount = () => {
		if (!account) return

		// Resolve the switch target before deletion
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

	const isDefaultAccount = account?.isDefault ?? false
	const isLastAccount = userAccounts.length <= 1
	const canDeleteAccount = !isDefaultAccount || isLastAccount

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="text-txt-300 h-8 w-8 animate-spin" />
			</div>
		)
	}

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 mx-auto max-w-2xl">
			{/* Account Information */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<div className="flex items-center justify-between">
					<h2 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("accountInfo")}
					</h2>
					{!isEditingAccount && (
						<Button
							id="account-edit-info"
							variant="ghost"
							size="sm"
							onClick={() => setIsEditingAccount(true)}
						>
							{tCommon("edit")}
						</Button>
					)}
				</div>
				<div className="mt-m-400 space-y-m-400">
					<div className="gap-s-200 sm:gap-m-400 flex flex-col sm:flex-row sm:items-center sm:justify-between">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("accountName")}</p>
						</div>
						{isEditingAccount ? (
							<Input
								id="account-name"
								value={accountForm.name}
								onChange={(e) =>
									setAccountForm((prev) => ({ ...prev, name: e.target.value }))
								}
								className="w-full sm:w-64"
							/>
						) : (
							<span className="text-small text-txt-200">{account?.name}</span>
						)}
					</div>
					<div className="gap-s-200 sm:gap-m-400 flex flex-col sm:flex-row sm:items-center sm:justify-between">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("accountType")}</p>
						</div>
						{isEditingAccount ? (
							<Select
								value={accountForm.accountType}
								onValueChange={(value: "personal" | "prop" | "replay") =>
									setAccountForm((prev) => ({
										...prev,
										accountType: value,
										replayStartDate:
											value === "replay" && !prev.replayStartDate
												? formatDateKey(new Date())
												: prev.replayStartDate,
									}))
								}
							>
								<SelectTrigger id="account-type" className="w-full sm:w-48">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="personal">{t("personal")}</SelectItem>
									<SelectItem value="prop">{t("propFirm")}</SelectItem>
									{isAdmin && (
										<SelectItem value="replay">{t("replay")}</SelectItem>
									)}
								</SelectContent>
							</Select>
						) : (
							<span className="text-small text-txt-200">
								{account?.accountType === "replay"
									? t("replay")
									: account?.accountType === "prop"
										? t("propFirm")
										: t("personal")}
							</span>
						)}
					</div>
					{(accountForm.accountType === "replay" ||
						account?.accountType === "replay") && (
						<div className="gap-s-200 sm:gap-m-400 flex flex-col sm:flex-row sm:items-center sm:justify-between">
							<div className="flex-1">
								<p className="text-small text-txt-100">
									{t("replayStartDate")}
								</p>
								<p className="text-tiny text-txt-300">
									{t("replayStartDateHelp")}
								</p>
							</div>
							{isEditingAccount ? (
								<DatePicker
									id="account-replay-start-date"
									value={
										accountForm.replayStartDate
											? new Date(accountForm.replayStartDate + "T12:00:00")
											: undefined
									}
									onChange={(date) =>
										setAccountForm((prev) => ({
											...prev,
											replayStartDate: date ? formatDateKey(date) : "",
										}))
									}
									className="w-full sm:w-48"
								/>
							) : (
								<span className="text-small text-txt-200">
									{account?.replayCurrentDate
										? new Date(account.replayCurrentDate).toLocaleDateString()
										: "-"}
								</span>
							)}
						</div>
					)}
					{(accountForm.accountType === "prop" ||
						account?.accountType === "prop") && (
						<>
							<div className="gap-s-200 sm:gap-m-400 flex flex-col sm:flex-row sm:items-center sm:justify-between">
								<div className="flex-1">
									<p className="text-small text-txt-100">{t("propFirmName")}</p>
								</div>
								{isEditingAccount ? (
									<Input
										id="account-prop-firm-name"
										value={accountForm.propFirmName}
										onChange={(e) =>
											setAccountForm((prev) => ({
												...prev,
												propFirmName: e.target.value,
											}))
										}
										className="w-full sm:w-64"
										placeholder={t("propFirmNamePlaceholder")}
									/>
								) : (
									<span className="text-small text-txt-200">
										{account?.propFirmName || "-"}
									</span>
								)}
							</div>
							<div className="gap-s-200 sm:gap-m-400 flex flex-col sm:flex-row sm:items-center sm:justify-between">
								<div className="flex-1">
									<p className="text-small text-txt-100">{t("profitShare")}</p>
								</div>
								{isEditingAccount ? (
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
											className="w-full text-right sm:w-24"
										/>
										<span className="text-small text-txt-300">%</span>
									</div>
								) : (
									<span className="text-small text-txt-200">
										{account?.profitSharePercentage}%
									</span>
								)}
							</div>
						</>
					)}
					<div className="gap-s-200 sm:gap-m-400 flex flex-col sm:flex-row sm:items-center sm:justify-between">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("defaultAsset")}</p>
							<p className="text-tiny text-txt-300">{t("defaultAssetHelp")}</p>
						</div>
						{isEditingAccount ? (
							<Select
								value={accountForm.defaultAsset || "none"}
								onValueChange={(value) =>
									setAccountForm((prev) => ({
										...prev,
										defaultAsset: value === "none" ? "" : value,
									}))
								}
							>
								<SelectTrigger
									id="account-default-asset"
									className="w-full sm:w-64"
								>
									<SelectValue placeholder={t("defaultAssetPlaceholder")} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">{t("defaultAssetNone")}</SelectItem>
									{assets.map((asset) => (
										<SelectItem key={asset.id} value={asset.symbol}>
											<span className="font-mono">{asset.symbol}</span>
											<span className="text-txt-300 ml-2">{asset.name}</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<span className="text-small text-txt-200">
								{account?.defaultAsset || t("defaultAssetNone")}
							</span>
						)}
					</div>
				</div>
				{isEditingAccount && (
					<div className="mt-m-500 gap-s-300 flex justify-end">
						<Button
							id="account-cancel-info"
							variant="ghost"
							size="sm"
							onClick={() => {
								setIsEditingAccount(false)
								if (account) {
									setAccountForm({
										name: account.name,
										accountType: account.accountType,
										propFirmName: account.propFirmName || "",
										profitSharePercentage: account.profitSharePercentage,
										defaultCommission: fromCents(
											account.defaultCommission
										).toString(),
										defaultFees: fromCents(account.defaultFees).toString(),
										defaultBreakevenTicks:
											account.defaultBreakevenTicks.toString(),
										replayStartDate: account.replayCurrentDate
											? new Date(account.replayCurrentDate)
													.toISOString()
													.split("T")[0]
											: "",
										defaultAsset: account.defaultAsset || "",
									})
								}
							}}
							disabled={isPending}
						>
							{tCommon("cancel")}
						</Button>
						<Button
							id="account-save-info"
							size="sm"
							onClick={handleSaveAccount}
							disabled={isPending}
						>
							{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{tCommon("save")}
						</Button>
					</div>
				)}
			</div>

			{/* Default Commission & Fees */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<div className="flex items-center justify-between">
					<h2 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("defaultFees")}
					</h2>
					{!isEditingAccount && (
						<Button
							id="account-edit-fees"
							variant="ghost"
							size="sm"
							onClick={() => setIsEditingAccount(true)}
						>
							{tCommon("edit")}
						</Button>
					)}
				</div>
				<p className="mt-s-200 text-tiny text-txt-300">
					{t("defaultFeesDesc")}
				</p>
				<div className="mt-m-400 space-y-m-400">
					<div className="gap-s-200 sm:gap-m-400 flex flex-col sm:flex-row sm:items-center sm:justify-between">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("commission")}</p>
							<p className="text-tiny text-txt-300">{t("perContract")}</p>
						</div>
						{isEditingAccount ? (
							<div className="gap-s-200 flex items-center">
								<span className="text-small text-txt-300">$</span>
								<Input
									id="account-default-commission"
									type="number"
									step="0.01"
									min="0"
									value={accountForm.defaultCommission}
									onChange={(e) =>
										setAccountForm((prev) => ({
											...prev,
											defaultCommission: e.target.value,
										}))
									}
									className="w-full text-right sm:w-24"
								/>
							</div>
						) : (
							<span className="text-small text-txt-200">
								${fromCents(account?.defaultCommission || 0).toFixed(2)}
							</span>
						)}
					</div>
					<div className="gap-s-200 sm:gap-m-400 flex flex-col sm:flex-row sm:items-center sm:justify-between">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("fees")}</p>
							<p className="text-tiny text-txt-300">{t("perContract")}</p>
						</div>
						{isEditingAccount ? (
							<div className="gap-s-200 flex items-center">
								<span className="text-small text-txt-300">$</span>
								<Input
									id="account-default-fees"
									type="number"
									step="0.01"
									min="0"
									value={accountForm.defaultFees}
									onChange={(e) =>
										setAccountForm((prev) => ({
											...prev,
											defaultFees: e.target.value,
										}))
									}
									className="w-full text-right sm:w-24"
								/>
							</div>
						) : (
							<span className="text-small text-txt-200">
								${fromCents(account?.defaultFees || 0).toFixed(2)}
							</span>
						)}
					</div>
					<div className="gap-s-200 sm:gap-m-400 flex flex-col sm:flex-row sm:items-center sm:justify-between">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("breakevenTicks")}</p>
							<p className="text-tiny text-txt-300">
								{t("breakevenTicksDesc")}
							</p>
						</div>
						{isEditingAccount ? (
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
									className="w-full text-right sm:w-24"
								/>
								<span className="text-small text-txt-300">{t("ticks")}</span>
							</div>
						) : (
							<span className="text-small text-txt-200">
								{account?.defaultBreakevenTicks ?? 2} {t("ticks")}
							</span>
						)}
					</div>
				</div>
			</div>

			{/* Per-Asset Overrides */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<h2 className="text-body text-txt-100 font-semibold">
					{t("assetOverrides")}
				</h2>
				<p className="mt-s-200 text-tiny text-txt-300">
					{t("assetOverridesDesc")}
				</p>
				<div className="mt-m-400 space-y-s-300">
					{assets.map((asset) => {
						const fees = getAssetFees(asset.id)
						const isEditing = editingAssetId === asset.id
						return (
							<div
								key={asset.id}
								className="border-bg-300 p-s-300 rounded-md border"
							>
								{isEditing ? (
									<div className="space-y-s-300">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-small text-txt-100 font-medium">
													{asset.symbol}
												</p>
												<p className="text-tiny text-txt-300">{asset.name}</p>
											</div>
										</div>
										<div className="gap-s-300 grid grid-cols-3">
											<div className="space-y-s-100">
												<Label
													id="label-asset-commission"
													className="text-tiny text-txt-300"
												>
													{t("commission")}
												</Label>
												<Input
													id="account-asset-commission"
													type="number"
													step="0.01"
													min="0"
													value={assetFeesForm.commission}
													onChange={(e) =>
														setAssetFeesForm((prev) => ({
															...prev,
															commission: e.target.value,
														}))
													}
													className="h-8 text-right text-sm"
												/>
											</div>
											<div className="space-y-s-100">
												<Label
													id="label-asset-fees"
													className="text-tiny text-txt-300"
												>
													{t("fees")}
												</Label>
												<Input
													id="account-asset-fees"
													type="number"
													step="0.01"
													min="0"
													value={assetFeesForm.fees}
													onChange={(e) =>
														setAssetFeesForm((prev) => ({
															...prev,
															fees: e.target.value,
														}))
													}
													className="h-8 text-right text-sm"
												/>
											</div>
											<div className="space-y-s-100">
												<Label
													id="label-asset-breakeven-ticks"
													className="text-tiny text-txt-300"
												>
													{t("breakevenTicks")}
												</Label>
												<Input
													id="account-asset-breakeven-ticks"
													type="number"
													step="1"
													min="0"
													value={assetFeesForm.breakevenTicks}
													onChange={(e) =>
														setAssetFeesForm((prev) => ({
															...prev,
															breakevenTicks: e.target.value,
														}))
													}
													className="h-8 text-right text-sm"
													placeholder={
														account?.defaultBreakevenTicks?.toString() ?? "2"
													}
												/>
											</div>
										</div>
										<div className="flex items-center justify-between">
											<div>
												{fees.isOverride && (
													<Button
														id={`account-reset-asset-${asset.id}`}
														variant="ghost"
														size="sm"
														onClick={handleResetAssetFees}
														disabled={isPending}
														className="text-txt-300 hover:text-fb-error"
													>
														{t("resetToDefault")}
													</Button>
												)}
											</div>
											<div className="gap-s-200 flex">
												<Button
													id={`account-cancel-asset-${asset.id}`}
													variant="ghost"
													size="sm"
													onClick={() => setEditingAssetId(null)}
													disabled={isPending}
												>
													{tCommon("cancel")}
												</Button>
												<Button
													id={`account-save-asset-${asset.id}`}
													size="sm"
													onClick={handleSaveAssetFees}
													disabled={isPending}
												>
													{isPending && (
														<Loader2 className="mr-2 h-3 w-3 animate-spin" />
													)}
													{tCommon("save")}
												</Button>
											</div>
										</div>
									</div>
								) : (
									<div className="flex items-center justify-between">
										<div className="flex-1">
											<p className="text-small text-txt-100 font-medium">
												{asset.symbol}
											</p>
											<p className="text-tiny text-txt-300">{asset.name}</p>
										</div>
										<div className="gap-m-400 flex items-center">
											<div className="text-right">
												<p className="text-small text-txt-200">
													${fees.commission.toFixed(2)} / $
													{fees.fees.toFixed(2)} /{" "}
													{fees.breakevenTicks ??
														account?.defaultBreakevenTicks ??
														2}{" "}
													{t("ticks")}
												</p>
												{fees.isOverride && (
													<p className="text-tiny text-acc-100">
														{t("override")}
													</p>
												)}
											</div>
											<Button
												id={`account-edit-asset-${asset.id}`}
												variant="ghost"
												size="sm"
												onClick={() => handleEditAssetFees(asset.id)}
											>
												{tCommon("edit")}
											</Button>
										</div>
									</div>
								)}
							</div>
						)
					})}
				</div>
			</div>

			{/* Data Maintenance */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
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
					<div className="border-t border-bg-300 pt-s-300 sm:border-0 sm:pt-0">
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

			{/* Data Import — admin only */}
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

			{/* Data Export — admin only */}
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
			{/* <div className="bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border border-red-500/30">
				<h2 className="text-small sm:text-body font-semibold text-red-500">
					{t("dangerZone")}
				</h2>
				<p className="mt-s-200 text-tiny text-txt-300">
					{isLastAccount ? t("deleteLastAccountDesc") : t("dangerZoneDesc")}
				</p>
				{!canDeleteAccount && (
					<p className="mt-s-200 text-tiny text-red-400">
						{t("cannotDeleteDefaultAccount")}
					</p>
				)}
				<div className="mt-m-400 flex items-center justify-between">
					<p className="text-small text-txt-200">{account?.name}</p>
					<AlertDialog
						open={isDeleteDialogOpen}
						onOpenChange={(open) => {
							setIsDeleteDialogOpen(open)
							if (!open) setDeleteConfirmName("")
						}}
					>
						<AlertDialogTrigger asChild>
							<Button
								id="account-delete-trigger"
								variant="destructive"
								size="sm"
								disabled={!canDeleteAccount}
							>
								<Trash2 className="mr-2 h-4 w-4" />
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
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									)}
									{tCommon("confirm")}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div> */}
		</div>
	)
}

export { AccountSettings }
