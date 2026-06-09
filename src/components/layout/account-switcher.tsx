"use client"

import { useState, useTransition, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useTranslations } from "next-intl"
import {
	ChevronDown,
	Check,
	Building2,
	User,
	Loader2,
	Plus,
} from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getAccountIcon } from "@/lib/account-brand"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import {
	getUserAccounts,
	getCurrentAccount,
	revalidateAfterAccountSwitch,
} from "@/app/actions/auth"
import { createAccount } from "@/app/actions/accounts"
import { useAccountTransition } from "@/components/ui/account-transition-overlay"
import { cn } from "@/lib/utils"
import type { TradingAccount } from "@/db/schema"

interface CreateAccountForm {
	name: string
	accountType: "personal" | "prop"
	propFirmName: string
	profitSharePercentage: string
}

interface AccountSwitcherProps {
	isCollapsed: boolean
}

export const AccountSwitcher = ({ isCollapsed }: AccountSwitcherProps) => {
	const t = useTranslations("auth.accountSwitcher")
	const { update } = useSession()
	const { showToast } = useToast()
	const { showAccountTransition } = useAccountTransition()
	const [isPending, startTransition] = useTransition()
	const [isOpen, setIsOpen] = useState(false)
	const [isCreateOpen, setIsCreateOpen] = useState(false)
	const [isLoading, setIsLoading] = useState(true)
	const [accounts, setAccounts] = useState<TradingAccount[]>([])
	const [currentAccount, setCurrentAccount] = useState<TradingAccount | null>(
		null
	)

	// Create account form
	const [createForm, setCreateForm] = useState<CreateAccountForm>({
		name: "",
		accountType: "personal",
		propFirmName: "",
		profitSharePercentage: "100",
	})

	useEffect(() => {
		let mounted = true
		const fetchData = async () => {
			try {
				const [accountsData, currentAccountData] = await Promise.all([
					getUserAccounts(),
					getCurrentAccount(),
				])
				if (!mounted) {
					return
				}
				setAccounts(accountsData)
				setCurrentAccount(currentAccountData)
			} finally {
				if (mounted) {
					setIsLoading(false)
				}
			}
		}
		void fetchData()
		return () => {
			mounted = false
		}
	}, [])

	const handleSwitchAccount = (accountId: string) => {
		const targetAccount = accounts.find((account) => account.id === accountId)
		if (!targetAccount || accountId === currentAccount?.id) {
			setIsOpen(false)
			return
		}

		setIsOpen(false)
		showAccountTransition({
			accountName: targetAccount.name,
			accountType: targetAccount.accountType,
			onTransition: async () => {
				await update({ accountId })
				await revalidateAfterAccountSwitch()
			},
		})
	}

	const handleCreateAccount = () => {
		if (!createForm.name.trim()) {
			return
		}

		startTransition(async () => {
			const result = await createAccount({
				name: createForm.name.trim(),
				accountType: createForm.accountType,
				propFirmName:
					createForm.accountType === "prop"
						? createForm.propFirmName
						: undefined,
				profitSharePercentage:
					parseFloat(createForm.profitSharePercentage) || 100,
			})

			if (result.status === "success" && result.data) {
				const newAccountId = result.data.id
				showToast("success", t("createSuccess"))
				setIsCreateOpen(false)
				showAccountTransition({
					accountName: createForm.name.trim(),
					accountType: createForm.accountType,
					onTransition: async () => {
						await update({ accountId: newAccountId })
						await revalidateAfterAccountSwitch()
					},
				})
			} else {
				showToast("error", result.error || t("createError"))
			}
		})
	}

	const AccountIcon = currentAccount
		? getAccountIcon(currentAccount.accountType)
		: User

	if (isLoading) {
		return (
			<div
				className={cn(
					"flex items-center justify-center",
					isCollapsed ? "h-10 w-10" : "px-s-300 h-10 w-full"
				)}
			>
				<Loader2 className="text-txt-300 h-4 w-4 animate-spin motion-reduce:animate-none" />
			</div>
		)
	}

	if (isCollapsed) {
		return (
			<>
				<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="text-txt-200 hover:bg-bg-300 hover:text-txt-100 flex h-10 w-10 items-center justify-center rounded-md"
							aria-label={t("switchAccount")}
							disabled={isPending}
						>
							<AccountIcon className="h-5 w-5" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						id="dropdown-account-switcher-collapsed"
						side="right"
						align="start"
						className="w-56"
					>
						<DropdownMenuLabel>{t("accounts")}</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{accounts.map((account) => {
							const Icon = getAccountIcon(account.accountType)
							const isSelected = account.id === currentAccount?.id
							return (
								<DropdownMenuItem
									key={account.id}
									onClick={() => handleSwitchAccount(account.id)}
									className={cn("cursor-pointer", isSelected && "bg-bg-300")}
								>
									<Icon className="h-4 w-4" />
									<span className="flex-1 truncate">{account.name}</span>
									{isSelected && <Check className="text-acc-100 h-4 w-4" />}
								</DropdownMenuItem>
							)
						})}
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => {
								setIsOpen(false)
								setIsCreateOpen(true)
							}}
							className="text-acc-100 cursor-pointer"
						>
							<Plus className="h-4 w-4" />
							<span>{t("newAccount")}</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				<CreateAccountDialog
					isOpen={isCreateOpen}
					onOpenChange={setIsCreateOpen}
					form={createForm}
					setForm={setCreateForm}
					onSubmit={handleCreateAccount}
					isPending={isPending}
					t={t}
				/>
			</>
		)
	}

	return (
		<>
			<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="text-txt-200 hover:bg-bg-300 hover:text-txt-100 gap-s-200 px-s-300 py-s-200 text-small flex w-full items-center rounded-md text-left"
						disabled={isPending}
						aria-label={t("switchAccount")}
					>
						<AccountIcon className="h-4 w-4 shrink-0" />
						<span className="flex-1 truncate">
							{currentAccount?.name || t("noAccount")}
						</span>
						<ChevronDown
							className={cn(
								"h-4 w-4 shrink-0 transition-transform",
								isOpen && "rotate-180"
							)}
						/>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					id="dropdown-account-switcher-expanded"
					side="right"
					align="start"
					className="w-56"
				>
					<DropdownMenuLabel>{t("accounts")}</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{accounts.map((account) => {
						const Icon = getAccountIcon(account.accountType)
						const isSelected = account.id === currentAccount?.id
						return (
							<DropdownMenuItem
								key={account.id}
								onClick={() => handleSwitchAccount(account.id)}
								className={cn("cursor-pointer", isSelected && "bg-bg-300")}
							>
								<Icon className="h-4 w-4" />
								<div className="flex-1 truncate">
									{/* Label (account name) pairs with secondary field (firm name) for hierarchy */}
									<p className="text-small truncate">{account.name}</p>
									{account.accountType === "prop" && account.propFirmName && (
										<p className="text-txt-300 text-tiny truncate">
											{account.propFirmName}
										</p>
									)}
								</div>
								{isSelected && <Check className="text-acc-100 h-4 w-4" />}
							</DropdownMenuItem>
						)
					})}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => {
							setIsOpen(false)
							setIsCreateOpen(true)
						}}
						className="text-acc-100 cursor-pointer"
					>
						<Plus className="h-4 w-4" />
						<span>{t("newAccount")}</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<CreateAccountDialog
				isOpen={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				form={createForm}
				setForm={setCreateForm}
				onSubmit={handleCreateAccount}
				isPending={isPending}
				t={t}
			/>
		</>
	)
}

