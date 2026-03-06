"use client"

import { useState, useTransition, useMemo, useCallback, type ChangeEvent, type KeyboardEvent } from "react"
import { useTranslations } from "next-intl"
import { ChevronRight, Loader2, Search, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
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
import { useToast } from "@/components/ui/toast"
import { updateUserRole } from "@/app/actions/user-management"
import type { UserWithAccounts } from "@/app/actions/user-management"

interface UserListProps {
	users: UserWithAccounts[]
	currentUserId: string
}

const ROLES = ["admin", "trader", "viewer"] as const

const UserList = ({ users, currentUserId }: UserListProps) => {
	const t = useTranslations("settings.users")
	const tCommon = useTranslations("common")
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [search, setSearch] = useState("")
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
	const [pendingId, setPendingId] = useState<string | null>(null)

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

	return (
		<div className="space-y-m-400">
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
								<TableHead>{t("email")}</TableHead>
								<TableHead className="text-center">
									{t("accounts")}
								</TableHead>
								<TableHead>{t("joined")}</TableHead>
								<TableHead>{t("role")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredUsers.map((user) => {
								const isExpanded = expandedIds.has(user.id)
								const isCurrentUser = user.id === currentUserId
								const isRowPending =
									isPending && pendingId === user.id

								return (
									<>
										<TableRow
											key={user.id}
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
											<TableCell className="text-muted-foreground">
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
															className="w-28"
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
																	</div>
																)
															)}
														</div>
													)}
												</TableCell>
											</TableRow>
										)}
									</>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	)
}

export { UserList }
