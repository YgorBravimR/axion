"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface AccountOption {
	id: string
	name: string
	accountType: "personal" | "prop" | "replay"
}

interface AccountSelectorProps {
	accounts: AccountOption[]
	selectedIds: string[]
	onSelectionChange: (ids: string[]) => void
	onCompare: () => void
	isPending: boolean
}

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
	personal: "bg-acc-100",
	prop: "bg-acc-200",
	replay: "bg-txt-300",
}

const AccountSelector = ({
	accounts,
	selectedIds,
	onSelectionChange,
	onCompare,
	isPending,
}: AccountSelectorProps) => {
	const t = useTranslations("accountComparison.selector")
	const tCommon = useTranslations("common")

	const handleToggle = (accountId: string) => {
		if (selectedIds.includes(accountId)) {
			onSelectionChange(selectedIds.filter((id) => id !== accountId))
		} else {
			onSelectionChange([...selectedIds, accountId])
		}
	}

	const canCompare = selectedIds.length >= 2

	if (accounts.length < 2) {
		return (
			<div id="comparison-selector" className="border-bg-300 bg-bg-200 rounded-lg border p-m-400">
				<p className="text-txt-300 text-small">{t("noAccounts")}</p>
			</div>
		)
	}

	return (
		<div id="comparison-selector" className="border-bg-300 bg-bg-200 rounded-lg border p-s-300 sm:p-m-400">
			<p className="text-small text-txt-200 mb-s-300">
				{t("selectAccounts")}
			</p>

			<div className="flex flex-wrap gap-s-200">
				{accounts.map((account) => {
					const isSelected = selectedIds.includes(account.id)
					return (
						<button
							key={account.id}
							type="button"
							tabIndex={0}
							aria-label={`${isSelected ? tCommon("deselect") : tCommon("select")} ${account.name}`}
							aria-pressed={isSelected}
							className={cn(
								"flex items-center gap-s-200 rounded-md border px-s-300 py-s-200 text-small transition-colors",
								isSelected
									? "border-acc-100 bg-acc-100/10 text-txt-100"
									: "border-bg-300 bg-bg-100 text-txt-300 hover:border-txt-300 hover:text-txt-200"
							)}
							onClick={() => handleToggle(account.id)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault()
									handleToggle(account.id)
								}
							}}
						>
							<span
								className={cn(
									"h-2 w-2 rounded-full",
									ACCOUNT_TYPE_COLORS[account.accountType]
								)}
							/>
							<span>{account.name}</span>
							<span className="text-tiny text-txt-300">
								{account.accountType}
							</span>
						</button>
					)
				})}
			</div>

			<div className="mt-s-300 flex items-center gap-s-300">
				<Button
					id="compare-accounts"
					type="button"
					variant="default"
					tabIndex={0}
					aria-label={t("compare")}
					disabled={!canCompare || isPending}
					className="px-m-400 py-s-200 text-small font-medium"
					onClick={onCompare}
				>
					{isPending ? t("comparing") : t("compare")}
				</Button>

				{!canCompare && (
					<p className="text-tiny text-txt-300">{t("minAccounts")}</p>
				)}
			</div>
		</div>
	)
}

export { AccountSelector, type AccountOption }