// Dialog component for creating accounts
interface CreateAccountDialogProps {
	isOpen: boolean
	onOpenChange: (_open: boolean) => void
	form: CreateAccountForm
	setForm: (
		_value:
			| CreateAccountForm
			| ((_prev: CreateAccountForm) => CreateAccountForm)
	) => void
	onSubmit: () => void
	isPending: boolean
	t: (_key: string) => string
}

const CreateAccountDialog = ({
	isOpen,
	onOpenChange,
	form,
	setForm,
	onSubmit,
	isPending,
	t,
}: CreateAccountDialogProps) => {
	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent
				id="create-account-dialog"
				className="max-w-[calc(100vw-2rem)] sm:max-w-md"
			>
				<DialogHeader>
					<DialogTitle>{t("createAccount")}</DialogTitle>
					<DialogDescription>{t("createAccountDesc")}</DialogDescription>
				</DialogHeader>

				<div className="space-y-m-400 py-m-400">
					<div className="space-y-s-200">
						<Label id="label-account-name" htmlFor="accountName">
							{t("accountName")}
						</Label>
						<Input
							id="accountName"
							value={form.name}
							onChange={(e) =>
								setForm((prev) => ({ ...prev, name: e.target.value }))
							}
							placeholder={t("accountNamePlaceholder")}
							disabled={isPending}
						/>
					</div>

					<div className="space-y-s-200">
						<Label id="label-account-type" htmlFor="accountType">
							{t("accountType")}
						</Label>
						<Select
							value={form.accountType}
							onValueChange={(value: "personal" | "prop") =>
								setForm((prev) => ({
									...prev,
									accountType: value,
								}))
							}
							disabled={isPending}
						>
							<SelectTrigger id="accountType">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="personal">
									<div className="gap-s-200 flex items-center">
										<User className="h-4 w-4" />
										{t("personal")}
									</div>
								</SelectItem>
								<SelectItem value="prop">
									<div className="gap-s-200 flex items-center">
										<Building2 className="h-4 w-4" />
										{t("propFirm")}
									</div>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{form.accountType === "prop" && (
						<>
							<div className="space-y-s-200">
								<Label id="label-prop-firm-name" htmlFor="propFirmName">
									{t("propFirmName")}
								</Label>
								<Input
									id="propFirmName"
									value={form.propFirmName}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											propFirmName: e.target.value,
										}))
									}
									placeholder={t("propFirmNamePlaceholder")}
									disabled={isPending}
								/>
							</div>

							<div className="space-y-s-200">
								<Label id="label-profit-share" htmlFor="profitShare">
									{t("profitShare")}
								</Label>
								<div className="gap-s-200 flex items-center">
									<Input
										id="profitShare"
										type="number"
										min="0"
										max="100"
										step="0.01"
										value={form.profitSharePercentage}
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												profitSharePercentage: e.target.value,
											}))
										}
										className="w-24"
										disabled={isPending}
									/>
									<span className="text-txt-300 text-small">%</span>
								</div>
							</div>
						</>
					)}
				</div>

				<div className="gap-s-300 flex justify-end">
					<Button
						id="account-switcher-cancel"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						{t("cancel")}
					</Button>
					<Button
						id="account-switcher-create"
						onClick={onSubmit}
						disabled={!form.name.trim() || isPending}
					>
						{isPending && (
							<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
						)}
						{t("createAccount")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
