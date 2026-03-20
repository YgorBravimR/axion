"use client"

import { Fragment, useState, useTransition, useMemo, useCallback, type ChangeEvent, type KeyboardEvent } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { ChevronRight, Loader2, Search, Trash2, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
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
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/toast"
import { updateUserRole } from "@/app/actions/user-management"
import { deleteAccount } from "@/app/actions/accounts"
import type { UserWithAccounts } from "@/app/actions/user-management"

interface UserListProps {
	users: UserWithAccounts[]
	currentUserId: string
}

const ROLES = ["admin", "trader", "viewer"] as const

interface DeleteTarget {
	accountId: string
	accountName: string
	userName: string
}

const UserList = ({ users, currentUserId }: UserListProps) => {
	const t = useTranslations("settings.users")
	const tCommon = useTranslations("common")
	const { showToast } = useToast()
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [search, setSearch] = useState("")
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
	const [pendingId, setPendingId] = useState<string | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

	const filteredUsers = useMemo(() => {
		if (!search.trim()) return users
		const query = search.toLowerCase()
		return users.filter(
			(user) =>
				user.name.toLowerCase().includes(query) ||
				user.email.toLowerCase().includes(query)
		)
	}, [users, search])

	const handleToggleExpand = useCallback((userId: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev)
			if (next.has(userId)) {
				next.delete(userId)
			} else {
				next.add(userId)
			}
			return next
		})
	}, [])

	const handleRoleChange = useCallback(
		(userId: string, role: string) => {
			setPendingId(userId)
			startTransition(async () => {
				const result = await updateUserRole({
					userId,
					role: role as "admin" | "trader" | "viewer",
				})
				setPendingId(null)
				if (result.success) {
					showToast("success", t("roleUpdated"))
					return
				}
				showToast("error", result.error || t("roleUpdateError"))
			})
		},
		[showToast, t]
	)

	const handleSearchChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			setSearch(e.target.value)
		},
		[]
	)

	const handleRowKeyDown = useCallback(
		(e: KeyboardEvent, userId: string) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				handleToggleExpand(userId)
			}
		},
		[handleToggleExpand]
	)

	const handleDeleteAccount = useCallback(() => {
		if (!deleteTarget) return

		startTransition(async () => {
			const result = await deleteAccount(deleteTarget.accountId)
			if (result.status === "success") {
				showToast("success", t("deleteAccountSuccess"))
				setDeleteTarget(null)
				router.refresh()
			} else {
				showToast("error", result.error || t("deleteAccountError"))
			}
		})
	}, [deleteTarget, showToast, t, router])

	return (
		<div id="settings-users" className="space-y-m-400">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-lg font-semibold">{t("title")}</h3>
				</div>
			</div>

			<div className="relative w-full sm:max-w-sm">
				<Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
				<Input
					id="user-search"
					placeholder={t("searchUsers")}
					value={search}
					onChange={handleSearchChange}
					className="pl-9"
					aria-label={t("searchUsers")}
				/>
			</div>

			{filteredUsers.length === 0 ? (
				<div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-12">
					<Users className="h-8 w-8 opacity-50" />
					<p className="text-sm">{t("noUsers")}</p>
				</div>
			) : (
				<div className="overflow-x-auto rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10" />
								<TableHead>{t("name")}</TableHead>
								<TableHead className="hidden sm:table-cell">{t("email")}</TableHead>
								<TableHead className="text-center">
									{t("accounts")}
								</TableHead>
								<TableHead>{t("joined")}</TableHead>
								<TableHead className="whitespace-nowrap">{t("role")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredUsers.map((user) => {
								const isExpanded = expandedIds.has(user.id)
								const isCurrentUser = user.id === currentUserId
								const isRowPending =
									isPending && pendingId === user.id

								return (
									<Fragment key={user.id}>
										<TableRow
											className="cursor-pointer"
											tabIndex={0}
											role="button"
											aria-expanded={isExpanded}
											aria-label={
												isExpanded
													? t("collapseAccounts")
													: t("expandAccounts")
											}
											onClick={() =>
												handleToggleExpand(user.id)
											}
											onKeyDown={(e) =>
												handleRowKeyDown(e, user.id)
											}
										>
											<TableCell className="w-10 px-2">
												<ChevronRight
													className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
												/>
											</TableCell>
											<TableCell className="font-medium">
												<span className="flex items-center gap-2">
													{user.name}
													{isCurrentUser && (
														<Badge
															id={`you-badge-${user.id}`}
															variant="secondary"
															className="text-micro"
														>
															{t("you")}
														</Badge>
													)}
												</span>
											</TableCell>
											<TableCell className="text-muted-foreground hidden sm:table-cell">
												{user.email}
											</TableCell>
											<TableCell className="text-center">
												{user.tradingAccounts.length}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{new Date(
													user.createdAt
												).toLocaleDateString()}
											</TableCell>
											<TableCell
												className="whitespace-nowrap"
												onClick={(e) =>
													e.stopPropagation()
												}
												onKeyDown={(e) =>
													e.stopPropagation()
												}
											>
												<div className="flex items-center gap-2">
													<Select
														value={user.role}
														onValueChange={(
															value
														) =>
															handleRoleChange(
																user.id,
																value
															)
														}
														disabled={
															isCurrentUser ||
															isRowPending
														}
													>
														<SelectTrigger
															id={`role-select-${user.id}`}
															size="sm"
															className="w-28 min-h-[40px]"
															aria-label={t(
																"changeRole"
															)}
														>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{ROLES.map(
																(role) => (
																	<SelectItem
																		key={
																			role
																		}
																		value={
																			role
																		}
																	>
																		{t(
																			`roles.${role}`
																		)}
																	</SelectItem>
																)
															)}
														</SelectContent>
													</Select>
													{isRowPending && (
														<Loader2 className="h-4 w-4 animate-spin" />
													)}
												</div>
											</TableCell>
										</TableRow>

										{isExpanded && (
											<TableRow
												key={`${user.id}-accounts`}
												className="hover:bg-transparent"
											>
												<TableCell />
												<TableCell colSpan={5}>
													{user.tradingAccounts
														.length === 0 ? (
														<p className="text-muted-foreground py-2 text-sm">
															{t("noAccounts")}
														</p>
													) : (
														<div className="flex flex-wrap gap-2 py-2">
															{user.tradingAccounts.map(
																(account) => (
																	<div
																		key={
																			account.id
																		}
																		className="bg-muted flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
																	>
																		<span className="font-medium">
																			{
																				account.name
																			}
																		</span>
																		<Badge
																			id={`account-type-${account.id}`}
																			variant="outline"
																			className="text-micro"
																		>
																			{
																				account.accountType
																			}
																		</Badge>
																		{account.isDefault && (
																			<Badge
																				id={`account-default-${account.id}`}
																				variant="secondary"
																				className="text-micro"
																			>
																				{t(
																					"default"
																				)}
																			</Badge>
																		)}
																		{!account.isActive && (
																			<Badge
																				id={`account-inactive-${account.id}`}
																				variant="destructive"
																				className="text-micro"
																			>
																				{tCommon(
																					"inactive"
																				)}
																			</Badge>
																		)}
																		<Button
																			id={`delete-account-${account.id}`}
																			variant="ghost"
																			size="icon"
																			className="size-10 text-red-500 hover:bg-red-500/10 hover:text-red-600"
																			disabled={user.tradingAccounts.length <= 1 || (account.isDefault && user.tradingAccounts.length > 1)}
																			aria-label={t("deleteAccountTitle")}
																			title={
																				user.tradingAccounts.length <= 1
																					? t("cannotDeleteOnlyAccount")
																					: account.isDefault && user.tradingAccounts.length > 1
																						? t("cannotDeleteDefaultAccount")
																						: t("deleteAccountTitle")
																			}
																			onClick={(e) => {
																				e.stopPropagation()
																				setDeleteTarget({
																					accountId: account.id,
																					accountName: account.name,
																					userName: user.name,
																				})
																			}}
																		>
																			<Trash2 className="h-3.5 w-3.5" />
																		</Button>
																	</div>
																)
															)}
														</div>
													)}
												</TableCell>
											</TableRow>
										)}
									</Fragment>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}
			<AlertDialog open={deleteTarget !== null} onOpenChange={(open) => {
				if (!open) setDeleteTarget(null)
			}}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("deleteAccountTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{deleteTarget && t("deleteAccountDescription", {
								accountName: deleteTarget.accountName,
								userName: deleteTarget.userName,
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel id="admin-delete-account-cancel">
							{tCommon("cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							id="admin-delete-account-confirm"
							variant="destructive"
							disabled={isPending}
							onClick={handleDeleteAccount}
						>
							{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{tCommon("confirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

export { UserList }
